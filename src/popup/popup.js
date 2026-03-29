const SAIL_NAMES = {
  1: 'Jib',
  2: 'Spi',
  3: 'Staysail',
  4: 'Light Jib',
  5: 'Code 0',
  6: 'Heavy Genn',
  7: 'Light Genn',
};

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showSection(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function populateBoatData(boat) {
  if (!boat) return;

  setText('boat-lat', boat.lat != null ? boat.lat.toFixed(4) : '—');
  setText('boat-lon', boat.lon != null ? boat.lon.toFixed(4) : '—');
  setText('boat-speed', boat.speed != null ? boat.speed.toFixed(1) + ' kn' : '—');
  setText('boat-heading', boat.heading != null ? Math.round(boat.heading) + '°' : '—');
  setText('boat-twa', boat.twa != null ? Math.round(boat.twa) + '°' : '—');
  setText('boat-tws', boat.tws != null ? boat.tws.toFixed(1) + ' kn' : '—');
  setText('boat-twd', boat.twd != null ? Math.round(boat.twd) + '°' : '—');
  setText('boat-sail', SAIL_NAMES[boat.sail] || '—');
  setText('boat-stamina', boat.stamina != null ? Math.round(boat.stamina) + '%' : '—');
  setText('boat-dtf', boat.distanceToEnd != null ? boat.distanceToEnd.toFixed(1) + ' nm' : '—');

  showSection('boat-data');
}

function populateVMG(vmg) {
  if (!vmg) return;

  const vmgEl = document.getElementById('vmg-value');
  const compEl = document.getElementById('vmg-component');
  if (!vmgEl) return;

  vmgEl.textContent = Math.abs(vmg.vmg).toFixed(2) + ' kn';
  compEl.textContent = vmg.component || '';

  // Remove previous color classes
  vmgEl.classList.remove('vmg-green', 'vmg-yellow', 'vmg-red');

  // Default to green — we don't have bestVmg in the snapshot yet,
  // so just show the value without comparison coloring
  vmgEl.classList.add('vmg-green');

  showSection('vmg-section');
}

function populateRace(race) {
  if (!race) return;

  const name = race.name || 'Unknown Race';
  const leg = race.legNum ? ` — Leg ${race.legNum}` : '';
  setText('race-name', name + leg);
  showSection('race-info');
}

function populateRank(competitorCount) {
  if (competitorCount == null) return;
  setText('competitor-count', `${competitorCount} competitors tracked`);
  showSection('rank-section');
}

function populateActions(events) {
  if (!events || events.length === 0) return;

  const list = document.getElementById('actions-list');
  if (!list) return;
  list.innerHTML = '';

  for (const evt of events) {
    const li = document.createElement('li');

    const typeSpan = document.createElement('span');
    typeSpan.className = 'action-type';
    let label = evt.type || 'unknown';
    if (evt.type === 'sailChange') {
      const from = SAIL_NAMES[evt.from] || evt.from;
      const to = SAIL_NAMES[evt.to] || evt.to;
      label = `Sail: ${from} → ${to}`;
    } else if (evt.value != null) {
      label = `${evt.type}: ${evt.value}`;
    }
    typeSpan.textContent = label;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'action-time';
    timeSpan.textContent = evt.timestamp ? formatRelativeTime(evt.timestamp) : '';

    li.appendChild(typeSpan);
    li.appendChild(timeSpan);
    list.appendChild(li);
  }

  showSection('actions-section');
}

function updateUI(snapshot) {
  const statusEl = document.getElementById('connection-status');

  if (!snapshot || !snapshot.connected) {
    statusEl.textContent = 'Not connected';
    statusEl.className = 'disconnected';
    document.getElementById('export-btn').disabled = true;
    return;
  }

  statusEl.textContent = 'Connected';
  statusEl.className = 'connected';
  document.getElementById('export-btn').disabled = false;

  populateRace(snapshot.race);
  populateBoatData(snapshot.boat);
  populateVMG(snapshot.vmg);
  populateRank(snapshot.competitorCount);
  populateActions(snapshot.events);
}

function fetchStatus() {
  chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
    if (chrome.runtime.lastError) {
      updateUI(null);
      return;
    }
    updateUI(response);
  });
}

function handleExport() {
  chrome.runtime.sendMessage({ type: 'exportRace' }, (response) => {
    if (chrome.runtime.lastError || !response) return;

    const raceName = (response.race && response.race.name) || 'unknown';
    const safeName = raceName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `vregatta-${safeName}-${timestamp}.json`;

    const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function handleDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
}

// --- Debug section ---
let rawCaptureActive = false;

function fetchDebugStats() {
  chrome.runtime.sendMessage({ type: 'getStats' }, (response) => {
    if (chrome.runtime.lastError || !response) return;

    const unknownCount = response.unknownCount || 0;
    const normFails = response.normalizeFails || 0;
    const pipeErrors = response.pipelineErrors || 0;
    const failTotal = unknownCount + normFails + pipeErrors;

    // Error alert — show/hide based on failures
    const errorAlert = document.getElementById('dbg-error-alert');
    if (errorAlert) {
      errorAlert.classList.toggle('hidden', failTotal === 0);
    }
    setText('dbg-unknown-count', String(unknownCount));
    setText('dbg-norm-fail-count', String(normFails));
    setText('dbg-pipe-error-count', String(pipeErrors));

    // Summary line
    const classifiedCounts = response.classifiedCounts || {};
    const okCount = Object.entries(classifiedCounts)
      .filter(([k]) => k !== 'unknown')
      .reduce((sum, [, v]) => sum + v, 0);
    setText('dbg-intercepted', String(response.totalIntercepted));
    setText('dbg-classified-ok', String(okCount));
    setText('dbg-fail-total', String(failTotal));

    // Pipeline stats
    setText('dbg-storage-writes', String(response.storageWrites));
    setText('dbg-raw-count', String(response.rawCaptureCount));

    const dlBtn = document.getElementById('download-raw-btn');
    if (dlBtn) dlBtn.disabled = response.rawCaptureCount === 0;

    rawCaptureActive = response.rawCaptureEnabled || false;
    const rawBtn = document.getElementById('raw-capture-btn');
    if (rawBtn) {
      rawBtn.textContent = rawCaptureActive ? 'Disable Raw Capture' : 'Enable Raw Capture';
      rawBtn.classList.toggle('active', rawCaptureActive);
    }
  });
}

function handleToggleDebugOverlay() {
  chrome.runtime.sendMessage({ type: 'toggleDebug' });
}

function handleToggleRawCapture() {
  rawCaptureActive = !rawCaptureActive;
  chrome.runtime.sendMessage({ type: 'setRawCapture', enabled: rawCaptureActive }, () => {
    fetchDebugStats();
  });
}

function handleDownloadRawCapture() {
  chrome.runtime.sendMessage({ type: 'getRawCapture' }, (response) => {
    if (chrome.runtime.lastError || !response || !response.data) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `vregatta-raw-capture-${timestamp}.json`;
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  fetchStatus();
  fetchDebugStats();
  setInterval(fetchStatus, 10000);
  setInterval(fetchDebugStats, 5000);
  document.getElementById('export-btn').addEventListener('click', handleExport);
  document.getElementById('dashboard-btn').addEventListener('click', handleDashboard);
  document.getElementById('debug-overlay-btn').addEventListener('click', handleToggleDebugOverlay);
  document.getElementById('raw-capture-btn').addEventListener('click', handleToggleRawCapture);
  document.getElementById('download-raw-btn').addEventListener('click', handleDownloadRawCapture);
});
