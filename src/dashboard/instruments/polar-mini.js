import { getBoatSpeed } from '../../polars/speed.js';
import { bestVMG } from '../../polars/best-vmg.js';

const SAIL_NAMES = {
  1: 'Jib', 2: 'Spi', 3: 'Stay', 4: 'LJib',
  5: 'C0', 6: 'HGn', 7: 'LGn',
};

export function init(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  container.innerHTML = '<div class="mfd-cell-inner mfd-polar-mini"><canvas></canvas></div>';

  const canvas = container.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let lastSnapshot = null;

  function draw(snapshot) {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width * dpr;
    const h = rect.height * dpr;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    const polar = snapshot?._polar;
    const boat = snapshot?.boat;
    const opts = snapshot?._options || [];

    if (!polar || !boat || boat.tws == null) {
      ctx.fillStyle = '#555';
      ctx.font = `${12 * dpr}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No polar', w / 2, h / 2);
      return;
    }

    const tws = boat.tws;
    const cx = w / 2;
    const cy = 12 * dpr;
    const radius = Math.min(w / 2 - 10 * dpr, h - 24 * dpr) * 0.9;

    // Compute envelope
    let maxSpd = 0;
    const envelope = [];
    for (let twa = 0; twa <= 180; twa += 2) {
      let best = 0;
      for (const sail of polar.sail) {
        const s = getBoatSpeed(polar, tws, twa, sail.id, opts);
        if (s > best) best = s;
      }
      envelope.push({ twa, speed: best });
      if (best > maxSpd) maxSpd = best;
    }

    if (maxSpd === 0) maxSpd = 1;

    function toXY(twa, speed) {
      const r = (speed / maxSpd) * radius;
      const angle = (twa * Math.PI) / 180;
      return { x: cx + r * Math.sin(angle), y: cy + r * Math.cos(angle) };
    }

    // Grid rings
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1 * dpr;
    for (let i = 1; i <= 3; i++) {
      const r = (i / 3) * radius;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI);
      ctx.stroke();
    }

    // Envelope curve
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    let started = false;
    for (const p of envelope) {
      const { x, y } = toXY(p.twa, p.speed);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Best VMG marks
    try {
      const vmgData = bestVMG(tws, polar, opts);
      if (vmgData.twaUp > 0) {
        const pt = toXY(vmgData.twaUp, getEnvSpeed(envelope, vmgData.twaUp));
        ctx.fillStyle = '#ffbf00';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      if (vmgData.twaDown > 0) {
        const pt = toXY(vmgData.twaDown, getEnvSpeed(envelope, vmgData.twaDown));
        ctx.fillStyle = '#ffbf00';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    } catch {
      // no vmg data
    }

    // Current needle
    if (boat.twa != null && boat.speed != null) {
      const absTwa = Math.abs(boat.twa);
      const pt = toXY(absTwa, boat.speed);

      ctx.strokeStyle = '#00ff41';
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([4 * dpr, 2 * dpr]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#00ff41';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sail label
    if (boat.sail != null) {
      ctx.fillStyle = '#555';
      ctx.font = `${9 * dpr}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(SAIL_NAMES[boat.sail] || '?', cx, h - 4 * dpr);
    }
  }

  function getEnvSpeed(envelope, twa) {
    let closest = envelope[0];
    let minDiff = Infinity;
    for (const p of envelope) {
      const d = Math.abs(p.twa - twa);
      if (d < minDiff) { minDiff = d; closest = p; }
    }
    return closest.speed;
  }

  function update(snapshot) {
    lastSnapshot = snapshot;
    draw(snapshot);
  }

  function resize() {
    draw(lastSnapshot);
  }

  return { update, resize };
}
