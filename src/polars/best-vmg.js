import { getBoatSpeed } from './speed.js';

// Sails 1 (Jib) and 2 (Spi) are always available
const ALWAYS_AVAILABLE = [1, 2];
// Option-gated sails
const LIGHT_SAILS = [4, 7];   // LightJib, LightGenn
const HEAVY_SAILS = [3, 6];   // Staysail, HeavyGenn
const REACH_SAILS = [5];      // Code0

/**
 * Sweeps TWA from 25-180 in 0.1 degree steps to find best VMG upwind, downwind, and raw speed.
 * @param {number} tws - true wind speed
 * @param {object} polar - polar data
 * @param {string[]} options - e.g. ['foil', 'hull', 'light', 'heavy', 'reach']
 * @returns {{vmgUp, twaUp, sailUp, vmgDown, twaDown, sailDown, bspeed, btwa, sailBSpeed}}
 */
export function bestVMG(tws, polar, options) {
  const availableSails = getAvailableSails(options);

  let vmgUp = -Infinity;
  let twaUp = 0;
  let sailUp = 0;
  let vmgDown = Infinity;
  let twaDown = 0;
  let sailDown = 0;
  let bspeed = 0;
  let btwa = 0;
  let sailBSpeed = 0;

  for (let twaDeg = 25.0; twaDeg <= 180.0; twaDeg += 0.1) {
    const twaRad = twaDeg * Math.PI / 180;
    const cosA = Math.cos(twaRad);

    for (const sailId of availableSails) {
      const speed = getBoatSpeed(polar, tws, twaDeg, sailId, options);
      const vmg = speed * cosA;

      // Best upwind VMG (most positive)
      if (vmg > vmgUp) {
        vmgUp = vmg;
        twaUp = twaDeg;
        sailUp = sailId;
      }

      // Best downwind VMG (most negative)
      if (vmg < vmgDown) {
        vmgDown = vmg;
        twaDown = twaDeg;
        sailDown = sailId;
      }

      // Best raw speed
      if (speed > bspeed) {
        bspeed = speed;
        btwa = twaDeg;
        sailBSpeed = sailId;
      }
    }
  }

  // Round angles to 1 decimal
  twaUp = Math.round(twaUp * 10) / 10;
  twaDown = Math.round(twaDown * 10) / 10;
  btwa = Math.round(btwa * 10) / 10;

  return { vmgUp, twaUp, sailUp, vmgDown, twaDown, sailDown, bspeed, btwa, sailBSpeed };
}

function getAvailableSails(options) {
  const sails = [...ALWAYS_AVAILABLE];
  if (options && options.includes('light')) sails.push(...LIGHT_SAILS);
  if (options && options.includes('heavy')) sails.push(...HEAVY_SAILS);
  if (options && options.includes('reach')) sails.push(...REACH_SAILS);
  return sails;
}
