/**
 * Mark overlay for the 2D map.
 *
 * Renders detected Inshore marks as orange diamonds on the Leaflet map,
 * draws the course layout connecting marks, highlights the next mark,
 * and shows distance/rounding direction indicators.
 *
 * Uses the same CRS.Simple coordinate mapping as the Inshore boat overlay:
 *   lat = -y, lng = x (so increasing y goes "up" on the map)
 */
import L from 'leaflet';

const MARK_COLOR = '#ff8c00';
const MARK_HIGHLIGHT_COLOR = '#ffd700';
const COURSE_LINE_COLOR = '#ff8c00';
const MARK_SIZE = 16;

/**
 * Create an SVG diamond icon for a mark.
 *
 * @param {string} label - Mark label (e.g., "M1")
 * @param {boolean} isNext - Whether this is the next mark (highlighted)
 * @param {string} roundingDir - 'port' or 'starboard'
 * @returns {L.DivIcon}
 */
function createMarkIcon(label, isNext, roundingDir) {
  const color = isNext ? MARK_HIGHLIGHT_COLOR : MARK_COLOR;
  const size = isNext ? MARK_SIZE + 4 : MARK_SIZE;
  const half = size / 2;

  // Arrow curve for rounding direction
  const arrow = roundingDir === 'port'
    ? `<path d="M${half + 6},${half - 4} A6,6 0 0,0 ${half + 6},${half + 4}" stroke="${color}" fill="none" stroke-width="1.5" marker-end="url(#arrowPort)"/>`
    : `<path d="M${half + 6},${half + 4} A6,6 0 0,0 ${half + 6},${half - 4}" stroke="${color}" fill="none" stroke-width="1.5" marker-end="url(#arrowStbd)"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 14}" height="${size + 14}" viewBox="0 0 ${size + 14} ${size + 14}">
    <defs>
      <marker id="arrowPort" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4" fill="${color}"/></marker>
      <marker id="arrowStbd" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4" fill="${color}"/></marker>
    </defs>
    <polygon points="${half},2 ${size - 2},${half} ${half},${size - 2} 2,${half}"
             fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2"/>
    ${arrow}
    <text x="${half}" y="${size + 10}" text-anchor="middle" fill="${color}"
          font-size="10" font-family="monospace" font-weight="bold">${label}</text>
  </svg>`;

  return L.divIcon({
    html: svg,
    iconSize: [size + 14, size + 14],
    iconAnchor: [(size + 14) / 2, (size + 14) / 2],
    className: '',
  });
}

/**
 * Initialize the mark overlay on a Leaflet map.
 *
 * @param {object} map2d - Result of init2DMap (must have getLeafletMap())
 * @returns {{update: function, toggle: function}}
 */
export function initMarkOverlay(map2d) {
  const leafletMap = map2d ? map2d.getLeafletMap() : null;
  if (!leafletMap) {
    return {
      update() {},
      toggle() { return false; },
    };
  }

  let visible = true;
  const markMarkers = new Map(); // mark.id -> L.marker
  let courseLine = null;
  let distanceLabel = null;

  /**
   * Update the mark overlay with detected marks and player boat info.
   *
   * @param {Array<{x: number, y: number, id: string, roundingDirection: string, passCount: number}>} marks
   * @param {{x: number, y: number, heading: number}} playerBoat
   * @param {{legNumber: number, nextMark: object, distanceToMark: number, bearingToMark: number}|null} legInfo
   */
  function update(marks, playerBoat, legInfo) {
    if (!visible) return;

    const nextMarkId = legInfo?.nextMark?.id ?? null;

    // Remove stale markers
    for (const [id, marker] of markMarkers) {
      if (!marks || !marks.find(m => m.id === id)) {
        leafletMap.removeLayer(marker);
        markMarkers.delete(id);
      }
    }

    if (!marks || marks.length === 0) {
      if (courseLine) {
        leafletMap.removeLayer(courseLine);
        courseLine = null;
      }
      if (distanceLabel) {
        leafletMap.removeLayer(distanceLabel);
        distanceLabel = null;
      }
      return;
    }

    // Draw/update mark markers
    for (const mark of marks) {
      const pos = [-mark.y, mark.x]; // CRS.Simple: lat=-y, lng=x
      const isNext = mark.id === nextMarkId;
      const icon = createMarkIcon(mark.id, isNext, mark.roundingDirection);

      const existing = markMarkers.get(mark.id);
      if (existing) {
        existing.setLatLng(pos);
        existing.setIcon(icon);
      } else {
        const marker = L.marker(pos, { icon, interactive: false }).addTo(leafletMap);
        markMarkers.set(mark.id, marker);
      }
    }

    // Draw course line connecting marks in order
    const courseLatLngs = marks.map(m => [-m.y, m.x]);
    if (courseLine) {
      courseLine.setLatLngs(courseLatLngs);
    } else {
      courseLine = L.polyline(courseLatLngs, {
        color: COURSE_LINE_COLOR,
        opacity: 0.4,
        weight: 1.5,
        dashArray: '6, 4',
      }).addTo(leafletMap);
    }

    // Distance to next mark label
    if (legInfo && legInfo.nextMark && playerBoat) {
      const midX = (playerBoat.x + legInfo.nextMark.x) / 2;
      const midY = (playerBoat.y + legInfo.nextMark.y) / 2;
      const midPos = [-midY, midX];
      const text = `${legInfo.distanceToMark} → ${legInfo.nextMark.id}`;

      if (distanceLabel) {
        distanceLabel.setLatLng(midPos);
        distanceLabel.getElement().textContent = text;
      } else {
        distanceLabel = L.marker(midPos, {
          icon: L.divIcon({
            html: `<span style="color:#ffd700;font-size:11px;font-family:monospace;white-space:nowrap;text-shadow:0 0 3px #000">${text}</span>`,
            iconSize: [120, 16],
            iconAnchor: [60, 8],
            className: '',
          }),
          interactive: false,
        }).addTo(leafletMap);
      }
    } else if (distanceLabel) {
      leafletMap.removeLayer(distanceLabel);
      distanceLabel = null;
    }
  }

  /**
   * Toggle overlay visibility.
   * @returns {boolean} New visibility state
   */
  function toggle() {
    visible = !visible;
    if (!visible) {
      for (const marker of markMarkers.values()) {
        leafletMap.removeLayer(marker);
      }
      markMarkers.clear();
      if (courseLine) {
        leafletMap.removeLayer(courseLine);
        courseLine = null;
      }
      if (distanceLabel) {
        leafletMap.removeLayer(distanceLabel);
        distanceLabel = null;
      }
    }
    return visible;
  }

  return { update, toggle };
}
