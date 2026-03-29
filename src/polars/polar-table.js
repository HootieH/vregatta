import { getBoatSpeed } from './speed.js';

/**
 * Generates a polar lookup table for given TWS values.
 * For each TWS, for each TWA in the polar, finds the best sail and speed.
 * @param {object} polar - polar data
 * @param {string[]} options - e.g. ['foil', 'hull', 'light', 'heavy', 'reach']
 * @param {number[]} twsList - TWS values to generate for
 * @returns {Array<{tws: number, entries: Array<{twa: number, speed: number, sail: number, vmg: number}>}>}
 */
export function generatePolarTable(polar, options, twsList) {
  return twsList.map((tws) => {
    const entries = polar.twa.map((twa) => {
      let bestSpeed = 0;
      let bestSail = 0;

      for (const sail of polar.sail) {
        const speed = getBoatSpeed(polar, tws, twa, sail.id, options);
        if (speed > bestSpeed) {
          bestSpeed = speed;
          bestSail = sail.id;
        }
      }

      const vmg = bestSpeed * Math.cos(twa * Math.PI / 180);
      return { twa, speed: bestSpeed, sail: bestSail, vmg };
    });

    return { tws, entries };
  });
}
