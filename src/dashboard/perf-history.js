const SAIL_NAMES = {
  1: 'Jib', 2: 'Spi', 3: 'Staysail', 4: 'Light Jib',
  5: 'Code 0', 6: 'Heavy Genn', 7: 'Light Genn',
};

const SAIL_COLORS = {
  1: '#3a86ff', 2: '#ff006e', 3: '#8338ec', 4: '#00b4d8',
  5: '#f39c12', 6: '#e74c3c', 7: '#2ecc71',
};

/**
 * Initializes the performance history panel.
 * @param {string} containerId
 * @returns {{update(sessionStats)}}
 */
export function initPerfHistory(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  container.innerHTML = `
    <div class="perf-history-inner">
      <div class="perf-hist-section">
        <div class="perf-hist-title">Sail Distribution</div>
        <canvas class="perf-sail-bar-canvas"></canvas>
      </div>
      <div class="perf-hist-section">
        <div class="perf-hist-title">Maneuvers</div>
        <div class="perf-maneuver-summary"></div>
      </div>
      <div class="perf-hist-section">
        <div class="perf-hist-title">Efficiency Timeline</div>
        <canvas class="perf-heatmap-canvas"></canvas>
      </div>
      <div class="perf-hist-section">
        <div class="perf-hist-title">Biggest Mistakes</div>
        <div class="perf-mistakes-list"></div>
      </div>
    </div>
  `;

  const sailBarCanvas = container.querySelector('.perf-sail-bar-canvas');
  const maneuverSummary = container.querySelector('.perf-maneuver-summary');
  const heatmapCanvas = container.querySelector('.perf-heatmap-canvas');
  const mistakesList = container.querySelector('.perf-mistakes-list');

  const sailBarCtx = sailBarCanvas.getContext('2d');
  const heatmapCtx = heatmapCanvas.getContext('2d');

  // Store efficiency history for heatmap
  let efficiencyTimeline = [];

  function resize() {
    const dpr = window.devicePixelRatio || 1;

    const sw = sailBarCanvas.clientWidth || 300;
    sailBarCanvas.width = sw * dpr;
    sailBarCanvas.height = 40 * dpr;

    const hw = heatmapCanvas.clientWidth || 300;
    heatmapCanvas.width = hw * dpr;
    heatmapCanvas.height = 30 * dpr;
  }

  function drawSailDistribution(sailDist) {
    const dpr = window.devicePixelRatio || 1;
    const w = sailBarCanvas.width;
    const h = sailBarCanvas.height;
    sailBarCtx.clearRect(0, 0, w, h);

    if (!sailDist || Object.keys(sailDist).length === 0) {
      sailBarCtx.font = `${10 * dpr}px monospace`;
      sailBarCtx.fillStyle = '#666';
      sailBarCtx.textAlign = 'center';
      sailBarCtx.fillText('No sail data', w / 2, h / 2);
      return;
    }

    const barH = 20 * dpr;
    const barY = 2 * dpr;
    let x = 0;

    // Sort by percentage descending
    const sorted = Object.entries(sailDist).sort((a, b) => b[1] - a[1]);

    for (const [sailId, pct] of sorted) {
      if (pct <= 0) continue;
      const segW = (pct / 100) * w;
      sailBarCtx.fillStyle = SAIL_COLORS[sailId] || '#555';
      sailBarCtx.fillRect(x, barY, segW, barH);
      x += segW;
    }

    // Labels below bar
    x = 0;
    sailBarCtx.font = `${9 * dpr}px monospace`;
    sailBarCtx.textAlign = 'left';
    const labelY = barY + barH + 12 * dpr;
    for (const [sailId, pct] of sorted) {
      if (pct < 5) continue; // skip tiny segments in labels
      const name = SAIL_NAMES[sailId] || `S${sailId}`;
      sailBarCtx.fillStyle = SAIL_COLORS[sailId] || '#888';
      sailBarCtx.fillText(`${name} ${Math.round(pct)}%`, x + 4 * dpr, labelY);
      x += (pct / 100) * w;
    }
  }

  function drawManeuverSummary(stats) {
    if (!stats) {
      maneuverSummary.textContent = 'No maneuver data';
      return;
    }

    const tackText = stats.tackCount > 0
      ? `${stats.tackCount} tacks (avg score: ${stats.avgTackScore ?? '--'})`
      : 'No tacks';
    const gybeText = stats.gybeCount > 0
      ? `${stats.gybeCount} gybes (avg score: ${stats.avgGybeScore ?? '--'})`
      : 'No gybes';

    maneuverSummary.innerHTML = `
      <div class="perf-maneuver-row">${tackText}</div>
      <div class="perf-maneuver-row">${gybeText}</div>
    `;
  }

  function drawHeatmap() {
    const dpr = window.devicePixelRatio || 1;
    const w = heatmapCanvas.width;
    const h = heatmapCanvas.height;
    heatmapCtx.clearRect(0, 0, w, h);

    if (efficiencyTimeline.length === 0) {
      heatmapCtx.font = `${10 * dpr}px monospace`;
      heatmapCtx.fillStyle = '#666';
      heatmapCtx.textAlign = 'center';
      heatmapCtx.fillText('Collecting data...', w / 2, h / 2);
      return;
    }

    const n = efficiencyTimeline.length;
    const cellW = Math.max(1, w / n);

    for (let i = 0; i < n; i++) {
      const eff = efficiencyTimeline[i];
      heatmapCtx.fillStyle = effToColor(eff);
      heatmapCtx.fillRect(i * cellW, 0, cellW + 1, h);
    }
  }

  function effToColor(eff) {
    if (eff == null) return '#1a1a3a';
    if (eff >= 90) return '#00e676';
    if (eff >= 80) return '#66bb6a';
    if (eff >= 70) return '#ffd600';
    if (eff >= 60) return '#ff9800';
    return '#ff5252';
  }

  function drawMistakes(stats) {
    if (!stats || !stats.worstVMGMoment) {
      mistakesList.innerHTML = '<div class="perf-mistake-item">No significant drops detected</div>';
      return;
    }

    const m = stats.worstVMGMoment;
    const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '--';
    mistakesList.innerHTML = `
      <div class="perf-mistake-item">
        <span class="perf-mistake-time">${time}</span>
        <span class="perf-mistake-detail">VMG eff dropped to ${Math.round(m.vmgEfficiency)}% — TWA ${Math.round(Math.abs(m.twa))}° at ${m.tws?.toFixed(0) ?? '?'}kn TWS</span>
      </div>
    `;
  }

  function update(sessionStats, effHistory) {
    if (effHistory) {
      efficiencyTimeline = effHistory;
    }

    resize();
    drawSailDistribution(sessionStats?.sailDistribution);
    drawManeuverSummary(sessionStats);
    drawHeatmap();
    drawMistakes(sessionStats);
  }

  resize();

  return { update };
}
