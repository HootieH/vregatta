import { classify, classify_ws } from './classifier.js';
import {
  normalizeBoatState,
  normalizeCompetitor,
  normalizeRaceMeta,
  normalizeWindSnapshot,
  normalizeAction,
  normalizePolar,
} from './schemas/index.js';
import {
  openDB,
  saveBoatState,
  saveCompetitors,
  saveRace,
  saveAction,
  saveWindSnapshot,
  savePolar,
  getPolar,
  exportRace,
  saveReplay,
  getReplay,
  listReplays,
  deleteReplay,
} from './storage/idb.js';
import { LiveState } from './state/live-state.js';
import { decompressStateAsync } from './colyseus/decoder.js';
import { decodeState } from './colyseus/state-decoder.js';
import { normalizeInshoreState } from './colyseus/inshore-pipeline.js';
import { decodeMasterState, decodeMasterUpdate } from './colyseus/master-decoder.js';
import { FleetManager } from './colyseus/fleet-manager.js';
import { PlayerDetector } from './colyseus/player-detector.js';
import { RaceRecorder } from './storage/race-recorder.js';
import { CourseInferrer } from './colyseus/course-inferrer.js';
import { createLogger, getLogs, clearLogs, setLogLevel, getLogLevel, LogLevel } from './telemetry.js';

const log = createLogger('background');
const interceptorLog = createLogger('interceptor');
const wsLog = createLogger('ws-interceptor');
const classifierLog = createLogger('classifier');
const normalizerLog = createLogger('normalizer');
const storageLog = createLogger('storage');
const stateLog = createLogger('state');

let db = null;
const state = new LiveState();
const fleetManager = new FleetManager();
const playerDetector = new PlayerDetector();
const masterLog = createLogger('master-decoder');
const courseInferrer = new CourseInferrer();
const courseLog = createLogger('course-inferrer');
const unityScanLog = createLogger('unity-scanner');

// Auto-record every Inshore race in background
const raceRecorder = new RaceRecorder();
let raceAutoStarted = false;
let unityScanTriggered = false;

// Initialize DB — wrapped to avoid top-level await crash in some Chrome versions
(async () => {
  try {
    db = await openDB();
    log.info('IndexedDB opened successfully');
  } catch (err) {
    log.error('Failed to open IndexedDB', { error: err.message });
  }
})();

function requireDB() {
  if (!db) {
    log.warn('IndexedDB not ready — skipping storage operation');
    return false;
  }
  return true;
}

// --- Pipeline stats ---
const stats = {
  totalIntercepted: 0,
  classifiedCounts: {},
  normalizeFails: 0,
  storageWrites: 0,
  unknownCount: 0,
  pipelineErrors: 0,
  wsMessagesTotal: 0,
  wsClassifiedCounts: {},
  // Inshore-specific telemetry
  inshoreStateDecodes: 0,
  inshoreStateErrors: 0,
  inshoreMasterDecodes: 0,
  inshoreMasterErrors: 0,
  inshoreHelmInputs: 0,
  inshoreBoatsSpotted: new Set(),    // all slots ever seen
  inshoreLastStateTime: 0,
  inshoreStateRate: 0,               // states/sec
  inshoreDecodeLatency: [],           // last 20 decode durations in ms
  inshoreConnectionUrls: new Set(),   // all WS URLs seen
};

// --- Game mode detection ---
let detectedOffshore = false;
let detectedInshore = false;

// --- Messages-per-second tracking ---
const recentTimestamps = [];

function recordMessage() {
  recentTimestamps.push(Date.now());
  // Keep only last 10 seconds
  const cutoff = Date.now() - 10000;
  while (recentTimestamps.length > 0 && recentTimestamps[0] < cutoff) {
    recentTimestamps.shift();
  }
}

function getMessagesPerSecond() {
  const cutoff = Date.now() - 10000;
  while (recentTimestamps.length > 0 && recentTimestamps[0] < cutoff) {
    recentTimestamps.shift();
  }
  return recentTimestamps.length / 10;
}

// --- Badge management ---
function updateBadge() {
  const failCount = stats.unknownCount + stats.normalizeFails + stats.pipelineErrors;
  if (failCount > 0) {
    chrome.action.setBadgeText({ text: String(failCount) });
    chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
  } else if (stats.totalIntercepted > 0) {
    chrome.action.setBadgeText({ text: String(stats.totalIntercepted) });
    chrome.action.setBadgeBackgroundColor({ color: '#2ecc71' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// --- Raw capture ---
let rawCaptureEnabled = false;

function autoEnableRawCapture(reason) {
  if (rawCaptureEnabled) return;
  rawCaptureEnabled = true;
  log.warn(`Raw capture auto-enabled: ${reason}`);
}

async function saveRawCapture(url, body) {
  if (!rawCaptureEnabled) return;
  try {
    const result = await chrome.storage.local.get('vregatta-raw-capture');
    const entries = result['vregatta-raw-capture'] || [];
    entries.push({ url, body, timestamp: Date.now() });
    // FIFO cap at 500 — large enough to catch initial race join data
    while (entries.length > 500) {
      entries.shift();
    }
    await chrome.storage.local.set({ 'vregatta-raw-capture': entries });
  } catch (err) {
    log.error('Failed to save raw capture', { error: err.message });
  }
}

async function getRawCaptureCount() {
  try {
    const result = await chrome.storage.local.get('vregatta-raw-capture');
    return (result['vregatta-raw-capture'] || []).length;
  } catch {
    return 0;
  }
}

// --- Message handlers ---
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'intercepted') {
    detectedOffshore = true;
    handleIntercepted(message.url, message.body);
    return false;
  }

  if (message.type === 'ws-intercepted') {
    detectedInshore = true;
    handleWsIntercepted(message.url, message.data, message.direction, message.timestamp);
    return false;
  }

  if (message.type === 'ws-connected') {
    detectedInshore = true;
    stats.inshoreConnectionUrls.add(message.url);
    const connType = message.url?.includes('Master') ? 'MASTER' : message.url?.includes('Game') ? 'GAME' : 'UNKNOWN';
    log.info(`WS ${connType} connected: ${message.url} (${stats.inshoreConnectionUrls.size} total connections)`);
    autoEnableRawCapture('WebSocket connected — capturing from start');
    return false;
  }

  if (message.type === 'unity-scan') {
    detectedInshore = true;
    handleUnityScanResults(message.data);
    return false;
  }

  if (message.type === 'logFromInjected') {
    const injectedLog = createLogger('injected');
    const level = message.level ?? LogLevel.DEBUG;
    if (level >= LogLevel.ERROR) injectedLog.error(message.message, message.data);
    else if (level >= LogLevel.WARN) injectedLog.warn(message.message, message.data);
    else if (level >= LogLevel.INFO) injectedLog.info(message.message, message.data);
    else injectedLog.debug(message.message, message.data);
    return false;
  }

  if (message.type === 'getStatus') {
    const snapshot = state.getSnapshot();
    snapshot.inshoreFleet = fleetManager.getFleet();
    snapshot.inshoreFleetStats = fleetManager.getStats();
    snapshot.inshoreCourse = courseInferrer.getCourse();
    snapshot.inshoreMarks = courseInferrer.getMarks();
    const windDir = snapshot.inshoreWindDirection;
    if (windDir != null) {
      snapshot.inshoreLaylines = courseInferrer.getLaylines(windDir);
    }
    sendResponse(snapshot);
    return true;
  }

  if (message.type === 'getPolar') {
    const polarId = message.polarId ?? state.race?.polarId;
    if (polarId == null || !db) {
      sendResponse({ polar: null });
      return true;
    }
    getPolar(db, polarId)
      .then((polar) => sendResponse({ polar }))
      .catch(() => sendResponse({ polar: null }));
    return true;
  }

  if (message.type === 'exportRace') {
    if (!db) { sendResponse({ ok: false, error: 'DB not ready' }); return true; }
    exportRace(db, message.raceId)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'getStats') {
    getRawCaptureCount().then((rawCaptureCount) => {
      let gameMode = 'none';
      if (detectedOffshore && detectedInshore) gameMode = 'both';
      else if (detectedOffshore) gameMode = 'offshore';
      else if (detectedInshore) gameMode = 'inshore';

      const avgDecodeLatency = stats.inshoreDecodeLatency.length > 0
        ? stats.inshoreDecodeLatency.reduce((a, b) => a + b, 0) / stats.inshoreDecodeLatency.length
        : 0;

      sendResponse({
        totalIntercepted: stats.totalIntercepted,
        classifiedCounts: { ...stats.classifiedCounts },
        normalizeFails: stats.normalizeFails,
        storageWrites: stats.storageWrites,
        unknownCount: stats.unknownCount,
        pipelineErrors: stats.pipelineErrors,
        rawCaptureCount,
        rawCaptureEnabled,
        logLevel: getLogLevel(),
        messagesPerSecond: getMessagesPerSecond(),
        wsMessagesTotal: stats.wsMessagesTotal,
        wsClassifiedCounts: { ...stats.wsClassifiedCounts },
        gameMode,
        // Inshore telemetry
        inshore: {
          stateDecodes: stats.inshoreStateDecodes,
          stateErrors: stats.inshoreStateErrors,
          stateErrorRate: stats.inshoreStateDecodes > 0
            ? ((stats.inshoreStateErrors / (stats.inshoreStateDecodes + stats.inshoreStateErrors)) * 100).toFixed(1) + '%'
            : '0%',
          masterDecodes: stats.inshoreMasterDecodes,
          masterErrors: stats.inshoreMasterErrors,
          helmInputs: stats.inshoreHelmInputs,
          boatsSpotted: stats.inshoreBoatsSpotted.size,
          boatSlots: [...stats.inshoreBoatsSpotted].sort((a, b) => a - b),
          stateRate: stats.inshoreStateRate,
          avgDecodeLatencyMs: avgDecodeLatency.toFixed(1),
          connections: [...stats.inshoreConnectionUrls],
        },
      });
    });
    return true;
  }

  if (message.type === 'getDebugLogs') {
    sendResponse({ logs: getLogs() });
    return true;
  }

  if (message.type === 'clearDebugLogs') {
    clearLogs();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'setRawCapture') {
    rawCaptureEnabled = !!message.enabled;
    log.info(`Raw capture ${rawCaptureEnabled ? 'enabled' : 'disabled'}`);
    sendResponse({ ok: true, enabled: rawCaptureEnabled });
    return true;
  }

  if (message.type === 'getRawCapture') {
    chrome.storage.local.get('vregatta-raw-capture', (result) => {
      sendResponse({ data: result['vregatta-raw-capture'] || [] });
    });
    return true;
  }

  if (message.type === 'clearRawCapture') {
    chrome.storage.local.remove('vregatta-raw-capture', () => {
      log.info('Raw capture cleared');
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'setLogLevel') {
    setLogLevel(message.level);
    log.info(`Log level set to ${message.level}`);
    sendResponse({ ok: true });
    return true;
  }

  // --- Replay CRUD handlers ---
  if (message.type === 'saveReplay') {
    if (!db) { sendResponse({ ok: false, error: 'DB not ready' }); return true; }
    saveReplay(db, message.raceData)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'getReplay') {
    if (!db) { sendResponse({ replay: null }); return true; }
    getReplay(db, message.raceId)
      .then((replay) => sendResponse({ replay }))
      .catch(() => sendResponse({ replay: null }));
    return true;
  }

  if (message.type === 'listReplays') {
    if (!db) { sendResponse({ replays: [] }); return true; }
    listReplays(db)
      .then((replays) => sendResponse({ replays }))
      .catch(() => sendResponse({ replays: [] }));
    return true;
  }

  if (message.type === 'getCurrentRecording') {
    const data = raceRecorder.getRaceData();
    sendResponse({
      recording: raceRecorder.isRecording(),
      data: data.states.length > 0 ? data : null,
    });
    return true;
  }

  if (message.type === 'deleteReplay') {
    if (!db) { sendResponse({ ok: false, error: 'DB not ready' }); return true; }
    deleteReplay(db, message.raceId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'toggleDebug') {
    // Forward to content script in active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleDebug' });
      }
    });
    sendResponse({ ok: true });
    return true;
  }
});

async function handleIntercepted(url, rawBody) {
  stats.totalIntercepted++;
  recordMessage();
  interceptorLog.debug(`Received: ${url}`);

  let parsed;
  try {
    parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch {
    interceptorLog.warn('Failed to parse response body', { url });
    return;
  }

  // Save raw capture if enabled
  saveRawCapture(url, parsed);

  const { type, data } = classify(url, parsed);

  // Track classified counts
  stats.classifiedCounts[type] = (stats.classifiedCounts[type] || 0) + 1;

  if (type === 'unknown') {
    stats.unknownCount++;
    classifierLog.warn('UNKNOWN message — dumping raw', {
      url,
      body: JSON.stringify(parsed).slice(0, 1000),
    });
    autoEnableRawCapture('unknown message type detected');
    updateBadge();
  } else {
    classifierLog.info(`Classified as: ${type}`, { url });
  }

  try {
    const canStore = requireDB();
    switch (type) {
      case 'boat': {
        const sd = data?.scriptData ?? data;
        const normalized = normalizeBoatState(sd);
        if (normalized) {
          normalizerLog.debug(`Normalized boat`, {
            speed: normalized.speed,
            heading: normalized.heading,
            lat: normalized.lat,
            lon: normalized.lon,
          });
          if (canStore) await saveBoatState(db, normalized);
          stats.storageWrites++;
          storageLog.debug('Saved boat to IndexedDB');
          state.updateBoat(normalized);
          stateLog.debug(`State updated: speed=${normalized.speed}, heading=${normalized.heading}`);
        } else {
          stats.normalizeFails++;
          normalizerLog.warn('FAILED to normalize boat', { raw: sd });
          autoEnableRawCapture('boat normalize failure');
          updateBadge();
        }
        break;
      }

      case 'fleet': {
        const items = Array.isArray(data) ? data : (Array.isArray(data?.scriptData) ? data.scriptData : []);
        const normalized = items.map(normalizeCompetitor).filter(Boolean);
        if (normalized.length > 0) {
          normalizerLog.debug(`Normalized fleet: ${normalized.length} competitors`);
          if (canStore) await saveCompetitors(db, state.race?.raceId, Date.now(), normalized);
          stats.storageWrites++;
          storageLog.debug('Saved fleet to IndexedDB');
          for (const comp of normalized) {
            state.competitors.set(comp.id, comp);
          }
        } else {
          stats.normalizeFails++;
          normalizerLog.warn('FAILED to normalize fleet', {
            raw: JSON.stringify(data).slice(0, 500),
          });
          autoEnableRawCapture('fleet normalize failure');
          updateBadge();
        }
        break;
      }

      case 'race': {
        const legs = data?.scriptData?.currentLegs;
        const leg = Array.isArray(legs) ? legs[0] : data;
        const normalized = normalizeRaceMeta(leg);
        if (normalized) {
          normalizerLog.debug(`Normalized race: ${normalized.name}`);
          if (canStore) await saveRace(db, normalized);
          stats.storageWrites++;
          storageLog.debug('Saved race to IndexedDB');
          state.race = normalized;
        } else {
          stats.normalizeFails++;
          normalizerLog.warn('FAILED to normalize race', { raw: leg });
          autoEnableRawCapture('race normalize failure');
          updateBadge();
        }
        break;
      }

      case 'action': {
        const normalized = normalizeAction(data);
        if (normalized) {
          normalizerLog.debug(`Normalized action: ${normalized.type}`);
          if (canStore) await saveAction(db, normalized);
          stats.storageWrites++;
          storageLog.debug('Saved action to IndexedDB');
        } else {
          stats.normalizeFails++;
          normalizerLog.warn('FAILED to normalize action', { raw: data });
          autoEnableRawCapture('action normalize failure');
          updateBadge();
        }
        break;
      }

      case 'wind': {
        const normalized = normalizeWindSnapshot(data);
        if (normalized) {
          normalizerLog.debug('Normalized wind snapshot');
          if (canStore) await saveWindSnapshot(db, normalized);
          stats.storageWrites++;
          storageLog.debug('Saved wind to IndexedDB');
        } else {
          stats.normalizeFails++;
          normalizerLog.warn('FAILED to normalize wind', { raw: data });
          autoEnableRawCapture('wind normalize failure');
          updateBadge();
        }
        break;
      }

      case 'polar': {
        const normalized = normalizePolar(data);
        if (normalized) {
          normalizerLog.debug(`Normalized polar: ${normalized._id}`);
          if (canStore) await savePolar(db, normalized);
          stats.storageWrites++;
          storageLog.debug('Saved polar to IndexedDB');
        } else {
          stats.normalizeFails++;
          normalizerLog.warn('FAILED to normalize polar', { raw: data });
          autoEnableRawCapture('polar normalize failure');
          updateBadge();
        }
        break;
      }

      case 'auth':
        log.info('Auth message received');
        break;

      default:
        break;
    }
  } catch (err) {
    stats.pipelineErrors++;
    log.error(`Error handling ${type}: ${err.message}`, { stack: err.stack });
    autoEnableRawCapture(`pipeline error in ${type}`);
    updateBadge();
  }

  // Update badge on every message to keep the green count fresh
  updateBadge();
}

async function handleWsIntercepted(url, data, direction, timestamp) {
  stats.wsMessagesTotal++;
  recordMessage();

  const result = classify_ws(url, data, direction);
  const { type, wsType, decoded } = result;

  // Track by classified type (ws-state, ws-helm-input, ws-ack, etc.)
  stats.wsClassifiedCounts[type] = (stats.wsClassifiedCounts[type] || 0) + 1;

  switch (type) {
    case 'ws-helm-input':
      stats.inshoreHelmInputs++;
      if (decoded && decoded.heading !== undefined) {
        const playerBoat = state.inshoreBoats?.values()?.next()?.value;
        const currentHdg = playerBoat?.heading;
        const delta = currentHdg != null ? (decoded.heading - currentHdg).toFixed(1) : '?';
        wsLog.info(`Helm: ${decoded.heading.toFixed(1)}\u00b0 (delta=${delta}\u00b0, input #${stats.inshoreHelmInputs})`, { direction });
        // Feed PlayerDetector
        playerDetector.addHelmInput(decoded.heading, state.inshoreTick || Date.now());
        // Record helm input
        if (raceRecorder.isRecording()) {
          raceRecorder.addHelmInput(decoded.heading, timestamp || Date.now());
        }
      } else {
        wsLog.warn(`Helm input decode failed (size=${data?.size ?? '?'}, input #${stats.inshoreHelmInputs})`, { direction });
      }
      break;

    case 'ws-ack':
      if (decoded) {
        wsLog.debug(`WS ack: heading=${decoded.heading}\u00b0 tick=${decoded.timestamp}`, { direction });
      }
      break;

    case 'ws-master-state':
      if (data?.base64) {
        try {
          const raw = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
          const masterResult = raw.length > 50
            ? decodeMasterState(raw)
            : decodeMasterUpdate(raw);
          stats.inshoreMasterDecodes++;
          fleetManager.updateFromMaster(masterResult);
          const named = masterResult.players.filter(p => p.name);
          const fleet = fleetManager.getFleet();
          masterLog.info(`Master #${stats.inshoreMasterDecodes}: ${masterResult.players.length} players (${named.length} named), fleet total=${fleet.length}, size=${raw.length}`);
          if (named.length > 0) {
            masterLog.info(`Fleet: ${named.map(p => `${p.name} [slot=${p.slotId ?? '?'}]`).join(', ')}`);
          }
        } catch (err) {
          stats.inshoreMasterErrors++;
          masterLog.error(`Master decode failed #${stats.inshoreMasterErrors} (size=${data?.size ?? '?'}): ${err.message}`);
        }
      }
      break;

    case 'ws-master-data':
      masterLog.debug(`Master data (size=${data?.size ?? '?'})`, { direction });
      break;

    case 'ws-state':
      if (data?.base64) {
        const t0 = Date.now();
        try {
          const raw = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
          const payload = raw.slice(2); // strip 0xf3 + type byte
          const decompressed = await decompressStateAsync(payload);
          const decoded_state = decodeState(decompressed);
          const normalized = normalizeInshoreState(decoded_state, playerDetector.getPlayerSlot());
          playerDetector.updateFromState(normalized);
          const updateResult = state.updateInshore(normalized);
          fleetManager.updateFromGame(normalized);

          // Record detected events (tack, gybe, wind shift)
          if (raceRecorder.isRecording() && updateResult.events) {
            for (const evt of updateResult.events) {
              raceRecorder.addEvent(evt);
            }
          }

          // Trigger Unity memory scan after first state with 10+ boats
          if (!unityScanTriggered && normalized.boats.length >= 10) {
            triggerUnityScan(normalized.boats);
          }

          // Auto-record race in background
          if (!raceAutoStarted && normalized.boats.length > 0) {
            raceAutoStarted = true;
            const rid = normalized.raceId || `inshore-${Date.now()}`;
            raceRecorder.startRecording(rid);
            log.info(`Auto-recording Inshore race: ${rid}`);
          }
          if (raceRecorder.isRecording()) {
            raceRecorder.addState(normalized);
          }

          // Telemetry
          stats.inshoreStateDecodes++;
          const decodeMs = Date.now() - t0;
          stats.inshoreDecodeLatency.push(decodeMs);
          if (stats.inshoreDecodeLatency.length > 20) stats.inshoreDecodeLatency.shift();

          // Track state rate
          const now = Date.now();
          if (stats.inshoreLastStateTime > 0) {
            const dt = now - stats.inshoreLastStateTime;
            stats.inshoreStateRate = dt > 0 ? Math.round(1000 / dt) : 0;
          }
          stats.inshoreLastStateTime = now;

          // Track boats spotted
          for (const b of normalized.boats) {
            stats.inshoreBoatsSpotted.add(b.slot);
          }

          // Log at DEBUG (not INFO) — 125/sec is too noisy for INFO
          const myBoat = normalized.boats.find(b => b.isPlayer) ?? normalized.boats[0];
          wsLog.debug(`State: ${normalized.boats.length} boats, tick=${normalized.tick}, hdg=${myBoat?.heading?.toFixed(0) ?? '?'}°, spd=${myBoat?.speedRaw ?? '?'}, player=${playerDetector.getPlayerSlot() ?? '?'}`);

          // Log summary at INFO every 500th decode
          if (stats.inshoreStateDecodes % 500 === 0) {
            const avgLatency = stats.inshoreDecodeLatency.reduce((a, b) => a + b, 0) / stats.inshoreDecodeLatency.length;
            wsLog.info(`Inshore stats: ${stats.inshoreStateDecodes} states decoded, ${stats.inshoreBoatsSpotted.size} unique boats, rate=${stats.inshoreStateRate}/sec, avg decode=${avgLatency.toFixed(1)}ms`);
          }
        } catch (err) {
          stats.inshoreStateErrors++;
          wsLog.error(`State decode failed #${stats.inshoreStateErrors} (size=${data?.size ?? '?'}): ${err.message}`);
          // Log decode error rate
          if (stats.inshoreStateErrors <= 5 || stats.inshoreStateErrors % 100 === 0) {
            wsLog.warn(`Decode error rate: ${stats.inshoreStateErrors}/${stats.inshoreStateDecodes + stats.inshoreStateErrors} (${((stats.inshoreStateErrors / (stats.inshoreStateDecodes + stats.inshoreStateErrors)) * 100).toFixed(1)}%)`);
          }
        }
      } else {
        wsLog.debug(`State update without base64 (size=${data?.size ?? '?'})`, { direction });
      }
      break;

    case 'ws-data':
      wsLog.debug(`WS room data (size=${data?.size ?? '?'})`, { direction });
      break;

    case 'ws-mark-crossing':
      if (decoded) {
        // Get player position from current state
        const playerBoat = Array.from(state.inshoreBoats.values()).find(b => b.isPlayer);
        if (playerBoat) {
          courseInferrer.addCrossing(
            decoded.markId,
            decoded.crossingAngle,
            playerBoat.x,
            playerBoat.y,
            playerBoat.heading,
            state.inshoreTick,
          );
          courseLog.info(`Mark crossing: mark=${decoded.markId} pos=(${playerBoat.x.toFixed(0)}, ${playerBoat.y.toFixed(0)}) angle=${decoded.hasAngle ? decoded.crossingAngle.toFixed(1) : 'N/A'}`);
        } else {
          courseLog.warn(`Mark crossing mark=${decoded.markId} but no player boat found in state`);
        }
      } else {
        courseLog.warn('Mark crossing without decoded data');
      }
      break;

    case 'ws-leave':
      wsLog.info('WS leave room', { direction });
      // Reset player detection, course inference, and scan trigger for next race
      playerDetector.reset();
      courseInferrer.reset();
      unityScanTriggered = false;
      // Auto-stop recording on leave
      if (raceRecorder.isRecording()) {
        raceRecorder.addEvent({ type: 'leave', timestamp: Date.now(), direction });
        const raceData = raceRecorder.stopRecording();
        raceAutoStarted = false;
        log.info(`Race recording stopped: ${raceData.states.length} states, ${raceData.events.length} events, ${raceData.helmInputs.length} helm inputs, ${raceData.duration.toFixed(0)}s`);
        // Save to IndexedDB if available
        if (db) {
          raceRecorder.persist(db).then(() => {
            log.info('Race recording saved to IndexedDB');
          }).catch(err => {
            log.error('Failed to save race recording: ' + err.message);
          });
        }
      }
      break;

    default:
      wsLog.warn(`WS ${direction}: unknown (${wsType || 'empty'}, size=${data?.size ?? '?'})`, {
        url,
        wsType,
        direction,
      });
      autoEnableRawCapture('Inshore WebSocket traffic detected — capturing for analysis');
      break;
  }

  // Always save WS messages to raw capture for offline analysis
  try {
    const entry = {
      url,
      direction,
      wsType,
      type,
      data,
      decoded: decoded || null,
      timestamp: timestamp || Date.now(),
      source: 'websocket',
    };
    const captureResult = await chrome.storage.local.get('vregatta-raw-capture');
    const entries = captureResult['vregatta-raw-capture'] || [];
    entries.push(entry);
    while (entries.length > 500) {
      entries.shift();
    }
    await chrome.storage.local.set({ 'vregatta-raw-capture': entries });
  } catch (err) {
    wsLog.error('Failed to save WS raw capture', { error: err.message });
  }

  updateBadge();
}

// --- Unity memory scan handling ---
function handleUnityScanResults(data) {
  if (!data) {
    unityScanLog.warn('Received empty unity scan results');
    return;
  }

  unityScanLog.info('Unity scan results received', {
    heapMB: data.heapSizeMB,
    knownBoats: data.knownBoatCount,
    f32RawCandidates: data.float32?.rawCandidates,
    f32Clusters: data.float32?.clusters?.length,
    f32ScanMs: data.float32?.scanTimeMs,
    i16RawCandidates: data.int16?.rawCandidates,
    i16Clusters: data.int16?.clusters?.length,
    i16ScanMs: data.int16?.scanTimeMs,
    stringHits: data.strings?.length,
  });

  // Log top float32 clusters (likely mark positions)
  if (data.float32?.clusters?.length > 0) {
    const top = data.float32.clusters.slice(0, 10);
    unityScanLog.info('Top float32 clusters (possible marks):', top.map(c =>
      `(${c.x.toFixed(0)}, ${c.y.toFixed(0)}) hits=${c.count}`
    ));
  }

  // Log top int16 clusters
  if (data.int16?.clusters?.length > 0) {
    const top = data.int16.clusters.slice(0, 10);
    unityScanLog.info('Top int16 clusters (possible marks):', top.map(c =>
      `(${c.x.toFixed(0)}, ${c.y.toFixed(0)}) hits=${c.count}`
    ));
  }

  // Log string hits
  if (data.strings?.length > 0) {
    unityScanLog.info('String matches in WASM heap:', data.strings.slice(0, 20).map(s =>
      `"${s.term}" @ offset ${s.offset}: ${s.context}`
    ));
  }
}

function triggerUnityScan(boats) {
  if (unityScanTriggered) return;
  unityScanTriggered = true;

  const positions = boats.map(b => ({ x: b.x, y: b.y, slot: b.slot }));

  unityScanLog.info('Triggering Unity scan with ' + positions.length + ' known boat positions');

  chrome.tabs.query({ url: '*://play.inshore.virtualregatta.com/*' }, (tabs) => {
    for (const tab of tabs) {
      try {
        chrome.tabs.sendMessage(tab.id, {
          type: 'triggerUnityScan',
          boatPositions: positions,
        });
      } catch (err) {
        unityScanLog.warn('Failed to send scan trigger to tab ' + tab.id + ': ' + err.message);
      }
    }
  });
}

log.info('vRegatta background service worker loaded');
