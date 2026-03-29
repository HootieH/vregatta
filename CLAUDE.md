# vRegatta — Virtual Regatta Sailing Tools

## Project
- Chrome Extension (Manifest V3) that intercepts VR Offshore API traffic for sailing analytics
- Working dir: `/Users/hootie/projects/virtual-regatta-tools`

## Stack
- ES modules (no TypeScript)
- Build: esbuild
- Test: vitest
- Lint: eslint (flat config)
- Target: Chrome 120+

## Commands
- `npm run build` — bundle src/ → dist/
- `npm run dev` — watch mode
- `npm test` — run vitest
- `npm run lint` — eslint src/

## Structure
- `src/` — source code
- `src/background.js` — extension service worker
- `src/content.js` — content script (injects interceptor)
- `src/injected.js` — runs in page context, monkey-patches fetch
- `src/popup/` — popup UI (html, css, js)
- `src/classifier.js` — classifies intercepted API messages by type
- `src/schemas/` — data normalizers (boat, competitor, race, wind, action)
- `src/storage/` — IndexedDB persistence layer
- `src/state/` — live state manager
- `dist/` — build output, load this in chrome://extensions

## Loading in Chrome
1. Run `npm run build` to produce `dist/`
2. Open `chrome://extensions`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** → select the `dist/` directory
5. Navigate to https://play.offshore.virtualregatta.com/ — the extension activates automatically

## Source Directory Guide
- `src/injected.js` — runs in page context, monkey-patches fetch to capture VR API traffic
- `src/content.js` — content script, injects interceptor and relays messages to background
- `src/background.js` — service worker, orchestrates classify → normalize → store → state
- `src/classifier.js` — classifies intercepted API messages by type (boat, fleet, race, etc.)
- `src/schemas/` — data normalizers that extract consistent fields from raw API responses
- `src/storage/` — IndexedDB persistence layer (save, query, export, cleanup)
- `src/state/` — LiveState class: in-memory state, event detection, VMG, distance
- `src/popup/` — popup dashboard UI (HTML, CSS, JS)
- `src/__tests__/` — vitest test suite including unit, integration, and pipeline tests

## Data Flow
```
VR Game page
  → injected.js (fetch monkey-patch, captures API responses)
  → content.js (relays via window.postMessage → chrome.runtime.sendMessage)
  → background.js (classify → normalize → save to IndexedDB + update LiveState)
  → popup.js (requests snapshot from background, renders dashboard)
```

## Conventions
- No TypeScript, plain JS with ES modules
- Keep functions pure where possible
- All normalizers return null for invalid input
- Tests go in `src/__tests__/`
- Dark nautical theme for UI (#1a1a2e background)
