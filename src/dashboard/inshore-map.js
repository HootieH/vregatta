/**
 * Inshore race map using Leaflet with CRS.Simple.
 *
 * Renders boats as arrow markers on a game-coordinate plane,
 * with track trails, mark diamonds, and a wind direction indicator.
 */
import L from 'leaflet';

const PLAYER_COLOR = '#3a86ff';
const COMPETITOR_COLOR = '#ff9f1c';
const GIVEWAY_COLOR = '#ff3333';
const STANDON_COLOR = '#00e676';
const MARK_COLOR = '#ff8c00';
const GRID_COLOR = '#1a2a3a';
const TRACK_MAX_POINTS = 60; // ~30 seconds at 2 updates/sec

function createBoatArrowSvg(heading, color, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <g transform="rotate(${heading}, ${size / 2}, ${size / 2})">
      <polygon points="${size / 2},2 ${size * 0.25},${size - 2} ${size / 2},${size * 0.7} ${size * 0.75},${size - 2}"
               fill="${color}" stroke="#fff" stroke-width="1" opacity="0.9"/>
    </g>
  </svg>`;
}

function createBoatIcon(heading, color, size) {
  return L.divIcon({
    html: createBoatArrowSvg(heading, color, size),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    className: '',
  });
}

function createMarkIcon(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="26" viewBox="0 0 20 26">
    <polygon points="10,2 18,10 10,18 2,10" fill="${MARK_COLOR}" fill-opacity="0.4" stroke="${MARK_COLOR}" stroke-width="2"/>
    <text x="10" y="25" text-anchor="middle" fill="${MARK_COLOR}" font-size="9" font-family="monospace" font-weight="bold">${label}</text>
  </svg>`;
  return L.divIcon({
    html: svg,
    iconSize: [20, 26],
    iconAnchor: [10, 13],
    className: '',
  });
}

/**
 * Initialize the Inshore map in the given container.
 *
 * @param {string} containerId - DOM element ID
 * @returns {{ update: function, updateMarks: function, updateEncounters: function, resize: function }}
 */
export function initInshoreMap(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const map = L.map(containerId, {
    crs: L.CRS.Simple,
    zoomControl: true,
    attributionControl: false,
    minZoom: -5,
    maxZoom: 2,
  }).setView([0, 0], -2);

  // Grid lines layer
  const gridGroup = L.layerGroup().addTo(map);
  let gridDrawn = false;
  let gridCenter = null;

  // Boat markers: slot -> { marker, label, trail, trailCoords[] }
  const boats = new Map();
  // Encounter map: slot -> role ('give-way'|'stand-on')
  let encounterRoles = new Map();
  // Mark markers
  const markMarkers = new Map();
  let courseLine = null;

  // Wind indicator overlay
  const windEl = document.createElement('div');
  windEl.className = 'map-wind-indicator';
  windEl.innerHTML = '<div class="map-wind-arrow"></div><div class="map-wind-label">---</div>';
  container.appendChild(windEl);

  // Heading projection line for player
  const headingLine = L.polyline([], {
    color: '#ffffff',
    opacity: 0.3,
    weight: 1.5,
    dashArray: '6, 4',
  }).addTo(map);

  let firstUpdate = true;

  function drawGrid(centerX, centerY) {
    gridGroup.clearLayers();
    const step = 1000;
    const range = 10000;
    const startX = Math.floor((centerX - range) / step) * step;
    const startY = Math.floor((centerY - range) / step) * step;

    for (let x = startX; x <= centerX + range; x += step) {
      L.polyline([[-centerY - range, x], [-centerY + range, x]], {
        color: GRID_COLOR,
        weight: 0.5,
        opacity: 0.5,
      }).addTo(gridGroup);
    }
    for (let y = startY; y <= centerY + range; y += step) {
      L.polyline([[-y, centerX - range], [-y, centerX + range]], {
        color: GRID_COLOR,
        weight: 0.5,
        opacity: 0.5,
      }).addTo(gridGroup);
    }
    gridDrawn = true;
    gridCenter = { x: centerX, y: centerY };
  }

  function getBoatColor(boat) {
    if (boat.isPlayer) return PLAYER_COLOR;
    const role = encounterRoles.get(boat.slot);
    if (role === 'give-way') return GIVEWAY_COLOR;
    if (role === 'stand-on') return STANDON_COLOR;
    return COMPETITOR_COLOR;
  }

  function toLatLng(boat) {
    return [-boat.y, boat.x];
  }

  function update(snapshot) {
    if (!snapshot || !snapshot.inshoreActive || !snapshot.inshoreBoats) return;

    const allBoats = snapshot.inshoreBoats;
    const playerBoat = allBoats.find(b => b.isPlayer);
    const trackHistory = snapshot._inshoreTrackHistory || {};

    // Draw grid around player on first update
    if (playerBoat && (!gridDrawn || !gridCenter)) {
      drawGrid(playerBoat.x, playerBoat.y);
    }

    // Update wind indicator
    if (snapshot.inshoreWindDirection != null) {
      const wd = snapshot.inshoreWindDirection;
      const arrowSvg = `<svg width="24" height="24" viewBox="0 0 24 24">
        <g transform="rotate(${wd}, 12, 12)">
          <line x1="12" y1="22" x2="12" y2="4" stroke="#00b4d8" stroke-width="2"/>
          <polygon points="12,2 8,8 16,8" fill="#00b4d8"/>
        </g>
      </svg>`;
      windEl.querySelector('.map-wind-arrow').innerHTML = arrowSvg;
      windEl.querySelector('.map-wind-label').textContent = `${Math.round(wd)}`;
    }

    // Track active slots
    const activeSlots = new Set();

    for (const boat of allBoats) {
      activeSlots.add(boat.slot);
      const pos = toLatLng(boat);
      const color = getBoatColor(boat);
      const size = boat.isPlayer ? 28 : 20;

      let entry = boats.get(boat.slot);
      if (!entry) {
        const marker = L.marker(pos, { icon: createBoatIcon(boat.heading, color, size), zIndexOffset: boat.isPlayer ? 1000 : 0 }).addTo(map);
        const labelText = boat.isPlayer ? 'YOU' : `#${boat.slot}`;
        const labelClass = boat.isPlayer ? 'boat-label boat-label-player' : 'boat-label';
        const label = L.marker(pos, {
          icon: L.divIcon({
            html: `<span class="${labelClass}">${labelText}</span>`,
            iconSize: [40, 14],
            iconAnchor: [20, -10],
            className: '',
          }),
          interactive: false,
        }).addTo(map);

        const trail = L.polyline([], {
          color,
          opacity: 0.4,
          weight: 1.5,
        }).addTo(map);

        entry = { marker, label, trail, trailCoords: [] };
        boats.set(boat.slot, entry);
      }

      // Update marker position and icon
      entry.marker.setLatLng(pos);
      entry.marker.setIcon(createBoatIcon(boat.heading, color, size));
      entry.label.setLatLng(pos);

      // Update trail from track history
      const slotTrack = trackHistory[boat.slot];
      if (slotTrack && slotTrack.length > 1) {
        const coords = slotTrack.slice(-TRACK_MAX_POINTS).map(p => [-p.y, p.x]);
        entry.trail.setLatLngs(coords);
        entry.trail.setStyle({ color });
      }
    }

    // Remove stale boats
    for (const [slot, entry] of boats) {
      if (!activeSlots.has(slot)) {
        map.removeLayer(entry.marker);
        map.removeLayer(entry.label);
        map.removeLayer(entry.trail);
        boats.delete(slot);
      }
    }

    // Heading projection for player
    if (playerBoat) {
      const pos = toLatLng(playerBoat);
      const hdgRad = (playerBoat.heading * Math.PI) / 180;
      // Project 2000 game units ahead
      const projLen = 2000;
      const endX = playerBoat.x + projLen * Math.sin(hdgRad);
      const endY = playerBoat.y + projLen * Math.cos(hdgRad);
      headingLine.setLatLngs([pos, [-endY, endX]]);
    }

    // Auto-zoom: fit all boats with padding
    if (allBoats.length > 0) {
      const bounds = L.latLngBounds(allBoats.map(b => toLatLng(b)));

      if (firstUpdate) {
        map.fitBounds(bounds.pad(0.5), { maxZoom: -1 });
        firstUpdate = false;
      } else if (allBoats.length === 1) {
        // Follow single boat
        map.panTo(toLatLng(allBoats[0]), { animate: true, duration: 0.5 });
      } else {
        // Gentle fit — only adjust if boats are outside current view
        const currentBounds = map.getBounds();
        if (!currentBounds.contains(bounds)) {
          map.fitBounds(bounds.pad(0.3), { animate: true, maxZoom: map.getZoom() });
        }
      }
    }
  }

  function updateMarks(marks) {
    if (!marks) return;

    // Remove stale
    for (const [id, marker] of markMarkers) {
      if (!marks.find(m => m.id === id)) {
        map.removeLayer(marker);
        markMarkers.delete(id);
      }
    }

    // Draw marks
    for (const mark of marks) {
      const pos = [-mark.y, mark.x];
      const existing = markMarkers.get(mark.id);
      if (existing) {
        existing.setLatLng(pos);
      } else {
        const marker = L.marker(pos, { icon: createMarkIcon(mark.id), interactive: false }).addTo(map);
        markMarkers.set(mark.id, marker);
      }
    }

    // Course line
    if (marks.length >= 2) {
      const coords = marks.map(m => [-m.y, m.x]);
      if (courseLine) {
        courseLine.setLatLngs(coords);
      } else {
        courseLine = L.polyline(coords, {
          color: MARK_COLOR,
          opacity: 0.3,
          weight: 1.5,
          dashArray: '6, 4',
        }).addTo(map);
      }
    }
  }

  function updateEncounters(encounters) {
    encounterRoles.clear();
    if (!encounters) return;
    for (const enc of encounters) {
      if (enc.otherBoat != null && enc.playerRole) {
        // If player is give-way, the other boat is stand-on and vice versa
        const otherRole = enc.playerRole === 'give-way' ? 'stand-on' : 'give-way';
        encounterRoles.set(enc.otherBoat, otherRole);
      }
    }
  }

  function resize() {
    map.invalidateSize();
  }

  return { update, updateMarks, updateEncounters, resize };
}
