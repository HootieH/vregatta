/**
 * Inshore race map using Leaflet with CRS.Simple.
 *
 * Renders boats as arrow markers on a game-coordinate plane,
 * with track trails, mark diamonds, and a wind direction indicator.
 */
import L from 'leaflet';
import { initWindViz } from './wind-viz.js';
import { initWindShadow } from './wind-shadow.js';

const PLAYER_COLOR = '#3a86ff';
const COMPETITOR_COLOR = '#ff9f1c';
const GIVEWAY_COLOR = '#ff3333';
const STANDON_COLOR = '#00e676';
const STALE_COLOR = '#888888';
const MARK_COLOR = '#ff8c00';
const GRID_COLOR = '#1a2a3a';
const TRACK_MAX_POINTS = 60; // ~30 seconds at 2 updates/sec

function createBoatArrowSvg(heading, color, size, opacity) {
  const op = opacity ?? 0.9;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <g transform="rotate(${heading}, ${size / 2}, ${size / 2})">
      <polygon points="${size / 2},2 ${size * 0.25},${size - 2} ${size / 2},${size * 0.7} ${size * 0.75},${size - 2}"
               fill="${color}" stroke="#fff" stroke-width="1" opacity="${op}"/>
    </g>
  </svg>`;
}

function createBoatIcon(heading, color, size, opacity) {
  return L.divIcon({
    html: createBoatArrowSvg(heading, color, size, opacity),
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
  // Fleet name lookup: slot -> playerName
  let fleetNames = new Map();
  // Mark markers
  const markMarkers = new Map();
  let courseLine = null;

  // North indicator — top-left corner
  const northEl = document.createElement('div');
  northEl.style.cssText = 'position:absolute;top:8px;left:8px;z-index:1000;pointer-events:none;text-align:center;';
  northEl.innerHTML = `<svg width="32" height="40" viewBox="0 0 32 40">
    <polygon points="16,2 12,14 20,14" fill="#e74c3c" stroke="#fff" stroke-width="1"/>
    <polygon points="16,38 12,26 20,26" fill="#333" stroke="#fff" stroke-width="1"/>
    <text x="16" y="24" text-anchor="middle" fill="#fff" font-size="10" font-weight="bold" font-family="monospace">N</text>
  </svg>`;
  container.appendChild(northEl);

  // Wind indicator overlay — top-right corner
  const windEl = document.createElement('div');
  windEl.className = 'map-wind-indicator';
  windEl.innerHTML = '<div class="map-wind-label" style="font-size:10px;color:#888;margin-bottom:2px;">WIND</div><div class="map-wind-arrow"></div><div class="map-wind-value">---</div>';
  container.appendChild(windEl);

  // Fleet counter overlay
  const fleetCounterEl = document.createElement('div');
  fleetCounterEl.className = 'map-fleet-counter';
  fleetCounterEl.style.cssText = 'position:absolute;bottom:8px;left:8px;z-index:1000;background:rgba(0,0,0,0.7);color:#ccc;padding:4px 8px;border-radius:4px;font-size:11px;font-family:monospace;pointer-events:none;';
  fleetCounterEl.textContent = '';
  container.appendChild(fleetCounterEl);

  // Wind visualization layers
  const windViz = initWindViz(map, container);
  const windShadow = initWindShadow(map, container);

  // Heading projection line for player
  const headingLine = L.polyline([], {
    color: '#ffffff',
    opacity: 0.3,
    weight: 1.5,
    dashArray: '6, 4',
  }).addTo(map);

  function getBoatLabel(boat) {
    if (boat.isPlayer) return 'YOU';
    const name = fleetNames.get(boat.slot);
    if (name) {
      // Shorten long names (max 16 chars)
      return name.length > 16 ? name.substring(0, 14) + '\u2026' : name;
    }
    return `#${boat.slot}`;
  }

  let firstUpdate = true;

  // --- Interpolation state per boat ---
  // Smooth boat motion: interpolate between known positions at 60fps.
  // Duration adapts to actual data rate (time between received updates).
  const interpState = new Map();
  const DEFAULT_INTERP_MS = 150;
  const MIN_INTERP_MS = 50;
  const MAX_INTERP_MS = 500;

  function lerpAngle(a, b, t) {
    let delta = b - a;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return ((a + delta * t) % 360 + 360) % 360;
  }

  function easeOut(t) {
    // Smooth deceleration for more natural motion
    return 1 - (1 - t) * (1 - t);
  }

  function getInterpolated(slot, now) {
    const s = interpState.get(slot);
    if (!s) return null;
    const elapsed = now - s.startTime;
    const rawT = Math.min(elapsed / s.duration, 1);
    const t = easeOut(rawT);
    return {
      x: s.prevX + (s.targetX - s.prevX) * t,
      y: s.prevY + (s.targetY - s.prevY) * t,
      heading: lerpAngle(s.prevHdg, s.targetHdg, t),
    };
  }

  function setTarget(slot, x, y, heading) {
    const now = performance.now();
    const existing = interpState.get(slot);

    if (existing) {
      // Adapt duration to actual data arrival rate
      const timeSinceLastUpdate = now - existing.startTime;
      const adaptiveDuration = Math.max(MIN_INTERP_MS, Math.min(MAX_INTERP_MS, timeSinceLastUpdate * 1.2));

      // Start from current interpolated position (not raw previous)
      const current = getInterpolated(slot, now);

      // Skip tiny movements (sub-pixel jitter)
      const dx = x - (current?.x ?? x);
      const dy = y - (current?.y ?? y);
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(heading - (current?.heading ?? heading)) < 0.5) {
        return; // no meaningful change — don't reset interpolation
      }

      interpState.set(slot, {
        prevX: current?.x ?? x,
        prevY: current?.y ?? y,
        prevHdg: current?.heading ?? heading,
        targetX: x,
        targetY: y,
        targetHdg: heading,
        startTime: now,
        duration: adaptiveDuration,
      });
    } else {
      interpState.set(slot, {
        prevX: x, prevY: y, prevHdg: heading,
        targetX: x, targetY: y, targetHdg: heading,
        startTime: now,
        duration: DEFAULT_INTERP_MS,
      });
    }
  }

  function drawGrid(centerX, centerY) {
    gridGroup.clearLayers();
    const step = 1000;
    const range = 10000;
    // X=North (lat), Y=East (lng) — toLatLng returns [x, y]
    const startX = Math.floor((centerX - range) / step) * step;
    const startY = Math.floor((centerY - range) / step) * step;

    // Vertical lines (constant Y, varying X=North)
    for (let y = startY; y <= centerY + range; y += step) {
      L.polyline([[centerX - range, y], [centerX + range, y]], {
        color: GRID_COLOR,
        weight: 0.5,
        opacity: 0.5,
      }).addTo(gridGroup);
    }
    // Horizontal lines (constant X, varying Y=East)
    for (let x = startX; x <= centerX + range; x += step) {
      L.polyline([[x, centerY - range], [x, centerY + range]], {
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

  // Coordinate convention: X=North, Y=East, heading=atan2(dy,dx)
  // For Leaflet CRS.Simple: lat=north=X, lng=east=Y
  function toLatLng(boat) {
    return [boat.x, boat.y];
  }

  function update(snapshot) {
    if (!snapshot || !snapshot.inshoreActive) return;

    // Use accumulated fleet (all known boats) if available, fall back to visible-only
    const allBoats = snapshot.inshoreAllBoats && snapshot.inshoreAllBoats.length > 0
      ? snapshot.inshoreAllBoats
      : (snapshot.inshoreBoats || []);
    const visibleBoats = snapshot.inshoreBoats || [];
    const playerBoat = visibleBoats.find(b => b.isPlayer) || allBoats.find(b => b.isPlayer);
    const trackHistory = snapshot._inshoreTrackHistory || {};
    const accStats = snapshot.inshoreAccStats;

    // Set interpolation targets for all boats
    for (const boat of allBoats) {
      setTarget(boat.slot, boat.x, boat.y, boat.heading);
    }

    // Update fleet names from snapshot
    if (snapshot.inshoreFleet && snapshot.inshoreFleet.length > 0) {
      fleetNames.clear();
      for (const p of snapshot.inshoreFleet) {
        if (p.slotId != null && p.name) {
          fleetNames.set(p.slotId, p.name);
        }
      }
    }

    // Draw grid around player on first update
    if (playerBoat && (!gridDrawn || !gridCenter)) {
      drawGrid(playerBoat.x, playerBoat.y);
    }

    // Update wind indicator — arrow shows where wind comes FROM
    if (snapshot.inshoreWindDirection != null) {
      const wd = snapshot.inshoreWindDirection;
      const arrowSvg = `<svg width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="none" stroke="#00b4d8" stroke-width="1" opacity="0.3"/>
        <g transform="rotate(${wd}, 16, 16)">
          <line x1="16" y1="28" x2="16" y2="6" stroke="#00b4d8" stroke-width="2.5"/>
          <polygon points="16,4 11,11 21,11" fill="#00b4d8"/>
        </g>
      </svg>`;
      windEl.querySelector('.map-wind-arrow').innerHTML = arrowSvg;
      const valueEl = windEl.querySelector('.map-wind-value');
      if (valueEl) valueEl.textContent = `${Math.round(wd)}°`;
    }

    // Update fleet counter
    if (accStats) {
      const vis = accStats.currentlyVisible;
      const known = accStats.totalSeen;
      fleetCounterEl.textContent = `Visible: ${vis} / Known: ${known} / Race: 18`;
    }

    // Track active slots (all known boats now)
    const activeSlots = new Set();
    const visibleSlots = new Set(visibleBoats.map(b => b.slot));

    for (const boat of allBoats) {
      activeSlots.add(boat.slot);
      const pos = toLatLng(boat);
      const isVisible = boat.visible !== false && visibleSlots.has(boat.slot);
      const isStale = boat.stale === true || !isVisible;
      const color = boat.isPlayer ? PLAYER_COLOR : (isStale ? STALE_COLOR : getBoatColor(boat));
      const opacity = boat.isPlayer ? 0.9 : (isStale ? 0.4 : 0.9);
      const size = boat.isPlayer ? 28 : 20;

      let entry = boats.get(boat.slot);
      if (!entry) {
        const marker = L.marker(pos, { icon: createBoatIcon(boat.heading, color, size, opacity), zIndexOffset: boat.isPlayer ? 1000 : 0 }).addTo(map);
        const label = L.marker(pos, {
          icon: L.divIcon({ html: '', iconSize: [1, 1], className: '' }),
          interactive: false,
        }).addTo(map);
        const trail = L.polyline([], { color, opacity: isStale ? 0.2 : 0.4, weight: 1.5 }).addTo(map);
        entry = { marker, label, trail, trailCoords: [], lastColor: color, lastSize: size, lastOpacity: opacity };
        boats.set(boat.slot, entry);
      }

      // Only rebuild icon when color/size/opacity changes (NOT every frame)
      if (entry.lastColor !== color || entry.lastSize !== size || entry.lastOpacity !== opacity) {
        entry.lastColor = color;
        entry.lastSize = size;
        entry.lastOpacity = opacity;
      }

      // Store boat metadata for the animation loop
      entry.boatData = boat;
      entry.color = color;
      entry.size = size;
      entry.opacity = opacity;
      entry.isStale = isStale;

      // Update label text — name + speed in knots
      const nameLabel = boat.isPlayer ? 'YOU' : (isStale ? `${getBoatLabel(boat)}?` : getBoatLabel(boat));
      const spdLabel = boat.speedKnots != null && boat.speedKnots > 0 ? ` ${boat.speedKnots.toFixed(1)}kn` : '';
      const updatedLabel = nameLabel + spdLabel;
      const updatedClass = boat.isPlayer ? 'boat-label boat-label-player' : 'boat-label';
      const updatedWidth = Math.max(50, Math.min(updatedLabel.length * 7, 140));
      entry.label.setIcon(L.divIcon({
        html: `<span class="${updatedClass}" style="opacity:${opacity}">${updatedLabel}</span>`,
        iconSize: [updatedWidth, 14],
        iconAnchor: [updatedWidth / 2, -10],
        className: '',
      }));

      // Update trail from accumulated track history or dashboard track history
      const accTrack = boat.trackHistory;
      const slotTrack = accTrack && accTrack.length > 1 ? accTrack : trackHistory[boat.slot];
      if (slotTrack && slotTrack.length > 1) {
        const coords = slotTrack.slice(-TRACK_MAX_POINTS).map(p => [p.x, p.y]);
        entry.trail.setLatLngs(coords);
        entry.trail.setStyle({ color, opacity: isStale ? 0.2 : 0.4 });
      }
    }

    // Remove boats no longer in accumulated fleet
    for (const [slot, entry] of boats) {
      if (!activeSlots.has(slot)) {
        map.removeLayer(entry.marker);
        map.removeLayer(entry.label);
        map.removeLayer(entry.trail);
        boats.delete(slot);
      }
    }

    // Heading projection for player
    // Coordinate system: X=North, Y=East, heading=atan2(dy,dx)
    // So: endX = x + cos(heading), endY = y + sin(heading)
    if (playerBoat) {
      const pos = toLatLng(playerBoat);
      const hdgRad = (playerBoat.heading * Math.PI) / 180;
      const projLen = 2000;
      const endX = playerBoat.x + projLen * Math.cos(hdgRad);
      const endY = playerBoat.y + projLen * Math.sin(hdgRad);
      headingLine.setLatLngs([pos, [endX, endY]]);
    }

    // Update wind visualization and shadow cones
    windViz.update(snapshot);
    windViz.updateBoatWinds(allBoats);
    windShadow.update(allBoats, snapshot.inshoreWindDirection);

    // Auto-zoom: fit visible boats (not stale) with padding
    const boatsForZoom = allBoats.filter(b => visibleSlots.has(b.slot));
    if (boatsForZoom.length > 0) {
      const bounds = L.latLngBounds(boatsForZoom.map(b => toLatLng(b)));

      if (firstUpdate) {
        map.fitBounds(bounds.pad(0.3), { maxZoom: 0, animate: false });
        firstUpdate = false;
      } else if (boatsForZoom.length === 1) {
        // Follow single boat
        map.panTo(toLatLng(boatsForZoom[0]), { animate: true, duration: 0.5 });
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
      const pos = [mark.x, mark.y];
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

  // --- 60fps animation loop for smooth boat interpolation ---
  let lastIconUpdate = new Map(); // slot -> {heading, color}
  let lastMarkerPos = new Map();  // slot -> {x, y} — track to avoid redundant setLatLng

  function animate() {
    const now = performance.now();
    for (const [slot, entry] of boats) {
      const interp = getInterpolated(slot, now);
      if (!interp) continue;

      // Only call setLatLng if position actually moved (>0.5 game units)
      const lastPos = lastMarkerPos.get(slot);
      const moved = !lastPos || Math.abs(interp.x - lastPos.x) > 0.5 || Math.abs(interp.y - lastPos.y) > 0.5;
      if (moved) {
        const pos = [interp.x, interp.y];
        entry.marker.setLatLng(pos);
        entry.label.setLatLng(pos);
        lastMarkerPos.set(slot, { x: interp.x, y: interp.y });
      }

      // Only rebuild icon when heading changes by >3° or color changed
      const last = lastIconUpdate.get(slot);
      const hdgRounded = Math.round(interp.heading);
      if (!last || Math.abs(last.heading - hdgRounded) >= 3 || last.color !== entry.color) {
        entry.marker.setIcon(createBoatIcon(hdgRounded, entry.color, entry.size, entry.opacity));
        lastIconUpdate.set(slot, { heading: hdgRounded, color: entry.color });
      }
    }

    // Update heading projection line from interpolated player position
    const playerSlot = [...boats.entries()].find(([, e]) => e.boatData?.isPlayer)?.[0];
    if (playerSlot != null) {
      const pi = getInterpolated(playerSlot, now);
      if (pi) {
        const hdgRad = (pi.heading * Math.PI) / 180;
        const projLen = 2000;
        headingLine.setLatLngs([[pi.x, pi.y], [pi.x + projLen * Math.cos(hdgRad), pi.y + projLen * Math.sin(hdgRad)]]);
      }
    }

    requestAnimationFrame(animate);
  }

  // Start animation loop
  requestAnimationFrame(animate);

  return { update, updateMarks, updateEncounters, resize, windViz, windShadow };
}
