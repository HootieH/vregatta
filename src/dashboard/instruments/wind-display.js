export function init(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  container.innerHTML = '<div class="mfd-cell-inner mfd-wind"><canvas></canvas></div>';

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

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) * 0.78;

    // Use Inshore data when active, otherwise Offshore
    const useInshore = snapshot?.inshoreActive && snapshot.inshorePlayerBoat;
    const boat = useInshore ? null : snapshot?.boat;
    const twa = useInshore ? snapshot.inshorePlayerBoat.twa : boat?.twa;
    const tws = useInshore ? snapshot.inshoreWindSpeed : boat?.tws;
    const twd = useInshore ? snapshot.inshoreWindDirection : boat?.twd;

    // Outer ring
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Tick marks every 30 degrees
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg - 90) * Math.PI / 180;
      const inner = radius * 0.88;
      const outer = radius;

      ctx.strokeStyle = deg % 90 === 0 ? '#444' : '#333';
      ctx.lineWidth = (deg % 90 === 0 ? 2 : 1) * dpr;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(rad) * inner, cy + Math.sin(rad) * inner);
      ctx.lineTo(cx + Math.cos(rad) * outer, cy + Math.sin(rad) * outer);
      ctx.stroke();

      if (deg % 30 === 0) {
        ctx.fillStyle = '#555';
        ctx.font = `${8 * dpr}px monospace`;
        const lx = cx + Math.cos(rad) * (radius * 0.78);
        const ly = cy + Math.sin(rad) * (radius * 0.78);
        ctx.fillText(deg + '\u00B0', lx, ly);
      }
    }

    // Boat icon at center
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8 * dpr);
    ctx.lineTo(cx - 5 * dpr, cy + 6 * dpr);
    ctx.lineTo(cx + 5 * dpr, cy + 6 * dpr);
    ctx.closePath();
    ctx.fill();

    if (twa == null || tws == null) {
      ctx.fillStyle = '#555';
      ctx.font = `${12 * dpr}px monospace`;
      ctx.fillText('---', cx, cy + radius * 0.4);
      return;
    }

    // TWA arrow: red port, green stbd
    const arrowColor = twa < 0 ? '#ff3333' : '#00ff41';
    const arrowAngle = (twa) * Math.PI / 180 - Math.PI / 2;
    const arrowLen = radius * 0.85;

    const tipX = cx + Math.cos(arrowAngle) * arrowLen;
    const tipY = cy + Math.sin(arrowAngle) * arrowLen;

    ctx.strokeStyle = arrowColor;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Arrowhead
    const headLen = 10 * dpr;
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
    ctx.lineWidth = 2.5 * dpr;
    ctx.stroke();

    // TWS in center
    ctx.fillStyle = '#00ff41';
    ctx.font = `bold ${16 * dpr}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tws.toFixed(1), cx, cy + 20 * dpr);
    ctx.fillStyle = '#555';
    ctx.font = `${8 * dpr}px monospace`;
    ctx.fillText('TWS kn', cx, cy + 32 * dpr);

    // TWA text top
    ctx.fillStyle = arrowColor;
    ctx.font = `bold ${11 * dpr}px monospace`;
    ctx.fillText('TWA ' + Math.abs(twa).toFixed(0) + '\u00B0' + (twa < 0 ? 'P' : 'S'), cx, cy - radius - 10 * dpr);

    // Tack label (port/starboard) for Inshore
    if (useInshore && snapshot.inshorePlayerBoat.tack) {
      const tackLabel = snapshot.inshorePlayerBoat.tack === 'starboard' ? 'STBD' : 'PORT';
      ctx.fillStyle = twa < 0 ? '#ff3333' : '#00ff41';
      ctx.font = `bold ${9 * dpr}px monospace`;
      ctx.fillText(tackLabel, cx, cy - radius - 22 * dpr);
    }

    // TWD text bottom
    if (twd != null) {
      ctx.fillStyle = '#888';
      ctx.font = `${10 * dpr}px monospace`;
      ctx.fillText('TWD ' + Math.round(twd) + '\u00B0', cx, cy + radius + 12 * dpr);
    }

    // VMG angle marks
    if (snapshot?._bestVMG) {
      const vmg = snapshot._bestVMG;
      drawVMGMark(ctx, cx, cy, radius, vmg.twaUp, dpr);
      drawVMGMark(ctx, cx, cy, radius, vmg.twaDown, dpr);
    }
  }

  function drawVMGMark(drawCtx, cx, cy, radius, twaDeg, dpr) {
    if (!twaDeg || twaDeg <= 0) return;
    const angle = twaDeg * Math.PI / 180 - Math.PI / 2;
    const r1 = radius * 0.92;
    const r2 = radius * 1.0;

    drawCtx.strokeStyle = '#ffbf00';
    drawCtx.lineWidth = 1.5 * dpr;
    drawCtx.setLineDash([3 * dpr, 3 * dpr]);
    drawCtx.beginPath();
    drawCtx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
    drawCtx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
    drawCtx.stroke();

    // Mirror for port side
    const mirrorAngle = -twaDeg * Math.PI / 180 - Math.PI / 2;
    drawCtx.beginPath();
    drawCtx.moveTo(cx + Math.cos(mirrorAngle) * r1, cy + Math.sin(mirrorAngle) * r1);
    drawCtx.lineTo(cx + Math.cos(mirrorAngle) * r2, cy + Math.sin(mirrorAngle) * r2);
    drawCtx.stroke();
    drawCtx.setLineDash([]);
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
