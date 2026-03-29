const STORAGE_KEY = 'vregatta-onboarded';

const STEPS = [
  {
    title: 'Welcome',
    body: 'Welcome to vRegatta — your Virtual Regatta sailing companion. This tool captures live race data and gives you powerful analytics to improve your sailing.',
  },
  {
    title: 'Getting Started',
    body: `<ol>
<li>Open Virtual Regatta Offshore in Chrome</li>
<li>Start or join a race</li>
<li>vRegatta automatically captures data — look for the green badge on the extension icon</li>
<li>Click <strong>Open Dashboard</strong> in the popup to launch the full view</li>
</ol>`,
  },
  {
    title: 'Dashboard Panels',
    body: `Use the tab bar to switch between views:
<ul>
<li><strong>Map</strong> — 2D Leaflet map with boat track, competitors, wind arrows</li>
<li><strong>Globe</strong> — 3D view of your race on a globe</li>
<li><strong>Polar</strong> — Interactive polar chart showing boat speed at every angle</li>
<li><strong>Perf</strong> — Real-time performance analysis vs theoretical optimal</li>
</ul>`,
  },
  {
    title: 'Wind Tools',
    body: `<ul>
<li><strong>Compass Rose</strong> (top-right of map) — Shows current wind direction and speed</li>
<li><strong>Wind Arrows</strong> — Toggle wind overlay to see wind at your position</li>
<li><strong>Wind Strip</strong> (below HUD) — TWS/TWD history with wind shift detection</li>
<li><strong>Wind Shifts</strong> — Marked with arrows showing veering (clockwise) or backing (counter-clockwise)</li>
</ul>`,
  },
  {
    title: 'Routing',
    body: `<ul>
<li>Click the <strong>Route</strong> button to enable routing mode</li>
<li>Click anywhere on the map to set a waypoint</li>
<li>See recommended heading, sail, and VMG to waypoint</li>
<li><strong>Laylines</strong> show optimal tack/gybe angles (green=starboard, red=port)</li>
<li>Watch for <strong>TACK NOW / GYBE NOW</strong> alerts near laylines</li>
</ul>`,
  },
  {
    title: 'Performance',
    body: `<ul>
<li><strong>Efficiency Gauge</strong> — Your current VMG efficiency (0-100%)</li>
<li><strong>Speed Trace</strong> — Your actual speed vs theoretical optimal over time</li>
<li><strong>Sail Indicator</strong> — Warns you if you're on the wrong sail</li>
<li><strong>Session Stats</strong> — Average efficiency, tack/gybe scores, distance sailed</li>
</ul>`,
  },
  {
    title: 'Polar Chart',
    body: `<ul>
<li>Shows speed curves for all 7 sails at current wind speed</li>
<li><strong>White envelope</strong> = maximum speed at each angle</li>
<li><strong>Animated needle</strong> = your current TWA and speed</li>
<li><strong>BestVMG markers</strong> = optimal upwind/downwind angles</li>
<li>Use TWS buttons to see how polars change at different wind speeds</li>
</ul>`,
  },
  {
    title: 'Debugging',
    body: `If something isn't working:
<ul>
<li>Check the <strong>Debug</strong> section in the popup for pipeline stats</li>
<li>Red badge on icon = pipeline failures (click to inspect)</li>
<li>Raw capture auto-enables on failures — download captured data for analysis</li>
<li>The debug overlay on the game page shows live message flow</li>
</ul>`,
  },
];

function createModal() {
  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.className = 'onboarding-overlay';

  const card = document.createElement('div');
  card.className = 'onboarding-card';

  card.innerHTML = `
    <div class="onboarding-header">
      <span class="onboarding-step-label"></span>
      <button class="onboarding-skip">Skip</button>
    </div>
    <h2 class="onboarding-title"></h2>
    <div class="onboarding-body"></div>
    <div class="onboarding-dots"></div>
    <div class="onboarding-nav">
      <button class="onboarding-prev">Previous</button>
      <button class="onboarding-next">Next</button>
    </div>
  `;

  overlay.appendChild(card);
  return overlay;
}

export function initOnboarding() {
  let currentStep = 0;
  let overlay = null;
  let visible = false;

  function render() {
    if (!overlay) return;
    const step = STEPS[currentStep];
    overlay.querySelector('.onboarding-step-label').textContent =
      `Step ${currentStep + 1} of ${STEPS.length}`;
    overlay.querySelector('.onboarding-title').textContent = step.title;
    overlay.querySelector('.onboarding-body').innerHTML = step.body;

    // Dots
    const dotsEl = overlay.querySelector('.onboarding-dots');
    dotsEl.innerHTML = STEPS.map((_, i) =>
      `<span class="onboarding-dot${i === currentStep ? ' active' : ''}"></span>`,
    ).join('');

    // Nav button states
    const prevBtn = overlay.querySelector('.onboarding-prev');
    const nextBtn = overlay.querySelector('.onboarding-next');
    prevBtn.disabled = currentStep === 0;
    nextBtn.textContent = currentStep === STEPS.length - 1 ? 'Done' : 'Next';
  }

  function show() {
    if (visible) return;
    currentStep = 0;
    if (!overlay) {
      overlay = createModal();
      document.body.appendChild(overlay);

      overlay.querySelector('.onboarding-skip').addEventListener('click', hide);
      overlay.querySelector('.onboarding-prev').addEventListener('click', () => {
        if (currentStep > 0) { currentStep--; render(); }
      });
      overlay.querySelector('.onboarding-next').addEventListener('click', () => {
        if (currentStep < STEPS.length - 1) { currentStep++; render(); }
        else { hide(); }
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hide();
      });
    }
    render();
    overlay.classList.add('visible');
    visible = true;
  }

  function hide() {
    if (!visible || !overlay) return;
    overlay.classList.remove('visible');
    visible = false;
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
  }

  function isVisible() {
    return visible;
  }

  function showIfFirstVisit() {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) { show(); }
    } catch { /* ignore */ }
  }

  return { show, hide, isVisible, showIfFirstVisit };
}
