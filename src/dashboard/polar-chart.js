import { getBoatSpeed } from '../polars/speed.js';
import { bestVMG } from '../polars/best-vmg.js';

const SAIL_COLORS = {
  1: '#3a86ff', // Jib
  2: '#ff006e', // Spi
  3: '#8338ec', // Staysail
  4: '#00b4d8', // Light Jib
  5: '#f39c12', // Code 0
  6: '#e74c3c', // Heavy Genn
  7: '#2ecc71', // Light Genn
};

const SAIL_NAMES = {
  1: 'Jib',
  2: 'Spi',
  3: 'Staysail',
  4: 'Light Jib',
  5: 'Code 0',
  6: 'Heavy Genn',
  7: 'Light Genn',
};

const TWS_PRESETS = [6, 10, 16, 22, 30];
const TWA_STEP = 1; // degrees per curve sample

/**
 * Initializes the polar chart in a container element.
 * @param {string} containerId
 * @returns {{update, resize, setTws, setMode}}
 */
export function initPolarChart(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  // Build DOM structure
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;height:100%;width:100%;';

  // TWS selector bar
  const twsBar = document.createElement('div');
  twsBar.className = 'polar-tws-bar';
  wrapper.appendChild(twsBar);

  // Canvas container (flex-grow)
  const canvasWrap = document.createElement('div');
  canvasWrap.style.cssText = 'flex:1;position:relative;min-height:0;';
  wrapper.appendChild(canvasWrap);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  canvasWrap.appendChild(canvas);

  // Tooltip overlay
  const tooltip = document.createElement('div');
  tooltip.className = 'polar-tooltip';
  tooltip.style.display = 'none';
  canvasWrap.appendChild(tooltip);

  // Legend bar
  const legend = document.createElement('div');
  legend.className = 'polar-legend';
  wrapper.appendChild(legend);

  // Error/message overlay
  const overlay = document.createElement('div');
  overlay.className = 'polar-overlay';
  overlay.style.display = 'none';
  canvasWrap.appendChild(overlay);

  container.appendChild(wrapper);

  // State
  let polar = null;
  let currentTws = 10;
  let currentTwa = null;
  let currentSail = null;
  let options = [];
  let cachedCurves = null; // pre-computed speed curves
  let cachedVMG = null;
  let needleAngle = null; // animated needle angle
  let needleTarget = null;
  let animFrameId = null;

  // Build TWS buttons
  function buildTwsBar() {
    twsBar.innerHTML = '';
    for (const tws of TWS_PRESETS) {
      const btn = document.createElement('button');
      btn.className = 'polar-tws-btn' + (tws === currentTws ? ' active' : '');
      btn.textContent = tws + 'kn';
      btn.addEventListener('click', () => setTws(tws));
      twsBar.appendChild(btn);
    }
  }

  // Build legend
  function buildLegend() {
    legend.innerHTML = '';
    if (!polar) return;
    for (const sail of polar.sail) {
      const item = document.createElement('span');
      item.className = 'polar-legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'polar-legend-swatch';
      swatch.style.background = SAIL_COLORS[sail.id] || '#888';
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(SAIL_NAMES[sail.id] || `Sail ${sail.id}`));
      legend.appendChild(item);
    }
    // Envelope legend
    const envItem = document.createElement('span');
    envItem.className = 'polar-legend-item';
    const envSwatch = document.createElement('span');
    envSwatch.className = 'polar-legend-swatch';
    envSwatch.style.background = '#fff';
    envItem.appendChild(envSwatch);
    envItem.appendChild(document.createTextNode('Optimal'));
    legend.appendChild(envItem);
  }

  // Pre-compute speed curves for all sails at current TWS
  function computeCurves() {
    if (!polar) { cachedCurves = null; cachedVMG = null; return; }

    const curves = {};
    const envelope = [];

    for (let twa = 0; twa <= 180; twa += TWA_STEP) {
      let maxSpeed = 0;
      for (const sail of polar.sail) {
        const speed = getBoatSpeed(polar, currentTws, twa, sail.id, options);
        if (!curves[sail.id]) curves[sail.id] = [];
        curves[sail.id].push({ twa, speed });
        if (speed > maxSpeed) maxSpeed = speed;
      }
      envelope.push({ twa, speed: maxSpeed });
    }

    cachedCurves = { curves, envelope };

    try {
      cachedVMG = bestVMG(currentTws, polar, options);
    } catch {
      cachedVMG = null;
    }
  }

  // Get chart geometry from canvas size
  function getGeometry() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width * dpr;
    const h = rect.height * dpr;
    canvas.width = w;
    canvas.height = h;

    // Center-x at middle, center-y near top with padding
    const padding = 40 * dpr;
    const legendH = 10 * dpr;
    const cx = w / 2;
    const cy = padding;
    const radius = Math.min(w / 2 - padding, h - padding - legendH - padding) * 0.95;

    return { dpr, w, h, cx, cy, radius };
  }

  // Find max speed across all curves for ring scaling
  function getMaxSpeed() {
    if (!cachedCurves) return 10;
    let max = 0;
    for (const pts of Object.values(cachedCurves.curves)) {
      for (const p of pts) if (p.speed > max) max = p.speed;
    }
    return Math.max(max, 2);
  }

  // Convert TWA + speed to canvas x,y
  function polarToXY(geo, twa, speed, maxSpeed) {
    const r = (speed / maxSpeed) * geo.radius;
    const angle = (twa * Math.PI) / 180; // 0=up, 180=down
    const x = geo.cx + r * Math.sin(angle);
    const y = geo.cy + r * Math.cos(angle);
    return { x, y };
  }

  // Draw the full chart
  function draw() {
    const ctx = canvas.getContext('2d');
    const geo = getGeometry();
    const { dpr, w, h, cx, cy, radius } = geo;

    ctx.clearRect(0, 0, w, h);

    if (!polar || !cachedCurves) {
      showOverlay(polar ? 'Computing...' : 'No polar data available');
      return;
    }
    hideOverlay();

    const maxSpeed = getMaxSpeed();
    const ringStep = maxSpeed > 12 ? 4 : 2;
    const ringCount = Math.ceil(maxSpeed / ringStep);
    const adjustedMax = ringCount * ringStep;

    // Helper with adjusted max
    function toXY(twa, speed) {
      return polarToXY(geo, twa, speed, adjustedMax);
    }

    // --- Background grid ---
    ctx.strokeStyle = '#1a1a3a';
    ctx.lineWidth = 1 * dpr;

    // Concentric speed rings
    for (let i = 1; i <= ringCount; i++) {
      const ringSpeed = i * ringStep;
      const r = (ringSpeed / adjustedMax) * radius;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI);
      ctx.stroke();

      // Ring label
      ctx.fillStyle = '#555';
      ctx.font = `${10 * dpr}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(ringSpeed + 'kn', cx + 3 * dpr, cy + r - 2 * dpr);
    }

    // Radial TWA lines every 15 degrees
    ctx.strokeStyle = '#1a1a3a';
    for (let twa = 0; twa <= 180; twa += 15) {
      const end = toXY(twa, adjustedMax);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      // TWA label at edge
      if (twa % 30 === 0) {
        const labelPos = toXY(twa, adjustedMax * 1.06);
        ctx.fillStyle = '#666';
        ctx.font = `${10 * dpr}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(twa + '\u00B0', labelPos.x, labelPos.y);
      }
    }

    // --- Foiling zone ---
    if (options.includes('foil') && polar.foil) {
      const foil = polar.foil;
      ctx.fillStyle = 'rgba(46, 204, 113, 0.06)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      // Arc from twaMin to twaMax
      for (let a = foil.twaMin; a <= foil.twaMax; a += 1) {
        const pt = toXY(a, adjustedMax);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fill();

      // Foil zone border lines
      ctx.strokeStyle = 'rgba(46, 204, 113, 0.2)';
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      const fStart = toXY(foil.twaMin, adjustedMax);
      const fEnd = toXY(foil.twaMax, adjustedMax);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(fStart.x, fStart.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(fEnd.x, fEnd.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- Speed curves per sail ---
    for (const sail of polar.sail) {
      const pts = cachedCurves.curves[sail.id];
      if (!pts || pts.length === 0) continue;

      ctx.strokeStyle = SAIL_COLORS[sail.id] || '#888';
      ctx.lineWidth = 1.5 * dpr;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      let started = false;
      for (const p of pts) {
        if (p.speed <= 0) continue;
        const { x, y } = toXY(p.twa, p.speed);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // --- Optimal envelope ---
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 * dpr;
    ctx.beginPath();
    let envStarted = false;
    for (const p of cachedCurves.envelope) {
      if (p.speed <= 0) continue;
      const { x, y } = toXY(p.twa, p.speed);
      if (!envStarted) { ctx.moveTo(x, y); envStarted = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // --- BestVMG markers ---
    if (cachedVMG) {
      drawVMGMarker(ctx, geo, adjustedMax, cachedVMG.twaUp, cachedVMG.vmgUp, cachedVMG.sailUp, 'UP', toXY);
      drawVMGMarker(ctx, geo, adjustedMax, cachedVMG.twaDown, cachedVMG.vmgDown, cachedVMG.sailDown, 'DN', toXY);
    }

    // --- Current angle needle ---
    if (needleAngle != null && currentSail != null) {
      const sailColor = SAIL_COLORS[currentSail] || '#fff';
      const speed = getBoatSpeed(polar, currentTws, Math.abs(needleAngle), currentSail, options);
      const pt = toXY(Math.abs(needleAngle), speed);

      // Needle line
      ctx.strokeStyle = sailColor;
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([6 * dpr, 3 * dpr]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dot at speed
      ctx.fillStyle = sailColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5 * dpr, 0, Math.PI * 2);
      ctx.fill();

      // Speed label near dot
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${11 * dpr}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(speed.toFixed(1) + 'kn', pt.x + 8 * dpr, pt.y - 4 * dpr);
    }
  }

  function drawVMGMarker(ctx, geo, maxSpeed, twa, vmg, sailId, label, toXY) {
    if (!twa || twa <= 0) return;
    const dpr = geo.dpr;

    // Dashed line from center to envelope edge
    const envSpeed = getEnvelopeSpeedAtTwa(twa);
    const pt = toXY(twa, envSpeed);

    ctx.strokeStyle = '#ffdd57';
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath();
    ctx.moveTo(geo.cx, geo.cy);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Small triangle marker
    ctx.fillStyle = '#ffdd57';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();

    // Label
    const sailName = SAIL_NAMES[sailId] || `S${sailId}`;
    const vmgAbs = Math.abs(vmg).toFixed(1);
    ctx.fillStyle = '#ffdd57';
    ctx.font = `${9 * dpr}px monospace`;
    ctx.textAlign = twa < 90 ? 'left' : 'right';
    const offset = twa < 90 ? 8 * dpr : -8 * dpr;
    ctx.fillText(`${label} ${twa.toFixed(0)}\u00B0`, pt.x + offset, pt.y - 6 * dpr);
    ctx.fillText(`VMG ${vmgAbs}kn ${sailName}`, pt.x + offset, pt.y + 8 * dpr);
  }

  function getEnvelopeSpeedAtTwa(twa) {
    if (!cachedCurves) return 0;
    // Find closest TWA in envelope
    let closest = cachedCurves.envelope[0];
    let minDiff = Infinity;
    for (const p of cachedCurves.envelope) {
      const diff = Math.abs(p.twa - twa);
      if (diff < minDiff) { minDiff = diff; closest = p; }
    }
    return closest.speed;
  }

  function showOverlay(msg) {
    overlay.textContent = msg;
    overlay.style.display = 'flex';
  }

  function hideOverlay() {
    overlay.style.display = 'none';
  }

  // Tooltip on mousemove
  canvas.addEventListener('mousemove', (e) => {
    if (!polar || !cachedCurves) { tooltip.style.display = 'none'; return; }

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const geo = getGeometry();
    const dpr = geo.dpr;
    const dx = (mx * dpr) - geo.cx;
    const dy = (my * dpr) - geo.cy;

    // Convert mouse to TWA + distance
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5 * dpr || dist > geo.radius * 1.1) {
      tooltip.style.display = 'none';
      return;
    }

    let twa = Math.atan2(dx, dy) * 180 / Math.PI;
    if (twa < 0) { tooltip.style.display = 'none'; return; } // left side
    twa = Math.max(0, Math.min(180, twa));

    // Find best sail at this TWA
    let bestSpeed = 0;
    let bestSailId = 0;
    for (const sail of polar.sail) {
      const speed = getBoatSpeed(polar, currentTws, twa, sail.id, options);
      if (speed > bestSpeed) { bestSpeed = speed; bestSailId = sail.id; }
    }

    tooltip.innerHTML = `<b>TWA:</b> ${twa.toFixed(0)}\u00B0<br><b>Speed:</b> ${bestSpeed.toFixed(1)}kn<br><b>Best:</b> ${SAIL_NAMES[bestSailId] || 'N/A'}`;
    tooltip.style.display = 'block';
    tooltip.style.left = (mx + 12) + 'px';
    tooltip.style.top = (my - 10) + 'px';
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });

  // Needle animation loop
  function animateNeedle() {
    if (needleTarget == null) {
      animFrameId = null;
      return;
    }

    if (needleAngle == null) {
      needleAngle = needleTarget;
    } else {
      const diff = needleTarget - needleAngle;
      if (Math.abs(diff) < 0.5) {
        needleAngle = needleTarget;
      } else {
        needleAngle += diff * 0.15;
      }
    }

    draw();

    if (Math.abs(needleAngle - needleTarget) > 0.3) {
      animFrameId = requestAnimationFrame(animateNeedle);
    } else {
      needleAngle = needleTarget;
      draw();
      animFrameId = null;
    }
  }

  function startNeedleAnimation() {
    if (animFrameId == null) {
      animFrameId = requestAnimationFrame(animateNeedle);
    }
  }

  // Public API
  function update(newPolar, tws, twa, sail, opts) {
    const polarChanged = newPolar !== polar;
    const twsChanged = tws != null && tws !== currentTws;

    if (newPolar) polar = newPolar;
    if (tws != null) currentTws = tws;
    if (twa != null) currentTwa = twa;
    if (sail != null) currentSail = sail;
    if (opts) options = opts;

    if (polarChanged || twsChanged) {
      computeCurves();
      buildLegend();
      buildTwsBar();
    }

    // Update needle target
    if (currentTwa != null) {
      needleTarget = Math.abs(currentTwa);
      startNeedleAnimation();
    } else {
      needleTarget = null;
      needleAngle = null;
      draw();
    }

    if (!animFrameId) draw();
  }

  function resize() {
    draw();
  }

  function setTws(tws) {
    currentTws = tws;
    computeCurves();
    buildTwsBar();
    draw();
  }

  function setMode() {
    // reserved for future modes (e.g., VMG overlay, sail-only view)
  }

  // Initial setup
  buildTwsBar();
  showOverlay('No polar data available');

  return { update, resize, setTws, setMode };
}
