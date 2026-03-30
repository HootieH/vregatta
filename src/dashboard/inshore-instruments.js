/**
 * Inshore instrument strip — top bar of the racing cockpit.
 *
 * Reads data-field attributes from the HTML to find value/sub elements.
 * No DOM creation — the layout is defined in inshore-dashboard.html.
 */

const POS_NAMES = {
  'head-to-wind': 'In Irons',
  'close-hauled': 'Close Hauled',
  'close-reach': 'Close Reach',
  'beam-reach': 'Beam Reach',
  'broad-reach': 'Broad Reach',
  'running': 'Running',
  'dead-downwind': 'Dead Run',
};

const COMPASS = [
  [337.5, 360, 'N'], [0, 22.5, 'N'], [22.5, 67.5, 'NE'],
  [67.5, 112.5, 'E'], [112.5, 157.5, 'SE'], [157.5, 202.5, 'S'],
  [202.5, 247.5, 'SW'], [247.5, 292.5, 'W'], [292.5, 337.5, 'NW'],
];

function compassLabel(deg) {
  if (deg == null) return '';
  const d = ((deg % 360) + 360) % 360;
  for (const [min, max, label] of COMPASS) {
    if (d >= min && d < max) return label;
  }
  return 'N';
}

function $(sel) { return document.querySelector(sel); }

function setField(field, text, colorClass) {
  const el = $(`[data-field="${field}"]`);
  if (!el) return;
  el.textContent = text;
  // Reset color classes
  el.className = el.className.replace(/\bclr-\S+/g, '').trim();
  if (colorClass) el.classList.add(colorClass);
}

/**
 * @param {string} _containerId — ignored, reads from top-strip HTML
 * @returns {{ update: function }}
 */
export function initInshoreInstruments() {
  let maxSpeed = 0;

  function update(snapshot) {
    if (!snapshot) return;
    // Use player boat if detected, otherwise fall back to first visible boat
    const p = snapshot.inshorePlayerBoat
      || (snapshot.inshoreBoats && snapshot.inshoreBoats.length > 0 ? snapshot.inshoreBoats[0] : null);

    if (!p) {
      for (const field of ['hdg', 'spd', 'twa', 'twd', 'vmg', 'pos', 'lap', 'timer']) {
        setField(field, '---');
        setField(field + '-sub', '');
      }
      return;
    }

    // HDG
    if (p.heading != null) {
      setField('hdg', String(Math.round(p.heading)).padStart(3, '0'));
      setField('hdg-sub', compassLabel(p.heading));
    } else {
      setField('hdg', '---');
    }

    // SPD
    if (p.speedKnots != null && p.speedKnots > 0) {
      if (p.speedRaw > maxSpeed) maxSpeed = p.speedRaw;
      setField('spd', p.speedKnots.toFixed(1));
      setField('spd-sub', 'kn');
      const pct = maxSpeed > 0 ? (p.speedRaw / maxSpeed) * 100 : 0;
      const el = $('[data-field="spd"]');
      if (el) {
        el.className = el.className.replace(/\bclr-\S+/g, '').trim();
        el.classList.add('ti-value');
        el.classList.add(pct >= 80 ? 'clr-green' : pct >= 50 ? 'clr-amber' : 'clr-red');
      }
    } else {
      setField('spd', '---');
    }

    // TWA
    if (p.twa != null) {
      setField('twa', String(Math.abs(Math.round(p.twa))));
      setField('twa-sub', p.twa >= 0 ? 'STBD' : 'PORT');
      const el = $('[data-field="twa"]');
      if (el) {
        el.className = el.className.replace(/\bclr-\S+/g, '').trim();
        el.classList.add('ti-value');
        el.classList.add(p.twa >= 0 ? 'clr-stbd' : 'clr-port');
      }
    } else {
      setField('twa', '---');
      setField('twa-sub', '');
    }

    // TWD
    if (snapshot.inshoreWindDirection != null) {
      const wd = Math.round(snapshot.inshoreWindDirection);
      setField('twd', String(wd).padStart(3, '0'));

      const wh = snapshot.inshoreWindHistory;
      if (wh && wh.length >= 10) {
        const recent = wh[wh.length - 1].direction;
        const older = wh[Math.max(0, wh.length - 30)].direction;
        let delta = recent - older;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        if (Math.abs(delta) >= 2) {
          const arrow = delta > 0 ? '\u2191' : '\u2193';
          setField('twd-sub', `${compassLabel(wd)} ${arrow}${Math.abs(delta).toFixed(0)}\u00b0`);
          const el = $('[data-field="twd"]');
          if (el) {
            el.className = el.className.replace(/\bclr-\S+/g, '').trim();
            el.classList.add('ti-value', 'clr-amber');
          }
        } else {
          setField('twd-sub', compassLabel(wd));
        }
      } else {
        setField('twd-sub', compassLabel(wd));
      }
    } else {
      setField('twd', '---');
      setField('twd-sub', '');
    }

    // VMG
    if (p.vmg != null) {
      setField('vmg', Math.abs(p.vmg).toFixed(1));
      setField('vmg-sub', p.vmg >= 0 ? 'UP' : 'DN');
      const el = $('[data-field="vmg"]');
      if (el) {
        el.className = el.className.replace(/\bclr-\S+/g, '').trim();
        el.classList.add('ti-value');
        el.classList.add(p.vmg >= 0 ? 'clr-green' : 'clr-blue');
      }
    } else {
      setField('vmg', '---');
      setField('vmg-sub', '');
    }

    // Point of Sail
    if (p.pointOfSail) {
      setField('pos', POS_NAMES[p.pointOfSail] || p.pointOfSail);
    } else {
      setField('pos', '---');
    }

    // LAP
    if (snapshot.inshoreCurrentLap != null) {
      setField('lap', String(snapshot.inshoreCurrentLap));
    } else {
      setField('lap', '---');
    }

    // TIMER
    if (snapshot.inshoreRaceTimerSeconds != null && snapshot.inshoreRaceTimerSeconds > 0) {
      const s = snapshot.inshoreRaceTimerSeconds;
      const m = Math.floor(s / 60);
      const sec = s % 60;
      setField('timer', `${m}:${String(sec).padStart(2, '0')}`);
      const el = $('[data-field="timer"]');
      if (el) {
        el.className = el.className.replace(/\bclr-\S+/g, '').trim();
        el.classList.add('ti-value');
        if (s < 30) el.classList.add('clr-red');
        else if (s < 60) el.classList.add('clr-amber');
      }
    } else {
      setField('timer', '---');
    }
  }

  return { update };
}
