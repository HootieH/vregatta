import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { destinationPoint } from '../routing/geometry.js';

const GLOBE_RADIUS = 1;
const BOAT_COLOR = 0x3a86ff;
const TRACK_COLOR = 0x00b4d8;
const OCEAN_COLOR = 0x0a1628;
const GRID_COLOR = 0x1a3a5c;
const COURSE_PROJECTION_NM = 50;
const COURSE_PROJECTION_SEGMENTS = 32;

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function createGlobeGeometry() {
  const group = new THREE.Group();

  // Ocean sphere
  const sphereGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
  const sphereMat = new THREE.MeshPhongMaterial({
    color: OCEAN_COLOR,
    shininess: 10,
  });
  group.add(new THREE.Mesh(sphereGeo, sphereMat));

  // Latitude lines every 10 degrees
  const lineMat = new THREE.LineBasicMaterial({ color: GRID_COLOR, opacity: 0.4, transparent: true });
  for (let lat = -80; lat <= 80; lat += 10) {
    const points = [];
    for (let lon = -180; lon <= 180; lon += 2) {
      points.push(latLonToVector3(lat, lon, GLOBE_RADIUS + 0.001));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geo, lineMat));
  }

  // Longitude lines every 10 degrees
  for (let lon = -180; lon < 180; lon += 10) {
    const points = [];
    for (let lat = -90; lat <= 90; lat += 2) {
      points.push(latLonToVector3(lat, lon, GLOBE_RADIUS + 0.001));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geo, lineMat));
  }

  return group;
}

export function init3DGlobe(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a1a);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);
  camera.position.set(0, 0, 3);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 1.2;
  controls.maxDistance = 10;

  // Lighting
  scene.add(new THREE.AmbientLight(0x404060, 1.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(5, 3, 5);
  scene.add(dirLight);

  // Globe
  const globe = createGlobeGeometry();
  scene.add(globe);

  // Boat marker
  const boatGeo = new THREE.ConeGeometry(0.015, 0.04, 8);
  const boatMat = new THREE.MeshPhongMaterial({ color: BOAT_COLOR, emissive: BOAT_COLOR, emissiveIntensity: 0.5 });
  const boatMesh = new THREE.Mesh(boatGeo, boatMat);
  boatMesh.visible = false;
  scene.add(boatMesh);

  // Track line
  const trackGeo = new THREE.BufferGeometry();
  const trackMat = new THREE.LineBasicMaterial({ color: TRACK_COLOR, opacity: 0.6, transparent: true });
  const trackLine = new THREE.Line(trackGeo, trackMat);
  scene.add(trackLine);

  // Course projection line
  const projGeo = new THREE.BufferGeometry();
  const projMat = new THREE.LineDashedMaterial({
    color: 0xffffff,
    opacity: 0.5,
    transparent: true,
    dashSize: 0.02,
    gapSize: 0.015,
  });
  const projLine = new THREE.Line(projGeo, projMat);
  scene.add(projLine);

  let firstUpdate = true;

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function update(snapshot, positionHistory) {
    if (!snapshot || !snapshot.boat) return;
    const { lat, lon, heading } = snapshot.boat;
    if (lat == null || lon == null) return;

    const pos = latLonToVector3(lat, lon, GLOBE_RADIUS + 0.005);
    boatMesh.position.copy(pos);
    boatMesh.lookAt(0, 0, 0);
    boatMesh.rotateX(Math.PI / 2);
    boatMesh.visible = true;

    // Update track
    if (positionHistory && positionHistory.length > 1) {
      const points = positionHistory.map(p => latLonToVector3(p.lat, p.lon, GLOBE_RADIUS + 0.002));
      trackGeo.setFromPoints(points);
    }

    // Update course projection line along heading
    if (heading != null) {
      const from = { lat, lon };
      const projPoints = [];
      for (let i = 0; i <= COURSE_PROJECTION_SEGMENTS; i++) {
        const d = (COURSE_PROJECTION_NM * i) / COURSE_PROJECTION_SEGMENTS;
        const pt = destinationPoint(from, heading, d);
        projPoints.push(latLonToVector3(pt.lat, pt.lon, GLOBE_RADIUS + 0.003));
      }
      projGeo.setFromPoints(projPoints);
      projLine.computeLineDistances();
      projLine.visible = true;
    } else {
      projLine.visible = false;
    }

    // On first update, orient camera to boat
    if (firstUpdate) {
      const camPos = latLonToVector3(lat, lon, 3);
      camera.position.copy(camPos);
      controls.target.set(0, 0, 0);
      controls.update();
      firstUpdate = false;
    }
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  return { update, resize, getScene() { return scene; } };
}
