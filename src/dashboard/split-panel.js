const STORAGE_KEY = 'vregatta-split-ratio';

export function initSplitPanel() {
  const panels = document.getElementById('panels');
  const splitter = document.getElementById('splitter');
  if (!panels || !splitter) return;

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const ratio = parseFloat(saved);
    if (ratio > 0.1 && ratio < 0.9) {
      applyRatio(panels, ratio);
    }
  }

  let dragging = false;

  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = panels.getBoundingClientRect();
    const isVertical = window.innerWidth <= 800;

    let ratio;
    if (isVertical) {
      ratio = (e.clientY - rect.top) / rect.height;
    } else {
      ratio = (e.clientX - rect.left) / rect.width;
    }

    ratio = Math.max(0.15, Math.min(0.85, ratio));
    applyRatio(panels, ratio);
    localStorage.setItem(STORAGE_KEY, String(ratio));
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.dispatchEvent(new Event('resize'));
  });
}

function applyRatio(panels, ratio) {
  const isVertical = window.innerWidth <= 800;
  if (isVertical) {
    panels.style.gridTemplateRows = `${ratio}fr 4px ${1 - ratio}fr`;
  } else {
    panels.style.gridTemplateColumns = `${ratio}fr 4px ${1 - ratio}fr`;
  }
}
