import { computeSpeedEfficiency, computeVMGEfficiency, computeSailScore, analyzeTackQuality, analyzeGybeQuality } from './performance.js';

/**
 * Computes comprehensive session statistics from boat history and events.
 * @param {object[]} boatHistory - array of boat states sorted chronologically
 * @param {object[]} events - array of detected events (tack, gybe, sailChange)
 * @param {object} polar - polar data
 * @param {string[]} options - e.g. ['foil', 'hull', 'light']
 * @returns {object} session stats
 */
export function computeSessionStats(boatHistory, events, polar, options) {
  const opts = options || [];
  const history = boatHistory || [];
  const evts = events || [];

  if (history.length === 0 || !polar) {
    return emptyStats();
  }

  // Speed and VMG efficiency aggregates
  let speedEffSum = 0;
  let speedEffCount = 0;
  let vmgEffSum = 0;
  let vmgEffCount = 0;
  let bestSpeed = 0;
  let worstVMGMoment = null;
  let worstVMGEff = 101;
  let wrongSailSeconds = 0;

  // Sail distribution tracking
  const sailTime = {};

  for (let i = 0; i < history.length; i++) {
    const state = history[i];

    const speedEff = computeSpeedEfficiency(state, polar, opts);
    if (speedEff != null) {
      speedEffSum += speedEff;
      speedEffCount++;
    }

    const vmgEff = computeVMGEfficiency(state, polar, opts);
    if (vmgEff != null) {
      vmgEffSum += vmgEff;
      vmgEffCount++;
      if (vmgEff < worstVMGEff) {
        worstVMGEff = vmgEff;
        worstVMGMoment = { timestamp: state.timestamp, vmgEfficiency: vmgEff, twa: state.twa, tws: state.tws };
      }
    }

    if (state.speed != null && state.speed > bestSpeed) {
      bestSpeed = state.speed;
    }

    // Sail analysis
    const sailScore = computeSailScore(state, polar, opts);
    if (sailScore && !sailScore.correct) {
      // Estimate time on wrong sail using interval to next state
      const dt = (i < history.length - 1 && history[i + 1].timestamp && state.timestamp)
        ? (history[i + 1].timestamp - state.timestamp) / 1000
        : 5; // default 5s interval
      wrongSailSeconds += dt;
    }

    // Track sail distribution
    if (state.sail != null) {
      const dt = (i < history.length - 1 && history[i + 1].timestamp && state.timestamp)
        ? (history[i + 1].timestamp - state.timestamp) / 1000
        : 5;
      sailTime[state.sail] = (sailTime[state.sail] || 0) + dt;
    }
  }

  // Tack and gybe analysis
  const tacks = evts.filter((e) => e.type === 'tack');
  const gybes = evts.filter((e) => e.type === 'gybe');

  const tackScores = analyzeTackGybeEvents(tacks, history, polar, opts, 'tack');
  const gybeScores = analyzeTackGybeEvents(gybes, history, polar, opts, 'gybe');

  // Distance calculations
  const distanceSailed = computeTotalDistance(history);
  const distanceMadeGood = computeStraightLineDistance(history);

  // Sail distribution as percentages
  const totalSailTime = Object.values(sailTime).reduce((a, b) => a + b, 0);
  const sailDistribution = {};
  for (const [sailId, time] of Object.entries(sailTime)) {
    sailDistribution[sailId] = totalSailTime > 0 ? (time / totalSailTime) * 100 : 0;
  }

  return {
    avgSpeedEfficiency: speedEffCount > 0 ? Math.round((speedEffSum / speedEffCount) * 10) / 10 : null,
    avgVMGEfficiency: vmgEffCount > 0 ? Math.round((vmgEffSum / vmgEffCount) * 10) / 10 : null,
    timeOnWrongSail: Math.round(wrongSailSeconds),
    tackCount: tacks.length,
    gybeCount: gybes.length,
    avgTackScore: tackScores.length > 0 ? Math.round(tackScores.reduce((a, b) => a + b, 0) / tackScores.length) : null,
    avgGybeScore: gybeScores.length > 0 ? Math.round(gybeScores.reduce((a, b) => a + b, 0) / gybeScores.length) : null,
    bestSpeed,
    worstVMGMoment,
    distanceSailed: Math.round(distanceSailed * 100) / 100,
    distanceMadeGood: Math.round(distanceMadeGood * 100) / 100,
    sailDistribution,
  };
}

function emptyStats() {
  return {
    avgSpeedEfficiency: null,
    avgVMGEfficiency: null,
    timeOnWrongSail: 0,
    tackCount: 0,
    gybeCount: 0,
    avgTackScore: null,
    avgGybeScore: null,
    bestSpeed: 0,
    worstVMGMoment: null,
    distanceSailed: 0,
    distanceMadeGood: 0,
    sailDistribution: {},
  };
}

function analyzeTackGybeEvents(events, history, polar, opts, type) {
  const scores = [];
  const analyzeFn = type === 'tack' ? analyzeTackQuality : analyzeGybeQuality;

  for (const evt of events) {
    if (!evt.timestamp) continue;
    // Find closest states before and after the event
    const before = findClosestBefore(history, evt.timestamp);
    const after = findClosestAfter(history, evt.timestamp);
    if (!before || !after) continue;

    const result = analyzeFn(before, after, polar, opts);
    if (result) scores.push(result.overallScore);
  }
  return scores;
}

function findClosestBefore(history, timestamp) {
  let best = null;
  for (const s of history) {
    if (s.timestamp && s.timestamp <= timestamp) {
      if (!best || s.timestamp > best.timestamp) best = s;
    }
  }
  return best;
}

function findClosestAfter(history, timestamp) {
  let best = null;
  for (const s of history) {
    if (s.timestamp && s.timestamp > timestamp) {
      if (!best || s.timestamp < best.timestamp) best = s;
    }
  }
  return best;
}

function computeTotalDistance(history) {
  let total = 0;
  for (let i = 1; i < history.length; i++) {
    const d = haversineNm(history[i - 1], history[i]);
    if (d != null) total += d;
  }
  return total;
}

function computeStraightLineDistance(history) {
  if (history.length < 2) return 0;
  const first = history[0];
  const last = history[history.length - 1];
  return haversineNm(first, last) ?? 0;
}

function haversineNm(a, b) {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return null;
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return (R * c) / 1852;
}
