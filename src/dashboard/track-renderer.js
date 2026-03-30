import L from 'leaflet';
import { efficiencyColor, segmentSpeedEff, segmentVmgEff } from './track-utils.js';

export { efficiencyColor, segmentSpeedEff, segmentVmgEff };

const COLOR_PLAIN = '#00b4d8';
const MODES = ['plain', 'speed', 'vmg'];

/**
 * Initialize the enhanced track renderer on a 2D Leaflet map.
 * @param {object} map2d - the map object returned by init2DMap
 * @returns {object} {update, setMode, toggle, getMode}
 */
export function initTrackRenderer(map2d) {
  if (!map2d) return null;

  const leafletMap = map2d.getLeafletMap();
  if (!leafletMap) return null;

  let mode = 'plain';
  let segments = []; // L.Polyline[]
  let visible = true;
  let lastPositionHistory = null;
  let lastPolar = null;
  let lastOptions = null;

  // Canvas overlay for Inshore tracks (x,y coordinates)
  let inshoreCanvas = null;
  let inshoreCtx = null;
  let lastInshoreData = null;

  function clearSegments() {
    for (const seg of segments) {
      leafletMap.removeLayer(seg);
    }
    segments = [];
  }

  function rebuild(positionHistory, polar, options) {
    clearSegments();

    if (!positionHistory || positionHistory.length < 2) return;
    if (!visible) return;

    if (mode === 'plain') {
      // Single polyline
      const coords = positionHistory.map(p => [p.lat, p.lon]);
      const line = L.polyline(coords, {
        color: COLOR_PLAIN,
        opacity: 0.6,
        weight: 2,
      }).addTo(leafletMap);
      segments.push(line);
      return;
    }

    // Colored segments
    for (let i = 0; i < positionHistory.length - 1; i++) {
      const p1 = positionHistory[i];
      const p2 = positionHistory[i + 1];

      let eff = null;
      if (mode === 'speed') {
        eff = segmentSpeedEff(p2, polar, options);
      } else if (mode === 'vmg') {
        eff = segmentVmgEff(p2, polar, options);
      }

      const color = eff != null ? efficiencyColor(eff) : COLOR_PLAIN;
      const line = L.polyline(
        [[p1.lat, p1.lon], [p2.lat, p2.lon]],
        { color, opacity: 0.8, weight: 3 },
      ).addTo(leafletMap);
      segments.push(line);
    }
  }

  function getInshoreCanvas() {
    if (inshoreCanvas) return inshoreCanvas;
    inshoreCanvas = document.createElement('canvas');
    inshoreCanvas.style.position = 'absolute';
    inshoreCanvas.style.top = '0';
    inshoreCanvas.style.left = '0';
    inshoreCanvas.style.pointerEvents = 'none';
    inshoreCanvas.style.zIndex = '400';
    const container = leafletMap.getContainer();
    inshoreCanvas.width = container.clientWidth;
    inshoreCanvas.height = container.clientHeight;
    container.appendChild(inshoreCanvas);
    inshoreCtx = inshoreCanvas.getContext('2d');

    // Resize canvas when map resizes
    leafletMap.on('resize', () => {
      inshoreCanvas.width = container.clientWidth;
      inshoreCanvas.height = container.clientHeight;
      if (lastInshoreData) {
        drawInshore(lastInshoreData.tracks, lastInshoreData.polar, lastInshoreData.options);
      }
    });
    leafletMap.on('moveend zoomend', () => {
      if (lastInshoreData) {
        drawInshore(lastInshoreData.tracks, lastInshoreData.polar, lastInshoreData.options);
      }
    });

    return inshoreCanvas;
  }

  function drawInshore(trackHistory, polar, options) {
    if (!visible) {
      if (inshoreCtx) inshoreCtx.clearRect(0, 0, inshoreCanvas.width, inshoreCanvas.height);
      return;
    }
    getInshoreCanvas();
    inshoreCtx.clearRect(0, 0, inshoreCanvas.width, inshoreCanvas.height);

    lastInshoreData = { tracks: trackHistory, polar, options };

    if (!trackHistory) return;

    for (const [, track] of Object.entries(trackHistory)) {
      if (!track || track.length < 2) continue;

      if (mode === 'plain') {
        inshoreCtx.strokeStyle = COLOR_PLAIN;
        inshoreCtx.lineWidth = 2;
        inshoreCtx.globalAlpha = 0.6;
        inshoreCtx.beginPath();
        const start = leafletMap.latLngToContainerPoint([-track[0].y, track[0].x]);
        inshoreCtx.moveTo(start.x, start.y);
        for (let i = 1; i < track.length; i++) {
          const pt = leafletMap.latLngToContainerPoint([-track[i].y, track[i].x]);
          inshoreCtx.lineTo(pt.x, pt.y);
        }
        inshoreCtx.stroke();
        inshoreCtx.globalAlpha = 1;
      } else {
        // For Inshore, we don't have polar data per-point, use plain colors
        inshoreCtx.lineWidth = 2;
        inshoreCtx.globalAlpha = 0.7;
        for (let i = 0; i < track.length - 1; i++) {
          const p1 = leafletMap.latLngToContainerPoint([-track[i].y, track[i].x]);
          const p2 = leafletMap.latLngToContainerPoint([-track[i + 1].y, track[i + 1].x]);
          inshoreCtx.strokeStyle = COLOR_PLAIN;
          inshoreCtx.beginPath();
          inshoreCtx.moveTo(p1.x, p1.y);
          inshoreCtx.lineTo(p2.x, p2.y);
          inshoreCtx.stroke();
        }
        inshoreCtx.globalAlpha = 1;
      }
    }
  }

  function update(positionHistory, currentBoat, polar, options) {
    lastPositionHistory = positionHistory;
    lastPolar = polar;
    lastOptions = options;

    if (positionHistory && positionHistory.length > 0 && positionHistory[0].lat != null) {
      // Offshore track
      rebuild(positionHistory, polar, options);
    }
  }

  function updateInshore(trackHistory, polar, options) {
    drawInshore(trackHistory, polar, options);
  }

  function setMode(newMode) {
    if (!MODES.includes(newMode)) return;
    mode = newMode;
    if (lastPositionHistory) {
      rebuild(lastPositionHistory, lastPolar, lastOptions);
    }
    if (lastInshoreData) {
      drawInshore(lastInshoreData.tracks, lastInshoreData.polar, lastInshoreData.options);
    }
  }

  function toggle() {
    visible = !visible;
    if (!visible) {
      clearSegments();
      if (inshoreCtx) inshoreCtx.clearRect(0, 0, inshoreCanvas.width, inshoreCanvas.height);
    } else {
      if (lastPositionHistory) rebuild(lastPositionHistory, lastPolar, lastOptions);
      if (lastInshoreData) drawInshore(lastInshoreData.tracks, lastInshoreData.polar, lastInshoreData.options);
    }
    return visible;
  }

  function getMode() {
    return mode;
  }

  return { update, updateInshore, setMode, toggle, getMode };
}
