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
import { detectMarks, detectCurrentLeg, isApproachingMark } from '../colyseus/mark-detector.js';
import { createStateHistory } from '../colyseus/inshore-pipeline.js';

// --- Initialize components ---
const raceMap = initInshoreMap('race-map');
const instruments = initInshoreInstruments('instrument-bar');
const rulesPanel = initRulesPanel('rules-sidebar');
const events = initInshoreEvents('rules-sidebar');

// State history for mark detection
const stateHistory = createStateHistory(500);
let detectedMarks = [];
let lastMarkDetection = 0;
const MARK_DETECTION_INTERVAL = 2000;

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

// Polling
const POLL_MS = 200;
let waitingOverlay = document.getElementById('waiting-overlay');
let hasReceivedData = false;

// Previous events for dedup
let lastEventCount = 0;

// Penalty tracking
const penaltyState = new Map();

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
      if (raceMap) raceMap.update(snapshot);

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
      const now = Date.now();
      const stateForHistory = {
        tick: snapshot.inshoreTick ?? now,
        boats: snapshot.inshoreBoats,
      };
      stateHistory.push(stateForHistory);

      if (now - lastMarkDetection >= MARK_DETECTION_INTERVAL) {
        lastMarkDetection = now;
        const result = detectMarks(stateHistory.getHistory());
        detectedMarks = result.marks;

        const player = snapshot.inshorePlayerBoat;
        if (player && detectedMarks.length > 0) {
          const legInfo = detectCurrentLeg(player, detectedMarks);

          // Mark approach alert
          if (legInfo.nextMark && isApproachingMark(player, legInfo.nextMark)) {
            if (legInfo.distanceToMark < 1500) {
              const markAlert = {
                rule: 'mark',
                otherBoat: null,
                distance: legInfo.distanceToMark,
                situation: 'mark_approach',
                playerRole: null,
                urgency: legInfo.distanceToMark < 500 ? 'critical' : 'high',
                description: `Approaching ${legInfo.nextMark.id} (${legInfo.distanceToMark} units)`,
              };
              encounters = [markAlert, ...encounters];
            }
          }
        }

        if (raceMap) raceMap.updateMarks(detectedMarks);
      }

      // Feed fleet names and rules panel
      if (rulesPanel) {
        if (snapshot.inshoreFleet) rulesPanel.updateFleet(snapshot.inshoreFleet);
        rulesPanel.update(encounters);
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
