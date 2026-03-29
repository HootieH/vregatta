import L from 'leaflet';
import { destinationPoint } from '../routing/geometry.js';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://carto.com/">CARTO</a>';
const BOAT_COLOR = '#3a86ff';
const TRACK_COLOR = '#00b4d8';
const COURSE_PROJECTION_NM = 50;
const TWA_PROJECTION_NM = 30;

function createBoatIcon(heading) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <g transform="rotate(${heading}, 12, 12)">
      <polygon points="12,2 6,20 12,16 18,20" fill="${BOAT_COLOR}" stroke="#fff" stroke-width="1" opacity="0.9"/>
    </g>
  </svg>`;
  return L.divIcon({
    html: svg,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    className: '',
  });
}

export function init2DMap(containerId) {
  const map = L.map(containerId, {
    zoomControl: true,
    attributionControl: true,
  }).setView([0, 0], 3);

  L.tileLayer(TILE_URL, {
    attribution: TILE_ATTR,
    maxZoom: 18,
    subdomains: 'abcd',
  }).addTo(map);

  let boatMarker = null;
  const trackCoords = [];
  const trackLine = L.polyline([], {
    color: TRACK_COLOR,
    opacity: 0.6,
    weight: 2,
  }).addTo(map);

  // Course projection line (heading direction)
  const courseProjection = L.polyline([], {
    color: '#ffffff',
    opacity: 0.5,
    weight: 2,
    dashArray: '8, 6',
  }).addTo(map);

  // TWA projection line (wind-driven direction)
  const twaProjection = L.polyline([], {
    color: '#00e5ff',
    opacity: 0.5,
    weight: 1.5,
    dashArray: '6, 4',
  }).addTo(map);

  let firstUpdate = true;

  function update(snapshot, positionHistory) {
    if (!snapshot || !snapshot.boat) return;
    const { lat, lon, heading, twd, twa } = snapshot.boat;
    if (lat == null || lon == null) return;

    const pos = [lat, lon];
    const from = { lat, lon };

    if (!boatMarker) {
      boatMarker = L.marker(pos, { icon: createBoatIcon(heading || 0) }).addTo(map);
    } else {
      boatMarker.setLatLng(pos);
      boatMarker.setIcon(createBoatIcon(heading || 0));
    }

    if (positionHistory && positionHistory.length > 0) {
      trackLine.setLatLngs(positionHistory.map(p => [p.lat, p.lon]));
    } else {
      trackCoords.push(pos);
      trackLine.setLatLngs(trackCoords);
    }

    // Update course projection line along heading
    if (heading != null) {
      const endPt = destinationPoint(from, heading, COURSE_PROJECTION_NM);
      courseProjection.setLatLngs([pos, [endPt.lat, endPt.lon]]);
    } else {
      courseProjection.setLatLngs([]);
    }

    // Update TWA projection line (effective VMG direction from wind)
    if (twd != null && twa != null) {
      // TWA direction: twd + twa for starboard, twd - twa for port
      // Use heading relative to wind to determine tack side
      let twaHeading;
      if (heading != null) {
        const diff = ((heading - twd + 540) % 360) - 180;
        twaHeading = diff >= 0 ? (twd + twa) % 360 : (twd - twa + 360) % 360;
      } else {
        twaHeading = (twd + twa) % 360;
      }
      const twaEnd = destinationPoint(from, twaHeading, TWA_PROJECTION_NM);
      twaProjection.setLatLngs([pos, [twaEnd.lat, twaEnd.lon]]);
    } else {
      twaProjection.setLatLngs([]);
    }

    if (firstUpdate) {
      map.setView(pos, 8);
      firstUpdate = false;
    } else {
      map.panTo(pos, { animate: true, duration: 1 });
    }
  }

  function resize() {
    map.invalidateSize();
  }

  return { update, resize, getLeafletMap() { return map; } };
}
