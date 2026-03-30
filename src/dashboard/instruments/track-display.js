export function init(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  container.innerHTML = '<div class="mfd-cell-inner mfd-track"><canvas></canvas></div>';

  const canvas = container.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let lastSnapshot = null;
  let lastHistory = null;

  function draw(snapshot, history) {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width * dpr;
    const h = rect.height * dpr;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    const boat = snapshot?.boat;

    if (!boat || boat.lat == null || boat.lon == null || !history || history.length < 2) {
      ctx.fillStyle = '#555';
      ctx.font = `${12 * dpr}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No track', w / 2, h / 2);
      return;
    }

    // Use last ~60 points (5 min at 5s poll)
    const track = history.slice(-60);
    const margin = 20 * dpr;
    const drawW = w - margin * 2;
    const drawH = h - margin * 2;

    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
    for (const p of track) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }

    const latRange = Math.max(maxLat - minLat, 0.001);
    const lonRange = Math.max(maxLon - minLon, 0.001);
    const pad = 0.15;

    function toXY(lat, lon) {
      const x = margin + ((lon - minLon + lonRange * pad) / (lonRange * (1 + pad * 2))) * drawW;
      const y = margin + drawH - ((lat - minLat + latRange * pad) / (latRange * (1 + pad * 2))) * drawH;
      return { x, y };
    }

    // Track line with fading
    for (let i = 1; i < track.length; i++) {
      const p0 = toXY(track[i - 1].lat, track[i - 1].lon);
      const p1 = toXY(track[i].lat, track[i].lon);
      const alpha = 0.2 + 0.8 * (i / track.length);

      ctx.strokeStyle = `rgba(0, 255, 65, ${alpha.toFixed(2)})`;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    // Boat dot
    const boatPt = toXY(boat.lat, boat.lon);
    ctx.fillStyle = '#00ff41';
    ctx.beginPath();
    ctx.arc(boatPt.x, boatPt.y, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();

    // Heading line
    if (boat.heading != null) {
      const hdgRad = (boat.heading - 90) * Math.PI / 180;
      const lineLen = 20 * dpr;
      ctx.strokeStyle = '#00ff41';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(boatPt.x, boatPt.y);
      ctx.lineTo(boatPt.x + Math.cos(hdgRad) * lineLen, boatPt.y + Math.sin(hdgRad) * lineLen);
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = '#555';
    ctx.font = `${9 * dpr}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('TRACK', 4 * dpr, 10 * dpr);
  }

  function update(snapshot, history) {
    lastSnapshot = snapshot;
    if (history) lastHistory = history;
    draw(snapshot, lastHistory);
  }

  function resize() {
    draw(lastSnapshot, lastHistory);
  }

  return { update, resize };
}
