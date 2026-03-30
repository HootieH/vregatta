import L from 'leaflet';

const SAIL_NAMES = {
  1: 'Jib', 2: 'Spi', 3: 'Staysail', 4: 'Light Jib',
  5: 'Code 0', 6: 'Heavy Genn', 7: 'Light Genn',
};

function qualityColor(score) {
  if (score == null) return '#888';
  if (score > 80) return '#00ff41';
  if (score >= 50) return '#ffbf00';
  return '#ff3333';
}

function tackSvg(heading, score) {
  const color = qualityColor(score);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <g transform="rotate(${heading ?? 0}, 8, 8)">
      <polygon points="8,2 3,14 13,14" fill="${color}" stroke="#fff" stroke-width="0.5" opacity="0.9"/>
    </g>
  </svg>`;
}

function gybeSvg(heading, score) {
  const color = qualityColor(score);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <g transform="rotate(${heading ?? 0}, 8, 8)">
      <polygon points="8,2 2,8 8,14 14,8" fill="${color}" stroke="#fff" stroke-width="0.5" opacity="0.9"/>
    </g>
  </svg>`;
}

function sailChangeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">
    <path d="M7,1 L7,13 M7,1 Q12,5 7,10" fill="none" stroke="#00b4d8" stroke-width="1.5" opacity="0.9"/>
  </svg>`;
}

function windShiftSvg(direction) {
  const rot = direction === 'veer' ? 45 : -45;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">
    <g transform="rotate(${rot}, 7, 7)">
      <line x1="7" y1="12" x2="7" y2="2" stroke="#88ccff" stroke-width="1.5" opacity="0.7"/>
      <polygon points="7,2 4,6 10,6" fill="#88ccff" opacity="0.7"/>
    </g>
  </svg>`;
}

function formatTime(ts) {
  if (!ts) return '--:--';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function buildTooltip(evt) {
  const lines = [`<b>${evt.type}</b>`, `Time: ${formatTime(evt.timestamp)}`];
  if (evt.quality != null) lines.push(`Quality: ${evt.quality}`);
  if (evt.speedBefore != null) lines.push(`Speed before: ${evt.speedBefore.toFixed(1)} kn`);
  if (evt.speedAfter != null) lines.push(`Speed after: ${evt.speedAfter.toFixed(1)} kn`);
  if (evt.from != null && evt.to != null) {
    const fromName = SAIL_NAMES[evt.from] || `Sail ${evt.from}`;
    const toName = SAIL_NAMES[evt.to] || `Sail ${evt.to}`;
    lines.push(`${fromName} &rarr; ${toName}`);
  }
  if (evt.direction) lines.push(`Shift: ${evt.direction}`);
  return lines.join('<br>');
}

/**
 * Initialize event markers on the track.
 * @param {object} map2d - the map object returned by init2DMap
 * @returns {object} {update, setVisible}
 */
export function initTrackMarkers(map2d) {
  if (!map2d) return null;

  const leafletMap = map2d.getLeafletMap();
  if (!leafletMap) return null;

  let markers = [];
  let visible = true;

  function clear() {
    for (const m of markers) {
      leafletMap.removeLayer(m);
    }
    markers = [];
  }

  /**
   * Find the closest position in history to a given timestamp.
   */
  function findPosition(positionHistory, timestamp) {
    if (!positionHistory || positionHistory.length === 0) return null;
    // If positions have timestamps, find closest
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < positionHistory.length; i++) {
      const p = positionHistory[i];
      if (p.timestamp) {
        const d = Math.abs(p.timestamp - timestamp);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
    }
    // If no timestamps, use event index proportionally
    if (bestDist === Infinity) return null;
    return positionHistory[bestIdx];
  }

  /**
   * Update markers from events and position history.
   * events: array of {type, timestamp, quality?, from?, to?, speedBefore?, speedAfter?, direction?, heading?, lat?, lon?}
   * positionHistory: array of {lat, lon, timestamp?}
   */
  function update(events, positionHistory) {
    clear();
    if (!visible || !events || events.length === 0) return;

    for (const evt of events) {
      let pos = null;

      // Event may have lat/lon directly
      if (evt.lat != null && evt.lon != null) {
        pos = [evt.lat, evt.lon];
      } else if (evt.timestamp && positionHistory) {
        const found = findPosition(positionHistory, evt.timestamp);
        if (found) pos = [found.lat, found.lon];
      }
      // For Inshore events with x,y
      if (!pos && evt.x != null && evt.y != null) {
        pos = [-evt.y, evt.x];
      }

      if (!pos) continue;

      let html;
      if (evt.type === 'tack') {
        html = tackSvg(evt.heading, evt.quality);
      } else if (evt.type === 'gybe') {
        html = gybeSvg(evt.heading, evt.quality);
      } else if (evt.type === 'sailChange') {
        html = sailChangeSvg();
      } else if (evt.type === 'windShift') {
        html = windShiftSvg(evt.direction);
      } else {
        continue;
      }

      const icon = L.divIcon({
        html,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        className: 'track-event-marker',
      });

      const marker = L.marker(pos, { icon })
        .bindTooltip(buildTooltip(evt), {
          direction: 'top',
          offset: [0, -10],
          className: 'track-event-tooltip',
        })
        .addTo(leafletMap);

      markers.push(marker);
    }
  }

  function setVisible(v) {
    visible = v;
    if (!visible) clear();
  }

  return { update, setVisible };
}
