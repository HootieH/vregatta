import L from 'leaflet';
import { destinationPoint } from '../routing/geometry.js';
import { bestVMG } from '../polars/best-vmg.js';

const GHOST_COLOR = '#ffffff';
const GHOST_OPACITY = 0.4;

/**
 * Compute a ghost (optimal VMG) track from position history.
 * At each time step, the ghost sails at the optimal VMG angle for the wind conditions.
 *
 * @param {Array} positionHistory - [{lat, lon, tws?, twa?, twd?, timestamp?}]
 * @param {object} polar - polar data
 * @param {string[]} options - race options
 * @param {object|null} windData - optional wind override {tws, twd}
 * @returns {Array} ghostPositions [{lat, lon}]
 */
export function computeGhostTrack(positionHistory, polar, options, windData) {
  if (!positionHistory || positionHistory.length < 2 || !polar) return [];

  const ghostPositions = [];
  const start = positionHistory[0];
  if (start.lat == null || start.lon == null) return [];

  ghostPositions.push({ lat: start.lat, lon: start.lon });

  let currentPos = { lat: start.lat, lon: start.lon };

  for (let i = 1; i < positionHistory.length; i++) {
    const prev = positionHistory[i - 1];
    const curr = positionHistory[i];

    // Get wind conditions from the actual position or windData
    const tws = curr.tws ?? windData?.tws;
    const twd = curr.twd ?? windData?.twd;
    const twa = curr.twa;

    if (tws == null || twd == null) {
      // No wind data — ghost stays put
      ghostPositions.push({ lat: currentPos.lat, lon: currentPos.lon });
      continue;
    }

    // Determine if upwind or downwind based on actual sailing
    const isUpwind = twa != null ? Math.abs(twa) < 90 : true;

    try {
      const best = bestVMG(tws, polar, options || []);
      const optimalTwa = isUpwind ? best.twaUp : best.twaDown;
      const optimalSpeed = isUpwind
        ? best.vmgUp / Math.cos((optimalTwa * Math.PI) / 180)
        : Math.abs(best.vmgDown) / Math.abs(Math.cos((optimalTwa * Math.PI) / 180));

      // Determine which tack/gybe — maintain same side as actual boat
      const actualSide = twa != null ? Math.sign(twa) : 1;
      const vmgHeading = actualSide >= 0
        ? (twd + optimalTwa) % 360
        : (twd - optimalTwa + 360) % 360;

      // Compute time interval between positions (or estimate from distance)
      let dt = 0; // hours
      if (curr.timestamp && prev.timestamp) {
        dt = (curr.timestamp - prev.timestamp) / 3600000;
      } else {
        // Estimate: assume 5-second polling
        dt = 5 / 3600;
      }

      const dist = optimalSpeed * dt; // nautical miles
      if (dist > 0) {
        const nextPos = destinationPoint(currentPos, vmgHeading, dist);
        currentPos = { lat: nextPos.lat, lon: nextPos.lon };
      }
    } catch {
      // Polar lookup failed — stay at current position
    }

    ghostPositions.push({ lat: currentPos.lat, lon: currentPos.lon });
  }

  return ghostPositions;
}

/**
 * Initialize ghost track overlay on the 2D map (Offshore only).
 * @param {object} map2d - the map object returned by init2DMap
 * @returns {object} {update, setVisible}
 */
export function initGhostTrack(map2d) {
  if (!map2d) return null;

  const leafletMap = map2d.getLeafletMap();
  if (!leafletMap) return null;

  let ghostLine = null;
  let gapLine = null;
  let visible = false; // Off by default

  function clear() {
    if (ghostLine) { leafletMap.removeLayer(ghostLine); ghostLine = null; }
    if (gapLine) { leafletMap.removeLayer(gapLine); gapLine = null; }
  }

  function update(positionHistory, polar, options, windData) {
    clear();
    if (!visible) return;

    const ghost = computeGhostTrack(positionHistory, polar, options, windData);
    if (ghost.length < 2) return;

    const coords = ghost.map(p => [p.lat, p.lon]);
    ghostLine = L.polyline(coords, {
      color: GHOST_COLOR,
      opacity: GHOST_OPACITY,
      weight: 2,
      dashArray: '6, 8',
    }).addTo(leafletMap);

    // Draw gap line from last ghost position to last actual position
    if (positionHistory && positionHistory.length > 0) {
      const lastActual = positionHistory[positionHistory.length - 1];
      const lastGhost = ghost[ghost.length - 1];
      if (lastActual.lat != null && lastGhost.lat != null) {
        gapLine = L.polyline(
          [[lastGhost.lat, lastGhost.lon], [lastActual.lat, lastActual.lon]],
          { color: '#ff3333', opacity: 0.3, weight: 1, dashArray: '3, 4' },
        ).addTo(leafletMap);
      }
    }
  }

  function setVisible(v) {
    visible = v;
    if (!visible) clear();
  }

  return { update, setVisible };
}
