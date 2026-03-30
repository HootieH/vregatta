import L from 'leaflet';
import { destinationPoint } from '../routing/geometry.js';
import { bestVMG } from '../polars/best-vmg.js';
import { projectionDistance, computeTimeMarks } from './track-utils.js';

export { projectionDistance, computeTimeMarks };

const PROJECTION_COLOR = '#ffffff';
const VMG_PROJECTION_COLOR = '#00e5ff';

/**
 * Initialize heading projection on the 2D map.
 * @param {object} map2d - the map object returned by init2DMap
 * @returns {object} {update, setVisible}
 */
export function initHeadingProjection(map2d) {
  if (!map2d) return null;

  const leafletMap = map2d.getLeafletMap();
  if (!leafletMap) return null;

  let courseProjectionLine = null;
  let vmgProjectionLine = null;
  let timeMarkMarkers = [];
  let visible = true;

  function clearAll() {
    if (courseProjectionLine) { leafletMap.removeLayer(courseProjectionLine); courseProjectionLine = null; }
    if (vmgProjectionLine) { leafletMap.removeLayer(vmgProjectionLine); vmgProjectionLine = null; }
    for (const m of timeMarkMarkers) leafletMap.removeLayer(m);
    timeMarkMarkers = [];
  }

  /**
   * Update the heading projection.
   * @param {object} boat - {lat, lon, heading, speed, tws, twa, twd} or {x, y, heading, speed} for Inshore
   * @param {object|null} polar - polar data for VMG projection
   * @param {string[]|null} options - race options
   */
  function update(boat, polar, options) {
    clearAll();
    if (!visible || !boat) return;

    const isInshore = boat.lat == null && boat.x != null;

    if (isInshore) {
      updateInshore(boat);
      return;
    }

    // --- Offshore ---
    const { lat, lon, heading, speed, tws, twa, twd } = boat;
    if (lat == null || lon == null || heading == null) return;

    const from = { lat, lon };
    const maxDist = projectionDistance(speed || 0, 10);
    if (maxDist <= 0) return;

    // Course projection (solid)
    const endPt = destinationPoint(from, heading, maxDist);
    courseProjectionLine = L.polyline(
      [[lat, lon], [endPt.lat, endPt.lon]],
      { color: PROJECTION_COLOR, opacity: 0.6, weight: 2, dashArray: '8, 4' },
    ).addTo(leafletMap);

    // Time marks
    const marks = computeTimeMarks(from, heading, speed, false);
    for (const mark of marks) {
      const dot = L.circleMarker([mark.lat, mark.lon], {
        radius: 3,
        fillColor: PROJECTION_COLOR,
        fillOpacity: 0.7,
        stroke: false,
      }).addTo(leafletMap);

      const label = L.marker([mark.lat, mark.lon], {
        icon: L.divIcon({
          html: `<span class="projection-time-label">${mark.label}</span>`,
          iconSize: [24, 12],
          iconAnchor: [-4, 6],
          className: '',
        }),
      }).addTo(leafletMap);

      timeMarkMarkers.push(dot, label);
    }

    // VMG projection (dashed, thinner)
    if (polar && tws != null && twa != null && twd != null) {
      try {
        const best = bestVMG(tws, polar, options || []);
        const absTwa = Math.abs(twa);
        const isUpwind = absTwa < 90;
        const optimalTwa = isUpwind ? best.twaUp : best.twaDown;

        // VMG direction: optimal TWA relative to wind
        const diff = ((heading - twd + 540) % 360) - 180;
        const vmgHeading = diff >= 0
          ? (twd + optimalTwa) % 360
          : (twd - optimalTwa + 360) % 360;

        const optimalSpeed = isUpwind
          ? best.vmgUp / Math.cos((optimalTwa * Math.PI) / 180)
          : Math.abs(best.vmgDown) / Math.abs(Math.cos((optimalTwa * Math.PI) / 180));

        const vmgDist = projectionDistance(optimalSpeed, 10);
        if (vmgDist > 0) {
          const vmgEnd = destinationPoint(from, vmgHeading, vmgDist);
          vmgProjectionLine = L.polyline(
            [[lat, lon], [vmgEnd.lat, vmgEnd.lon]],
            { color: VMG_PROJECTION_COLOR, opacity: 0.4, weight: 1.5, dashArray: '4, 6' },
          ).addTo(leafletMap);
        }
      } catch { /* no polar data for this TWS */ }
    }
  }

  function updateInshore(boat) {
    // For Inshore, project using x,y and heading
    const { x, y, heading, speed } = boat;
    if (x == null || y == null || heading == null || !speed) return;

    const marks = computeTimeMarks({ x, y }, heading, speed, true);
    if (marks.length === 0) return;

    const lastMark = marks[marks.length - 1];
    courseProjectionLine = L.polyline(
      [[-y, x], [-lastMark.y, lastMark.x]],
      { color: PROJECTION_COLOR, opacity: 0.6, weight: 2, dashArray: '8, 4' },
    ).addTo(leafletMap);

    for (const mark of marks) {
      const dot = L.circleMarker([-mark.y, mark.x], {
        radius: 3,
        fillColor: PROJECTION_COLOR,
        fillOpacity: 0.7,
        stroke: false,
      }).addTo(leafletMap);

      const label = L.marker([-mark.y, mark.x], {
        icon: L.divIcon({
          html: `<span class="projection-time-label">${mark.label}</span>`,
          iconSize: [24, 12],
          iconAnchor: [-4, 6],
          className: '',
        }),
      }).addTo(leafletMap);

      timeMarkMarkers.push(dot, label);
    }
  }

  function setVisible(v) {
    visible = v;
    if (!visible) clearAll();
  }

  return { update, setVisible };
}
