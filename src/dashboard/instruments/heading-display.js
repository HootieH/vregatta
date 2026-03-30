export function init(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  container.innerHTML = `
    <div class="mfd-cell-inner mfd-heading">
      <div class="mfd-label">HDG</div>
      <div class="mfd-heading-value">---</div>
      <div class="mfd-heading-tape"><canvas></canvas></div>
    </div>
  `;

  const valueEl = container.querySelector('.mfd-heading-value');
  const canvas = container.querySelector('.mfd-heading-tape canvas');
  const ctx = canvas.getContext('2d');
  let lastHeading = null;

  function drawTape(heading) {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width * dpr;
    const h = rect.height * dpr;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    const cxCanvas = w / 2;
    const range = 45;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    // Center mark
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(cxCanvas, 0);
    ctx.lineTo(cxCanvas, 6 * dpr);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cxCanvas, h);
    ctx.lineTo(cxCanvas, h - 6 * dpr);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let deg = -range; deg <= range; deg++) {
      const actual = ((heading + deg) % 360 + 360) % 360;
      const x = cxCanvas + (deg / range) * (w / 2) * 0.9;

      if (x < 0 || x > w) continue;

      if (actual % 10 === 0) {
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h * 0.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x, h * 0.7);
        ctx.stroke();

        ctx.fillStyle = '#888';
        ctx.font = `${9 * dpr}px monospace`;
        ctx.fillText(String(Math.round(actual)).padStart(3, '0'), x, h / 2);
      } else if (actual % 5 === 0) {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h * 0.2);
        ctx.stroke();
      }
    }
  }

  function update(snapshot) {
    // Use Inshore heading when active
    const useInshore = snapshot?.inshoreActive && snapshot.inshorePlayerBoat;
    const rawHeading = useInshore
      ? snapshot.inshorePlayerBoat.heading
      : snapshot?.boat?.heading;

    if (rawHeading == null) {
      valueEl.textContent = '---';
      return;
    }

    const heading = Math.round(rawHeading);
    valueEl.textContent = String(heading).padStart(3, '0') + '\u00B0';
    lastHeading = heading;
    drawTape(heading);
  }

  function resize() {
    if (lastHeading != null) drawTape(lastHeading);
  }

  return { update, resize };
}
