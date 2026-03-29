import { distanceNm, bearingTo, twaForHeading } from '../routing/geometry.js';
import { bestVMG } from '../polars/best-vmg.js';
import { getBoatSpeed } from '../polars/speed.js';

const SAIL_NAMES = { 1: 'Jib', 2: 'Spi', 3: 'Staysail', 4: 'LightJib', 5: 'Code0', 6: 'HeavyGenn', 7: 'LightGenn' };
const MARK_APPROACH_NM = 2;
const ALWAYS_AVAILABLE = [1, 2];
const LIGHT_SAILS = [4, 7];
const HEAVY_SAILS = [3, 6];
const REACH_SAILS = [5];

/**
 * Analyze approach to a mark and advise on rounding strategy.
 * @param {object} boat - {lat, lon, speed, heading, twa, tws, twd, sail}
 * @param {{lat:number, lon:number}} mark - mark position
 * @param {object} polar - polar data
 * @param {string[]} options - e.g. ['foil','hull','light','heavy','reach']
 * @param {object[]} competitors - nearby competitors
 * @returns {object} rounding analysis
 */
export function analyzeMarkRounding(boat, mark, polar, options, competitors) {
  if (!boat) throw new Error('analyzeMarkRounding: boat is required');
  if (!mark) throw new Error('analyzeMarkRounding: mark is required');
  if (!polar) throw new Error('analyzeMarkRounding: polar is required');
  if (boat.lat == null || boat.lon == null) {
    throw new Error('analyzeMarkRounding: boat position is required');
  }
  if (mark.lat == null || mark.lon == null) {
    throw new Error('analyzeMarkRounding: mark position is required');
  }

  const opts = options || [];
  const dist = distanceNm(boat, mark);
  const brgToMark = bearingTo(boat, mark);
  const approaching = dist < MARK_APPROACH_NM;

  if (!approaching) {
    return {
      approaching: false,
      distanceToMark: dist,
      bearingToMark: brgToMark,
      advice: [],
      summary: `Mark ${dist.toFixed(1)}nm away — not yet approaching`,
    };
  }

  const advice = [];

  // Determine what the TWA will be after rounding (heading away from mark)
  // After rounding, boat continues past the mark — assume heading ~opposite of current approach
  const postRoundingBrg = (brgToMark + 180) % 360;
  const postRoundingTwa = boat.twd != null ? twaForHeading(postRoundingBrg, boat.twd) : null;

  // Determine if this is an upwind-to-downwind or downwind-to-upwind rounding
  const currentAbsTwa = boat.twa != null ? Math.abs(boat.twa) : null;
  const roundingType = getRoundingType(currentAbsTwa, postRoundingTwa);

  // Sail change advice
  if (boat.tws != null && postRoundingTwa != null) {
    const postSail = findBestSail(polar, boat.tws, postRoundingTwa, opts);
    if (postSail && boat.sail != null && postSail.sailId !== boat.sail) {
      advice.push({
        priority: 1,
        type: 'sail_change',
        message: `Prepare ${SAIL_NAMES[postSail.sailId] || `Sail ${postSail.sailId}`} for rounding`,
        action: `sail_${postSail.sailId}`,
        urgency: dist < 0.5 ? 'critical' : 'high',
      });
    }
  }

  // VMG angle advice for after rounding
  if (boat.tws != null) {
    const vmgData = bestVMG(boat.tws, polar, opts);
    if (postRoundingTwa != null && postRoundingTwa < 90) {
      advice.push({
        priority: 2,
        type: 'heading',
        message: `After mark: head up to ${vmgData.twaUp.toFixed(0)}° TWA`,
        action: 'adjust_heading',
        urgency: 'medium',
      });
    } else if (postRoundingTwa != null && postRoundingTwa >= 90) {
      advice.push({
        priority: 2,
        type: 'heading',
        message: `After mark: bear away to ${vmgData.twaDown.toFixed(0)}° TWA`,
        action: 'adjust_heading',
        urgency: 'medium',
      });
    }
  }

  // Competitor traffic at mark
  if (competitors && competitors.length > 0) {
    const nearMark = competitors.filter((c) => {
      if (c.lat == null || c.lon == null) return false;
      return distanceNm(c, mark) < MARK_APPROACH_NM;
    });
    if (nearMark.length > 0) {
      advice.push({
        priority: 3,
        type: 'traffic',
        message: `${nearMark.length} competitor${nearMark.length > 1 ? 's' : ''} near mark — watch for traffic`,
        action: 'monitor',
        urgency: nearMark.length >= 3 ? 'high' : 'medium',
      });
    }
  }

  // Distance urgency
  if (dist < 0.3) {
    advice.push({
      priority: 1,
      type: 'rounding',
      message: 'Rounding imminent — execute now',
      action: 'round',
      urgency: 'critical',
    });
  }

  advice.sort((a, b) => a.priority - b.priority);

  const summary = advice.length > 0
    ? advice[0].message
    : `Approaching mark at ${dist.toFixed(1)}nm`;

  return {
    approaching: true,
    distanceToMark: dist,
    bearingToMark: brgToMark,
    roundingType,
    postRoundingTwa,
    advice,
    summary,
  };
}

function getRoundingType(currentTwa, postTwa) {
  if (currentTwa == null || postTwa == null) return 'unknown';
  const wasUpwind = currentTwa < 90;
  const willBeUpwind = postTwa < 90;
  if (wasUpwind && !willBeUpwind) return 'windward';
  if (!wasUpwind && willBeUpwind) return 'leeward';
  return 'reaching';
}

function findBestSail(polar, tws, twa, options) {
  const available = getAvailableSails(options);
  let bestSpeed = 0;
  let bestSailId = null;
  for (const sailId of available) {
    const speed = getBoatSpeed(polar, tws, twa, sailId, options);
    if (speed > bestSpeed) {
      bestSpeed = speed;
      bestSailId = sailId;
    }
  }
  return bestSailId != null ? { sailId: bestSailId, speed: bestSpeed } : null;
}

function getAvailableSails(options) {
  const sails = [...ALWAYS_AVAILABLE];
  if (options && options.includes('light')) sails.push(...LIGHT_SAILS);
  if (options && options.includes('heavy')) sails.push(...HEAVY_SAILS);
  if (options && options.includes('reach')) sails.push(...REACH_SAILS);
  return sails;
}
