import { init as initSpeed } from './instruments/speed-display.js';
import { init as initHeading } from './instruments/heading-display.js';
import { init as initWind } from './instruments/wind-display.js';
import { init as initVMG } from './instruments/vmg-display.js';
import { init as initPolarMini } from './instruments/polar-mini.js';
import { init as initTrack } from './instruments/track-display.js';
import { init as initStartTimer } from './instruments/start-timer-display.js';
import { init as initStats } from './instruments/stats-display.js';

const STORAGE_KEY = 'vregatta-mfd-layout';

const INSTRUMENT_TYPES = {
  speed: { label: 'Speed', init: initSpeed },
  heading: { label: 'Heading', init: initHeading },
  wind: { label: 'Wind', init: initWind },
  vmg: { label: 'VMG', init: initVMG },
  'polar-mini': { label: 'Polar', init: initPolarMini },
  track: { label: 'Track', init: initTrack },
  'start-timer': { label: 'Timer', init: initStartTimer },
  stats: { label: 'Stats', init: initStats },
};

const GRID_PRESETS = [
  { cols: 2, rows: 2, label: '2x2' },
  { cols: 3, rows: 2, label: '3x2' },
  { cols: 4, rows: 2, label: '4x2' },
  { cols: 2, rows: 3, label: '2x3' },
  { cols: 3, rows: 3, label: '3x3' },
];

const DEFAULT_INSTRUMENTS = ['speed', 'heading', 'wind', 'vmg', 'polar-mini', 'track'];

export function initMFDLayout(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  let cols = 3;
  let rows = 2;
  let cellInstruments = [...DEFAULT_INSTRUMENTS];
  const instruments = new Map(); // cellIndex -> instrument instance

  // Load saved config
  loadConfig();

  // Build DOM
  const toolbar = document.createElement('div');
  toolbar.className = 'mfd-toolbar';
  container.appendChild(toolbar);

  const grid = document.createElement('div');
  grid.className = 'mfd-grid';
  container.appendChild(grid);

  buildToolbar();
  buildGrid();

  function loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const cfg = JSON.parse(saved);
        if (cfg.cols) cols = cfg.cols;
        if (cfg.rows) rows = cfg.rows;
        if (Array.isArray(cfg.instruments)) cellInstruments = cfg.instruments;
      }
    } catch { /* use defaults */ }
  }

  function saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        cols, rows, instruments: cellInstruments,
      }));
    } catch { /* storage full */ }
  }

  function buildToolbar() {
    toolbar.innerHTML = '';

    for (const preset of GRID_PRESETS) {
      const btn = document.createElement('button');
      btn.className = 'mfd-grid-btn' + (preset.cols === cols && preset.rows === rows ? ' active' : '');
      btn.textContent = preset.label;
      btn.addEventListener('click', () => {
        setGrid(preset.cols, preset.rows);
      });
      toolbar.appendChild(btn);
    }
  }

  function buildGrid() {
    grid.innerHTML = '';
    instruments.clear();

    const totalCells = cols * rows;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    // Ensure cellInstruments array matches grid size
    while (cellInstruments.length < totalCells) {
      cellInstruments.push('speed');
    }

    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement('div');
      cell.className = 'mfd-cell';

      // Cell header with instrument selector
      const header = document.createElement('div');
      header.className = 'mfd-cell-header';

      const select = document.createElement('select');
      select.className = 'mfd-cell-select';
      for (const [type, info] of Object.entries(INSTRUMENT_TYPES)) {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = info.label;
        if (type === cellInstruments[i]) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        setInstrument(i, select.value);
      });
      header.appendChild(select);
      cell.appendChild(header);

      // Instrument content area
      const content = document.createElement('div');
      content.className = 'mfd-cell-inner';
      content.id = `mfd-cell-${i}`;
      cell.appendChild(content);

      grid.appendChild(cell);

      // Initialize instrument
      const type = cellInstruments[i];
      const factory = INSTRUMENT_TYPES[type];
      if (factory) {
        const inst = factory.init(`mfd-cell-${i}`);
        if (inst) instruments.set(i, inst);
      }
    }
  }

  function setGrid(newCols, newRows) {
    cols = newCols;
    rows = newRows;
    buildToolbar();
    buildGrid();
    saveConfig();
  }

  function setInstrument(cellIndex, type) {
    cellInstruments[cellIndex] = type;

    // Clear and reinitialize cell
    const content = document.getElementById(`mfd-cell-${cellIndex}`);
    if (content) {
      content.innerHTML = '';
      content.className = 'mfd-cell-inner';
      const factory = INSTRUMENT_TYPES[type];
      if (factory) {
        const inst = factory.init(`mfd-cell-${cellIndex}`);
        if (inst) instruments.set(cellIndex, inst);
      }
    }
    saveConfig();
  }

  function updateAll(snapshot) {
    for (const inst of instruments.values()) {
      if (inst && inst.update) inst.update(snapshot);
    }
  }

  function resize() {
    for (const inst of instruments.values()) {
      if (inst && inst.resize) inst.resize();
    }
  }

  function getConfig() {
    return { cols, rows, instruments: [...cellInstruments] };
  }

  return { resize, setGrid, getConfig, setInstrument, updateAll };
}
