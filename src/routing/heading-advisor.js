import { bearingTo, distanceNm, twaForHeading, vmgToWaypoint } from './geometry.js';
import { getBoatSpeed } from '../polars/speed.js';
import { bestVMG } from '../polars/best-vmg.js';

const SAIL_NAMES = { 1: 'Jib', 2: 'Spi', 3: 'Staysail', 4: 'LightJib', 5: 'Code0', 6: 'HeavyGenn', 7: 'LightGenn' };

/**
 * Advise the best heading toward a waypoint given current conditions.
 * @param {object} boat - {lat, lon, tws, twd}
 * @param {{lat:number, lon:number}} waypoint
 * @param {object} polar - polar data
 * @param {string[]} options - e.g. ['foil','hull','light','heavy','reach']
 * @returns {object} advice
 */
export function adviseBestHeading(boat, waypoint, polar, options) {
  if (!polar || !polar.sail || !polar.tws || !polar.twa) {
    return { error: 'Need polar data for routing' };
  }
  if (boat.tws == null || boat.twd == null) {
    return { error: 'Need wind data for routing' };
  }

  const brg = bearingTo(boat, waypoint);
  const dist = distanceNm(boat, waypoint);
  const { tws, twd } = boat;

  const availableSails = getAvailableSails(options);

  // Sweep all headings, find best VMG toward waypoint
  const candidates = [];

  for (let heading = 0; heading < 360; heading++) {
    const twa = twaForHeading(heading, twd);
    if (twa < 1 || twa > 180) continue;

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

    const vmg = vmgToWaypoint(bestSpeed, heading, brg);
    candidates.push({
      heading,
      twa,
      speed: bestSpeed,
      vmgToWP: vmg,
      sailId: bestSailId,
      sailName: SAIL_NAMES[bestSailId] || `Sail ${bestSailId}`,
    });
  }

  if (candidates.length === 0) {
    return { error: 'No valid headings found', bearingToWP: brg, distanceToWP: dist };
  }

  // Sort by VMG toward waypoint (descending)
  candidates.sort((a, b) => b.vmgToWP - a.vmgToWP);

  const best = candidates[0];

  // Direct route check: TWA on direct bearing is between ~30 and ~170
  const directTwa = twaForHeading(brg, twd);
  const directRoutePossible = directTwa >= 30 && directTwa <= 170;

  // Tack/gybe recommendations from best VMG data
  const vmgData = bestVMG(tws, polar, options);
  const tackAngle = vmgData.twaUp;
  const gybeAngle = vmgData.twaDown;

  // Determine if upwind or downwind
  const isUpwind = directTwa < 70;
  const isDownwind = directTwa > 110;

  // ETA at current VMG
  const eta = best.vmgToWP > 0 ? dist / best.vmgToWP : null;

  // Top 3 alternatives (excluding best)
  const alternatives = candidates.slice(1, 4).map((c) => ({
    heading: c.heading,
    twa: c.twa,
    speed: c.speed,
    vmgToWP: c.vmgToWP,
    sailId: c.sailId,
    sailName: c.sailName,
  }));

  return {
    bestHeading: best.heading,
    bestTwa: best.twa,
    bestSpeed: best.speed,
    bestVmgToWP: best.vmgToWP,
    bestSail: best.sailId,
    bestSailName: best.sailName,
    bearingToWP: brg,
    distanceToWP: dist,
    directRoutePossible,
    directTwa,
    isUpwind,
    isDownwind,
    tackAngle,
    gybeAngle,
    etaHours: eta,
    alternatives,
  };
}

function getAvailableSails(options) {
  const sails = [1, 2]; // Jib + Spi always
  if (options && options.includes('light')) sails.push(4, 7);
  if (options && options.includes('heavy')) sails.push(3, 6);
  if (options && options.includes('reach')) sails.push(5);
  return sails;
}
