const R_NM = 3440.065; // Earth radius in nautical miles
const DEG = Math.PI / 180;

/**
 * Bearing in degrees from one point to another.
 * @param {{lat:number, lon:number}} from
 * @param {{lat:number, lon:number}} to
 * @returns {number} bearing 0-360
 */
export function bearingTo(from, to) {
  const lat1 = from.lat * DEG;
  const lat2 = to.lat * DEG;
  const dLon = (to.lon - from.lon) * DEG;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

/**
 * Haversine distance in nautical miles.
 * @param {{lat:number, lon:number}} from
 * @param {{lat:number, lon:number}} to
 * @returns {number} distance in nm
 */
export function distanceNm(from, to) {
  const lat1 = from.lat * DEG;
  const lat2 = to.lat * DEG;
  const dLat = (to.lat - from.lat) * DEG;
  const dLon = (to.lon - from.lon) * DEG;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R_NM * c;
}

/**
 * Destination point given start, bearing, and distance.
 * @param {{lat:number, lon:number}} from
 * @param {number} bearing - degrees
 * @param {number} dist - nautical miles
 * @returns {{lat:number, lon:number}}
 */
export function destinationPoint(from, bearing, dist) {
  const lat1 = from.lat * DEG;
  const lon1 = from.lon * DEG;
  const brng = bearing * DEG;
  const d = dist / R_NM; // angular distance

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: lat2 / DEG, lon: lon2 / DEG };
}

/**
 * Compute TWA given heading and true wind direction.
 * Returns 0-180 (unsigned).
 * @param {number} heading - degrees 0-360
 * @param {number} twd - true wind direction in degrees 0-360
 * @returns {number} TWA 0-180
 */
export function twaForHeading(heading, twd) {
  let diff = heading - twd;
  // Normalize to -180..180
  diff = ((diff + 540) % 360) - 180;
  return Math.abs(diff);
}

/**
 * Compute heading(s) given desired TWA and TWD.
 * Returns both port and starboard solutions.
 * @param {number} twa - 0-180
 * @param {number} twd - 0-360
 * @returns {{starboard: number, port: number}} headings 0-360
 */
export function headingForTwa(twa, twd) {
  const starboard = (twd + twa + 360) % 360;
  const port = (twd - twa + 360) % 360;
  return { starboard, port };
}

/**
 * Velocity made good toward a specific waypoint.
 * @param {number} speed - boat speed in knots
 * @param {number} heading - boat heading in degrees
 * @param {number} bearingToWP - bearing to waypoint in degrees
 * @returns {number} VMG toward waypoint in knots
 */
export function vmgToWaypoint(speed, heading, bearingToWP) {
  const angle = ((heading - bearingToWP + 540) % 360) - 180;
  return speed * Math.cos(angle * DEG);
}
