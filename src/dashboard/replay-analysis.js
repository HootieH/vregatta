/**
 * Post-race analysis for Inshore race replays.
 *
 * Takes a complete race recording and produces summary stats, a timeline
 * of key events, speed heatmap data, rules encounters, and mark roundings.
 */

/**
 * Analyze a complete race replay.
 *
 * @param {object} raceData — { raceId, states[], events[], marks[], startTime, endTime, duration }
 * @returns {object} Comprehensive analysis object
 */
export function analyzeReplay(raceData) {
  if (!raceData) {
    return emptyAnalysis();
  }

  const states = raceData.states || [];
  const events = raceData.events || [];
  const marks = raceData.marks || [];
  const duration = raceData.duration ?? 0;

  if (states.length === 0) {
    return {
      ...emptyAnalysis(),
      summary: { ...emptyAnalysis().summary, duration },
    };
  }

  // --- Summary stats (player boat = index 0) ---
  const totalTacks = events.filter((e) => e.type === 'tack').length;
  const totalGybes = events.filter((e) => e.type === 'gybe').length;

  let speedSum = 0;
  let speedCount = 0;
  let maxSpeed = 0;
  let totalDistance = 0;

  for (let i = 0; i < states.length; i++) {
    const player = states[i].boats?.[0];
    if (!player) continue;

    const spd = player.speed ?? 0;
    speedSum += spd;
    speedCount++;
    if (spd > maxSpeed) maxSpeed = spd;

    // Distance from previous state (Euclidean in game coords)
    if (i > 0) {
      const prev = states[i - 1].boats?.[0];
      if (prev) {
        const dx = player.x - prev.x;
        const dy = player.y - prev.y;
        totalDistance += Math.sqrt(dx * dx + dy * dy);
      }
    }
  }

  const avgSpeed = speedCount > 0 ? speedSum / speedCount : 0;

  const summary = {
    duration,
    totalTacks,
    totalGybes,
    avgSpeed: Math.round(avgSpeed * 1000) / 1000,
    maxSpeed: Math.round(maxSpeed * 1000) / 1000,
    distanceSailed: Math.round(totalDistance),
  };

  // --- Timeline: merge events with ticks ---
  const timeline = events.map((e) => ({
    tick: e.tick ?? 0,
    type: e.type,
    details: { ...e },
    quality: e.quality ?? null,
  }));

  // Sort timeline by tick
  timeline.sort((a, b) => a.tick - b.tick);

  // --- Heatmap: speed by leg ---
  const speedByLeg = computeSpeedByLeg(states, marks);
  const { worstMoments, bestMoments } = findExtremes(states);

  const heatmap = {
    speedByLeg,
    worstMoments,
    bestMoments,
  };

  // --- Rules encounters from events ---
  const rulesEncounters = events
    .filter((e) => e.type === 'encounter' || e.type === 'penalty' || e.rule)
    .map((e) => ({
      tick: e.tick ?? 0,
      rule: e.rule ?? null,
      playerRole: e.playerRole ?? null,
      outcome: e.outcome ?? null,
    }));

  // --- Mark roundings from events ---
  const markRoundings = events
    .filter((e) => e.type === 'mark')
    .map((e) => ({
      tick: e.tick ?? 0,
      markId: e.markId ?? null,
      approachAngle: e.approachAngle ?? null,
      exitAngle: e.exitAngle ?? null,
      speedLoss: e.speedLoss ?? null,
      quality: e.quality ?? null,
    }));

  return {
    summary,
    timeline,
    heatmap,
    rulesEncounters,
    markRoundings,
  };
}

// --- Internals ---

function emptyAnalysis() {
  return {
    summary: {
      duration: 0,
      totalTacks: 0,
      totalGybes: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      distanceSailed: 0,
    },
    timeline: [],
    heatmap: {
      speedByLeg: [],
      worstMoments: [],
      bestMoments: [],
    },
    rulesEncounters: [],
    markRoundings: [],
  };
}

/**
 * Compute average speed and TWA per leg using mark positions as boundaries.
 */
function computeSpeedByLeg(states, marks) {
  if (!marks || marks.length === 0 || states.length === 0) {
    // Single leg = entire race
    const player = states.map((s) => s.boats?.[0]).filter(Boolean);
    if (player.length === 0) return [];
    const avgSpd = player.reduce((s, b) => s + (b.speed ?? 0), 0) / player.length;
    const avgTwa = player.reduce((s, b) => s + Math.abs(b.twa ?? 0), 0) / player.length;
    return [{ leg: 1, avgSpeed: Math.round(avgSpd * 1000) / 1000, avgTwa: Math.round(avgTwa * 10) / 10 }];
  }

  // Simplified: split states evenly across marks as leg boundaries
  const legsCount = marks.length + 1;
  const statesPerLeg = Math.ceil(states.length / legsCount);
  const legs = [];

  for (let leg = 0; leg < legsCount; leg++) {
    const start = leg * statesPerLeg;
    const end = Math.min(start + statesPerLeg, states.length);
    const slice = states.slice(start, end);
    const players = slice.map((s) => s.boats?.[0]).filter(Boolean);

    if (players.length === 0) continue;
    const avgSpd = players.reduce((s, b) => s + (b.speed ?? 0), 0) / players.length;
    const avgTwa = players.reduce((s, b) => s + Math.abs(b.twa ?? 0), 0) / players.length;

    legs.push({
      leg: leg + 1,
      avgSpeed: Math.round(avgSpd * 1000) / 1000,
      avgTwa: Math.round(avgTwa * 10) / 10,
    });
  }

  return legs;
}

/**
 * Find the worst and best speed moments (significant drops/peaks relative to average).
 */
function findExtremes(states) {
  const worstMoments = [];
  const bestMoments = [];

  if (states.length < 10) return { worstMoments, bestMoments };

  // Compute rolling average over a window of 25 states (~2 seconds)
  const WINDOW = 25;
  const speeds = states.map((s) => s.boats?.[0]?.speed ?? 0);
  const globalAvg = speeds.reduce((s, v) => s + v, 0) / speeds.length;

  if (globalAvg === 0) return { worstMoments, bestMoments };

  for (let i = WINDOW; i < speeds.length; i++) {
    const windowAvg = speeds.slice(i - WINDOW, i).reduce((s, v) => s + v, 0) / WINDOW;
    const ratio = windowAvg / globalAvg;

    if (ratio < 0.6 && (worstMoments.length === 0 || i - worstMoments[worstMoments.length - 1].stateIndex > WINDOW)) {
      worstMoments.push({
        tick: states[i].tick,
        stateIndex: i,
        reason: 'speed_drop',
        speedLoss: Math.round((1 - ratio) * 100),
      });
    }

    if (ratio > 1.3 && (bestMoments.length === 0 || i - bestMoments[bestMoments.length - 1].stateIndex > WINDOW)) {
      bestMoments.push({
        tick: states[i].tick,
        stateIndex: i,
        reason: 'speed_peak',
      });
    }
  }

  // Keep top 5 of each
  worstMoments.sort((a, b) => b.speedLoss - a.speedLoss);
  worstMoments.splice(5);

  bestMoments.splice(5);

  return { worstMoments, bestMoments };
}
