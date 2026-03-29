import { fractionStep, bilinear } from './interpolation.js';
import { foilingFactor } from './foiling.js';

/**
 * Computes boat speed for a given polar, TWS, TWA, sail, and options.
 * @param {object} polar - polar data with tws[], twa[], sail[], foil, hull, globalSpeedRatio
 * @param {number} tws - true wind speed in knots
 * @param {number} twa - true wind angle in degrees (0-180)
 * @param {number} sailId - sail ID (1-7)
 * @param {string[]} options - e.g. ['foil', 'hull']
 * @returns {number} speed in knots
 */
export function getBoatSpeed(polar, tws, twa, sailId, options) {
  const sail = polar.sail.find((s) => s.id === sailId);
  if (!sail) {
    console.warn(`[vRegatta:getBoatSpeed] Sail id=${sailId} not found in polar. Available: ${polar.sail.map((s) => s.id).join(',')}`);
    return 0;
  }

  const twsStep = fractionStep(tws, polar.tws);
  const twaStep = fractionStep(twa, polar.twa);

  // Get the four corner values from the speed matrix
  // speed matrix is [twaIdx][twsIdx]
  const twsLo = twsStep.fraction === 0 ? twsStep.index : twsStep.index - 1;
  const twsHi = twsStep.index;
  const twaLo = twaStep.fraction === 0 ? twaStep.index : twaStep.index - 1;
  const twaHi = twaStep.index;

  const f00 = sail.speed[twaLo]?.[twsLo] ?? 0;
  const f10 = sail.speed[twaLo]?.[twsHi] ?? 0;
  const f01 = sail.speed[twaHi]?.[twsLo] ?? 0;
  const f11 = sail.speed[twaHi]?.[twsHi] ?? 0;

  let speed = bilinear(twsStep.fraction, twaStep.fraction, f00, f10, f01, f11);

  // Apply foiling factor
  speed *= foilingFactor(options, tws, twa, polar.foil ?? null);

  // Apply hull factor
  if (options && options.includes('hull') && polar.hull) {
    speed *= polar.hull.speedRatio;
  }

  // Apply global speed ratio
  speed *= polar.globalSpeedRatio ?? 1.0;

  return speed;
}
