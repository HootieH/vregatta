/**
 * Replay panel — UI for browsing saved race replays, loading them,
 * and viewing analysis summaries + event timelines.
 */

import { analyzeReplay } from './replay-analysis.js';

/**
 * Initialize the replay panel UI inside the given container.
 *
 * @param {string} containerId — DOM element ID
 * @returns {{
 *   setReplays: function,
 *   onLoadReplay: function,
 *   onDeleteReplay: function,
 *   showAnalysis: function,
 *   onTimelineClick: function,
 * }}
 */
export function initReplayPanel(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  let loadCallback = null;
  let deleteCallback = null;
  let timelineClickCallback = null;
  let currentAnalysis = null;

  container.innerHTML = `
    <div class="replay-panel-inner">
      <div class="replay-header">
        <span class="replay-header-title">Race Replays</span>
      </div>
      <div class="replay-race-list"></div>
      <div class="replay-analysis-section" style="display:none;"></div>
      <div class="replay-timeline-section" style="display:none;"></div>
    </div>
  `;

  const raceListEl = container.querySelector('.replay-race-list');
  const analysisEl = container.querySelector('.replay-analysis-section');
  const timelineEl = container.querySelector('.replay-timeline-section');

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Populate the race list from an array of replay metadata.
   */
  function setReplays(replays) {
    if (!replays || replays.length === 0) {
      raceListEl.innerHTML = '<div class="replay-empty">No saved replays yet. Play an Inshore race to record one automatically.</div>';
      return;
    }

    // Sort by startTime descending (most recent first)
    const sorted = replays.slice().sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));

    raceListEl.innerHTML = sorted
      .map((r) => {
        const boatCount = r.states?.[0]?.boats?.length ?? '?';
        const stateCount = r.states?.length ?? 0;
        return `
        <div class="replay-race-item" data-race-id="${r.raceId}">
          <div class="replay-race-info">
            <span class="replay-race-date">${formatDate(r.startTime)}</span>
            <span class="replay-race-meta">${formatDuration(r.duration ?? 0)} | ${boatCount} boats | ${stateCount} states</span>
          </div>
          <div class="replay-race-actions">
            <button class="replay-load-btn" data-race-id="${r.raceId}">Load</button>
            <button class="replay-delete-btn" data-race-id="${r.raceId}">X</button>
          </div>
        </div>`;
      })
      .join('');

    // Wire load buttons
    raceListEl.querySelectorAll('.replay-load-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (loadCallback) loadCallback(btn.dataset.raceId);
      });
    });

    // Wire delete buttons
    raceListEl.querySelectorAll('.replay-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (deleteCallback) deleteCallback(btn.dataset.raceId);
      });
    });
  }

  /**
   * Show analysis summary and event timeline for a loaded replay.
   */
  function showAnalysis(raceData) {
    if (!raceData) {
      analysisEl.style.display = 'none';
      timelineEl.style.display = 'none';
      return;
    }

    currentAnalysis = analyzeReplay(raceData);
    const { summary, timeline } = currentAnalysis;

    // Summary card
    analysisEl.style.display = '';
    analysisEl.innerHTML = `
      <div class="replay-analysis-card">
        <div class="replay-analysis-title">Race Summary</div>
        <div class="replay-stat-row">
          <span class="replay-stat-label">Duration</span>
          <span class="replay-stat-value">${formatDuration(summary.duration)}</span>
        </div>
        <div class="replay-stat-row">
          <span class="replay-stat-label">Tacks</span>
          <span class="replay-stat-value">${summary.totalTacks}</span>
        </div>
        <div class="replay-stat-row">
          <span class="replay-stat-label">Gybes</span>
          <span class="replay-stat-value">${summary.totalGybes}</span>
        </div>
        <div class="replay-stat-row">
          <span class="replay-stat-label">Avg Speed</span>
          <span class="replay-stat-value">${summary.avgSpeed.toFixed(3)}</span>
        </div>
        <div class="replay-stat-row">
          <span class="replay-stat-label">Max Speed</span>
          <span class="replay-stat-value">${summary.maxSpeed.toFixed(3)}</span>
        </div>
        <div class="replay-stat-row">
          <span class="replay-stat-label">Distance</span>
          <span class="replay-stat-value">${summary.distanceSailed}</span>
        </div>
      </div>
    `;

    // Event timeline bar
    if (timeline.length > 0 && raceData.states?.length > 0) {
      timelineEl.style.display = '';
      const totalTicks = raceData.states[raceData.states.length - 1].tick - raceData.states[0].tick;
      const firstTick = raceData.states[0].tick;

      const eventColors = {
        tack: '#3a86ff',
        gybe: '#ff8c00',
        penalty: '#ff4444',
        mark: '#44cc44',
        encounter: '#ff6b9d',
      };

      const markers = timeline.map((evt) => {
        const pct = totalTicks > 0 ? ((evt.tick - firstTick) / totalTicks) * 100 : 0;
        const color = eventColors[evt.type] || '#888';
        return `<div class="replay-timeline-marker"
                     data-index="${evt.tick}"
                     style="left:${pct}%;background:${color}"
                     title="${evt.type} at tick ${evt.tick}"></div>`;
      }).join('');

      timelineEl.innerHTML = `
        <div class="replay-timeline-title">Event Timeline</div>
        <div class="replay-timeline-bar">${markers}</div>
        <div class="replay-timeline-legend">
          <span class="replay-legend-item"><span class="replay-legend-dot" style="background:#3a86ff"></span>Tack</span>
          <span class="replay-legend-item"><span class="replay-legend-dot" style="background:#ff8c00"></span>Gybe</span>
          <span class="replay-legend-item"><span class="replay-legend-dot" style="background:#ff4444"></span>Penalty</span>
          <span class="replay-legend-item"><span class="replay-legend-dot" style="background:#44cc44"></span>Mark</span>
        </div>
      `;

      // Wire timeline marker clicks
      timelineEl.querySelectorAll('.replay-timeline-marker').forEach((marker) => {
        marker.addEventListener('click', () => {
          const tick = parseInt(marker.dataset.index, 10);
          if (timelineClickCallback) timelineClickCallback(tick);
        });
      });
    } else {
      timelineEl.style.display = 'none';
    }
  }

  function onLoadReplay(cb) {
    loadCallback = cb;
  }

  function onDeleteReplay(cb) {
    deleteCallback = cb;
  }

  function onTimelineClick(cb) {
    timelineClickCallback = cb;
  }

  function getAnalysis() {
    return currentAnalysis;
  }

  return { setReplays, onLoadReplay, onDeleteReplay, showAnalysis, onTimelineClick, getAnalysis };
}
