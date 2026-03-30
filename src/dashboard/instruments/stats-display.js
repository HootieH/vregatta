export function init(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  container.innerHTML = `
    <div class="mfd-cell-inner mfd-stats">
      <div class="mfd-stat-row"><span class="mfd-stat-label">Dist</span><span class="mfd-stat-val" data-stat="dist">---</span></div>
      <div class="mfd-stat-row"><span class="mfd-stat-label">Avg Spd</span><span class="mfd-stat-val" data-stat="avgspd">---</span></div>
      <div class="mfd-stat-row"><span class="mfd-stat-label">VMG Eff</span><span class="mfd-stat-val" data-stat="vmgeff">---</span></div>
      <div class="mfd-stat-row"><span class="mfd-stat-label">Tacks</span><span class="mfd-stat-val" data-stat="tacks">0</span></div>
      <div class="mfd-stat-row"><span class="mfd-stat-label">Gybes</span><span class="mfd-stat-val" data-stat="gybes">0</span></div>
      <div class="mfd-stat-row"><span class="mfd-stat-label">Max Spd</span><span class="mfd-stat-val" data-stat="max">---</span></div>
    </div>
  `;

  const els = {};
  container.querySelectorAll('[data-stat]').forEach((el) => {
    els[el.dataset.stat] = el;
  });

  let maxSpeed = 0;
  let speedSum = 0;
  let speedCount = 0;
  let effSum = 0;
  let effCount = 0;
  let tacks = 0;
  let gybes = 0;
  let totalDist = 0;
  let lastLat = null;
  let lastLon = null;
  let lastEventCount = 0;

  function haversineNm(lat1, lon1, lat2, lon2) {
    const R = 3440.065;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function update(snapshot) {
    const boat = snapshot?.boat;
    if (!boat) return;

    // Distance
    if (boat.lat != null && boat.lon != null && lastLat != null) {
      const d = haversineNm(lastLat, lastLon, boat.lat, boat.lon);
      if (d < 10) totalDist += d;
    }
    if (boat.lat != null && boat.lon != null) {
      lastLat = boat.lat;
      lastLon = boat.lon;
    }
    els.dist.textContent = totalDist.toFixed(1) + ' nm';

    // Speed
    if (boat.speed != null) {
      if (boat.speed > maxSpeed) maxSpeed = boat.speed;
      speedSum += boat.speed;
      speedCount++;
      els.max.textContent = maxSpeed.toFixed(1) + ' kn';
      els.avgspd.textContent = (speedSum / speedCount).toFixed(1) + ' kn';
    }

    // VMG efficiency
    const eff = snapshot?._polarEff;
    if (eff != null) {
      effSum += eff;
      effCount++;
      els.vmgeff.textContent = (effSum / effCount).toFixed(0) + '%';
    }

    // Events — only count new ones
    const events = snapshot?.events;
    if (events && events.length > lastEventCount) {
      for (let i = lastEventCount; i < events.length; i++) {
        if (events[i].type === 'tack') tacks++;
        if (events[i].type === 'gybe') gybes++;
      }
      lastEventCount = events.length;
    }
    els.tacks.textContent = String(tacks);
    els.gybes.textContent = String(gybes);
  }

  function resize() {}

  return { update, resize };
}
