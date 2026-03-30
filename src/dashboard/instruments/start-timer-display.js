export function init(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  container.innerHTML = `
    <div class="mfd-cell-inner mfd-timer">
      <div class="mfd-label">START</div>
      <div class="mfd-timer-value mfd-dim">--:--</div>
      <div class="mfd-timer-phase mfd-dim">WAITING</div>
    </div>
  `;

  const valueEl = container.querySelector('.mfd-timer-value');
  const phaseEl = container.querySelector('.mfd-timer-phase');

  function update(snapshot) {
    const race = snapshot?.race;
    if (!race || race.startTime == null) {
      valueEl.textContent = '--:--';
      valueEl.className = 'mfd-timer-value mfd-dim';
      phaseEl.textContent = 'NO RACE';
      phaseEl.className = 'mfd-timer-phase mfd-dim';
      return;
    }

    const now = Date.now();
    const startMs = race.startTime;
    const diff = startMs - now;

    if (diff <= 0) {
      valueEl.textContent = 'GO';
      valueEl.className = 'mfd-timer-value mfd-timer-green';
      phaseEl.textContent = 'RACING';
      phaseEl.className = 'mfd-timer-phase mfd-timer-green';
      return;
    }

    const totalSec = Math.ceil(diff / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    valueEl.textContent = String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');

    if (totalSec > 300) {
      valueEl.className = 'mfd-timer-value mfd-timer-white';
      phaseEl.textContent = 'SEQUENCE';
      phaseEl.className = 'mfd-timer-phase mfd-timer-white';
    } else if (totalSec > 120) {
      valueEl.className = 'mfd-timer-value mfd-timer-yellow';
      phaseEl.textContent = 'PREP';
      phaseEl.className = 'mfd-timer-phase mfd-timer-yellow';
    } else if (totalSec > 30) {
      valueEl.className = 'mfd-timer-value mfd-timer-orange';
      phaseEl.textContent = 'FINAL';
      phaseEl.className = 'mfd-timer-phase mfd-timer-orange';
    } else {
      valueEl.className = 'mfd-timer-value mfd-timer-green';
      phaseEl.textContent = 'GO GO GO';
      phaseEl.className = 'mfd-timer-phase mfd-timer-green';
    }
  }

  function resize() {}

  return { update, resize };
}
