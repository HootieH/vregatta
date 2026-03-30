import { initSplitPanel } from './split-panel.js';
import { init2DMap } from './map-2d.js';
import { init3DGlobe } from './globe-3d.js';
import { initHUD } from './boat-hud.js';
import { createDataBridge } from './data-bridge.js';
import { syncViews } from './sync-views.js';
import { initPolarChart } from './polar-chart.js';
import { initWindOverlay } from './wind-overlay.js';
import { initCompassRose } from './compass-rose.js';
import { initWindHistory } from './wind-history.js';
import { initWindStrip } from './wind-strip.js';
import { initPerfChart } from './perf-chart.js';
import { initPerfHistory } from './perf-history.js';
import { computeSessionStats } from '../analytics/session-stats.js';
import { initRouteOverlay } from './route-overlay.js';
import { initRoutePanel } from './route-panel.js';
import { adviseBestHeading } from '../routing/heading-advisor.js';
import { computeLaylines } from '../routing/layline.js';
import { computeIsochrone } from '../routing/simple-isochrone.js';
import { initOnboarding } from './onboarding.js';
import { initMFDLayout } from './mfd-layout.js';
import { bestVMG } from '../polars/best-vmg.js';
import { computeSpeedEfficiency } from '../analytics/performance.js';

const map = init2DMap('map-2d');
const globe = init3DGlobe('globe-3d');
const hud = initHUD();
const polarChart = initPolarChart('polar-chart');
const perfChart = initPerfChart('perf-chart');
const perfHistory = initPerfHistory('perf-history');
const mfdLayout = initMFDLayout('mfd-container');

initSplitPanel();

const sync = syncViews(map, globe);

// Wind visualization
const leafletMap = map ? map.getLeafletMap() : null;
const threeScene = globe ? globe.getScene() : null;
const windOverlay = initWindOverlay(map, globe, leafletMap, threeScene);
const compassRose = initCompassRose('compass-rose');
const windHistory = initWindHistory();
const windStrip = initWindStrip('wind-strip');

// Route advisor
const routeOverlay = initRouteOverlay(map, globe);
const routePanel = initRoutePanel('route-panel');

// Wind strip collapsible toggle
const windStripToggle = document.getElementById('wind-strip-toggle');
const windStripContainer = document.getElementById('wind-strip');
if (windStripToggle && windStripContainer) {
  windStripToggle.addEventListener('click', () => {
    const collapsed = windStripContainer.classList.toggle('collapsed');
    windStripToggle.innerHTML = collapsed ? 'Wind History &#9650;' : 'Wind History &#9660;';
  });
}

// Wind overlay toggle button
const windToggleBtn = document.getElementById('wind-toggle');
if (windToggleBtn && windOverlay) {
  windToggleBtn.addEventListener('click', () => {
    const nowVisible = windOverlay.toggle();
    windToggleBtn.classList.toggle('active', nowVisible);
  });
}

// Route toggle button
const routeToggleBtn = document.getElementById('route-toggle');
const routePanelEl = document.getElementById('route-panel');
let routingActive = false;

if (routeToggleBtn) {
  routeToggleBtn.addEventListener('click', () => {
    routingActive = !routingActive;
    routeToggleBtn.classList.toggle('active', routingActive);
    if (routePanelEl) routePanelEl.classList.toggle('visible', routingActive);
    if (routeOverlay) routeOverlay.toggle();
  });
}

// Map click handler for waypoint setting
if (leafletMap) {
  leafletMap.on('click', (e) => {
    if (!routingActive || !routeOverlay) return;
    routeOverlay.setWaypoint(e.latlng.lat, e.latlng.lng);
    updateRouteAdvice();
  });
}

// Route panel clear handler
if (routePanel) {
  routePanel.setClearHandler(() => {
    if (routeOverlay) routeOverlay.clearWaypoint();
  });
}

function updateRouteAdvice() {
  if (!routeOverlay || !routePanel) return;
  const wp = routeOverlay.getWaypoint();
  if (!wp) {
    routePanel.update(null);
    return;
  }

  const snapshot = bridge.getLastSnapshot?.();
  if (!snapshot?.boat || !cachedPolar) {
    routePanel.update({ error: 'Need polar data for routing' });
    return;
  }

  const { lat, lon, tws, twd } = snapshot.boat;
  if (lat == null || lon == null || tws == null || twd == null) {
    routePanel.update({ error: 'Need position and wind data' });
    return;
  }

  const boat = { lat, lon, tws, twd };
  const opts = snapshot.race?.options || [];

  const advice = adviseBestHeading(boat, wp, cachedPolar, opts);
  if (advice.error) {
    routePanel.update(advice);
    routeOverlay.update(null);
    return;
  }

  const laylines = computeLaylines(boat, wp, cachedPolar, opts);
  const isochrone = computeIsochrone(boat, advice.bearingToWP, tws, twd, cachedPolar, opts, 12);

  const routeData = {
    boatLat: lat,
    boatLon: lon,
    waypoint: wp,
    advice,
    laylines,
    isochrone,
  };

  routePanel.update({ ...advice, onLayline: laylines.onLayline });
  routeOverlay.update(routeData);
}

// Panel visibility state
const activePanels = new Set(['map-2d', 'globe-3d']);

function updatePanelLayout() {
  const mapEl = document.getElementById('map-2d');
  const globeEl = document.getElementById('globe-3d');
  const polarEl = document.getElementById('polar-chart');
  const perfEl = document.getElementById('perf-chart');
  const mfdEl = document.getElementById('mfd');
  const splitter = document.getElementById('splitter');
  const panels = document.getElementById('panels');
  const hudEl = document.getElementById('hud');

  const showMap = activePanels.has('map-2d');
  const showGlobe = activePanels.has('globe-3d');
  const showPolar = activePanels.has('polar-chart');
  const showPerf = activePanels.has('perf-chart');
  const showMfd = activePanels.has('mfd');

  // Get visible panels (max 2)
  const visible = [];
  if (showMap) visible.push(mapEl);
  if (showGlobe) visible.push(globeEl);
  if (showPolar) visible.push(polarEl);
  if (showPerf) visible.push(perfEl);
  if (showMfd) visible.push(mfdEl);

  // Hide all first
  mapEl.style.display = 'none';
  globeEl.style.display = 'none';
  polarEl.style.display = 'none';
  perfEl.style.display = 'none';
  mfdEl.style.display = 'none';
  splitter.style.display = 'none';

  // Hide HUD when MFD is active (instruments replace it)
  if (hudEl) {
    hudEl.style.display = showMfd ? 'none' : '';
  }
  document.body.classList.toggle('mfd-active', showMfd);

  if (visible.length === 0) {
    panels.style.gridTemplateColumns = '1fr';
    return;
  }

  if (visible.length === 1) {
    visible[0].style.display = '';
    panels.style.gridTemplateColumns = '1fr';
  } else {
    visible[0].style.display = '';
    visible[1].style.display = '';
    splitter.style.display = '';
    panels.style.gridTemplateColumns = '1fr 4px 1fr';

    // Ensure correct DOM order: first panel, splitter, second panel
    panels.innerHTML = '';
    panels.appendChild(visible[0]);
    panels.appendChild(splitter);
    panels.appendChild(visible[1]);
  }

  // Trigger resize after layout change
  setTimeout(() => {
    if (map && showMap) map.resize();
    if (globe && showGlobe) globe.resize();
    if (polarChart && showPolar) polarChart.resize();
    if (perfChart && showPerf) perfChart.resize();
    if (mfdLayout && showMfd) mfdLayout.resize();
  }, 50);
}

// Wire panel tab buttons
document.querySelectorAll('.panel-tab[data-panel]').forEach((tab) => {
  tab.addEventListener('click', () => {
    const panel = tab.dataset.panel;

    if (activePanels.has(panel)) {
      // Don't allow removing last panel
      if (activePanels.size <= 1) return;
      activePanels.delete(panel);
      tab.classList.remove('active');
    } else {
      // Max 2 panels visible — if already 2, remove the oldest one that isn't being toggled
      if (activePanels.size >= 2) {
        // Remove first entry that isn't the one we're adding
        for (const existing of activePanels) {
          if (existing !== panel) {
            activePanels.delete(existing);
            document.querySelector(`.panel-tab[data-panel="${existing}"]`).classList.remove('active');
            break;
          }
        }
      }
      activePanels.add(panel);
      tab.classList.add('active');
    }

    updatePanelLayout();
  });
});

// Polar data cache
let cachedPolar = null;

const bridge = createDataBridge((snapshot, positionHistory) => {
  sync.onBoatUpdate(snapshot, positionHistory);
  if (hud) hud.update(snapshot);

  // Update polar chart if visible and data available
  if (polarChart && cachedPolar && snapshot?.boat) {
    const opts = [];
    // Derive options from race info if available
    if (snapshot.race) {
      if (snapshot.race.options) {
        opts.push(...snapshot.race.options);
      }
    }
    polarChart.update(
      cachedPolar,
      snapshot.boat.tws ?? null,
      snapshot.boat.twa ?? null,
      snapshot.boat.sail ?? null,
      opts,
    );
  }

  // Performance chart update
  if (perfChart && cachedPolar && snapshot?.boat) {
    const opts = snapshot.race?.options || [];
    perfChart.update(snapshot.boat, cachedPolar, opts);
    bridge.addPerfSnapshot(snapshot.boat, cachedPolar, opts);
  }

  // MFD instrument updates
  if (mfdLayout && activePanels.has('mfd') && snapshot) {
    // Enrich snapshot with computed data for instruments
    const enriched = { ...snapshot };
    if (cachedPolar && snapshot.boat) {
      const opts = snapshot.race?.options || [];
      enriched._polar = cachedPolar;
      enriched._options = opts;
      try {
        const best = bestVMG(snapshot.boat.tws, cachedPolar, opts);
        enriched._bestVMG = best;
        enriched._vmgAngles = { twaUp: best.twaUp, twaDown: best.twaDown };
      } catch { /* no polar data for this TWS */ }
      enriched._polarEff = computeSpeedEfficiency(snapshot.boat, cachedPolar, opts);
    }
    mfdLayout.updateAll(enriched);
  }

  // Wind updates
  if (snapshot?.boat) {
    const { tws, twd } = snapshot.boat;

    // Feed compass rose
    if (compassRose) {
      compassRose.update(twd ?? null, tws ?? null);
    }

    // Feed wind history
    if (tws != null && twd != null) {
      windHistory.addPoint(tws, twd, snapshot.boat.timestamp ?? Date.now());
    }

    // Feed wind overlay
    if (windOverlay) {
      windOverlay.update(snapshot, []);
    }

    // Feed wind strip
    if (windStrip) {
      windStrip.update(windHistory);
    }

    // Update route advice with latest data
    if (routingActive && routeOverlay?.getWaypoint()) {
      updateRouteAdvice();
    }
  }
});

bridge.start();

// Periodic session stats recompute (every 30s)
setInterval(() => {
  if (!cachedPolar || !perfChart) return;
  const perfData = bridge.getPerformanceHistory();
  const snapshot = bridge.getLastSnapshot?.();
  const events = snapshot?.events || [];
  const opts = snapshot?.race?.options || [];
  const stats = computeSessionStats(perfData.history, events, cachedPolar, opts);
  perfChart.updateHistory(stats);
  if (perfHistory) perfHistory.update(stats, perfData.efficiencyHistory);
}, 30000);

// Fetch polar data
bridge.fetchPolar().then((polar) => {
  if (polar) {
    cachedPolar = polar;
  }
});

// Onboarding
const onboarding = initOnboarding();
onboarding.showIfFirstVisit();

const helpBtn = document.getElementById('help-btn');
if (helpBtn) {
  helpBtn.addEventListener('click', () => {
    onboarding.show();
  });
}

window.addEventListener('resize', () => {
  if (map) map.resize();
  if (globe) globe.resize();
  if (polarChart) polarChart.resize();
  if (perfChart) perfChart.resize();
  if (mfdLayout) mfdLayout.resize();
});
