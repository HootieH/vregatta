import { getBoatSpeed } from '../polars/speed.js';
import { computeVMGEfficiency } from '../analytics/performance.js';
import { destinationPoint } from '../routing/geometry.js';

const COLOR_GREEN = '#00ff41';
const COLOR_YELLOW = '#ffbf00';
const COLOR_RED = '#ff3333';
const COLOR_PLAIN = '#00b4d8';

const TIME_MARKS_MINUTES = [1, 5, 10];

/**
 * Returns a color based on efficiency percentage (0-100).
 * Green >= 90%, Yellow 70-90%, Red < 70%.
 */
export function efficiencyColor(pct) {
  if (pct == null || isNaN(pct)) return COLOR_PLAIN;
  if (pct >= 90) return COLOR_GREEN;
  if (pct >= 70) return COLOR_YELLOW;
  return COLOR_RED;
}

/**
 * Compute speed efficiency for a single track segment.
 * Returns 0-100 or null.
 */
export function segmentSpeedEff(point, polar, options) {
  if (!polar || !point) return null;
  const { speed, tws, twa, sail } = point;
  if (speed == null || tws == null || twa == null || tws === 0) return null;

  const absTwa = Math.abs(twa);
  const sails = sail != null ? [sail, 1, 2] : [1, 2];
  let maxSpeed = 0;
  for (const s of sails) {
    const sp = getBoatSpeed(polar, tws, absTwa, s, options || []);
    if (sp > maxSpeed) maxSpeed = sp;
  }
  if (maxSpeed === 0) return null;
  return Math.max(0, Math.min(100, (speed / maxSpeed) * 100));
}

/**
 * Compute VMG efficiency for a single track segment.
 * Returns 0-100 or null.
 */
export function segmentVmgEff(point, polar, options) {
  return computeVMGEfficiency(point, polar, options);
}

/**
 * Compute projection distance in nautical miles for a given speed (knots) and time (minutes).
 */
export function projectionDistance(speedKnots, timeMinutes) {
  if (!speedKnots || speedKnots <= 0 || !timeMinutes || timeMinutes <= 0) return 0;
  return speedKnots * (timeMinutes / 60);
}

/**
 * Compute time mark positions along a heading from a starting point.
 * Returns array of {lat, lon, label} for Offshore, or {x, y, label} for Inshore.
 */
export function computeTimeMarks(from, heading, speed, isInshore) {
  if (speed == null || speed <= 0) return [];

  const marks = [];
  for (const minutes of TIME_MARKS_MINUTES) {
    const dist = projectionDistance(speed, minutes);
    if (dist <= 0) continue;

    if (isInshore) {
      const headingRad = (heading * Math.PI) / 180;
      const dx = dist * Math.sin(headingRad);
      const dy = dist * Math.cos(headingRad);
      marks.push({ x: from.x + dx, y: from.y + dy, label: `${minutes}m`, minutes });
    } else {
      const pt = destinationPoint(from, heading, dist);
      marks.push({ lat: pt.lat, lon: pt.lon, label: `${minutes}m`, minutes });
    }
  }
  return marks;
}
