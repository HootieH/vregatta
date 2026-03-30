/**
 * Wind field visualization on the Leaflet map.
 *
 * Draws semi-transparent parallel wind lines across the visible area
 * and a TWD overlay showing wind direction and speed.
 */
import L from 'leaflet';

const WIND_COLOR = '#00b4d8';
const WIND_LINE_OPACITY = 0.15;
const WIND_LINE_WEIGHT = 1;
const LINE_SPACING = 500; // game units between parallel wind lines
const LINE_LENGTH = 20000; // long enough to span visible area

/**
 * Cardinal/intercardinal direction label from degrees.
 * @param {number} deg - degrees 0-360
 * @returns {string}
 */
function compassLabel(deg) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(deg / 22.5) % 16;
  return dirs[idx];
}

/**
 * Initialize wind visualization on the map.
 *
 * @param {L.Map} map - Leaflet map instance
 * @param {HTMLElement} container - map container element for overlays
 * @returns {{ update: function, toggle: function, isVisible: function }}
 */
export function initWindViz(map, container) {
  const windLinesGroup = L.layerGroup().addTo(map);
  let visible = true;
  let lastWindDir = null;
  let lastCenter = null;

  // TWD overlay — fixed position on map container
  const twdOverlay = document.createElement('div');
  twdOverlay.className = 'map-twd-overlay';
  twdOverlay.textContent = '';
  container.appendChild(twdOverlay);

  function drawWindLines(windDir, center) {
    windLinesGroup.clearLayers();
    if (windDir == null || !center) return;

    // Wind blows FROM windDir, so flow direction is windDir + 180
    const flowDeg = (windDir + 180) % 360;
    const flowRad = (flowDeg * Math.PI) / 180;
    // Perpendicular for spacing offset
    const perpRad = flowRad + Math.PI / 2;

    const cx = center.lat;
    const cy = center.lng;

    // Draw parallel lines centered on view
    const numLines = 41; // -20 to +20
    const half = Math.floor(numLines / 2);

    for (let i = -half; i <= half; i++) {
      const offsetX = i * LINE_SPACING * Math.cos(perpRad);
      const offsetY = i * LINE_SPACING * Math.sin(perpRad);

      const baseX = cx + offsetX;
      const baseY = cy + offsetY;

      // Line endpoints along flow direction
      const halfLen = LINE_LENGTH / 2;
      const x1 = baseX - halfLen * Math.cos(flowRad);
      const y1 = baseY - halfLen * Math.sin(flowRad);
      const x2 = baseX + halfLen * Math.cos(flowRad);
      const y2 = baseY + halfLen * Math.sin(flowRad);

      L.polyline([[x1, y1], [x2, y2]], {
        color: WIND_COLOR,
        weight: WIND_LINE_WEIGHT,
        opacity: WIND_LINE_OPACITY,
        interactive: false,
      }).addTo(windLinesGroup);
    }

    // Add small arrowheads every ~2000 units along the center line
    // to show flow direction
    const arrowSpacing = 2000;
    const arrowCount = 9;
    const arrowHalf = Math.floor(arrowCount / 2);
    for (let i = -arrowHalf; i <= arrowHalf; i++) {
      const ax = cx + i * arrowSpacing * Math.cos(flowRad);
      const ay = cy + i * arrowSpacing * Math.sin(flowRad);

      // Small chevron pointing in flow direction
      const chevronLen = 80;
      const chevronAngle = 0.5; // radians spread
      const tipX = ax + chevronLen * Math.cos(flowRad);
      const tipY = ay + chevronLen * Math.sin(flowRad);
      const leftX = ax + chevronLen * 0.6 * Math.cos(flowRad - chevronAngle);
      const leftY = ay + chevronLen * 0.6 * Math.sin(flowRad - chevronAngle);
      const rightX = ax + chevronLen * 0.6 * Math.cos(flowRad + chevronAngle);
      const rightY = ay + chevronLen * 0.6 * Math.sin(flowRad + chevronAngle);

      L.polyline([[leftX, leftY], [tipX, tipY], [rightX, rightY]], {
        color: WIND_COLOR,
        weight: 1.5,
        opacity: WIND_LINE_OPACITY * 2,
        interactive: false,
      }).addTo(windLinesGroup);
    }
  }

  function update(snapshot) {
    const windDir = snapshot.inshoreWindDirection;
    const windSpd = snapshot.inshoreWindSpeed;

    // Update TWD overlay text
    if (windDir != null) {
      const label = compassLabel(windDir);
      let text = `TWD ${windDir.toFixed(2)}\u00b0 ${label}`;
      if (windSpd != null && windSpd > 0) {
        text += ` / TWS ${windSpd}kn`;
      }
      twdOverlay.textContent = text;
      twdOverlay.style.display = visible ? '' : 'none';
    }

    // Only redraw lines if wind direction changed or map moved significantly
    const center = map.getCenter();
    const dirChanged = windDir !== lastWindDir;
    const centerMoved = !lastCenter ||
      Math.abs(center.lat - lastCenter.lat) > 200 ||
      Math.abs(center.lng - lastCenter.lng) > 200;

    if (visible && (dirChanged || centerMoved)) {
      drawWindLines(windDir, center);
      lastWindDir = windDir;
      lastCenter = { lat: center.lat, lng: center.lng };
    }
  }

  function toggle() {
    visible = !visible;
    if (visible) {
      windLinesGroup.addTo(map);
      twdOverlay.style.display = '';
      // Force redraw
      lastWindDir = null;
    } else {
      map.removeLayer(windLinesGroup);
      twdOverlay.style.display = 'none';
    }
    return visible;
  }

  function isVisible() {
    return visible;
  }

  return { update, toggle, isVisible };
}
