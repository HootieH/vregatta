import { classify } from './classifier.js';
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
} from './storage/idb.js';
import { LiveState } from './state/live-state.js';
import { createLogger, getLogs, clearLogs, setLogLevel, getLogLevel, LogLevel } from './telemetry.js';

const log = createLogger('background');
const interceptorLog = createLogger('interceptor');
const classifierLog = createLogger('classifier');
const normalizerLog = createLogger('normalizer');
const storageLog = createLogger('storage');
const stateLog = createLogger('state');

const db = await openDB();
const state = new LiveState();

// --- Pipeline stats ---
const stats = {
  totalIntercepted: 0,
  classifiedCounts: {},
  normalizeFails: 0,
  storageWrites: 0,
  unknownCount: 0,
  pipelineErrors: 0,
};

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
    // FIFO cap at 100
    while (entries.length > 100) {
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
    handleIntercepted(message.url, message.body);
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
    sendResponse(state.getSnapshot());
    return true;
  }

  if (message.type === 'getPolar') {
    const polarId = message.polarId ?? state.race?.polarId;
    if (polarId == null) {
      sendResponse({ polar: null });
      return true;
    }
    getPolar(db, polarId)
      .then((polar) => sendResponse({ polar }))
      .catch(() => sendResponse({ polar: null }));
    return true;
  }

  if (message.type === 'exportRace') {
    exportRace(db, message.raceId)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'getStats') {
    getRawCaptureCount().then((rawCaptureCount) => {
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
          await saveBoatState(db, normalized);
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
          await saveCompetitors(db, state.race?.raceId, Date.now(), normalized);
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
          await saveRace(db, normalized);
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
          await saveAction(db, normalized);
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
          await saveWindSnapshot(db, normalized);
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
          await savePolar(db, normalized);
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

log.info('vRegatta background service worker loaded');
