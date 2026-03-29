const SIZE = 100;
const HALF = SIZE / 2;
const BG_COLOR = 'rgba(10, 10, 26, 0.85)';
const RING_COLOR = '#2a2a4a';
const CARDINAL_COLOR = '#8888aa';
const TEXT_COLOR = '#e0e0e0';
const NO_DATA_COLOR = '#555';

function twsColor(tws) {
  if (tws < 10) return '#00b4d8';
  if (tws < 20) return '#e0e0e0';
  if (tws < 30) return '#f39c12';
  return '#e74c3c';
}

export function initCompassRose(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE * 2; // retina
  canvas.height = SIZE * 2;
  canvas.style.width = SIZE + 'px';
  canvas.style.height = SIZE + 'px';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let animTwd = null;
  let animFrame = null;

  function drawRose(twd, tws) {
    const s = 2; // retina scale
    ctx.clearRect(0, 0, SIZE * s, SIZE * s);

    // Background circle
    ctx.beginPath();
    ctx.arc(HALF * s, HALF * s, (HALF - 2) * s, 0, Math.PI * 2);
    ctx.fillStyle = BG_COLOR;
    ctx.fill();
    ctx.strokeStyle = RING_COLOR;
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();

    // Cardinal points
    ctx.font = `bold ${10 * s}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = CARDINAL_COLOR;

    const cardinals = [
      { label: 'N', angle: -Math.PI / 2 },
      { label: 'E', angle: 0 },
      { label: 'S', angle: Math.PI / 2 },
      { label: 'W', angle: Math.PI },
    ];

    const labelR = (HALF - 12) * s;
    for (const c of cardinals) {
      const x = HALF * s + Math.cos(c.angle) * labelR;
      const y = HALF * s + Math.sin(c.angle) * labelR;
      ctx.fillText(c.label, x, y);
    }

    // Tick marks
    ctx.strokeStyle = RING_COLOR;
    ctx.lineWidth = 1 * s;
    for (let deg = 0; deg < 360; deg += 30) {
      if (deg % 90 === 0) continue; // skip cardinals
      const rad = ((deg - 90) * Math.PI) / 180;
      const inner = (HALF - 6) * s;
      const outer = (HALF - 2) * s;
      ctx.beginPath();
      ctx.moveTo(HALF * s + Math.cos(rad) * inner, HALF * s + Math.sin(rad) * inner);
      ctx.lineTo(HALF * s + Math.cos(rad) * outer, HALF * s + Math.sin(rad) * outer);
      ctx.stroke();
    }

    if (twd == null || tws == null) {
      // No data
      ctx.font = `${9 * s}px monospace`;
      ctx.fillStyle = NO_DATA_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No wind', HALF * s, HALF * s - 4 * s);
      ctx.fillText('data', HALF * s, HALF * s + 8 * s);
      return;
    }

    // Wind direction arrow (points FROM direction wind comes from)
    const arrowAngle = ((twd - 90) * Math.PI) / 180;
    const arrowLen = (HALF - 20) * s;
    const tipX = HALF * s + Math.cos(arrowAngle) * arrowLen;
    const tipY = HALF * s + Math.sin(arrowAngle) * arrowLen;
    const tailX = HALF * s - Math.cos(arrowAngle) * (arrowLen * 0.4);
    const tailY = HALF * s - Math.sin(arrowAngle) * (arrowLen * 0.4);

    const color = twsColor(tws);

    // Arrow shaft
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tipX, tipY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 * s;
    ctx.stroke();

    // Arrow head
    const headLen = 8 * s;
    const headAngle = 0.4;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      tipX - Math.cos(arrowAngle - headAngle) * headLen,
      tipY - Math.sin(arrowAngle - headAngle) * headLen,
    );
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      tipX - Math.cos(arrowAngle + headAngle) * headLen,
      tipY - Math.sin(arrowAngle + headAngle) * headLen,
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 * s;
    ctx.stroke();

    // TWS number in center
    ctx.font = `bold ${14 * s}px monospace`;
    ctx.fillStyle = TEXT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tws.toFixed(1), HALF * s, HALF * s - 2 * s);

    // "kn" label
    ctx.font = `${8 * s}px monospace`;
    ctx.fillStyle = CARDINAL_COLOR;
    ctx.fillText('kn', HALF * s, HALF * s + 10 * s);
  }

  function animateTo(targetTwd, tws) {
    if (animFrame) cancelAnimationFrame(animFrame);

    if (animTwd == null) {
      animTwd = targetTwd;
      drawRose(targetTwd, tws);
      return;
    }

    const diff = ((targetTwd - animTwd + 540) % 360) - 180;
    if (Math.abs(diff) < 0.5) {
      animTwd = targetTwd;
      drawRose(targetTwd, tws);
      return;
    }

    const step = diff * 0.15;
    animTwd = (animTwd + step + 360) % 360;
    drawRose(animTwd, tws);
    animFrame = requestAnimationFrame(() => animateTo(targetTwd, tws));
  }

  function update(twd, tws) {
    if (twd == null || tws == null) {
      if (animFrame) cancelAnimationFrame(animFrame);
      drawRose(null, null);
      return;
    }
    animateTo(twd, tws);
  }

  // Initial draw
  drawRose(null, null);

  return { update };
}
