/**
 * Route advisory panel UI.
 * @param {string} containerId - DOM container ID
 * @returns {object} panel API
 */
export function initRoutePanel(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  container.innerHTML = `
    <div class="route-panel-inner">
      <div class="route-panel-header">
        <span class="route-panel-title">Route Advisor</span>
        <button class="route-panel-clear" title="Clear waypoint" style="display:none;">&#x2715;</button>
      </div>
      <div class="route-panel-body">
        <div class="route-panel-prompt">Click map to set waypoint</div>
        <div class="route-panel-data" style="display:none;"></div>
        <div class="route-panel-alert" style="display:none;"></div>
      </div>
    </div>
  `;

  const prompt = container.querySelector('.route-panel-prompt');
  const dataDiv = container.querySelector('.route-panel-data');
  const alertDiv = container.querySelector('.route-panel-alert');
  const clearBtn = container.querySelector('.route-panel-clear');

  let onClear = null;

  clearBtn.addEventListener('click', () => {
    if (onClear) onClear();
    showPrompt();
  });

  function showPrompt() {
    prompt.style.display = '';
    dataDiv.style.display = 'none';
    alertDiv.style.display = 'none';
    clearBtn.style.display = 'none';
  }

  function update(adviceData) {
    if (!adviceData) {
      showPrompt();
      return;
    }

    if (adviceData.error) {
      prompt.style.display = 'none';
      dataDiv.style.display = '';
      dataDiv.innerHTML = `<div class="route-panel-error">${adviceData.error}</div>`;
      alertDiv.style.display = 'none';
      clearBtn.style.display = '';
      return;
    }

    prompt.style.display = 'none';
    dataDiv.style.display = '';
    clearBtn.style.display = '';

    const a = adviceData;
    const etaStr = a.etaHours != null && a.etaHours > 0 && isFinite(a.etaHours)
      ? formatEta(a.etaHours)
      : '--';

    const modeLabel = a.directRoutePossible
      ? '<span class="route-mode direct">Direct</span>'
      : a.isUpwind
        ? '<span class="route-mode upwind">Upwind</span>'
        : a.isDownwind
          ? '<span class="route-mode downwind">Downwind</span>'
          : '<span class="route-mode reaching">Reaching</span>';

    dataDiv.innerHTML = `
      <div class="route-row">${modeLabel}</div>
      <div class="route-row"><span class="route-label">BRG</span><span class="route-val">${a.bearingToWP.toFixed(0)}&deg;</span></div>
      <div class="route-row"><span class="route-label">DIST</span><span class="route-val">${a.distanceToWP.toFixed(1)} nm</span></div>
      <div class="route-divider"></div>
      <div class="route-row"><span class="route-label">HDG</span><span class="route-val route-highlight">${a.bestHeading}&deg;</span></div>
      <div class="route-row"><span class="route-label">TWA</span><span class="route-val">${a.bestTwa.toFixed(0)}&deg;</span></div>
      <div class="route-row"><span class="route-label">SAIL</span><span class="route-val">${a.bestSailName}</span></div>
      <div class="route-row"><span class="route-label">BSP</span><span class="route-val">${a.bestSpeed.toFixed(1)} kn</span></div>
      <div class="route-row"><span class="route-label">VMG→WP</span><span class="route-val">${a.bestVmgToWP.toFixed(1)} kn</span></div>
      <div class="route-row"><span class="route-label">ETA</span><span class="route-val">${etaStr}</span></div>
    `;

    // Tack/Gybe alert
    if (adviceData.onLayline) {
      alertDiv.style.display = '';
      if (a.isUpwind) {
        alertDiv.innerHTML = '<div class="route-alert tack">TACK NOW</div>';
      } else if (a.isDownwind) {
        alertDiv.innerHTML = '<div class="route-alert gybe">GYBE NOW</div>';
      } else {
        alertDiv.innerHTML = '<div class="route-alert layline">ON LAYLINE</div>';
      }
    } else {
      alertDiv.style.display = 'none';
    }
  }

  function setClearHandler(fn) {
    onClear = fn;
  }

  return { update, setClearHandler, showPrompt };
}

function formatEta(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
