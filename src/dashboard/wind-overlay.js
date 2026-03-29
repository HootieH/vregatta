import L from 'leaflet';
import * as THREE from 'three';

const COLORS = {
  light: '#00b4d8', // <10kn
  medium: '#e0e0e0', // 10-20kn
  strong: '#f39c12', // 20-30kn
  storm: '#e74c3c', // >30kn
};

function twsColor(tws) {
  if (tws < 10) return COLORS.light;
  if (tws < 20) return COLORS.medium;
  if (tws < 30) return COLORS.strong;
  return COLORS.storm;
}

function twsColorHex(tws) {
  if (tws < 10) return 0x00b4d8;
  if (tws < 20) return 0xe0e0e0;
  if (tws < 30) return 0xf39c12;
  return 0xe74c3c;
}

// --- 2D Wind Arrow SVG ---
function windArrowSvg(twd, tws, size) {
  const color = twsColor(tws);
  // Arrow length proportional to TWS, clamped
  const len = Math.min(size, 8 + tws * 0.8);
  const half = size / 2;
  // TWD is direction wind comes FROM — arrow points downwind (twd + 180)
  const angle = twd;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <g transform="rotate(${angle}, ${half}, ${half})">
      <line x1="${half}" y1="${half + len / 2}" x2="${half}" y2="${half - len / 2}"
        stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      <polygon points="${half},${half - len / 2} ${half - 4},${half - len / 2 + 8} ${half + 4},${half - len / 2 + 8}"
        fill="${color}"/>
    </g>
  </svg>`;
}

export function initWindOverlay(map2dInstance, globe3dInstance, leafletMap, threeScene) {
  let visible = true;

  // --- 2D Leaflet layer ---
  const arrowLayer = leafletMap ? L.layerGroup().addTo(leafletMap) : null;
  let boatArrow2d = null;

  // --- 3D Three.js objects ---
  let boatArrow3d = null;
  const compArrows3d = new Map();

  function createArrow3d(scene) {
    const group = new THREE.Group();
    // Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.06, 6);
    const shaftMat = new THREE.MeshPhongMaterial({ color: 0xe0e0e0, emissive: 0xe0e0e0, emissiveIntensity: 0.3 });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.y = 0.03;
    group.add(shaft);
    // Head
    const headGeo = new THREE.ConeGeometry(0.006, 0.015, 6);
    const headMat = new THREE.MeshPhongMaterial({ color: 0xe0e0e0, emissive: 0xe0e0e0, emissiveIntensity: 0.3 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.065;
    group.add(head);
    group.visible = false;
    if (scene) scene.add(group);
    return { group, shaftMat, headMat, shaft };
  }

  function latLonToVector3(lat, lon, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -(radius * Math.sin(phi) * Math.cos(theta)),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    );
  }

  function updateArrow3d(arrow, lat, lon, twd, tws, scale) {
    if (!arrow) return;
    const pos = latLonToVector3(lat, lon, 1.008);
    arrow.group.position.copy(pos);

    // Orient: look away from globe center, then rotate around local up by TWD
    arrow.group.lookAt(0, 0, 0);
    arrow.group.rotateX(Math.PI / 2);
    // Rotate around the local Y axis by TWD (wind FROM direction)
    arrow.group.rotateY((twd * Math.PI) / 180);

    // Scale by TWS
    const s = scale * (0.5 + tws * 0.03);
    arrow.group.scale.set(s, s, s);

    // Color
    const color = twsColorHex(tws);
    arrow.shaftMat.color.setHex(color);
    arrow.shaftMat.emissive.setHex(color);
    arrow.headMat.color.setHex(color);
    arrow.headMat.emissive.setHex(color);

    arrow.group.visible = visible;
  }

  if (threeScene) {
    boatArrow3d = createArrow3d(threeScene);
  }

  function update(snapshot, competitors) {
    if (!visible) return;

    const boat = snapshot?.boat;

    // --- 2D update ---
    if (arrowLayer && leafletMap) {
      arrowLayer.clearLayers();

      if (boat && boat.lat != null && boat.lon != null && boat.tws != null && boat.twd != null) {
        const size = 40;
        const icon = L.divIcon({
          html: windArrowSvg(boat.twd, boat.tws, size),
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          className: 'wind-arrow-icon',
        });
        boatArrow2d = L.marker([boat.lat, boat.lon], { icon, interactive: false, zIndexOffset: -100 });
        arrowLayer.addLayer(boatArrow2d);
      }

      // Competitor arrows (smaller)
      if (competitors && competitors.length > 0) {
        for (const comp of competitors) {
          if (comp.lat == null || comp.lon == null || comp.tws == null || comp.twd == null) continue;
          const size = 24;
          const icon = L.divIcon({
            html: windArrowSvg(comp.twd, comp.tws, size),
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            className: 'wind-arrow-icon wind-arrow-comp',
          });
          const marker = L.marker([comp.lat, comp.lon], { icon, interactive: false, zIndexOffset: -200 });
          arrowLayer.addLayer(marker);
        }
      }
    }

    // --- 3D update ---
    if (boatArrow3d && boat && boat.lat != null && boat.lon != null && boat.tws != null && boat.twd != null) {
      updateArrow3d(boatArrow3d, boat.lat, boat.lon, boat.twd, boat.tws, 1);
      boatArrow3d.group.visible = visible;
    } else if (boatArrow3d) {
      boatArrow3d.group.visible = false;
    }

    // 3D competitor arrows
    if (threeScene && competitors && competitors.length > 0) {
      // Hide all existing
      for (const [, arrow] of compArrows3d) {
        arrow.group.visible = false;
      }
      for (const comp of competitors) {
        if (comp.lat == null || comp.lon == null || comp.tws == null || comp.twd == null) continue;
        let arrow = compArrows3d.get(comp.id);
        if (!arrow) {
          arrow = createArrow3d(threeScene);
          compArrows3d.set(comp.id, arrow);
        }
        updateArrow3d(arrow, comp.lat, comp.lon, comp.twd, comp.tws, 0.6);
      }
    }
  }

  function toggle() {
    visible = !visible;
    if (arrowLayer) {
      if (visible) {
        leafletMap.addLayer(arrowLayer);
      } else {
        leafletMap.removeLayer(arrowLayer);
      }
    }
    if (boatArrow3d) boatArrow3d.group.visible = visible;
    for (const [, arrow] of compArrows3d) {
      arrow.group.visible = false; // hide all on toggle off
    }
    return visible;
  }

  function isVisible() {
    return visible;
  }

  return { update, toggle, isVisible };
}
