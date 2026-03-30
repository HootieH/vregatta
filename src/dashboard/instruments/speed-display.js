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
