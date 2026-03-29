import { bearingTo, distanceNm, destinationPoint, headingForTwa } from './geometry.js';
import { bestVMG } from '../polars/best-vmg.js';

const LAYLINE_LENGTH_NM = 50;
const LAYLINE_POINTS = 20;
const ON_LAYLINE_THRESHOLD = 0.5; // nm

/**
 * Compute laylines from a mark/waypoint.
 * @param {object} boat - {lat, lon, tws, twd}
 * @param {{lat:number, lon:number}} mark - waypoint position
 * @param {object} polar - polar data
 * @param {string[]} options - e.g. ['foil','hull','light','heavy','reach']
 * @returns {object} layline data
 */
export function computeLaylines(boat, mark, polar, options) {
  const { tws, twd } = boat;
  const vmg = bestVMG(tws, polar, options);
  const dist = distanceNm(boat, mark);
  const brgBoatToMark = bearingTo(boat, mark);

  // Upwind laylines: extend FROM the mark at the optimal upwind TWA
  const upwindTwa = vmg.twaUp;
  const upHeadings = headingForTwa(upwindTwa, twd);
  // Laylines go downwind FROM the mark (opposite of the sailing heading)
  const upPortBearing = (upHeadings.port + 180) % 360;
  const upStarboardBearing = (upHeadings.starboard + 180) % 360;

  const upPortLine = buildLine(mark, upPortBearing, LAYLINE_LENGTH_NM, LAYLINE_POINTS);
  const upStarboardLine = buildLine(mark, upStarboardBearing, LAYLINE_LENGTH_NM, LAYLINE_POINTS);

  // Downwind laylines: extend FROM the mark at the optimal downwind TWA
  const downwindTwa = vmg.twaDown;
  const dnHeadings = headingForTwa(downwindTwa, twd);
  // Laylines go upwind FROM the mark
  const dnPortBearing = (dnHeadings.port + 180) % 360;
  const dnStarboardBearing = (dnHeadings.starboard + 180) % 360;

  const dnPortLine = buildLine(mark, dnPortBearing, LAYLINE_LENGTH_NM, LAYLINE_POINTS);
  const dnStarboardLine = buildLine(mark, dnStarboardBearing, LAYLINE_LENGTH_NM, LAYLINE_POINTS);

  // Check if boat is near a layline
  const onLayline = isNearLayline(boat, mark, upPortBearing, upStarboardBearing, dist) ||
    isNearLayline(boat, mark, dnPortBearing, dnStarboardBearing, dist);

  // Distance to closest layline crossing
  const laylineDistance = computeLaylineDistance(boat, mark, brgBoatToMark, upwindTwa, twd);

  return {
    upwind: {
      port: { heading: upHeadings.port, line: upPortLine },
      starboard: { heading: upHeadings.starboard, line: upStarboardLine },
    },
    downwind: {
      port: { heading: dnHeadings.port, line: dnPortLine },
      starboard: { heading: dnHeadings.starboard, line: dnStarboardLine },
    },
    onLayline,
    laylineDistance,
  };
}

function buildLine(start, bearing, lengthNm, numPoints) {
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const d = (lengthNm * i) / numPoints;
    points.push(destinationPoint(start, bearing, d));
  }
  return points;
}

function isNearLayline(boat, mark, portBearing, stbdBearing, distToMark) {
  const brgToBoat = bearingTo(mark, boat);

  // Angular distance from layline bearings
  const portDiff = Math.abs(((brgToBoat - portBearing + 540) % 360) - 180);
  const stbdDiff = Math.abs(((brgToBoat - stbdBearing + 540) % 360) - 180);

  // Cross-track distance: dist * sin(angle difference)
  const portCross = distToMark * Math.sin(portDiff * Math.PI / 180);
  const stbdCross = distToMark * Math.sin(stbdDiff * Math.PI / 180);

  return Math.min(Math.abs(portCross), Math.abs(stbdCross)) < ON_LAYLINE_THRESHOLD;
}

function computeLaylineDistance(boat, mark, brgBoatToMark, optimalTwa, twd) {
  // Simplified: angular difference between current bearing-to-mark and the optimal TWA heading
  const headings = headingForTwa(optimalTwa, twd);
  const portDiff = Math.abs(((brgBoatToMark - headings.port + 540) % 360) - 180);
  const stbdDiff = Math.abs(((brgBoatToMark - headings.starboard + 540) % 360) - 180);
  const dist = distanceNm(boat, mark);
  // Perpendicular distance to the closer layline
  return dist * Math.sin(Math.min(portDiff, stbdDiff) * Math.PI / 180);
}
