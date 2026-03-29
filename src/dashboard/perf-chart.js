import { computeVMGEfficiency, computeSailScore } from '../analytics/performance.js';
import { getBoatSpeed } from '../polars/speed.js';

const TRACE_MAX_POINTS = 720; // 1 hour at 5s intervals
const GAUGE_RADIUS_RATIO = 0.38;

/**
 * Initializes the performance chart in a container element.
 * @param {string} containerId
 * @returns {{update(boatState, polar, options), updateHistory(stats), resize()}}
 */
export function initPerfChart(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  // Build DOM structure
  container.innerHTML = `
    <div class="perf-top-row">
      <canvas class="perf-gauge-canvas"></canvas>
      <div class="perf-sail-indicator">
        <div class="perf-sail-name">--</div>
        <div class="perf-sail-warning" style="display:none">WRONG SAIL</div>
        <div class="perf-sail-suggest"></div>
      </div>
    </div>
    <div class="perf-trace-wrap">
      <canvas class="perf-trace-canvas"></canvas>
    </div>
    <div class="perf-stats-bar">
      <div class="perf-stat"><span class="perf-stat-val" data-stat="eff">--</span><span class="perf-stat-lbl">AVG EFF</span></div>
      <div class="perf-stat"><span class="perf-stat-val" data-stat="tack">--</span><span class="perf-stat-lbl">TACK</span></div>
      <div class="perf-stat"><span class="perf-stat-val" data-stat="gybe">--</span><span class="perf-stat-lbl">GYBE</span></div>
      <div class="perf-stat"><span class="perf-stat-val" data-stat="dist">--</span><span class="perf-stat-lbl">DIST NM</span></div>
      <div class="perf-stat"><span class="perf-stat-val" data-stat="wrong">--</span><span class="perf-stat-lbl">WRONG SAIL</span></div>
    </div>
    <div class="perf-no-polar" style="display:none">Need polar data for performance analysis</div>
  `;

  const gaugeCanvas = container.querySelector('.perf-gauge-canvas');
  const traceCanvas = container.querySelector('.perf-trace-canvas');
  const sailName = container.querySelector('.perf-sail-name');
  const sailWarning = container.querySelector('.perf-sail-warning');
  const sailSuggest = container.querySelector('.perf-sail-suggest');
  const noPolarMsg = container.querySelector('.perf-no-polar');
  const statEls = {};
  container.querySelectorAll('[data-stat]').forEach((el) => {
    statEls[el.dataset.stat] = el;
  });

  const gaugeCtx = gaugeCanvas.getContext('2d');
  const traceCtx = traceCanvas.getContext('2d');

  // Speed trace data
  const traceActual = [];
  const traceOptimal = [];

  let currentEfficiency = null;
  let animatedNeedle = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;

    // Gauge canvas
    const gw = gaugeCanvas.clientWidth || 200;
    const gh = gaugeCanvas.clientHeight || 200;
    gaugeCanvas.width = gw * dpr;
    gaugeCanvas.height = gh * dpr;

    // Trace canvas
    const tw = traceCanvas.clientWidth || 400;
    const th = traceCanvas.clientHeight || 120;
    traceCanvas.width = tw * dpr;
    traceCanvas.height = th * dpr;
  }

  function drawGauge(efficiency) {
    const dpr = window.devicePixelRatio || 1;
    const w = gaugeCanvas.width;
    const h = gaugeCanvas.height;
    const cx = w / 2;
    const cy = h * 0.55;
    const r = Math.min(w, h) * GAUGE_RADIUS_RATIO;

    gaugeCtx.clearRect(0, 0, w, h);

    // Arc range: 220 degrees (from 160 to 380 degrees)
    const startAngle = (160 * Math.PI) / 180;
    const endAngle = (380 * Math.PI) / 180;
    const totalArc = endAngle - startAngle;

    // Background arc
    gaugeCtx.beginPath();
    gaugeCtx.arc(cx, cy, r, startAngle, endAngle);
    gaugeCtx.lineWidth = 12 * dpr;
    gaugeCtx.strokeStyle = '#1a1a3a';
    gaugeCtx.lineCap = 'round';
    gaugeCtx.stroke();

    if (efficiency == null) {
      // No data — draw empty gauge
      drawGaugeText(cx, cy, r, dpr, '--', '#666');
      return;
    }

    // Animated needle approach
    animatedNeedle += (efficiency - animatedNeedle) * 0.15;
    const eff = Math.max(0, Math.min(100, animatedNeedle));

    // Color based on efficiency
    const color = eff >= 90 ? '#00e676' : eff >= 70 ? '#ffd600' : '#ff5252';

    // Value arc
    const valueAngle = startAngle + (eff / 100) * totalArc;
    gaugeCtx.beginPath();
    gaugeCtx.arc(cx, cy, r, startAngle, valueAngle);
    gaugeCtx.lineWidth = 12 * dpr;
    gaugeCtx.strokeStyle = color;
    gaugeCtx.lineCap = 'round';
    gaugeCtx.stroke();

    // Needle line
    const needleAngle = valueAngle;
    const nx = cx + (r - 20 * dpr) * Math.cos(needleAngle);
    const ny = cy + (r - 20 * dpr) * Math.sin(needleAngle);
    gaugeCtx.beginPath();
    gaugeCtx.moveTo(cx, cy);
    gaugeCtx.lineTo(nx, ny);
    gaugeCtx.lineWidth = 2 * dpr;
    gaugeCtx.strokeStyle = color;
    gaugeCtx.stroke();

    // Center dot
    gaugeCtx.beginPath();
    gaugeCtx.arc(cx, cy, 4 * dpr, 0, Math.PI * 2);
    gaugeCtx.fillStyle = color;
    gaugeCtx.fill();

    drawGaugeText(cx, cy, r, dpr, `${Math.round(eff)}%`, color);
  }

  function drawGaugeText(cx, cy, r, dpr, text, color) {
    gaugeCtx.font = `bold ${24 * dpr}px monospace`;
    gaugeCtx.fillStyle = color;
    gaugeCtx.textAlign = 'center';
    gaugeCtx.textBaseline = 'middle';
    gaugeCtx.fillText(text, cx, cy + r * 0.45);

    gaugeCtx.font = `${10 * dpr}px monospace`;
    gaugeCtx.fillStyle = '#8888aa';
    gaugeCtx.fillText('VMG EFFICIENCY', cx, cy + r * 0.7);
  }

  function drawTrace() {
    const dpr = window.devicePixelRatio || 1;
    const w = traceCanvas.width;
    const h = traceCanvas.height;
    const pad = 30 * dpr;

    traceCtx.clearRect(0, 0, w, h);

    if (traceActual.length < 2) {
      traceCtx.font = `${11 * dpr}px monospace`;
      traceCtx.fillStyle = '#666';
      traceCtx.textAlign = 'center';
      traceCtx.fillText('Collecting speed data...', w / 2, h / 2);
      return;
    }

    // Find max speed for scale
    let maxSpeed = 0;
    for (const v of traceActual) if (v > maxSpeed) maxSpeed = v;
    for (const v of traceOptimal) if (v > maxSpeed) maxSpeed = v;
    maxSpeed = Math.max(maxSpeed, 1) * 1.1;

    const plotW = w - pad * 2;
    const plotH = h - pad * 2;

    // Grid lines
    traceCtx.strokeStyle = '#1a1a3a';
    traceCtx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (plotH * i) / 4;
      traceCtx.beginPath();
      traceCtx.moveTo(pad, y);
      traceCtx.lineTo(pad + plotW, y);
      traceCtx.stroke();

      // Label
      const val = (maxSpeed * (4 - i)) / 4;
      traceCtx.font = `${9 * dpr}px monospace`;
      traceCtx.fillStyle = '#555';
      traceCtx.textAlign = 'right';
      traceCtx.fillText(`${val.toFixed(1)}`, pad - 4 * dpr, y + 3 * dpr);
    }

    const n = traceActual.length;
    const dx = plotW / (n - 1);

    function toY(v) {
      return pad + plotH * (1 - v / maxSpeed);
    }

    // Fill gap between optimal and actual (red loss area)
    traceCtx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = pad + i * dx;
      traceCtx.lineTo(x, toY(traceOptimal[i] ?? 0));
    }
    for (let i = n - 1; i >= 0; i--) {
      const x = pad + i * dx;
      const actual = Math.min(traceActual[i] ?? 0, traceOptimal[i] ?? 0);
      traceCtx.lineTo(x, toY(actual));
    }
    traceCtx.closePath();
    traceCtx.fillStyle = 'rgba(255, 82, 82, 0.15)';
    traceCtx.fill();

    // Optimal speed line (green dashed)
    traceCtx.beginPath();
    traceCtx.setLineDash([6 * dpr, 4 * dpr]);
    for (let i = 0; i < n; i++) {
      const x = pad + i * dx;
      if (i === 0) traceCtx.moveTo(x, toY(traceOptimal[i] ?? 0));
      else traceCtx.lineTo(x, toY(traceOptimal[i] ?? 0));
    }
    traceCtx.strokeStyle = '#00e676';
    traceCtx.lineWidth = 1.5 * dpr;
    traceCtx.stroke();
    traceCtx.setLineDash([]);

    // Actual speed line (white)
    traceCtx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = pad + i * dx;
      if (i === 0) traceCtx.moveTo(x, toY(traceActual[i] ?? 0));
      else traceCtx.lineTo(x, toY(traceActual[i] ?? 0));
    }
    traceCtx.strokeStyle = '#e0e0e0';
    traceCtx.lineWidth = 1.5 * dpr;
    traceCtx.stroke();

    // Legend
    const lx = pad + 8 * dpr;
    const ly = pad + 12 * dpr;
    traceCtx.font = `${9 * dpr}px monospace`;
    traceCtx.fillStyle = '#e0e0e0';
    traceCtx.textAlign = 'left';
    traceCtx.fillText('Actual', lx + 14 * dpr, ly);
    traceCtx.fillStyle = '#00e676';
    traceCtx.fillText('Optimal', lx + 14 * dpr, ly + 14 * dpr);

    // Legend color squares
    traceCtx.fillStyle = '#e0e0e0';
    traceCtx.fillRect(lx, ly - 6 * dpr, 10 * dpr, 3 * dpr);
    traceCtx.fillStyle = '#00e676';
    traceCtx.fillRect(lx, ly + 14 * dpr - 6 * dpr, 10 * dpr, 3 * dpr);
  }

  function update(boatState, polar, options) {
    if (!polar) {
      noPolarMsg.style.display = 'flex';
      return;
    }
    noPolarMsg.style.display = 'none';

    const opts = options || [];

    // Compute efficiency
    const vmgEff = computeVMGEfficiency(boatState, polar, opts);
    currentEfficiency = vmgEff;

    // Sail indicator
    const sailScore = computeSailScore(boatState, polar, opts);
    if (sailScore) {
      sailName.textContent = sailScore.currentSail;
      if (!sailScore.correct) {
        sailWarning.style.display = '';
        sailSuggest.textContent = `Use ${sailScore.optimalSail} (+${sailScore.speedLoss.toFixed(1)}kn)`;
      } else {
        sailWarning.style.display = 'none';
        sailSuggest.textContent = '';
      }
    } else {
      sailName.textContent = '--';
      sailWarning.style.display = 'none';
      sailSuggest.textContent = '';
    }

    // Add to speed trace
    if (boatState && boatState.speed != null && boatState.twa != null && boatState.tws != null) {
      traceActual.push(boatState.speed);

      // Compute optimal speed at this TWA for all available sails
      const absTwa = Math.abs(boatState.twa);
      const availableSails = getAvailableSails(opts);
      let optSpeed = 0;
      for (const sid of availableSails) {
        const s = getBoatSpeed(polar, boatState.tws, absTwa, sid, opts);
        if (s > optSpeed) optSpeed = s;
      }
      traceOptimal.push(optSpeed);

      if (traceActual.length > TRACE_MAX_POINTS) {
        traceActual.shift();
        traceOptimal.shift();
      }
    }

    drawGauge(currentEfficiency);
    drawTrace();
  }

  function updateHistory(stats) {
    if (!stats) return;
    if (statEls.eff) statEls.eff.textContent = stats.avgSpeedEfficiency != null ? `${stats.avgSpeedEfficiency}%` : '--';
    if (statEls.tack) statEls.tack.textContent = stats.avgTackScore != null ? stats.avgTackScore : '--';
    if (statEls.gybe) statEls.gybe.textContent = stats.avgGybeScore != null ? stats.avgGybeScore : '--';
    if (statEls.dist) statEls.dist.textContent = stats.distanceSailed > 0 ? stats.distanceSailed.toFixed(1) : '--';
    if (statEls.wrong) {
      const mins = stats.timeOnWrongSail > 0 ? `${Math.round(stats.timeOnWrongSail / 60)}m` : '0';
      statEls.wrong.textContent = mins;
    }
  }

  function resizeHandler() {
    resize();
    drawGauge(currentEfficiency);
    drawTrace();
  }

  resize();

  return { update, updateHistory, resize: resizeHandler };
}

// Duplicated helper to avoid circular imports
const ALWAYS_AVAILABLE = [1, 2];
const LIGHT_SAILS = [4, 7];
const HEAVY_SAILS = [3, 6];
const REACH_SAILS = [5];

function getAvailableSails(options) {
  const sails = [...ALWAYS_AVAILABLE];
  if (options && options.includes('light')) sails.push(...LIGHT_SAILS);
  if (options && options.includes('heavy')) sails.push(...HEAVY_SAILS);
  if (options && options.includes('reach')) sails.push(...REACH_SAILS);
  return sails;
}
