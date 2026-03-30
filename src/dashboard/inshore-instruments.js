/**
 * Compact instrument bar for the Inshore dashboard.
 *
 * Shows heading, speed, TWA, wind direction, point of sail, and VMG
 * as large glanceable numbers in a single row.
 */

const POS_NAMES = {
  'head-to-wind': 'Head to Wind',
  'close-hauled': 'Close Hauled',
  'close-reach': 'Close Reach',
  'beam-reach': 'Beam Reach',
  'broad-reach': 'Broad Reach',
  'running': 'Running',
  'dead-downwind': 'Dead Downwind',
};

const COMPASS_POINTS = [
  { min: 337.5, max: 360, label: 'N' },
  { min: 0, max: 22.5, label: 'N' },
  { min: 22.5, max: 67.5, label: 'NE' },
  { min: 67.5, max: 112.5, label: 'E' },
  { min: 112.5, max: 157.5, label: 'SE' },
  { min: 157.5, max: 202.5, label: 'S' },
  { min: 202.5, max: 247.5, label: 'SW' },
  { min: 247.5, max: 292.5, label: 'W' },
  { min: 292.5, max: 337.5, label: 'NW' },
];

function compassLabel(deg) {
  if (deg == null) return '';
  const d = ((deg % 360) + 360) % 360;
  for (const p of COMPASS_POINTS) {
    if (p.min <= d && d < p.max) return p.label;
  }
  return 'N';
}

/**
 * Initialize instruments in the given container.
 *
 * @param {string} containerId
 * @returns {{ update: function }}
 */
export function initInshoreInstruments(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  // Track max observed speed for % calculation
  let maxObservedSpeed = 0;

  // Build instrument cells
  const cells = {};

  function makeCell(id, label) {
    const cell = document.createElement('div');
    cell.className = 'instr-cell';

    const lbl = document.createElement('div');
    lbl.className = 'instr-label';
    lbl.textContent = label;
    cell.appendChild(lbl);

    const val = document.createElement('div');
    val.className = 'instr-value';
    val.textContent = '---';
    cell.appendChild(val);

    const sub = document.createElement('div');
    sub.className = 'instr-sub';
    cell.appendChild(sub);

    container.appendChild(cell);
    cells[id] = { cell, value: val, sub };
    return cells[id];
  }

  makeCell('hdg', 'HDG');
  makeCell('spd', 'SPD');
  makeCell('twa', 'TWA');
  makeCell('twd', 'TWD');
  makeCell('pos', 'SAIL');
  makeCell('vmg', 'VMG');
  makeCell('lap', 'LAP');
  makeCell('timer', 'TIMER');

  function update(snapshot) {
    if (!snapshot) return;

    const player = snapshot.inshorePlayerBoat;
    if (!player) {
      for (const c of Object.values(cells)) {
        c.value.textContent = '---';
        c.sub.textContent = '';
        c.value.className = 'instr-value';
      }
      return;
    }

    // HDG
    const hdg = cells.hdg;
    if (player.heading != null) {
      hdg.value.textContent = `${String(Math.round(player.heading)).padStart(3, '0')}`;
      hdg.sub.textContent = compassLabel(player.heading);
    } else {
      hdg.value.textContent = '---';
      hdg.sub.textContent = '';
    }

    // SPD — show in knots (calibrated: rawSpeed / 923 ≈ knots)
    const spd = cells.spd;
    if (player.speedKnots != null && player.speedKnots > 0) {
      if (player.speedRaw > maxObservedSpeed) {
        maxObservedSpeed = player.speedRaw;
      }
      spd.value.textContent = player.speedKnots.toFixed(1);
      spd.sub.textContent = 'kn';

      // Color based on percentage of max observed
      const pct = maxObservedSpeed > 0 ? Math.round((player.speedRaw / maxObservedSpeed) * 100) : 0;
      spd.value.className = 'instr-value';
      if (pct >= 80) spd.value.classList.add('spd-green');
      else if (pct >= 50) spd.value.classList.add('spd-yellow');
      else spd.value.classList.add('spd-red');
    } else {
      spd.value.textContent = '---';
      spd.sub.textContent = 'kn';
      spd.value.className = 'instr-value';
    }

    // TWA
    const twa = cells.twa;
    if (player.twa != null) {
      const absTwa = Math.abs(Math.round(player.twa));
      const side = player.twa >= 0 ? 'STBD' : 'PORT';
      twa.value.textContent = `${absTwa}`;
      twa.sub.textContent = side;
      twa.value.className = 'instr-value';
      twa.value.classList.add(player.twa >= 0 ? 'twa-stbd' : 'twa-port');
    } else {
      twa.value.textContent = '---';
      twa.sub.textContent = '';
      twa.value.className = 'instr-value';
    }

    // TWD
    const twd = cells.twd;
    if (snapshot.inshoreWindDirection != null) {
      const wd = Math.round(snapshot.inshoreWindDirection);
      twd.value.textContent = `${String(wd).padStart(3, '0')}`;
      twd.sub.textContent = compassLabel(wd);
    } else {
      twd.value.textContent = '---';
      twd.sub.textContent = '';
    }

    // POS (Point of Sail)
    const pos = cells.pos;
    if (player.pointOfSail) {
      pos.value.textContent = POS_NAMES[player.pointOfSail] || player.pointOfSail;
      pos.value.style.fontSize = '18px'; // Smaller for text
      pos.sub.textContent = '';
    } else {
      pos.value.textContent = '---';
      pos.value.style.fontSize = '';
      pos.sub.textContent = '';
    }

    // VMG
    const vmg = cells.vmg;
    if (player.vmg != null) {
      const absVmg = Math.abs(player.vmg);
      const dir = player.vmg >= 0 ? 'UP' : 'DN';
      vmg.value.textContent = absVmg.toFixed(2);
      vmg.sub.textContent = dir;
      vmg.value.className = 'instr-value';
      vmg.value.classList.add(player.vmg >= 0 ? 'vmg-up' : 'vmg-down');
    } else {
      vmg.value.textContent = '---';
      vmg.sub.textContent = '';
      vmg.value.className = 'instr-value';
    }

    // LAP
    const lap = cells.lap;
    if (snapshot.inshoreCurrentLap != null) {
      lap.value.textContent = String(snapshot.inshoreCurrentLap);
      lap.sub.textContent = '';
    } else {
      lap.value.textContent = '---';
      lap.sub.textContent = '';
    }

    // TIMER — race countdown
    const timer = cells.timer;
    if (snapshot.inshoreRaceTimerSeconds != null) {
      const secs = snapshot.inshoreRaceTimerSeconds;
      const min = Math.floor(secs / 60);
      const sec = secs % 60;
      timer.value.textContent = `${min}:${String(sec).padStart(2, '0')}`;
      timer.value.className = 'instr-value';
      if (secs < 30) timer.value.classList.add('timer-critical');
      else if (secs < 60) timer.value.classList.add('timer-warning');
    } else {
      timer.value.textContent = '---';
      timer.value.className = 'instr-value';
    }
  }

  return { update };
}
