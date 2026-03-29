const STRIP_HEIGHT = 200;
const PADDING = { top: 20, right: 12, bottom: 40, left: 40 };
const GRID_COLOR = '#1a1a3a';
const TWS_COLOR = '#00b4d8';
const TWD_TICK_COLOR = '#8888aa';
const SHIFT_COLOR_VEER = '#f39c12';
const SHIFT_COLOR_BACK = '#e74c3c';
const TEXT_COLOR = '#8888aa';
const LABEL_COLOR = '#666';
const FLASH_DURATION = 3000;

export function initWindStrip(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = STRIP_HEIGHT + 'px';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  function resize() {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = STRIP_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function update(windHistory) {
    resize();

    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = STRIP_HEIGHT;
    const plotW = w - PADDING.left - PADDING.right;
    const plotH = h - PADDING.top - PADDING.bottom;

    ctx.clearRect(0, 0, w, h);

    const data = windHistory.getData();
    const { shifts } = windHistory.getShifts();

    if (data.length === 0) {
      ctx.font = '12px monospace';
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No wind history', w / 2, h / 2);
      return;
    }

    // Time range: last 2 hours or data range
    const now = Date.now();
    const tMin = Math.min(data[0].timestamp, now - 2 * 60 * 60 * 1000);
    const tMax = now;
    const tRange = tMax - tMin || 1;

    // TWS range
    let twsMin = Infinity;
    let twsMax = -Infinity;
    for (const p of data) {
      if (p.tws < twsMin) twsMin = p.tws;
      if (p.tws > twsMax) twsMax = p.tws;
    }
    twsMin = Math.max(0, twsMin - 2);
    twsMax = twsMax + 2;
    const twsRange = twsMax - twsMin || 1;

    function xOf(ts) {
      return PADDING.left + ((ts - tMin) / tRange) * plotW;
    }
    function yOf(tws) {
      return PADDING.top + plotH - ((tws - twsMin) / twsRange) * plotH;
    }

    // Grid lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    const twsStep = twsRange > 20 ? 10 : 5;
    for (let v = Math.ceil(twsMin / twsStep) * twsStep; v <= twsMax; v += twsStep) {
      const y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + plotW, y);
      ctx.stroke();

      ctx.font = '9px monospace';
      ctx.fillStyle = TEXT_COLOR;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(v + 'kn', PADDING.left - 4, y);
    }

    // Time labels
    const timeStep = tRange > 3600000 ? 1800000 : 600000; // 30min or 10min
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = Math.ceil(tMin / timeStep) * timeStep; t <= tMax; t += timeStep) {
      const x = xOf(t);
      const d = new Date(t);
      const label = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '9px monospace';
      ctx.fillText(label, x, PADDING.top + plotH + 4);

      ctx.beginPath();
      ctx.moveTo(x, PADDING.top);
      ctx.lineTo(x, PADDING.top + plotH);
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Shift event markers
    for (const s of shifts) {
      const x = xOf(s.timestamp);
      const isRecent = now - s.timestamp < FLASH_DURATION;
      const color = s.direction === 'veering' ? SHIFT_COLOR_VEER : SHIFT_COLOR_BACK;

      ctx.beginPath();
      ctx.moveTo(x, PADDING.top);
      ctx.lineTo(x, PADDING.top + plotH);
      ctx.strokeStyle = color;
      ctx.lineWidth = isRecent ? 2.5 : 1.5;
      ctx.setLineDash(isRecent ? [] : [4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Shift label
      const arrow = s.direction === 'veering' ? '\u21BB' : '\u21BA'; // clockwise / counter-clockwise
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${arrow} ${Math.round(s.magnitude)}\u00B0`, x, PADDING.top - 2);

      // Flash effect for recent shifts
      if (isRecent) {
        const alpha = 0.15 * (1 - (now - s.timestamp) / FLASH_DURATION);
        ctx.fillStyle = color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
        // Simple highlight band
        ctx.globalAlpha = alpha * 3;
        ctx.fillRect(x - 10, PADDING.top, 20, plotH);
        ctx.globalAlpha = 1;
      }
    }

    // TWS line
    ctx.beginPath();
    ctx.strokeStyle = TWS_COLOR;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < data.length; i++) {
      const x = xOf(data[i].timestamp);
      const y = yOf(data[i].tws);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // TWS dots at data points
    for (const p of data) {
      const x = xOf(p.timestamp);
      const y = yOf(p.tws);
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = TWS_COLOR;
      ctx.fill();
    }

    // TWD direction ticks below the plot
    const tickY = PADDING.top + plotH + 18;
    for (const p of data) {
      const x = xOf(p.timestamp);
      const angle = ((p.twd - 90) * Math.PI) / 180;
      const tickLen = 6;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(angle) * tickLen, tickY - Math.sin(angle) * tickLen);
      ctx.lineTo(x + Math.cos(angle) * tickLen, tickY + Math.sin(angle) * tickLen);
      ctx.strokeStyle = TWD_TICK_COLOR;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Axis labels
    ctx.font = '9px monospace';
    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('TWS', PADDING.left, 4);
    ctx.fillText('TWD', PADDING.left, PADDING.top + plotH + 26);
  }

  resize();
  return { update };
}
