/**
 * Dashboard capture system — screenshot + state export for debugging.
 *
 * Captures the Inshore dashboard as PNG via html2canvas,
 * plus a JSON state dump of all instruments and fleet data.
 * Supports single capture and timed sequence capture.
 */

import html2canvas from 'html2canvas';

const MAX_SEQUENCE_FRAMES = 30;

/**
 * Initialize the capture system.
 * @returns {{ captureScreenshot, captureState, captureBundle, startSequence, stopSequence }}
 */
export function initCapture() {
  let sequenceTimer = null;
  let sequenceFrames = [];

  /**
   * Capture screenshot of #inshore-app as a PNG blob.
   * Falls back to null with a warning if html2canvas fails.
   */
  async function captureScreenshot() {
    const target = document.getElementById('inshore-app');
    if (!target) {
      console.warn('[capture] #inshore-app not found');
      return null;
    }

    try {
      const canvas = await html2canvas(target, {
        backgroundColor: '#0a0a1a',
        scale: 1,
        logging: false,
        useCORS: true,
        allowTaint: true,
        // Leaflet tiles may not render; we capture what we can
        onclone: (clonedDoc) => {
          // Ensure map canvas elements are included if present
          const origCanvases = target.querySelectorAll('canvas');
          const clonedCanvases = clonedDoc.getElementById('inshore-app')?.querySelectorAll('canvas');
          if (origCanvases && clonedCanvases) {
            origCanvases.forEach((origCanvas, i) => {
              if (clonedCanvases[i]) {
                try {
                  const ctx = clonedCanvases[i].getContext('2d');
                  ctx.drawImage(origCanvas, 0, 0);
                } catch {
                  // Cross-origin canvas — skip
                }
              }
            });
          }
        },
      });

      return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      });
    } catch (err) {
      console.error('[capture] html2canvas failed:', err);
      return null;
    }
  }

  /**
   * Capture a low-quality data URL for sequence storage (saves memory).
   */
  async function captureScreenshotDataUrl() {
    const target = document.getElementById('inshore-app');
    if (!target) return null;

    try {
      const canvas = await html2canvas(target, {
        backgroundColor: '#0a0a1a',
        scale: 0.75, // Lower res for sequence frames
        logging: false,
        useCORS: true,
        allowTaint: true,
        onclone: (clonedDoc) => {
          const origCanvases = target.querySelectorAll('canvas');
          const clonedCanvases = clonedDoc.getElementById('inshore-app')?.querySelectorAll('canvas');
          if (origCanvases && clonedCanvases) {
            origCanvases.forEach((origCanvas, i) => {
              if (clonedCanvases[i]) {
                try {
                  const ctx = clonedCanvases[i].getContext('2d');
                  ctx.drawImage(origCanvas, 0, 0);
                } catch { /* skip */ }
              }
            });
          }
        },
      });

      // JPEG at 60% quality for smaller size
      return canvas.toDataURL('image/jpeg', 0.6);
    } catch (err) {
      console.error('[capture] screenshot data URL failed:', err);
      return null;
    }
  }

  /**
   * Gather current state from the extension background.
   * Returns a structured JSON object.
   */
  async function captureState() {
    const snapshot = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'getStatus' }, (resp) => {
        if (chrome.runtime.lastError || !resp) {
          resolve(null);
        } else {
          resolve(resp);
        }
      });
    });

    const player = snapshot?.inshorePlayerBoat;
    const boats = snapshot?.inshoreBoats || [];

    const instrumentReadings = {
      heading: player?.heading != null ? Math.round(player.heading) : null,
      speed: player?.speedKnots != null ? player.speedKnots : null,
      twa: player?.twa != null ? Math.round(player.twa) : null,
      twd: snapshot?.inshoreWindDirection != null ? Math.round(snapshot.inshoreWindDirection) : null,
      pointOfSail: player?.pointOfSail || null,
      vmg: player?.vmg != null ? player.vmg : null,
      lap: snapshot?.inshoreCurrentLap ?? null,
      timer: snapshot?.inshoreRaceTimerSeconds ?? null,
    };

    const fleetSummary = {
      total: snapshot?.inshoreAccStats?.totalSeen ?? boats.length,
      visible: snapshot?.inshoreAccStats?.currentlyVisible ?? boats.length,
      boats: boats.slice(0, 18).map((b) => ({
        slot: b.slot,
        name: b.name || null,
        heading: b.heading != null ? Math.round(b.heading) : null,
        speed: b.speedKnots != null ? Number(b.speedKnots.toFixed(1)) : null,
        x: b.x,
        y: b.y,
        isPlayer: b.isPlayer || false,
      })),
    };

    // Compute map bounds from boat positions
    let mapBounds = null;
    if (boats.length > 0) {
      const xs = boats.map((b) => b.x).filter((v) => v != null);
      const ys = boats.map((b) => b.y).filter((v) => v != null);
      if (xs.length > 0 && ys.length > 0) {
        mapBounds = {
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
        };
      }
    }

    // Extension version
    const manifest = chrome.runtime.getManifest?.();
    const version = manifest?.version ?? 'unknown';

    return {
      timestamp: new Date().toISOString(),
      version,
      snapshot: snapshot || {},
      instrumentReadings,
      fleetSummary,
      mapBounds,
      telemetry: {
        raceId: snapshot?.inshoreRaceId ?? null,
        tick: snapshot?.inshoreTick ?? null,
        windSpeed: snapshot?.inshoreWindSpeed ?? null,
        accStats: snapshot?.inshoreAccStats ?? null,
      },
    };
  }

  /**
   * Download a blob/string as a file.
   */
  function downloadFile(content, filename, mimeType) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Capture screenshot + state and download both files.
   */
  async function captureBundle() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const prefix = `vregatta-capture-${ts}`;

    const [screenshot, state] = await Promise.all([
      captureScreenshot(),
      captureState(),
    ]);

    if (screenshot) {
      downloadFile(screenshot, `${prefix}.png`, 'image/png');
    } else {
      console.warn('[capture] Screenshot failed — downloading state only');
      // Add failure note to state
      state._captureNote = 'Screenshot capture failed (html2canvas error). State-only export.';
    }

    downloadFile(JSON.stringify(state, null, 2), `${prefix}.json`, 'application/json');

    return { screenshot: !!screenshot, state: true };
  }

  /**
   * Start sequence capture at the given interval.
   */
  function startSequence(intervalMs = 2000) {
    if (sequenceTimer) {
      console.warn('[capture] Sequence already running');
      return;
    }

    sequenceFrames = [];

    async function captureFrame() {
      if (sequenceFrames.length >= MAX_SEQUENCE_FRAMES) {
        stopSequence();
        return;
      }

      const [dataUrl, state] = await Promise.all([
        captureScreenshotDataUrl(),
        captureState(),
      ]);

      sequenceFrames.push({
        index: sequenceFrames.length,
        timestamp: new Date().toISOString(),
        imageDataUrl: dataUrl,
        instrumentReadings: state.instrumentReadings,
        fleetSummary: state.fleetSummary,
        mapBounds: state.mapBounds,
      });

      // Dispatch event for UI to update frame count
      window.dispatchEvent(new CustomEvent('capture-frame', {
        detail: { frameCount: sequenceFrames.length, maxFrames: MAX_SEQUENCE_FRAMES },
      }));

      if (sequenceFrames.length >= MAX_SEQUENCE_FRAMES) {
        stopSequence();
      }
    }

    // Capture first frame immediately
    captureFrame();
    sequenceTimer = setInterval(captureFrame, intervalMs);

    window.dispatchEvent(new CustomEvent('capture-sequence-start'));
  }

  /**
   * Stop sequence capture and export as self-contained HTML viewer.
   */
  function stopSequence() {
    if (sequenceTimer) {
      clearInterval(sequenceTimer);
      sequenceTimer = null;
    }

    window.dispatchEvent(new CustomEvent('capture-sequence-stop'));

    if (sequenceFrames.length === 0) {
      console.warn('[capture] No frames captured');
      return;
    }

    exportSequenceViewer();
  }

  /**
   * Build and download a self-contained HTML slideshow of captured frames.
   */
  function exportSequenceViewer() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const framesJson = JSON.stringify(sequenceFrames);

    const html = buildViewerHtml(framesJson, sequenceFrames.length, ts);

    downloadFile(html, `vregatta-sequence-${ts}.html`, 'text/html');
    sequenceFrames = [];
  }

  /**
   * Get current sequence frame count (for UI).
   */
  function getSequenceFrameCount() {
    return sequenceFrames.length;
  }

  /**
   * Whether a sequence is currently recording.
   */
  function isRecording() {
    return sequenceTimer !== null;
  }

  return {
    captureScreenshot,
    captureState,
    captureBundle,
    startSequence,
    stopSequence,
    getSequenceFrameCount,
    isRecording,
  };
}

/**
 * Build the self-contained HTML viewer for a capture sequence.
 */
function buildViewerHtml(framesJson, frameCount, timestamp) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>vRegatta Capture — ${timestamp}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0a1a;
    color: #e0e0e0;
    font-family: 'Courier New', monospace;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .header {
    background: #111;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #2a2a4a;
    flex-shrink: 0;
  }
  .header-title {
    font-size: 14px;
    color: #3a86ff;
    font-weight: bold;
  }
  .header-info {
    font-size: 11px;
    color: #666;
  }
  .main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
  .frame-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #080818;
    position: relative;
    overflow: hidden;
  }
  .frame-area img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .frame-area .no-image {
    color: #555;
    font-size: 14px;
    text-align: center;
  }
  .sidebar {
    width: 260px;
    background: rgba(13, 13, 36, 0.98);
    border-left: 2px solid #1a2a4a;
    padding: 12px;
    overflow-y: auto;
    flex-shrink: 0;
  }
  .sidebar h3 {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #3a86ff;
    margin-bottom: 8px;
    border-bottom: 1px solid #2a2a4a;
    padding-bottom: 4px;
  }
  .reading {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    font-size: 12px;
  }
  .reading-label { color: #888; }
  .reading-value { color: #00ff41; font-weight: bold; }
  .fleet-boat {
    font-size: 11px;
    color: #aaa;
    padding: 2px 0;
    border-bottom: 1px solid #111;
  }
  .fleet-boat.player { color: #3a86ff; font-weight: bold; }
  .timestamp {
    font-size: 10px;
    color: #555;
    margin-top: 8px;
    text-align: center;
  }
  .controls {
    background: #111;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    border-top: 1px solid #2a2a4a;
    flex-shrink: 0;
  }
  .controls button {
    background: transparent;
    border: 1px solid #3a86ff;
    color: #3a86ff;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    padding: 6px 16px;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.15s, color 0.15s;
  }
  .controls button:hover {
    background: #3a86ff;
    color: #fff;
  }
  .controls button:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .controls button:disabled:hover {
    background: transparent;
    color: #3a86ff;
  }
  .frame-counter {
    font-size: 13px;
    color: #ccc;
    min-width: 100px;
    text-align: center;
  }
  .play-btn.playing {
    border-color: #ff4444;
    color: #ff4444;
  }
  .play-btn.playing:hover {
    background: #ff4444;
    color: #fff;
  }
</style>
</head>
<body>
<div class="header">
  <div class="header-title">vRegatta Capture Viewer</div>
  <div class="header-info">${frameCount} frames — ${timestamp}</div>
</div>
<div class="main">
  <div class="frame-area">
    <img id="frame-img" src="" alt="Capture frame">
    <div id="no-image" class="no-image" style="display:none">No screenshot for this frame</div>
  </div>
  <div class="sidebar" id="sidebar"></div>
</div>
<div class="controls">
  <button id="btn-prev" title="Previous frame">&laquo; Prev</button>
  <button id="btn-play" class="play-btn" title="Auto-play">Play</button>
  <span class="frame-counter" id="frame-counter">1 / ${frameCount}</span>
  <button id="btn-next" title="Next frame">Next &raquo;</button>
</div>

<script>
const frames = ${framesJson};
let currentIndex = 0;
let playing = false;
let playTimer = null;

const imgEl = document.getElementById('frame-img');
const noImgEl = document.getElementById('no-image');
const sidebarEl = document.getElementById('sidebar');
const counterEl = document.getElementById('frame-counter');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnPlay = document.getElementById('btn-play');

function showFrame(idx) {
  if (idx < 0 || idx >= frames.length) return;
  currentIndex = idx;
  const frame = frames[idx];

  if (frame.imageDataUrl) {
    imgEl.src = frame.imageDataUrl;
    imgEl.style.display = 'block';
    noImgEl.style.display = 'none';
  } else {
    imgEl.style.display = 'none';
    noImgEl.style.display = 'block';
  }

  counterEl.textContent = (idx + 1) + ' / ' + frames.length;
  btnPrev.disabled = idx === 0;
  btnNext.disabled = idx === frames.length - 1;

  // Sidebar
  let html = '<h3>Instruments</h3>';
  const r = frame.instrumentReadings || {};
  const readings = [
    ['HDG', r.heading != null ? r.heading + '\\u00b0' : '---'],
    ['SPD', r.speed != null ? r.speed.toFixed(1) + ' kn' : '---'],
    ['TWA', r.twa != null ? r.twa + '\\u00b0' : '---'],
    ['TWD', r.twd != null ? r.twd + '\\u00b0' : '---'],
    ['Sail', r.pointOfSail || '---'],
    ['VMG', r.vmg != null ? r.vmg.toFixed(2) : '---'],
    ['Lap', r.lap != null ? String(r.lap) : '---'],
    ['Timer', r.timer != null ? Math.floor(r.timer/60) + ':' + String(r.timer%60).padStart(2,'0') : '---'],
  ];
  for (const [label, value] of readings) {
    html += '<div class="reading"><span class="reading-label">' + label + '</span><span class="reading-value">' + value + '</span></div>';
  }

  if (frame.fleetSummary) {
    html += '<h3 style="margin-top:12px">Fleet (' + frame.fleetSummary.visible + '/' + frame.fleetSummary.total + ')</h3>';
    for (const b of (frame.fleetSummary.boats || []).slice(0, 12)) {
      const cls = b.isPlayer ? 'fleet-boat player' : 'fleet-boat';
      const name = b.isPlayer ? 'YOU' : (b.name || '#' + b.slot);
      const spd = b.speed != null ? ' ' + b.speed + 'kn' : '';
      const hdg = b.heading != null ? ' ' + b.heading + '\\u00b0' : '';
      html += '<div class="' + cls + '">' + name + spd + hdg + '</div>';
    }
  }

  html += '<div class="timestamp">' + (frame.timestamp || '') + '</div>';
  sidebarEl.innerHTML = html;
}

btnPrev.addEventListener('click', () => showFrame(currentIndex - 1));
btnNext.addEventListener('click', () => showFrame(currentIndex + 1));
btnPlay.addEventListener('click', () => {
  if (playing) {
    clearInterval(playTimer);
    playing = false;
    btnPlay.textContent = 'Play';
    btnPlay.classList.remove('playing');
  } else {
    playing = true;
    btnPlay.textContent = 'Stop';
    btnPlay.classList.add('playing');
    playTimer = setInterval(() => {
      if (currentIndex < frames.length - 1) {
        showFrame(currentIndex + 1);
      } else {
        showFrame(0); // loop
      }
    }, 1500);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') showFrame(currentIndex - 1);
  else if (e.key === 'ArrowRight') showFrame(currentIndex + 1);
  else if (e.key === ' ') { e.preventDefault(); btnPlay.click(); }
});

if (frames.length > 0) showFrame(0);
</script>
</body>
</html>`;
}
