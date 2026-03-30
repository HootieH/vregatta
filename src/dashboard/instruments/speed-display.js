export function init(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  container.innerHTML = `
    <div class="mfd-speed">
      <div class="mfd-speed-value">---</div>
      <div class="mfd-speed-unit">kn</div>
      <div class="mfd-speed-max">MAX ---</div>
    </div>
  `;

  const valueEl = container.querySelector('.mfd-speed-value');
  const maxEl = container.querySelector('.mfd-speed-max');
  let maxSpeed = 0;

  function update(snapshot) {
    // Inshore mode: show speed as percentage
    const useInshore = snapshot?.inshoreActive && snapshot.inshorePlayerBoat;

    if (useInshore) {
      const p = snapshot.inshorePlayerBoat;
      const speedNorm = p.speedRaw / 10000;
      const speedPct = (speedNorm * 100).toFixed(0);
      valueEl.textContent = speedPct + '%';

      if (speedNorm > maxSpeed) maxSpeed = speedNorm;
      maxEl.textContent = `MAX ${(maxSpeed * 100).toFixed(0)}%`;

      // Color by relative fleet speed if multiple boats available
      const allBoats = snapshot.inshoreBoats || [];
      const activeSpeeds = allBoats.filter(b => b.active && !b.isPlayer).map(b => b.speedRaw);
      let cls = 'mfd-cell-inner';
      if (activeSpeeds.length > 0) {
        const avgFleet = activeSpeeds.reduce((a, b) => a + b, 0) / activeSpeeds.length;
        if (avgFleet > 0) {
          const ratio = p.speedRaw / avgFleet;
          if (ratio >= 0.95) cls += ' mfd-speed-green';
          else if (ratio >= 0.8) cls += ' mfd-speed-yellow';
          else cls += ' mfd-speed-red';
        }
      }
      container.className = cls;
      return;
    }

    if (!snapshot?.boat || snapshot.boat.speed == null) {
      valueEl.textContent = '---';
      container.className = 'mfd-cell-inner';
      return;
    }

    const speed = snapshot.boat.speed;
    valueEl.textContent = speed.toFixed(1);

    if (speed > maxSpeed) maxSpeed = speed;
    maxEl.textContent = `MAX ${maxSpeed.toFixed(1)}`;

    // Color based on polar efficiency if available
    let cls = 'mfd-cell-inner';
    if (snapshot._polarEff != null) {
      if (snapshot._polarEff >= 80) cls += ' mfd-speed-green';
      else if (snapshot._polarEff >= 50) cls += ' mfd-speed-yellow';
      else cls += ' mfd-speed-red';
    }
    container.className = cls;
  }

  function resize() {}

  return { update, resize };
}
