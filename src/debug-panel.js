/**
 * Debug overlay panel injected into the VR game page via content script.
 * Toggled via message {type: 'toggleDebug'} from background.
 *
 * Design principle: failures are IMPOSSIBLE TO MISS.
 * Unknown/failed messages get red counters, not subtle logs.
 */

let panel = null;
let visible = false;
let refreshInterval = null;

const STYLES = `
  #vr-debug-panel {
    position: fixed;
    top: 10px;
    right: 10px;
    width: 420px;
    max-height: 60vh;
    background: rgba(20, 20, 40, 0.95);
    color: #e0e0e0;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
    border: 1px solid #3a86ff;
    border-radius: 6px;
    z-index: 999999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }
  #vr-debug-panel.has-errors {
    border-color: #e74c3c;
    box-shadow: 0 4px 20px rgba(231, 76, 60, 0.3);
  }
  #vr-debug-panel .vr-dbg-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: rgba(58, 134, 255, 0.2);
    border-bottom: 1px solid #3a86ff;
  }
  #vr-debug-panel.has-errors .vr-dbg-header {
    background: rgba(231, 76, 60, 0.2);
    border-bottom-color: #e74c3c;
  }
  #vr-debug-panel .vr-dbg-header span {
    font-weight: bold;
    font-size: 12px;
    color: #3a86ff;
  }
  #vr-debug-panel.has-errors .vr-dbg-header span {
    color: #e74c3c;
  }
  #vr-debug-panel .vr-dbg-close {
    cursor: pointer;
    color: #e74c3c;
    font-size: 14px;
    background: none;
    border: none;
    font-family: inherit;
  }
  #vr-debug-panel .vr-dbg-body {
    overflow-y: auto;
    padding: 8px 10px;
    flex: 1;
  }
  #vr-debug-panel .vr-dbg-section {
    margin-bottom: 8px;
  }
  #vr-debug-panel .vr-dbg-section-title {
    font-size: 10px;
    text-transform: uppercase;
    color: #3a86ff;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }

  /* Error banner — top of panel, red, impossible to miss */
  #vr-debug-panel .vr-dbg-error-banner {
    display: none;
    background: rgba(231, 76, 60, 0.15);
    border: 1px solid #e74c3c;
    border-radius: 4px;
    padding: 8px 10px;
    margin-bottom: 8px;
  }
  #vr-debug-panel .vr-dbg-error-banner.visible {
    display: block;
  }
  #vr-debug-panel .vr-dbg-error-banner .error-title {
    color: #e74c3c;
    font-weight: bold;
    font-size: 12px;
    margin-bottom: 4px;
  }
  #vr-debug-panel .vr-dbg-error-row {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
  }
  #vr-debug-panel .vr-dbg-error-row .label { color: #e08080; }
  #vr-debug-panel .vr-dbg-error-row .value {
    color: #e74c3c;
    font-weight: bold;
  }

  /* Summary bar — "12 intercepted, 8 OK, 4 UNKNOWN" */
  #vr-debug-panel .vr-dbg-summary {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
    font-size: 12px;
  }
  #vr-debug-panel .vr-dbg-summary .count-ok {
    color: #2ecc71;
    font-weight: bold;
  }
  #vr-debug-panel .vr-dbg-summary .count-fail {
    color: #e74c3c;
    font-weight: bold;
  }
  #vr-debug-panel .vr-dbg-summary .count-total {
    color: #e0e0e0;
  }

  #vr-debug-panel .vr-dbg-stat {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
  }
  #vr-debug-panel .vr-dbg-stat .label { color: #888; }
  #vr-debug-panel .vr-dbg-stat .value { color: #e0e0e0; }
  #vr-debug-panel .vr-dbg-stat .value.red { color: #e74c3c; font-weight: bold; }
  #vr-debug-panel .vr-dbg-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
  }
  #vr-debug-panel .vr-dbg-dot.green { background: #2ecc71; }
  #vr-debug-panel .vr-dbg-dot.red { background: #e74c3c; }
  #vr-debug-panel .vr-dbg-logs {
    max-height: 200px;
    overflow-y: auto;
    font-size: 10px;
    line-height: 1.4;
  }
  #vr-debug-panel .vr-dbg-log-entry {
    padding: 2px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    word-break: break-all;
  }
  #vr-debug-panel .vr-log-DEBUG { color: #888; }
  #vr-debug-panel .vr-log-INFO { color: #e0e0e0; }
  #vr-debug-panel .vr-log-WARN { color: #f39c12; }
  #vr-debug-panel .vr-log-ERROR { color: #e74c3c; font-weight: bold; }
  #vr-debug-panel .vr-dbg-toggle {
    background: rgba(58, 134, 255, 0.2);
    color: #3a86ff;
    border: 1px solid #3a86ff;
    border-radius: 3px;
    padding: 3px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 10px;
    margin-right: 4px;
  }
  #vr-debug-panel .vr-dbg-toggle.active {
    background: #3a86ff;
    color: #fff;
  }

  /* Classified breakdown list */
  #vr-debug-panel .vr-dbg-classified-list {
    margin: 4px 0;
    padding: 0;
    list-style: none;
  }
  #vr-debug-panel .vr-dbg-classified-list li {
    display: flex;
    justify-content: space-between;
    padding: 1px 4px;
    font-size: 11px;
  }
  #vr-debug-panel .vr-dbg-classified-list li.type-unknown {
    color: #e74c3c;
    font-weight: bold;
  }
`;

const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

function createPanel() {
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.appendChild(style);

  panel = document.createElement('div');
  panel.id = 'vr-debug-panel';
  panel.innerHTML = `
    <div class="vr-dbg-header">
      <span id="vr-dbg-title">vRegatta Debug</span>
      <button class="vr-dbg-close" title="Close">&times;</button>
    </div>
    <div class="vr-dbg-body">
      <!-- Error banner: shown only when there are failures -->
      <div class="vr-dbg-error-banner" id="vr-dbg-error-banner">
        <div class="error-title">Pipeline Failures Detected</div>
        <div class="vr-dbg-error-row">
          <span class="label">Unknown messages</span>
          <span class="value" id="vr-dbg-err-unknown">0</span>
        </div>
        <div class="vr-dbg-error-row">
          <span class="label">Normalize failures</span>
          <span class="value" id="vr-dbg-err-norm">0</span>
        </div>
        <div class="vr-dbg-error-row">
          <span class="label">Pipeline errors</span>
          <span class="value" id="vr-dbg-err-pipe">0</span>
        </div>
        <div class="vr-dbg-error-row" style="margin-top:4px; font-size:10px;">
          <span class="label" style="color:#f39c12;">Raw capture auto-enabled</span>
          <span class="value" id="vr-dbg-err-raw-status" style="color:#f39c12;"></span>
        </div>
      </div>

      <!-- Summary line: "12 intercepted, 8 OK, 4 UNKNOWN" -->
      <div class="vr-dbg-summary" id="vr-dbg-summary">
        <span class="count-total"><span id="vr-dbg-sum-total">0</span> intercepted</span>
        <span class="count-ok"><span id="vr-dbg-sum-ok">0</span> classified OK</span>
        <span class="count-fail"><span id="vr-dbg-sum-fail">0</span> FAILED</span>
      </div>

      <div class="vr-dbg-section">
        <div class="vr-dbg-section-title">Status</div>
        <div class="vr-dbg-stat">
          <span class="label">Connection</span>
          <span class="value"><span class="vr-dbg-dot red" id="vr-dbg-conn-dot"></span><span id="vr-dbg-conn-text">Unknown</span></span>
        </div>
        <div class="vr-dbg-stat">
          <span class="label">Messages/sec</span>
          <span class="value" id="vr-dbg-mps">0</span>
        </div>
      </div>

      <div class="vr-dbg-section">
        <div class="vr-dbg-section-title">Classified Breakdown</div>
        <ul class="vr-dbg-classified-list" id="vr-dbg-classified-list"></ul>
      </div>

      <div class="vr-dbg-section">
        <div class="vr-dbg-section-title">Pipeline</div>
        <div class="vr-dbg-stat">
          <span class="label">Storage writes</span>
          <span class="value" id="vr-dbg-storage">0</span>
        </div>
        <div class="vr-dbg-stat">
          <span class="label">Raw captured</span>
          <span class="value" id="vr-dbg-raw-count">off</span>
        </div>
      </div>

      <div class="vr-dbg-section">
        <div class="vr-dbg-section-title">Controls</div>
        <button class="vr-dbg-toggle" id="vr-dbg-raw-toggle">Raw Capture</button>
        <button class="vr-dbg-toggle" id="vr-dbg-verbose-toggle">Verbose</button>
      </div>

      <div class="vr-dbg-section">
        <div class="vr-dbg-section-title">Recent Logs</div>
        <div class="vr-dbg-logs" id="vr-dbg-logs"></div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  panel.querySelector('.vr-dbg-close').addEventListener('click', () => {
    hidePanel();
  });

  panel.querySelector('#vr-dbg-raw-toggle').addEventListener('click', (e) => {
    const btn = e.target;
    const enabling = !btn.classList.contains('active');
    btn.classList.toggle('active', enabling);
    chrome.runtime.sendMessage({ type: 'setRawCapture', enabled: enabling });
  });

  panel.querySelector('#vr-dbg-verbose-toggle').addEventListener('click', (e) => {
    const btn = e.target;
    const enabling = !btn.classList.contains('active');
    btn.classList.toggle('active', enabling);
    chrome.runtime.sendMessage({ type: 'setLogLevel', level: enabling ? 0 : 1 });
  });
}

function showPanel() {
  if (!panel) createPanel();
  panel.style.display = 'flex';
  visible = true;
  refreshInterval = setInterval(refreshStats, 1000);
  refreshStats();
}

function hidePanel() {
  if (panel) panel.style.display = 'none';
  visible = false;
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function refreshStats() {
  if (!visible) return;
  chrome.runtime.sendMessage({ type: 'getStats' }, (response) => {
    if (chrome.runtime.lastError || !response) return;

    const failCount = (response.unknownCount || 0) + (response.normalizeFails || 0) + (response.pipelineErrors || 0);
    const hasErrors = failCount > 0;

    // Panel border turns red when there are failures
    panel.classList.toggle('has-errors', hasErrors);

    // Title reflects failure state
    const titleEl = document.getElementById('vr-dbg-title');
    if (titleEl) {
      titleEl.textContent = hasErrors
        ? `vRegatta Debug — ${failCount} FAILURES`
        : 'vRegatta Debug';
    }

    // Error banner
    const banner = document.getElementById('vr-dbg-error-banner');
    if (banner) {
      banner.classList.toggle('visible', hasErrors);
    }
    const el = (id) => document.getElementById(id);
    if (el('vr-dbg-err-unknown')) el('vr-dbg-err-unknown').textContent = response.unknownCount || 0;
    if (el('vr-dbg-err-norm')) el('vr-dbg-err-norm').textContent = response.normalizeFails || 0;
    if (el('vr-dbg-err-pipe')) el('vr-dbg-err-pipe').textContent = response.pipelineErrors || 0;
    if (el('vr-dbg-err-raw-status')) {
      el('vr-dbg-err-raw-status').textContent = response.rawCaptureEnabled ? 'YES' : 'no';
    }

    // Summary line
    const classifiedCounts = response.classifiedCounts || {};
    const okCount = Object.entries(classifiedCounts)
      .filter(([k]) => k !== 'unknown')
      .reduce((sum, [, v]) => sum + v, 0);
    if (el('vr-dbg-sum-total')) el('vr-dbg-sum-total').textContent = response.totalIntercepted;
    if (el('vr-dbg-sum-ok')) el('vr-dbg-sum-ok').textContent = okCount;
    if (el('vr-dbg-sum-fail')) el('vr-dbg-sum-fail').textContent = failCount;

    // Connection
    const dot = document.getElementById('vr-dbg-conn-dot');
    const connText = document.getElementById('vr-dbg-conn-text');
    if (dot && connText) {
      const connected = response.totalIntercepted > 0;
      dot.className = `vr-dbg-dot ${connected ? 'green' : 'red'}`;
      connText.textContent = connected ? 'Active' : 'Waiting';
    }

    // Classified breakdown as list
    const listEl = document.getElementById('vr-dbg-classified-list');
    if (listEl) {
      listEl.innerHTML = '';
      const entries = Object.entries(classifiedCounts).sort((a, b) => b[1] - a[1]);
      for (const [type, count] of entries) {
        const li = document.createElement('li');
        li.className = type === 'unknown' ? 'type-unknown' : '';
        li.innerHTML = `<span>${type === 'unknown' ? 'UNKNOWN' : type}</span><span>${count}</span>`;
        listEl.appendChild(li);
      }
      if (entries.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No messages yet';
        li.style.color = '#666';
        listEl.appendChild(li);
      }
    }

    // Pipeline stats
    if (el('vr-dbg-storage')) el('vr-dbg-storage').textContent = response.storageWrites;

    // Raw capture
    if (el('vr-dbg-raw-count')) {
      el('vr-dbg-raw-count').textContent = response.rawCaptureEnabled
        ? `${response.rawCaptureCount} captured`
        : 'off';
    }

    // MPS
    if (el('vr-dbg-mps')) {
      el('vr-dbg-mps').textContent = (response.messagesPerSecond ?? 0).toFixed(1);
    }

    // Sync raw capture toggle state
    const rawBtn = document.getElementById('vr-dbg-raw-toggle');
    if (rawBtn) rawBtn.classList.toggle('active', response.rawCaptureEnabled);
  });

  // Fetch logs
  chrome.runtime.sendMessage({ type: 'getDebugLogs' }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    const container = document.getElementById('vr-dbg-logs');
    if (!container) return;

    container.innerHTML = '';
    const logs = response.logs || [];
    for (const entry of logs.slice(-20)) {
      const div = document.createElement('div');
      div.className = `vr-dbg-log-entry vr-log-${LEVEL_NAMES[entry.level] || 'INFO'}`;
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const dataStr = entry.data !== undefined ? ` ${JSON.stringify(entry.data).slice(0, 120)}` : '';
      div.textContent = `${time} [${entry.logger}] ${entry.message}${dataStr}`;
      container.appendChild(div);
    }
    container.scrollTop = container.scrollHeight;
  });
}

export function toggleDebugPanel() {
  if (visible) {
    hidePanel();
  } else {
    showPanel();
  }
}
