export function init(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  container.innerHTML = `
    <div class="mfd-cell-inner mfd-vmg">
      <div class="mfd-label">VMG</div>
      <div class="mfd-vmg-value mfd-green">---</div>
      <div class="mfd-vmg-indicator mfd-dim">---</div>
      <div class="mfd-vmg-delta mfd-dim"></div>
      <canvas class="mfd-vmg-gauge"></canvas>
    </div>
  `;

  const valueEl = container.querySelector('.mfd-vmg-value');
  const indicatorEl = container.querySelector('.mfd-vmg-indicator');
  const deltaEl = container.querySelector('.mfd-vmg-delta');
  const gaugeCanvas = container.querySelector('.mfd-vmg-gauge');
  const gCtx = gaugeCanvas.getContext('2d');

  function drawGauge(pct) {
    const rect = gaugeCanvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.min(rect.width * 0.8, 200) * dpr;
    const h = 8 * dpr;
    gaugeCanvas.width = w;
    gaugeCanvas.height = h;
    gaugeCanvas.style.width = (w / dpr) + 'px';
    gaugeCanvas.style.height = (h / dpr) + 'px';

    gCtx.fillStyle = '#1a1a1a';
    gCtx.fillRect(0, 0, w, h);

    const fillPct = Math.max(0, Math.min(1, pct / 100));
    let color = '#00ff41';
    if (fillPct < 0.5) color = '#ff3333';
    else if (fillPct < 0.8) color = '#ffbf00';

    gCtx.fillStyle = color;
    gCtx.fillRect(0, 0, w * fillPct, h);
  }

  function update(snapshot) {
    const vmg = snapshot?.vmg;

    if (!vmg || vmg.vmg == null) {
      valueEl.textContent = '---';
      valueEl.className = 'mfd-vmg-value mfd-dim';
      indicatorEl.textContent = '---';
      indicatorEl.className = 'mfd-vmg-indicator mfd-dim';
      deltaEl.textContent = '';
      drawGauge(0);
      return;
    }

    const absVmg = Math.abs(vmg.vmg);
    valueEl.textContent = absVmg.toFixed(2);

    const isUpwind = vmg.component === 'upwind';
    indicatorEl.textContent = isUpwind ? '\u25B2 UP' : '\u25BC DN';
    indicatorEl.className = 'mfd-vmg-indicator ' + (isUpwind ? 'mfd-green' : 'mfd-amber');

    const eff = snapshot?._polarEff;
    if (eff != null) {
      let effColor = 'mfd-green';
      if (eff < 50) effColor = 'mfd-red';
      else if (eff < 80) effColor = 'mfd-amber';

      valueEl.className = 'mfd-vmg-value ' + effColor;
      deltaEl.textContent = eff.toFixed(0) + '% of best';
      deltaEl.className = 'mfd-vmg-delta ' + effColor;
      drawGauge(eff);
    } else {
      valueEl.className = 'mfd-vmg-value mfd-green';
      deltaEl.textContent = '';
      drawGauge(50);
    }
  }

  function resize() {}

  return { update, resize };
}
