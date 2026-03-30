import L from 'leaflet';

const BARB_COLOR = '#88ccff';
const BARB_OPACITY = 0.3;
const OFFSHORE_INTERVAL = 5;
const INSHORE_INTERVAL = 20;

/**
 * Draw a wind barb SVG for a given TWD and TWS.
 * @param {number} twd - true wind direction in degrees
 * @param {number} tws - true wind speed in knots
 * @returns {string} SVG markup
 */
function windBarbSvg(twd, tws) {
  // Length proportional to TWS, min 6 max 20
  const len = Math.max(6, Math.min(20, tws * 0.8));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
    <g transform="rotate(${twd}, 10, 10)" opacity="${BARB_OPACITY}">
      <line x1="10" y1="${10 + len / 2}" x2="10" y2="${10 - len / 2}" stroke="${BARB_COLOR}" stroke-width="1.5"/>
      <polygon points="10,${10 - len / 2} ${10 - 3},${10 - len / 2 + 5} ${10 + 3},${10 - len / 2 + 5}" fill="${BARB_COLOR}"/>
    </g>
  </svg>`;
}

/**
 * Initialize wind field overlay on the track.
 * Shows tiny wind barbs at historical positions.
 * @param {object} map2d - the map object returned by init2DMap
 * @returns {object} {update, setVisible}
 */
export function initWindFieldTrack(map2d) {
  if (!map2d) return null;

  const leafletMap = map2d.getLeafletMap();
  if (!leafletMap) return null;

  let markers = [];
  let visible = false; // Off by default

  function clear() {
    for (const m of markers) leafletMap.removeLayer(m);
    markers = [];
  }

  /**
   * Update wind field markers.
   * @param {Array} positionHistory - [{lat, lon, twd?, tws?, x?, y?}]
   * @param {Array|null} windHistory - optional separate wind history [{twd, tws, timestamp}]
   */
  function update(positionHistory, windHistory) {
    clear();
    if (!visible || !positionHistory || positionHistory.length === 0) return;

    const isInshore = positionHistory[0].lat == null && positionHistory[0].x != null;
    const interval = isInshore ? INSHORE_INTERVAL : OFFSHORE_INTERVAL;

    for (let i = 0; i < positionHistory.length; i += interval) {
      const p = positionHistory[i];

      // Get wind data from position or separate wind history
      let twd = p.twd;
      let tws = p.tws;

      if ((twd == null || tws == null) && windHistory && windHistory.length > 0) {
        // Find closest wind data by index proportion
        const windIdx = Math.round((i / positionHistory.length) * (windHistory.length - 1));
        const w = windHistory[windIdx];
        if (w) {
          twd = twd ?? w.twd;
          tws = tws ?? w.tws;
        }
      }

      if (twd == null || tws == null || tws === 0) continue;

      const svg = windBarbSvg(twd, tws);
      const icon = L.divIcon({
        html: svg,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        className: 'wind-field-barb',
      });

      let pos;
      if (isInshore) {
        pos = [-p.y, p.x];
      } else {
        if (p.lat == null || p.lon == null) continue;
        pos = [p.lat, p.lon];
      }

      const marker = L.marker(pos, { icon, interactive: false }).addTo(leafletMap);
      markers.push(marker);
    }
  }

  function setVisible(v) {
    visible = v;
    if (!visible) clear();
  }

  return { update, setVisible };
}
