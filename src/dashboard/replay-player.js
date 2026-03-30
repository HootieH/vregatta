/**
 * Replay player for Inshore race recordings.
 *
 * Plays back recorded states at configurable speed, emitting snapshots
 * in the same format as live data so all dashboard components work
 * without modification.
 */

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8];

/**
 * Initialize the replay player, creating transport controls in the given container.
 *
 * @param {string} containerId — DOM element ID to host the replay controls bar
 * @returns {{
 *   loadRace: function,
 *   play: function,
 *   pause: function,
 *   seek: function,
 *   setSpeed: function,
 *   getState: function,
 *   onStateChange: function,
 *   destroy: function,
 * }}
 */
export function initReplayPlayer(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  let raceData = null;
  let currentIndex = 0;
  let playing = false;
  let playbackSpeed = 1;
  let intervalId = null;
  let stateCallback = null;

  // --- Build DOM ---
  const bar = document.createElement('div');
  bar.className = 'replay-controls';
  bar.innerHTML = `
    <button class="replay-btn replay-play-btn" title="Play/Pause">&#9654;</button>
    <span class="replay-time">00:00</span>
    <input type="range" class="replay-scrubber" min="0" max="0" value="0" step="1">
    <span class="replay-duration">00:00</span>
    <select class="replay-speed-select">
      ${SPEED_OPTIONS.map((s) => `<option value="${s}" ${s === 1 ? 'selected' : ''}>${s}x</option>`).join('')}
    </select>
    <span class="replay-label">REPLAY</span>
  `;
  bar.style.display = 'none';
  container.appendChild(bar);

  const playBtn = bar.querySelector('.replay-play-btn');
  const scrubber = bar.querySelector('.replay-scrubber');
  const timeEl = bar.querySelector('.replay-time');
  const durationEl = bar.querySelector('.replay-duration');
  const speedSelect = bar.querySelector('.replay-speed-select');

  // --- Helpers ---

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function tickToSeconds(index) {
    if (!raceData || raceData.states.length === 0) return 0;
    // Each stored state is ~80ms apart (12.5/sec)
    return index / 12.5;
  }

  function totalSeconds() {
    if (!raceData) return 0;
    return raceData.states.length / 12.5;
  }

  function emitCurrentState() {
    if (!raceData || raceData.states.length === 0) return;
    const state = raceData.states[currentIndex];
    if (!state) return;

    // Build a snapshot matching the LiveState.getSnapshot() shape
    const boats = state.boats || [];
    const playerBoat = boats[0] || null;
    const inshoreBoats = boats.map((b, i) => ({
      ...b,
      isPlayer: i === 0,
      speedRaw: (b.speed ?? 0) * 10000,
      rateOfTurn: 0,
      localWindDirection: 0,
      active: true,
      penaltyTimer: 65535,
      raceProgress: 0,
      distanceSailed: 0,
      pointOfSail: null,
      vmg: null,
    }));

    const snapshot = {
      boat: null,
      race: null,
      competitorCount: 0,
      vmg: null,
      events: [],
      connected: true,
      inshoreBoats,
      inshoreTick: state.tick,
      inshoreActive: true,
      inshoreWindDirection: state.windDirection,
      inshoreWindSpeed: null,
      inshorePlayerBoat: inshoreBoats[0] || null,
      inshoreTwa: playerBoat?.twa ?? null,
      inshoreTack: playerBoat?.tack ?? null,
      inshorePointOfSail: null,
      inshoreVmg: null,
      inshoreSpeed: playerBoat ? (playerBoat.speed ?? 0) * 10000 : null,
      _replay: true,
      _replayIndex: currentIndex,
      _replayTotal: raceData.states.length,
    };

    // Build track history from states up to currentIndex
    const trackHistory = {};
    for (let i = 0; i <= currentIndex; i++) {
      const s = raceData.states[i];
      if (!s || !s.boats) continue;
      for (const b of s.boats) {
        if (!trackHistory[b.slot]) trackHistory[b.slot] = [];
        const track = trackHistory[b.slot];
        const last = track[track.length - 1];
        if (!last || last.x !== b.x || last.y !== b.y) {
          track.push({ x: b.x, y: b.y });
        }
      }
    }
    snapshot._inshoreTrackHistory = trackHistory;

    if (stateCallback) stateCallback(snapshot);
  }

  function updateUI() {
    timeEl.textContent = formatTime(tickToSeconds(currentIndex));
    scrubber.value = currentIndex;
    playBtn.innerHTML = playing ? '&#9646;&#9646;' : '&#9654;';
  }

  function step() {
    if (!raceData || currentIndex >= raceData.states.length - 1) {
      pause();
      return;
    }
    currentIndex++;
    updateUI();
    emitCurrentState();
  }

  // --- Controls ---

  function loadRace(data) {
    pause();
    raceData = data;
    currentIndex = 0;
    if (!data || !data.states || data.states.length === 0) {
      bar.style.display = 'none';
      return;
    }
    scrubber.max = data.states.length - 1;
    scrubber.value = 0;
    durationEl.textContent = formatTime(totalSeconds());
    bar.style.display = '';
    updateUI();
    emitCurrentState();
  }

  function play() {
    if (!raceData || raceData.states.length === 0) return;
    if (playing) return;
    playing = true;
    // Base interval: 80ms per state at 1x (12.5 states/sec)
    const interval = 80 / playbackSpeed;
    intervalId = setInterval(step, interval);
    updateUI();
  }

  function pause() {
    playing = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    updateUI();
  }

  function seek(index) {
    if (!raceData) return;
    currentIndex = Math.max(0, Math.min(index, raceData.states.length - 1));
    updateUI();
    emitCurrentState();
  }

  function setSpeed(multiplier) {
    playbackSpeed = multiplier;
    speedSelect.value = multiplier;
    if (playing) {
      // Restart interval with new speed
      clearInterval(intervalId);
      const interval = 80 / playbackSpeed;
      intervalId = setInterval(step, interval);
    }
  }

  function getState() {
    if (!raceData || raceData.states.length === 0) return null;
    return raceData.states[currentIndex] || null;
  }

  function onStateChange(cb) {
    stateCallback = cb;
  }

  function destroy() {
    pause();
    bar.remove();
  }

  function isActive() {
    return raceData !== null && raceData.states.length > 0;
  }

  // --- Event wiring ---
  playBtn.addEventListener('click', () => {
    if (playing) pause();
    else play();
  });

  scrubber.addEventListener('input', () => {
    seek(parseInt(scrubber.value, 10));
  });

  speedSelect.addEventListener('change', () => {
    setSpeed(parseFloat(speedSelect.value));
  });

  return { loadRace, play, pause, seek, setSpeed, getState, onStateChange, destroy, isActive };
}
