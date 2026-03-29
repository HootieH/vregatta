import { destinationPoint, twaForHeading } from './geometry.js';
import { getBoatSpeed } from '../polars/speed.js';

const VR_STEP_MINUTES = 5;
const HEADING_STEP = 5;

const SAIL_NAMES = { 1: 'Jib', 2: 'Spi', 3: 'Staysail', 4: 'LightJib', 5: 'Code0', 6: 'HeavyGenn', 7: 'LightGenn' };

/**
 * Compute simplified isochrone using current wind only.
 * @param {{lat:number, lon:number}} start - start position
 * @param {number} targetBearing - bearing toward waypoint (unused in sweep, informational)
 * @param {number} tws - true wind speed
 * @param {number} twd - true wind direction
 * @param {object} polar - polar data
 * @param {string[]} options - e.g. ['foil','hull','light','heavy','reach']
 * @param {number} [steps=12] - number of 5-min steps (default 12 = 1 hour)
 * @returns {Array<{lat:number, lon:number, heading:number, speed:number, twa:number, sail:number, sailName:string}>}
 */
export function computeIsochrone(start, targetBearing, tws, twd, polar, options, steps = 12) {
  const availableSails = getAvailableSails(options);
  const totalMinutes = steps * VR_STEP_MINUTES;
  const totalHours = totalMinutes / 60;

  const points = [];

  for (let heading = 0; heading < 360; heading += HEADING_STEP) {
    const twa = twaForHeading(heading, twd);
    if (twa < 1) continue;

    let bestSpeed = 0;
    let bestSailId = 0;

    for (const sailId of availableSails) {
      const speed = getBoatSpeed(polar, tws, twa, sailId, options);
      if (speed > bestSpeed) {
        bestSpeed = speed;
        bestSailId = sailId;
      }
    }

    if (bestSpeed <= 0) continue;

    // Distance traveled in totalHours at this speed
    const distNm = bestSpeed * totalHours;
    const dest = destinationPoint(start, heading, distNm);

    points.push({
      lat: dest.lat,
      lon: dest.lon,
      heading,
      speed: bestSpeed,
      twa,
      sail: bestSailId,
      sailName: SAIL_NAMES[bestSailId] || `Sail ${bestSailId}`,
    });
  }

  return points;
}

function getAvailableSails(options) {
  const sails = [1, 2];
  if (options && options.includes('light')) sails.push(4, 7);
  if (options && options.includes('heavy')) sails.push(3, 6);
  if (options && options.includes('reach')) sails.push(5);
  return sails;
}
