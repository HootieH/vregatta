import { getBoatSpeed } from '../polars/speed.js';
import { bestVMG } from '../polars/best-vmg.js';

const SAIL_NAMES = {
  1: 'Jib',
  2: 'Spi',
  3: 'Staysail',
  4: 'Light Jib',
  5: 'Code 0',
  6: 'Heavy Genn',
  7: 'Light Genn',
};

/**
 * Computes VMG efficiency: actual VMG / best possible VMG at current TWS.
 * Returns 0-100 (%). Returns null if data is insufficient.
 */
export function computeVMGEfficiency(boatState, polar, options) {
  if (!boatState || !polar) return null;
  const { speed, twa, tws } = boatState;
  if (speed == null || twa == null || tws == null || tws === 0) return null;

  const absTwa = Math.abs(twa);
  const twaRad = (absTwa * Math.PI) / 180;
  const actualVMG = speed * Math.cos(twaRad);

  const best = bestVMG(tws, polar, options || []);

  // Pick the relevant best VMG based on whether we're upwind or downwind
  const isUpwind = absTwa < 90;
  const optimalVMG = isUpwind ? best.vmgUp : Math.abs(best.vmgDown);

  if (optimalVMG === 0) return null;

  const relevantActual = isUpwind ? actualVMG : Math.abs(actualVMG);
  const efficiency = (relevantActual / optimalVMG) * 100;

  return Math.max(0, Math.min(100, efficiency));
}

/**
 * Computes speed efficiency: actual speed / max possible speed at current TWS/TWA.
 * Checks all available sails to find the true max. Returns 0-100 (%).
 */
export function computeSpeedEfficiency(boatState, polar, options) {
  if (!boatState || !polar) return null;
  const { speed, twa, tws } = boatState;
  if (speed == null || twa == null || tws == null || tws === 0) return null;

  const absTwa = Math.abs(twa);
  const availableSails = getAvailableSails(options || []);

  let maxSpeed = 0;
  for (const sailId of availableSails) {
    const s = getBoatSpeed(polar, tws, absTwa, sailId, options || []);
    if (s > maxSpeed) maxSpeed = s;
  }

  if (maxSpeed === 0) return null;

  const efficiency = (speed / maxSpeed) * 100;
  return Math.max(0, Math.min(100, efficiency));
}

/**
 * Evaluates whether the current sail is optimal.
 * Returns {correct, currentSail, optimalSail, speedLoss}.
 */
export function computeSailScore(boatState, polar, options) {
  if (!boatState || !polar) return null;
  const { speed, twa, tws, sail } = boatState;
  if (speed == null || twa == null || tws == null || sail == null) return null;

  const absTwa = Math.abs(twa);
  const opts = options || [];
  const availableSails = getAvailableSails(opts);

  let bestSpeed = 0;
  let optimalSailId = sail;

  for (const sailId of availableSails) {
    const s = getBoatSpeed(polar, tws, absTwa, sailId, opts);
    if (s > bestSpeed) {
      bestSpeed = s;
      optimalSailId = sailId;
    }
  }

  const currentSpeed = getBoatSpeed(polar, tws, absTwa, sail, opts);
  const speedLoss = bestSpeed - currentSpeed;

  return {
    correct: optimalSailId === sail,
    currentSail: SAIL_NAMES[sail] || `Sail ${sail}`,
    optimalSail: SAIL_NAMES[optimalSailId] || `Sail ${optimalSailId}`,
    speedLoss: Math.max(0, speedLoss),
  };
}

/**
 * Analyzes tack quality given boat state before and after.
 * Returns {speedLoss, recoveryTime, angleScore, overallScore}.
 */
export function analyzeTackQuality(beforeState, afterState, polar, options) {
  if (!beforeState || !afterState || !polar) return null;
  if (beforeState.speed == null || afterState.speed == null) return null;
  if (beforeState.twa == null || afterState.twa == null) return null;

  const opts = options || [];
  const tws = afterState.tws ?? beforeState.tws;
  if (tws == null) return null;

  // Speed loss during tack
  const speedLoss = Math.max(0, beforeState.speed - afterState.speed);
  const speedLossPct = beforeState.speed > 0 ? (speedLoss / beforeState.speed) * 100 : 0;

  // Recovery time estimate (seconds between states if timestamps available)
  const recoveryTime = (beforeState.timestamp && afterState.timestamp)
    ? (afterState.timestamp - beforeState.timestamp) / 1000
    : null;

  // Angle quality: did they tack to the optimal TWA?
  const best = bestVMG(tws, polar, opts);
  const afterAbsTwa = Math.abs(afterState.twa);
  const optimalTwa = best.twaUp;
  const angleDiff = Math.abs(afterAbsTwa - optimalTwa);
  // Perfect angle = 0 diff, score degrades 2 pts per degree off
  const angleScore = Math.max(0, 100 - angleDiff * 2);

  // Overall score: weighted combination
  // 40% speed retention, 30% angle quality, 30% recovery speed
  const speedRetentionScore = Math.max(0, 100 - speedLossPct * 2);
  const recoveryScore = recoveryTime != null
    ? Math.max(0, 100 - recoveryTime * 2) // lose 2pts per second
    : 50; // neutral if unknown

  const overallScore = Math.round(
    speedRetentionScore * 0.4 + angleScore * 0.3 + recoveryScore * 0.3,
  );

  return {
    speedLoss,
    recoveryTime,
    angleScore: Math.round(angleScore),
    overallScore: Math.max(0, Math.min(100, overallScore)),
  };
}

/**
 * Analyzes gybe quality given boat state before and after.
 * Returns {speedLoss, recoveryTime, angleScore, overallScore}.
 */
export function analyzeGybeQuality(beforeState, afterState, polar, options) {
  if (!beforeState || !afterState || !polar) return null;
  if (beforeState.speed == null || afterState.speed == null) return null;
  if (beforeState.twa == null || afterState.twa == null) return null;

  const opts = options || [];
  const tws = afterState.tws ?? beforeState.tws;
  if (tws == null) return null;

  const speedLoss = Math.max(0, beforeState.speed - afterState.speed);
  const speedLossPct = beforeState.speed > 0 ? (speedLoss / beforeState.speed) * 100 : 0;

  const recoveryTime = (beforeState.timestamp && afterState.timestamp)
    ? (afterState.timestamp - beforeState.timestamp) / 1000
    : null;

  // Angle quality: did they gybe to the optimal downwind TWA?
  const best = bestVMG(tws, polar, opts);
  const afterAbsTwa = Math.abs(afterState.twa);
  const optimalTwa = best.twaDown;
  const angleDiff = Math.abs(afterAbsTwa - optimalTwa);
  const angleScore = Math.max(0, 100 - angleDiff * 2);

  const speedRetentionScore = Math.max(0, 100 - speedLossPct * 2);
  const recoveryScore = recoveryTime != null
    ? Math.max(0, 100 - recoveryTime * 2)
    : 50;

  const overallScore = Math.round(
    speedRetentionScore * 0.4 + angleScore * 0.3 + recoveryScore * 0.3,
  );

  return {
    speedLoss,
    recoveryTime,
    angleScore: Math.round(angleScore),
    overallScore: Math.max(0, Math.min(100, overallScore)),
  };
}

// -- helpers --

const ALWAYS_AVAILABLE = [1, 2];
const LIGHT_SAILS = [4, 7];
const HEAVY_SAILS = [3, 6];
const REACH_SAILS = [5];

function getAvailableSails(options) {
  const sails = [...ALWAYS_AVAILABLE];
  if (options && options.includes('light')) sails.push(...LIGHT_SAILS);
  if (options && options.includes('heavy')) sails.push(...HEAVY_SAILS);
  if (options && options.includes('reach')) sails.push(...REACH_SAILS);
  return sails;
}
