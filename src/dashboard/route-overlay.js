import L from 'leaflet';
import * as THREE from 'three';

const WP_COLOR = '#ff8c00';
const HEADING_COLOR = '#ff8c00';
const LAYLINE_PORT = '#ff4444';
const LAYLINE_STBD = '#44cc44';
const ISOCHRONE_COLOR = '#886fff';

/**
 * Initialize route overlay on 2D map and 3D globe.
 * @param {object} map2d - 2D map instance (from init2DMap)
 * @param {object} globe3d - 3D globe instance (from init3DGlobe)
 * @returns {object} overlay API
 */
export function initRouteOverlay(map2d, globe3d) {
  const leafletMap = map2d ? map2d.getLeafletMap() : null;
  const threeScene = globe3d ? globe3d.getScene() : null;

  let visible = false;
  let waypoint = null;
  let routeData = null;

  // --- 2D Leaflet layers ---
  let wpMarker = null;
  let wpLine = null;
  let headingArrow = null;
  const laylineLines = [];
  const isochroneLines = [];
  let infoBox = null;

  function createWpIcon() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="8" fill="none" stroke="${WP_COLOR}" stroke-width="2"/>
      <line x1="10" y1="2" x2="10" y2="18" stroke="${WP_COLOR}" stroke-width="1.5"/>
      <line x1="2" y1="10" x2="18" y2="10" stroke="${WP_COLOR}" stroke-width="1.5"/>
    </svg>`;
    return L.divIcon({
      html: svg,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      className: '',
    });
  }

  function createInfoBoxControl() {
    const control = L.control({ position: 'bottomleft' });
    control.onAdd = () => {
      const div = L.DomUtil.create('div', 'route-info-box');
      div.style.cssText = 'background:rgba(10,10,26,0.9);border:1px solid #3a86ff;color:#e0e0e0;font-family:monospace;font-size:11px;padding:8px 12px;border-radius:4px;line-height:1.6;min-width:180px;';
      return div;
    };
    return control;
  }

  function clearLeafletLayers() {
    if (!leafletMap) return;
    if (wpMarker) { leafletMap.removeLayer(wpMarker); wpMarker = null; }
    if (wpLine) { leafletMap.removeLayer(wpLine); wpLine = null; }
    if (headingArrow) { leafletMap.removeLayer(headingArrow); headingArrow = null; }
    for (const l of laylineLines) leafletMap.removeLayer(l);
    laylineLines.length = 0;
    for (const l of isochroneLines) leafletMap.removeLayer(l);
    isochroneLines.length = 0;
    if (infoBox) { leafletMap.removeControl(infoBox); infoBox = null; }
  }

  function drawLeaflet(data) {
    if (!leafletMap || !visible || !data) return;
    clearLeafletLayers();

    const boatPos = [data.boatLat, data.boatLon];
    const wpPos = [data.waypoint.lat, data.waypoint.lon];

    // Waypoint marker
    wpMarker = L.marker(wpPos, { icon: createWpIcon() }).addTo(leafletMap);

    // Dashed line boat -> waypoint
    wpLine = L.polyline([boatPos, wpPos], {
      color: WP_COLOR,
      weight: 1.5,
      dashArray: '6,4',
      opacity: 0.7,
    }).addTo(leafletMap);

    // Heading arrow
    if (data.advice && !data.advice.error) {
      const arrowDist = Math.min(data.advice.distanceToWP * 0.3, 20); // nm, capped
      const arrowEnd = destinationPointSimple(
        data.boatLat, data.boatLon, data.advice.bestHeading, arrowDist,
      );
      headingArrow = L.polyline([boatPos, [arrowEnd.lat, arrowEnd.lon]], {
        color: HEADING_COLOR,
        weight: 3,
        opacity: 0.9,
      }).addTo(leafletMap);
      // Arrowhead via decorator would need a plugin; skip for simplicity
    }

    // Laylines
    if (data.laylines) {
      const ll = data.laylines;
      if (ll.upwind) {
        addLayline(ll.upwind.port.line, LAYLINE_PORT);
        addLayline(ll.upwind.starboard.line, LAYLINE_STBD);
      }
      if (ll.downwind) {
        addLayline(ll.downwind.port.line, LAYLINE_PORT);
        addLayline(ll.downwind.starboard.line, LAYLINE_STBD);
      }
    }

    // Isochrone rings
    if (data.isochrone && data.isochrone.length > 0) {
      const pts = data.isochrone.map((p) => [p.lat, p.lon]);
      pts.push(pts[0]); // close the ring
      const line = L.polyline(pts, {
        color: ISOCHRONE_COLOR,
        weight: 1,
        opacity: 0.5,
        dashArray: '3,3',
      }).addTo(leafletMap);
      isochroneLines.push(line);
    }

    // Info box
    if (data.advice && !data.advice.error) {
      infoBox = createInfoBoxControl();
      infoBox.addTo(leafletMap);
      const a = data.advice;
      const etaStr = a.etaHours != null ? formatEta(a.etaHours) : '--';
      infoBox.getContainer().innerHTML = [
        `<b>Route Advisor</b>`,
        `BRG ${a.bearingToWP.toFixed(0)}° | ${a.distanceToWP.toFixed(1)} nm`,
        `HDG ${a.bestHeading}° | TWA ${a.bestTwa.toFixed(0)}°`,
        `Sail: ${a.bestSailName} | ${a.bestSpeed.toFixed(1)} kn`,
        `VMG→WP: ${a.bestVmgToWP.toFixed(1)} kn`,
        `ETA: ${etaStr}`,
        a.directRoutePossible ? '✓ Direct route' : (a.isUpwind ? '▲ Upwind' : (a.isDownwind ? '▼ Downwind' : '→ Reaching')),
      ].join('<br>');
    }
  }

  function addLayline(line, color) {
    if (!line || line.length < 2) return;
    const coords = line.map((p) => [p.lat, p.lon]);
    const l = L.polyline(coords, {
      color,
      weight: 1,
      dashArray: '4,4',
      opacity: 0.6,
    }).addTo(leafletMap);
    laylineLines.push(l);
  }

  // --- 3D Globe layers ---
  const threeObjects = [];

  function clear3D() {
    if (!threeScene) return;
    for (const obj of threeObjects) threeScene.remove(obj);
    threeObjects.length = 0;
  }

  function draw3D(data) {
    if (!threeScene || !visible || !data) return;
    clear3D();

    const GLOBE_R = 1;

    // Waypoint marker (small sphere)
    const wpGeo = new THREE.SphereGeometry(0.01, 8, 8);
    const wpMat = new THREE.MeshBasicMaterial({ color: 0xff8c00 });
    const wpMesh = new THREE.Mesh(wpGeo, wpMat);
    const wpPos = latLonToVec3(data.waypoint.lat, data.waypoint.lon, GLOBE_R + 0.005);
    wpMesh.position.copy(wpPos);
    threeScene.add(wpMesh);
    threeObjects.push(wpMesh);

    // Heading arrow line
    if (data.advice && !data.advice.error) {
      const boatV = latLonToVec3(data.boatLat, data.boatLon, GLOBE_R + 0.003);
      const arrowDist = Math.min(data.advice.distanceToWP * 0.3, 20);
      const arrowEnd = destinationPointSimple(data.boatLat, data.boatLon, data.advice.bestHeading, arrowDist);
      const endV = latLonToVec3(arrowEnd.lat, arrowEnd.lon, GLOBE_R + 0.003);
      const geo = new THREE.BufferGeometry().setFromPoints([boatV, endV]);
      const mat = new THREE.LineBasicMaterial({ color: 0xff8c00 });
      const line = new THREE.Line(geo, mat);
      threeScene.add(line);
      threeObjects.push(line);
    }

    // Laylines
    if (data.laylines) {
      const draw = (lineData, color) => {
        if (!lineData || lineData.length < 2) return;
        const pts = lineData.map((p) => latLonToVec3(p.lat, p.lon, GLOBE_R + 0.002));
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color, opacity: 0.6, transparent: true });
        const l = new THREE.Line(geo, mat);
        threeScene.add(l);
        threeObjects.push(l);
      };
      if (data.laylines.upwind) {
        draw(data.laylines.upwind.port.line, 0xff4444);
        draw(data.laylines.upwind.starboard.line, 0x44cc44);
      }
      if (data.laylines.downwind) {
        draw(data.laylines.downwind.port.line, 0xff4444);
        draw(data.laylines.downwind.starboard.line, 0x44cc44);
      }
    }

    // Isochrone
    if (data.isochrone && data.isochrone.length > 0) {
      const pts = data.isochrone.map((p) => latLonToVec3(p.lat, p.lon, GLOBE_R + 0.002));
      pts.push(pts[0]);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0x886fff, opacity: 0.5, transparent: true });
      const l = new THREE.Line(geo, mat);
      threeScene.add(l);
      threeObjects.push(l);
    }
  }

  // --- Public API ---

  function update(data) {
    routeData = data;
    if (!visible) return;
    drawLeaflet(data);
    draw3D(data);
  }

  function setWaypoint(lat, lon) {
    waypoint = { lat, lon };
  }

  function clearWaypoint() {
    waypoint = null;
    routeData = null;
    clearLeafletLayers();
    clear3D();
  }

  function toggle() {
    visible = !visible;
    if (!visible) {
      clearLeafletLayers();
      clear3D();
    } else if (routeData) {
      drawLeaflet(routeData);
      draw3D(routeData);
    }
    return visible;
  }

  function getWaypoint() {
    return waypoint;
  }

  function isVisible() {
    return visible;
  }

  return { update, setWaypoint, clearWaypoint, toggle, getWaypoint, isVisible };
}

// --- Helpers ---

function latLonToVec3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function destinationPointSimple(lat, lon, bearing, distNm) {
  const R = 3440.065;
  const DEG = Math.PI / 180;
  const lat1 = lat * DEG;
  const lon1 = lon * DEG;
  const brng = bearing * DEG;
  const d = distNm / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 / DEG, lon: lon2 / DEG };
}

function formatEta(hours) {
  if (hours <= 0 || !isFinite(hours)) return '--';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
