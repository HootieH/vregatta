const SAIL_NAMES = {
  1: 'Jib',
  2: 'Spi',
  3: 'Staysail',
  4: 'Light Jib',
  5: 'Code 0',
  6: 'Heavy Genn',
  7: 'Light Genn',
};

const HUD_FIELDS = [
  { key: 'speed', label: 'Speed', unit: 'kn', decimals: 1 },
  { key: 'heading', label: 'HDG', unit: '\u00B0', decimals: 0 },
  { key: 'twa', label: 'TWA', unit: '\u00B0', decimals: 0 },
  { key: 'tws', label: 'TWS', unit: 'kn', decimals: 1 },
  { key: 'sail', label: 'Sail', format: 'sail' },
  { key: 'vmg', label: 'VMG', unit: 'kn', decimals: 2, format: 'vmg' },
  { key: 'stamina', label: 'Stamina', unit: '%', decimals: 0 },
  { key: 'dtf', label: 'DTF', unit: 'nm', decimals: 1 },
];

export function initHUD() {
  const hud = document.getElementById('hud');
  if (!hud) return null;

  hud.innerHTML = '';

  const elements = {};

  for (const field of HUD_FIELDS) {
    const item = document.createElement('div');
    item.className = 'hud-item';

    const label = document.createElement('span');
    label.className = 'hud-label';
    label.textContent = field.label;

    const value = document.createElement('span');
    value.className = 'hud-value';
    value.id = `hud-${field.key}`;
    value.textContent = '\u2014';

    item.appendChild(label);
    item.appendChild(value);
    hud.appendChild(item);

    elements[field.key] = value;
  }

  function update(snapshot) {
    // Inshore mode: show inshore sailing data
    if (snapshot?.inshoreActive && snapshot.inshorePlayerBoat) {
      const p = snapshot.inshorePlayerBoat;
      const speedPct = ((p.speedRaw / 10000) * 100).toFixed(0);

      if (elements.speed) elements.speed.textContent = speedPct + ' %';
      if (elements.heading) elements.heading.textContent = Math.round(p.heading) + ' \u00B0';
      if (elements.twa) {
        const sign = p.twa >= 0 ? '+' : '';
        elements.twa.textContent = sign + Math.round(p.twa) + ' \u00B0';
      }
      if (elements.tws) elements.tws.textContent = snapshot.inshoreWindSpeed != null ? snapshot.inshoreWindSpeed + ' kn' : '\u2014';
      if (elements.sail) elements.sail.textContent = p.pointOfSail ?? '\u2014';
      if (elements.vmg) {
        if (p.vmg != null) {
          elements.vmg.textContent = p.vmg.toFixed(2);
          elements.vmg.className = 'hud-value vmg-green';
        } else {
          elements.vmg.textContent = '\u2014';
        }
      }
      if (elements.stamina) elements.stamina.textContent = '\u2014';
      if (elements.dtf) elements.dtf.textContent = p.raceProgress != null ? (p.raceProgress / 2).toFixed(0) + ' %' : '\u2014';
      return;
    }

    if (!snapshot || !snapshot.boat) {
      for (const el of Object.values(elements)) {
        el.textContent = '\u2014';
      }
      return;
    }

    const boat = snapshot.boat;

    for (const field of HUD_FIELDS) {
      const el = elements[field.key];
      if (!el) continue;

      if (field.format === 'sail') {
        el.textContent = SAIL_NAMES[boat.sail] || '\u2014';
        continue;
      }

      if (field.format === 'vmg') {
        const vmg = snapshot.vmg;
        el.classList.remove('vmg-green', 'vmg-yellow', 'vmg-red');
        if (vmg && vmg.vmg != null) {
          el.textContent = Math.abs(vmg.vmg).toFixed(2) + ' kn';
          el.classList.add('vmg-green');
        } else {
          el.textContent = '\u2014';
        }
        continue;
      }

      if (field.key === 'dtf') {
        const val = boat.distanceToEnd;
        el.textContent = val != null ? val.toFixed(field.decimals) + ' ' + field.unit : '\u2014';
        continue;
      }

      const val = boat[field.key];
      if (val != null) {
        const num = field.decimals === 0 ? Math.round(val) : val.toFixed(field.decimals);
        el.textContent = num + (field.unit ? ' ' + field.unit : '');
      } else {
        el.textContent = '\u2014';
      }
    }
  }

  return { update };
}
