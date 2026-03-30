/**
 * Main entry point for the Inshore-focused racing dashboard.
 *
 * Connects to the extension background, polls for Inshore state,
 * and feeds data to map, instruments, events, and rules panels.
 */

import { initInshoreMap } from './inshore-map.js';
import { initInshoreInstruments } from './inshore-instruments.js';
import { initInshoreEvents } from './inshore-events.js';
import { initRulesPanel } from './rules-panel.js';
import { detectEncounters } from '../rules/encounter-detector.js';
import { initCapture } from './capture.js';

// --- Initialize components ---
const raceMap = initInshoreMap('race-map');
const instruments = initInshoreInstruments('instrument-bar');
const rulesPanel = initRulesPanel('rules-sidebar');
const events = initInshoreEvents('rules-sidebar');
const capture = initCapture();

// Fleet count display
const fleetCountEl = document.getElementById('fleet-count');

// New boat notification element
let newBoatNotif = document.getElementById('new-boat-notif');
if (!newBoatNotif) {
  newBoatNotif = document.createElement('div');
  newBoatNotif.id = 'new-boat-notif';
  newBoatNotif.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;background:#2ecc71;color:#1a1a2e;padding:8px 16px;border-radius:6px;font-weight:bold;font-size:13px;opacity:0;transition:opacity 0.3s;pointer-events:none;';
  document.body.appendChild(newBoatNotif);
}
let lastKnownFleetSize = 0;

// Track history per boat slot
const inshoreTrackHistory = new Map();
const MAX_TRACK = 200;

// Polling — 100ms (10/sec) for smooth boat motion on map
const POLL_MS = 100;
let waitingOverlay = document.getElementById('waiting-overlay');
let hasReceivedData = false;

// Previous events for dedup
let lastEventCount = 0;

// Penalty tracking
const penaltyState = new Map();

// Throttle rules panel — max 1 update per second, only when encounters change
let lastRulesUpdate = 0;
let lastEncounterKey = '';
const RULES_UPDATE_INTERVAL = 1000;

function poll() {
  chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
    if (chrome.runtime.lastError || !response) return;

    const snapshot = response;

    // Check for active Inshore data
    if (snapshot.inshoreActive && snapshot.inshoreBoats && snapshot.inshoreBoats.length > 0) {
      if (!hasReceivedData) {
        hasReceivedData = true;
        if (waitingOverlay) waitingOverlay.classList.add('hidden');
      }

      // Build track history
      for (const boat of snapshot.inshoreBoats) {
        let track = inshoreTrackHistory.get(boat.slot);
        if (!track) {
          track = [];
          inshoreTrackHistory.set(boat.slot, track);
        }
        const last = track[track.length - 1];
        if (!last || last.x !== boat.x || last.y !== boat.y) {
          track.push({ x: boat.x, y: boat.y });
          if (track.length > MAX_TRACK) track.splice(0, track.length - MAX_TRACK);
        }
      }
      snapshot._inshoreTrackHistory = Object.fromEntries(inshoreTrackHistory);

      // --- Update fleet count display (accumulated) ---
      const accStats = snapshot.inshoreAccStats;
      if (fleetCountEl && accStats) {
        const vis = accStats.currentlyVisible;
        const known = accStats.totalSeen;
        fleetCountEl.textContent = `Spotted ${known} of 18 boats (${vis} visible)`;
        fleetCountEl.title = `${accStats.stale} stale (not seen for >5s)`;
      } else if (fleetCountEl && snapshot.inshoreFleetStats) {
        const stats = snapshot.inshoreFleetStats;
        if (stats.total > 0) {
          const visible = snapshot.inshoreBoats ? snapshot.inshoreBoats.length : 0;
          fleetCountEl.textContent = `${visible}/${stats.total} boats visible`;
          fleetCountEl.title = `${stats.withName} named, ${stats.inRace} racing`;
        }
      }

      // --- New boat spotted notification ---
      if (accStats && accStats.totalSeen > lastKnownFleetSize) {
        const newCount = accStats.totalSeen - lastKnownFleetSize;
        lastKnownFleetSize = accStats.totalSeen;
        if (newBoatNotif && lastKnownFleetSize > 1) { // skip first batch
          newBoatNotif.textContent = newCount === 1
            ? `New boat spotted! (${accStats.totalSeen} total)`
            : `${newCount} new boats spotted! (${accStats.totalSeen} total)`;
          newBoatNotif.style.opacity = '1';
          setTimeout(() => { newBoatNotif.style.opacity = '0'; }, 2500);
        }
      } else if (accStats) {
        lastKnownFleetSize = accStats.totalSeen;
      }

      // --- Feed map ---
      if (raceMap) {
        raceMap.update(snapshot);
      }

      // --- Feed instruments ---
      if (instruments) instruments.update(snapshot);

      // --- Encounter detection and rules ---
      let encounters = [];
      if (snapshot.inshorePlayerBoat) {
        encounters = detectEncounters(
          snapshot.inshorePlayerBoat,
          snapshot.inshoreBoats || [],
          snapshot.inshoreWindDirection,
        );

        // Update map with encounter coloring
        if (raceMap) raceMap.updateEncounters(encounters);
      }

      // --- Mark detection ---
      // DISABLED: mark inference from turning patterns was producing noisy results
      // with jumping positions. Needs rework with corrected coordinate system
      // (X=North, Y=East). Will re-enable once we have a reliable detection algorithm
      // or find marks in the protocol data.
      const now = Date.now();
      void now; // keep for other uses

      // Feed fleet names and rules panel — THROTTLED to prevent layout thrashing
      if (rulesPanel) {
        if (snapshot.inshoreFleet) rulesPanel.updateFleet(snapshot.inshoreFleet);

        // Only update rules if encounters changed OR enough time passed
        const encounterKey = encounters.map(e => `${e.rule}:${e.otherBoat?.slot ?? 'mark'}:${e.urgency}`).join('|');
        const rulesTimePassed = now - lastRulesUpdate >= RULES_UPDATE_INTERVAL;
        if (encounterKey !== lastEncounterKey || rulesTimePassed) {
          lastEncounterKey = encounterKey;
          lastRulesUpdate = now;
          rulesPanel.update(encounters);
        }
      }

      // --- Events ---
      if (snapshot.events && snapshot.events.length > lastEventCount) {
        const newEvents = snapshot.events.slice(lastEventCount);
        lastEventCount = snapshot.events.length;
        if (events) events.update(newEvents);
      }

      // Penalty detection from boat penalty timers
      for (const boat of snapshot.inshoreBoats) {
        if (boat.isPlayer) {
          const prevPenalty = penaltyState.get(boat.slot);
          const hasPenalty = boat.penaltyTimer !== 65535 && boat.penaltyTimer < 60000;
          if (hasPenalty && !prevPenalty) {
            if (events) events.addEvent('penalty', `Timer: ${boat.penaltyTimer}`, now);
          }
          penaltyState.set(boat.slot, hasPenalty);
        }
      }
    } else {
      // No Inshore data — maybe it stopped
      if (hasReceivedData) {
        // Keep showing last state, don't re-show waiting
      }
    }
  });
}

// Start polling
setInterval(poll, POLL_MS);
poll();

// Handle window resize
window.addEventListener('resize', () => {
  if (raceMap) raceMap.resize();
});

// --- Capture controls ---
const captureBtn = document.getElementById('capture-btn');
const captureRecording = document.getElementById('capture-recording');
const captureFrameCount = document.getElementById('capture-frame-count');
const captureStopBtn = document.getElementById('capture-stop-btn');
const shutterFlash = document.getElementById('shutter-flash');

function flashShutter() {
  if (!shutterFlash) return;
  shutterFlash.classList.add('flash');
  setTimeout(() => shutterFlash.classList.remove('flash'), 100);
}

if (captureBtn) {
  captureBtn.addEventListener('click', async (e) => {
    if (e.shiftKey) {
      // Shift+click: start sequence capture
      if (!capture.isRecording()) {
        capture.startSequence(2000);
      }
    } else {
      // Normal click: single capture
      flashShutter();
      await capture.captureBundle();
    }
  });
}

if (captureStopBtn) {
  captureStopBtn.addEventListener('click', () => {
    capture.stopSequence();
  });
}

// Listen for capture events
window.addEventListener('capture-sequence-start', () => {
  if (captureRecording) captureRecording.classList.remove('hidden');
  if (captureFrameCount) captureFrameCount.textContent = '0/30';
});

window.addEventListener('capture-sequence-stop', () => {
  if (captureRecording) captureRecording.classList.add('hidden');
});

window.addEventListener('capture-frame', (e) => {
  const { frameCount, maxFrames } = e.detail;
  if (captureFrameCount) captureFrameCount.textContent = `${frameCount}/${maxFrames}`;
  flashShutter();
});
