# vRegatta — Virtual Regatta Sailing Tools Suite

## Vision
A suite of mini-tools that augment Virtual Regatta to help us become better sailors — race analytics, routing, strategy, wind analysis, and more.

## Architecture
Chrome Extension (data layer) → Local storage/API → Tool modules (analysis, routing, UI)

## Reference: VR Offshore API Domains
- `prod.vro.sparks.virtualregatta.com` — game server (auth, actions, boat state)
- `vro-api-client.prod.virtualregatta.com` — boat info, wind file index
- `vro-api-ranking.prod.virtualregatta.com` — rankings
- `static.virtualregatta.com/winds/live/` — wind data (binary .wnd)

## Reference: Known Data Fields
- **Boat:** pos.lat, pos.lon, speed, heading, twa, tws, twd, sail (1=Jib,2=Spi,3=Staysail,4=LightJib,5=Code0,6=HeavyGenn,7=LightGenn), stamina, distanceToEnd, aground, lastCalcDate, bestVmg, badSail, isRegulated
- **Competitor:** pos, speed, heading, twa, tws, displayName, country, sail, rank, dtl, dtf, playerType
- **Race:** legId, legNum, name, polarId, startDate, endDate, playerCount
- **Actions:** type (heading/sail/prog/wp), value, autoTwa, timestamp

## Reference: Key GitHub Repos
- ITYC Dashboard: `7killer/ITYC-Dashboard` — fetch interception Chrome extension
- VR Autopilot: `Jude-A/virtual-regatta-autopilot` — cleanest API endpoint docs
- VRPolarsChart: `toxcct/VRPolarsChart` — polars visualization

---

# Phase 1: Project Init & Git

**Goal:** Empty project with package.json, git, .gitignore, CLAUDE.md. Nothing else.

| Task | What to do | Files created/modified |
|------|-----------|----------------------|
| 1.1 | Run `git init` in `/Users/hootie/projects/virtual-regatta-tools` | `.git/` |
| 1.2 | Create `.gitignore` with: `node_modules/`, `dist/`, `.DS_Store`, `*.crx`, `*.pem`, `*.zip` | `.gitignore` |
| 1.3 | Run `npm init -y`, set name=`vregatta`, description=`Virtual Regatta sailing tools suite` | `package.json` |
| 1.4 | Create `CLAUDE.md` with: project name, working dir, that this is a Chrome Extension (Manifest V3), use ES modules, no TypeScript yet, build with esbuild, test with vitest | `CLAUDE.md` |

**Done when:** `git status` shows clean repo with 3 tracked files.

---

# Phase 2: Build Tooling

**Goal:** esbuild bundles src/ into dist/, vitest runs tests, eslint lints.

| Task | What to do | Files |
|------|-----------|-------|
| 2.1 | `npm install --save-dev esbuild` | `package.json`, `package-lock.json` |
| 2.2 | Create `esbuild.config.mjs` — entry points: `src/background.js`, `src/content.js`, `src/popup/popup.js` → `dist/`, bundle, format esm, target chrome120 | `esbuild.config.mjs` |
| 2.3 | Create placeholder files: `src/background.js` (just `console.log('bg')`), `src/content.js` (just `console.log('content')`), `src/popup/popup.js` (just `console.log('popup')`) | 3 files |
| 2.4 | Add `scripts.build` = `node esbuild.config.mjs` to package.json. Run `npm run build`. Verify `dist/` has 3 .js files | `package.json` |
| 2.5 | `npm install --save-dev vitest` | `package.json` |
| 2.6 | Add `scripts.test` = `vitest run` to package.json | `package.json` |
| 2.7 | Create `src/__tests__/smoke.test.js` — single test: `expect(true).toBe(true)`. Run `npm test`, verify pass | `src/__tests__/smoke.test.js` |
| 2.8 | `npm install --save-dev eslint @eslint/js` | `package.json` |
| 2.9 | Create `eslint.config.js` — flat config, browser globals, es2022 | `eslint.config.js` |
| 2.10 | Add `scripts.lint` = `eslint src/` to package.json. Run `npm run lint`, verify pass | `package.json` |
| 2.11 | Add `scripts.dev` = `node esbuild.config.mjs --watch` (add watch flag handling in esbuild config) | `esbuild.config.mjs`, `package.json` |

**Done when:** `npm run build && npm test && npm run lint` all pass.

---

# Phase 3: Extension Manifest & Shell

**Goal:** Loadable Chrome extension that shows a popup and logs to console. No real functionality yet.

| Task | What to do | Files |
|------|-----------|-------|
| 3.1 | Create `src/manifest.json` — Manifest V3, name "vRegatta", version "0.1.0", permissions: `storage`, `scripting`, `activeTab`. Service worker: `background.js`. Content scripts: `content.js` matching `*://play.offshore.virtualregatta.com/*`, `all_frames: true`. Default popup: `popup/popup.html` | `src/manifest.json` |
| 3.2 | Create `src/popup/popup.html` — minimal HTML: title "vRegatta", a `<div id="status">` saying "Not connected", a `<div id="data">` empty. Link `popup.css` and `popup.js` | `src/popup/popup.html` |
| 3.3 | Create `src/popup/popup.css` — body width 320px, dark theme (bg #1a1a2e, text #e0e0e0), monospace font, basic padding | `src/popup/popup.css` |
| 3.4 | Update `src/popup/popup.js` — on DOMContentLoaded, send `{type: 'getStatus'}` to background, display response in `#status` | `src/popup/popup.js` |
| 3.5 | Update `src/background.js` — listen for `{type: 'getStatus'}` messages, respond with `{connected: false, race: null}` | `src/background.js` |
| 3.6 | Update `src/content.js` — log "vRegatta content script loaded" to console, send `{type: 'contentReady'}` to background | `src/content.js` |
| 3.7 | Update esbuild config to copy `src/manifest.json`, `src/popup/popup.html`, `src/popup/popup.css` to `dist/` (use esbuild copy plugin or a post-build cp) | `esbuild.config.mjs` |
| 3.8 | Add placeholder icon: create `src/icons/` dir, generate a simple 128x128 SVG sailboat icon, reference in manifest | `src/icons/icon128.svg`, `src/manifest.json` |
| 3.9 | Run `npm run build`, verify `dist/` contains: `manifest.json`, `background.js`, `content.js`, `popup/popup.html`, `popup/popup.css`, `popup/popup.js`, `icons/` | verify only |

**Done when:** `chrome://extensions` → Load unpacked → select `dist/` → extension loads, popup opens showing "Not connected".

---

# Phase 4: Fetch Interceptor (Injected Script)

**Goal:** Content script injects a script into the page that monkey-patches `fetch`, captures VR API traffic, and relays it back.

| Task | What to do | Files |
|------|-----------|-------|
| 4.1 | Create `src/injected.js` — this runs in the PAGE context (not extension). Save reference to `window.fetch`. Replace `window.fetch` with a wrapper that: calls original fetch, clones the response, reads clone as text, posts `{type: 'vr-intercepted', url, method, body: responseText}` via `window.postMessage` | `src/injected.js` |
| 4.2 | In `src/injected.js` — add URL filter: only intercept if URL contains one of the 4 VR API domains. Let all other fetches pass through silently (no postMessage) | `src/injected.js` |
| 4.3 | In `src/injected.js` — wrap the interception in try/catch so a parse failure never breaks the game's actual fetch | `src/injected.js` |
| 4.4 | In `src/injected.js` — before posting, strip fields named `password`, `userName`, `email` from parsed JSON body | `src/injected.js` |
| 4.5 | Update `src/content.js` — on load, create a `<script>` element with `src=chrome.runtime.getURL('injected.js')`, append to `document.documentElement`. This injects the interceptor into the page context | `src/content.js` |
| 4.6 | Update `src/content.js` — listen for `window.postMessage` events with `data.type === 'vr-intercepted'`, forward them to background via `chrome.runtime.sendMessage({type: 'intercepted', url: data.url, body: data.body})` | `src/content.js` |
| 4.7 | Update `src/manifest.json` — add `injected.js` to `web_accessible_resources` for the VR offshore origin | `src/manifest.json` |
| 4.8 | Update esbuild config to bundle `src/injected.js` as an additional entry point → `dist/injected.js` (IIFE format, not ESM — it runs in page context) | `esbuild.config.mjs` |
| 4.9 | Update `src/background.js` — listen for `{type: 'intercepted'}` messages, log `url` and first 200 chars of `body` to console | `src/background.js` |
| 4.10 | Write test: `src/__tests__/injected.test.js` — mock `window.fetch`, import interceptor logic, verify it calls original fetch, verify postMessage is called for VR URLs, verify postMessage is NOT called for non-VR URLs | `src/__tests__/injected.test.js` |
| 4.11 | Write test: `src/__tests__/injected-sanitize.test.js` — verify password/email fields are stripped from intercepted body | test file |
| 4.12 | Run `npm test && npm run build`, verify all pass | verify only |

**Done when:** Extension loaded in Chrome, open VR Offshore, background console shows intercepted API calls with URLs and truncated bodies.

---

# Phase 5: Message Classifier

**Goal:** Background script classifies intercepted messages by type based on URL and payload content.

| Task | What to do | Files |
|------|-----------|-------|
| 5.1 | Create `src/classifier.js` — export function `classify(url, body)` that returns `{type, data}`. Type is one of: `boat`, `fleet`, `wind`, `ranking`, `action`, `race`, `auth`, `unknown` | `src/classifier.js` |
| 5.2 | Classification rules (implement in `classify`): if URL contains `AuthenticationRequest` → `auth`. If response has `scriptData` with boat fields (pos, speed, heading) → `boat`. If response has `scriptData.rankings` → `ranking`. If URL contains `winds/live` → `wind`. If request had `Game_AddBoatAction` → `action`. If response has array of competitor objects → `fleet`. If response has `currentLegs` → `race`. Else → `unknown` | `src/classifier.js` |
| 5.3 | Write test: `src/__tests__/classifier.test.js` — one test per classification type with minimal mock payloads. Test `unknown` fallback | test file |
| 5.4 | Update `src/background.js` — import `classify`, use it on intercepted messages, log classified type | `src/background.js` |
| 5.5 | Run `npm test`, verify all classifier tests pass | verify only |

**Done when:** `classify()` correctly categorizes all 8 message types with tests passing.

---

# Phase 6: Data Schemas

**Goal:** Pure data schema definitions with validation helpers. No storage yet.

| Task | What to do | Files |
|------|-----------|-------|
| 6.1 | Create `src/schemas/boat-state.js` — export `normalizeBoatState(rawData)` that extracts: `{lat, lon, speed, heading, twa, tws, twd, sail, stamina, distanceToEnd, aground, lastCalcDate, isRegulated, timestamp}` from raw API response. Return null for missing required fields (lat, lon) | schema file |
| 6.2 | Create `src/schemas/competitor.js` — export `normalizeCompetitor(rawData)` that extracts: `{id, name, lat, lon, speed, heading, twa, sail, rank, dtf, dtl, country, playerType}` | schema file |
| 6.3 | Create `src/schemas/race-meta.js` — export `normalizeRaceMeta(rawData)` that extracts: `{raceId, legNum, name, polarId, startDate, endDate, playerCount}` | schema file |
| 6.4 | Create `src/schemas/wind-snapshot.js` — export `normalizeWindSnapshot(rawData)` that extracts: `{timestamp, fileUrl, gridResolution}` | schema file |
| 6.5 | Create `src/schemas/action-log.js` — export `normalizeAction(rawData)` that extracts: `{timestamp, type, value, autoTwa}` | schema file |
| 6.6 | Create `src/schemas/index.js` — re-export all normalizers | index file |
| 6.7 | Write tests: `src/__tests__/schemas.test.js` — for each normalizer: test with full data, test with minimal data, test with garbage (returns null or defaults) | test file |
| 6.8 | Run `npm test`, verify all pass | verify only |

**Done when:** All 5 normalizer functions exist, handle edge cases, tests pass.

---

# Phase 7: IndexedDB Storage Layer

**Goal:** Persistent storage via IndexedDB with write, read, query, export, and cleanup.

| Task | What to do | Files |
|------|-----------|-------|
| 7.1 | Create `src/storage/idb.js` — export `openDB()` that opens IndexedDB database `vregatta` with object stores: `boatStates` (keyPath: auto-increment, index on `timestamp` and `raceId`), `competitors` (keyPath: auto, index on `raceId+timestamp`), `races` (keyPath: `raceId`), `actions` (keyPath: auto, index on `timestamp`), `windSnapshots` (keyPath: auto, index on `timestamp`) | storage file |
| 7.2 | In `src/storage/idb.js` — export `saveBoatState(db, boatState)` — puts normalized boat state into `boatStates` store | storage file |
| 7.3 | In `src/storage/idb.js` — export `saveCompetitors(db, raceId, timestamp, competitors[])` — batch puts into `competitors` store | storage file |
| 7.4 | In `src/storage/idb.js` — export `saveRace(db, raceMeta)` — puts into `races` store (upsert by raceId) | storage file |
| 7.5 | In `src/storage/idb.js` — export `saveAction(db, action)` — puts into `actions` store | storage file |
| 7.6 | In `src/storage/idb.js` — export `saveWindSnapshot(db, snapshot)` — puts into `windSnapshots` store | storage file |
| 7.7 | In `src/storage/idb.js` — export `getBoatHistory(db, raceId, limit?)` — returns boat states for a race, ordered by timestamp desc, optional limit | storage file |
| 7.8 | In `src/storage/idb.js` — export `exportRace(db, raceId)` — returns JSON object with all data for a race: `{race, boatStates[], competitors[], actions[], windSnapshots[]}` | storage file |
| 7.9 | In `src/storage/idb.js` — export `cleanup(db, maxAgeDays)` — delete all records older than maxAgeDays across all stores | storage file |
| 7.10 | Write tests: `src/__tests__/storage.test.js` — use `fake-indexeddb` (npm install --save-dev fake-indexeddb). Test: open db, save+read boat state, save+read competitors, export race, cleanup old data | test file |
| 7.11 | Run `npm test`, verify all pass | verify only |

**Done when:** Full IndexedDB CRUD works, tested with fake-indexeddb.

---

# Phase 8: Live State Manager

**Goal:** In-memory state tracker that diffs updates, detects events (tacks, gybes, sail changes), computes derived metrics.

| Task | What to do | Files |
|------|-----------|-------|
| 8.1 | Create `src/state/live-state.js` — export class `LiveState` with properties: `boat` (current BoatState or null), `race` (current RaceMeta or null), `competitors` (Map of id → Competitor), `history` (last 20 boat states in memory) | state file |
| 8.2 | Add method `LiveState.updateBoat(newState)` — sets `this.boat`, pushes to `this.history` (cap at 20), returns `{changed: true/false}` | state file |
| 8.3 | Add method `LiveState.detectEvents(prevState, newState)` — returns array of events: `{type: 'tack', timestamp}` if TWA sign flipped, `{type: 'gybe', timestamp}` if TWA sign flipped and abs(TWA) > 90, `{type: 'sailChange', from, to, timestamp}` if sail changed | state file |
| 8.4 | Add method `LiveState.computeVMG(boatState)` — returns `{vmg, component}` where VMG = speed * cos(TWA in radians). Component is 'upwind' if abs(TWA) < 90, else 'downwind' | state file |
| 8.5 | Add method `LiveState.computeDistanceSailed(prev, curr)` — haversine distance between two lat/lon positions, in nautical miles | state file |
| 8.6 | Add method `LiveState.getSnapshot()` — returns serializable object: `{boat, race, competitorCount, rank, vmg, events: last5events}` for the popup to consume | state file |
| 8.7 | Write tests: `src/__tests__/live-state.test.js` — test updateBoat, detectEvents (tack, gybe, sail change, no change), computeVMG, computeDistanceSailed (known lat/lon pair), getSnapshot | test file |
| 8.8 | Run `npm test`, verify all pass | verify only |

**Done when:** LiveState class fully functional with all methods tested.

---

# Phase 9: Wire It All Together (Background)

**Goal:** Background service worker receives intercepted data, classifies it, normalizes it, stores it, updates live state.

| Task | What to do | Files |
|------|-----------|-------|
| 9.1 | Update `src/background.js` — import `classify` from classifier, all normalizers from schemas, `openDB`+save functions from storage, `LiveState` from state | `src/background.js` |
| 9.2 | In background.js — on startup: `const db = await openDB()`, `const state = new LiveState()` | `src/background.js` |
| 9.3 | In background.js — on `{type: 'intercepted'}` message: parse body as JSON, call `classify(url, parsed)`, switch on classified type | `src/background.js` |
| 9.4 | Handle `boat` type: normalize with `normalizeBoatState`, save to db with `saveBoatState`, update live state with `state.updateBoat`, detect events | `src/background.js` |
| 9.5 | Handle `fleet` type: normalize each competitor, save batch to db, update `state.competitors` | `src/background.js` |
| 9.6 | Handle `race` type: normalize, save to db, set `state.race` | `src/background.js` |
| 9.7 | Handle `action` type: normalize, save to db | `src/background.js` |
| 9.8 | Handle `wind` type: normalize, save to db | `src/background.js` |
| 9.9 | Handle `getStatus` message from popup: respond with `state.getSnapshot()` | `src/background.js` |
| 9.10 | Handle `exportRace` message from popup: call `exportRace(db, raceId)`, respond with JSON | `src/background.js` |
| 9.11 | Run `npm run build`, verify no import errors | verify only |

**Done when:** Background script compiles, handles all message types, stores data, maintains live state.

---

# Phase 10: Popup Dashboard UI

**Goal:** Popup shows live boat data, race info, VMG, rank, recent actions, export button.

| Task | What to do | Files |
|------|-----------|-------|
| 10.1 | Update `src/popup/popup.html` — add sections: `#connection-status`, `#race-info`, `#boat-data`, `#vmg`, `#rank`, `#actions`, `#controls` (export button) | popup HTML |
| 10.2 | Update `src/popup/popup.css` — style each section: status bar at top (green=connected, red=not), data in a compact grid layout, monospace numbers, dark nautical theme | popup CSS |
| 10.3 | Update `src/popup/popup.js` — on open, send `{type: 'getStatus'}` to background, populate all sections from snapshot response | popup JS |
| 10.4 | In popup.js — format boat data: lat/lon to 4 decimal places, speed to 1 decimal, heading/TWA as integers with degree symbol, sail as name (map number to string) | popup JS |
| 10.5 | In popup.js — VMG section: show current VMG, show best VMG if available, color green if within 95% of best, yellow if 80-95%, red if below 80% | popup JS |
| 10.6 | In popup.js — actions section: show last 5 actions as a list with timestamps (relative: "2m ago") and type+value | popup JS |
| 10.7 | In popup.js — export button: on click, send `{type: 'exportRace'}` to background, receive JSON, trigger download as `vregatta-{raceName}-{date}.json` | popup JS |
| 10.8 | In popup.js — auto-refresh: set interval to re-fetch status every 10 seconds while popup is open | popup JS |
| 10.9 | Run `npm run build`, verify popup assets in dist/ | verify only |

**Done when:** Popup opens, displays all data sections, export works.

---

# Phase 11: Integration Testing & Polish

**Goal:** End-to-end tests with mock data, cleanup, ready to use.

| Task | What to do | Files |
|------|-----------|-------|
| 11.1 | Create `src/__tests__/mocks/vr-responses.js` — export realistic mock responses for each API endpoint type (boat, fleet, race, action, wind, auth). Based on actual VR API response shapes from the reference repos | mock file |
| 11.2 | Write `src/__tests__/integration.test.js` — feed mock responses through classify → normalize → verify correct schema output for each type | test file |
| 11.3 | Write `src/__tests__/pipeline.test.js` — feed mock responses through full pipeline: classify → normalize → save to fake-indexeddb → read back → verify data integrity | test file |
| 11.4 | Run full test suite, fix any failures | verify only |
| 11.5 | Run `npm run lint`, fix any lint errors | verify only |
| 11.6 | Update CLAUDE.md with: how to build, test, lint, load in Chrome, what each src/ file does | `CLAUDE.md` |
| 11.7 | Run final `npm run build && npm test && npm run lint` — all green | verify only |

**Done when:** All tests pass, lint clean, extension loads in Chrome and captures VR Offshore data.

---

# Phase 12: Polar Engine

**Goal:** Parse VR polar data, interpolate boat speeds, calculate bestVMG for any TWS/TWA/sail/options combo.

**Reference:** Polars come from VR API events `Meta_GetPolar` / `Race_SelectorData` in `scriptData.polar`. Format is JSON with `tws[]` and `twa[]` breakpoint arrays and `sail[].speed[][]` 2D matrices. Speed at arbitrary TWS/TWA requires bilinear interpolation.

| Task | What to do | Files |
|------|-----------|-------|
| 12.1 | Create `src/polars/interpolation.js` — export `fractionStep(value, steps)` that finds which two breakpoints a value falls between, returns `{index, fraction}`. Export `bilinear(x, y, f00, f10, f01, f11)` for 2D interpolation | `src/polars/interpolation.js` |
| 12.2 | Create `src/polars/foiling.js` — export `foilingFactor(options, tws, twa, foilConfig)` that returns speed multiplier (1.0 if no foils). Foil zone defined by twaMin/twaMax/twsMin/twsMax with smooth merge transitions | `src/polars/foiling.js` |
| 12.3 | Create `src/polars/speed.js` — export `getBoatSpeed(polar, tws, twa, sailId, options)` that uses fractionStep + bilinear interpolation on `sail.speed[][]` matrix, applies foiling + hull + globalSpeedRatio. Returns speed in knots | `src/polars/speed.js` |
| 12.4 | Create `src/polars/best-vmg.js` — export `bestVMG(tws, polar, options, currentSailId)` that sweeps TWA 25-180 in 0.1° steps across all available sails, returns `{vmgUp, twaUp, sailUp, vmgDown, twaDown, sailDown, bspeed, btwa, sailBSpeed}` | `src/polars/best-vmg.js` |
| 12.5 | Create `src/polars/polar-table.js` — export `generatePolarTable(polar, options, twsList)` that builds a full lookup table: for each TWS, for each TWA, find best sail and speed. Returns array of `{tws, entries: [{twa, speed, sail}]}` | `src/polars/polar-table.js` |
| 12.6 | Create `src/polars/index.js` — re-export all polar functions | `src/polars/index.js` |
| 12.7 | Update classifier to detect `Meta_GetPolar` and `Race_SelectorData` responses → type `polar` | `src/classifier.js` |
| 12.8 | Create `src/schemas/polar.js` — export `normalizePolar(rawData)` that extracts the polar object from API response `scriptData` | `src/schemas/polar.js` |
| 12.9 | Update `src/schemas/index.js` to re-export normalizePolar | `src/schemas/index.js` |
| 12.10 | Update storage: add `polars` object store (keyPath: `_id`) to IndexedDB, add `savePolar(db, polar)` and `getPolar(db, polarId)` | `src/storage/idb.js` |
| 12.11 | Update background.js to handle `polar` classified type: normalize → save to IndexedDB | `src/background.js` |
| 12.12 | Write tests: `src/__tests__/interpolation.test.js` — fractionStep edge cases, bilinear known values | test |
| 12.13 | Write tests: `src/__tests__/foiling.test.js` — in-zone, out-of-zone, merge transitions | test |
| 12.14 | Write tests: `src/__tests__/speed.test.js` — known polar data, verify speed at specific TWS/TWA | test |
| 12.15 | Write tests: `src/__tests__/best-vmg.test.js` — verify upwind/downwind VMG angles and speeds | test |
| 12.16 | Create `src/__tests__/mocks/mock-polar.js` — realistic IMOCA-style polar JSON for all tests | mock |
| 12.17 | Run `npm test && npm run lint && npm run build` — all green | verify |

**Done when:** Can compute boat speed and bestVMG from polar data at any TWS/TWA with all options.

---

# Phase 13: Full Dashboard with 2D + 3D Simultaneous Views

**Goal:** Full-page dashboard (chrome extension new tab or side panel) showing 2D map and 3D globe side-by-side, both updating live from intercepted data.

**Libraries:** Leaflet (2D map), Three.js + globe (3D view), split-panel layout.

| Task | What to do | Files |
|------|-----------|-------|
| 13.1 | Install dependencies: `npm install leaflet three` | `package.json` |
| 13.2 | Create `src/dashboard/dashboard.html` — full page, split layout: left panel = 2D map, right panel = 3D globe, bottom bar = boat stats. Resizable splitter between panels | `src/dashboard/dashboard.html` |
| 13.3 | Create `src/dashboard/dashboard.css` — full viewport layout, dark theme matching popup, CSS grid with resizable panels, overlay controls | `src/dashboard/dashboard.css` |
| 13.4 | Create `src/dashboard/split-panel.js` — draggable splitter between 2D and 3D panels, saves ratio to localStorage | `src/dashboard/split-panel.js` |
| 13.5 | Create `src/dashboard/map-2d.js` — Leaflet map: dark tile layer (CartoDB dark_matter), boat marker with heading arrow, track polyline (breadcrumb trail of positions), competitor markers (different color), wind barbs overlay if data available | `src/dashboard/map-2d.js` |
| 13.6 | Create `src/dashboard/globe-3d.js` — Three.js 3D globe: earth sphere with texture, boat position as a 3D marker, track line on globe surface, camera orbits around boat position, competitor markers | `src/dashboard/globe-3d.js` |
| 13.7 | Create `src/dashboard/boat-hud.js` — bottom HUD overlay showing: speed, heading, TWA, TWS, sail, VMG, bestVMG comparison, stamina bar, DTF | `src/dashboard/boat-hud.js` |
| 13.8 | Create `src/dashboard/polar-overlay.js` — mini polar chart overlay (canvas): shows current polar at current TWS, highlights current TWA angle, marks bestVMG angles. Can toggle visibility | `src/dashboard/polar-overlay.js` |
| 13.9 | Create `src/dashboard/data-bridge.js` — connects to background.js via chrome.runtime, polls getStatus every 5s, updates all dashboard components (map, globe, HUD) via event emitter pattern | `src/dashboard/data-bridge.js` |
| 13.10 | Create `src/dashboard/dashboard.js` — main entry: initializes split panel, map, globe, HUD, polar overlay, data bridge. Coordinates updates | `src/dashboard/dashboard.js` |
| 13.11 | Synchronized views: when user pans/zooms 2D map, update 3D camera to match region (and vice versa). Link boat centering between both views | `src/dashboard/sync-views.js` |
| 13.12 | Update `src/manifest.json` — add dashboard page as a chrome extension page (accessible via toolbar button or keyboard shortcut) | `src/manifest.json` |
| 13.13 | Update esbuild config to bundle `src/dashboard/dashboard.js` and copy HTML/CSS to `dist/dashboard/` | `esbuild.config.mjs` |
| 13.14 | Update popup.js — add "Open Dashboard" button that opens the full dashboard page via `chrome.tabs.create({url: chrome.runtime.getURL('dashboard/dashboard.html')})` | `src/popup/popup.js` |
| 13.15 | Run `npm run build && npm run lint` — verify dashboard loads | verify |

**Done when:** Dashboard opens in full tab showing 2D Leaflet map on left + 3D Three.js globe on right, both showing boat position updating live.

---

# Phase 14: Polar Chart Visualization

**Goal:** Interactive polar diagram on dashboard — shows speed curves for all sails, current angle, bestVMG.

| Task | What to do | Files |
|------|-----------|-------|
| 14.1 | Expand `src/dashboard/polar-overlay.js` into full interactive polar chart: Canvas-based half-polar (0-180°), color-coded speed curves per sail, TWS selector | polar overlay |
| 14.2 | Show current boat angle as animated needle on polar | polar overlay |
| 14.3 | Show bestVMG upwind/downwind angles as highlighted arcs | polar overlay |
| 14.4 | Show foiling zone as shaded region | polar overlay |
| 14.5 | Click TWA on polar → show speed/sail details tooltip | polar overlay |
| 14.6 | Toggle between overlay mode (on top of map) and panel mode (replaces 3D or in separate panel) | dashboard layout |

**Done when:** Interactive polar chart visualizing all sail speeds with current angle and bestVMG.

---

# Future Phases (not yet broken down)
- **Phase 15:** Wind Visualization & Forecast Overlay
- **Phase 16:** Routing & Waypoint Optimizer
- **Phase 17:** Race Strategy Trainer
- **Phase 18:** Performance Tracker & Analytics
- **Phase 19:** Inshore Support

---

---

# Phase 19: Inshore Live Data Pipeline

**Goal:** Wire decoded Colyseus data (headings, positions, state) into the live dashboard so Inshore races show real-time boat positions, tracks, and instruments.

| Task | What to do |
|------|-----------|
| 19.1 | Create `src/colyseus/inshore-pipeline.js` — takes decoded state (from state-decoder), extracts per-boat data into normalized format: `{boats: [{id, heading, x, y, rateOfTurn, slot}], tick, raw}` |
| 19.2 | Update background.js `ws-state` handler: decompress + decode state, normalize via pipeline, update LiveState with Inshore boat data |
| 19.3 | Update LiveState to track Inshore boats (Map of slot → boat state), expose via getSnapshot as `inshoreBaots` |
| 19.4 | Update data-bridge to pass Inshore data to dashboard components |
| 19.5 | Update map-2d to render Inshore boat positions from decoded x,y (coordinate mapping TBD — may need to determine Inshore coordinate system) |
| 19.6 | Tests for inshore-pipeline normalizer |

---

# Phase 20: MFD Instrument Dashboard

**Goal:** Redesign dashboard as a race boat Multi-Function Display (MFD) — individual instrument panels for speed, heading, wind, VMG, polar, each in their own dockable/resizable cell. Like a B&G/Garmin cockpit display.

| Task | What to do |
|------|-----------|
| 20.1 | Create `src/dashboard/mfd-layout.js` — CSS Grid-based MFD layout manager. User-configurable grid (e.g., 3x2 or 4x2). Each cell hosts one instrument. Drag to rearrange. Save layout to localStorage |
| 20.2 | Create `src/dashboard/instruments/speed-display.js` — large digital speed readout (like B&G Vulcan). Current speed in huge font, max speed small below, unit label. Green/yellow/red based on polar efficiency |
| 20.3 | Create `src/dashboard/instruments/heading-display.js` — compass tape or digital heading. Shows heading + COG. Rotating compass ring with boat-up orientation |
| 20.4 | Create `src/dashboard/instruments/wind-display.js` — circular wind instrument. True wind angle/speed on outer ring, apparent on inner. Wind direction arrow. Like a B&G wind display |
| 20.5 | Create `src/dashboard/instruments/vmg-display.js` — VMG gauge with target VMG comparison. Shows % of target. Up/down arrows for upwind/downwind |
| 20.6 | Create `src/dashboard/instruments/polar-mini.js` — compact polar diagram showing current angle on the polar curve. Highlight optimal angle |
| 20.7 | Create `src/dashboard/instruments/track-display.js` — mini map showing boat track, heading projection, laylines. Compact version of the main map |
| 20.8 | Create `src/dashboard/instruments/start-timer-display.js` — countdown timer instrument for race starts |
| 20.9 | Create `src/dashboard/instruments/stats-display.js` — session stats: distance, avg speed, tacks, gybes, efficiency |
| 20.10 | Update dashboard.html/css — new "MFD" view mode alongside existing Map/Globe/Polar/Perf. MFD shows configurable grid of instruments |
| 20.11 | Dark cockpit theme: black background, green/amber/red instrument colors, high contrast, designed for glancing at quickly while racing |
| 20.12 | 2D map + 3D globe both visible simultaneously as MFD cells (not just split panel — each is an instrument in the grid) |

---

# Phase 21: Track & Trajectory Enhancement

**Goal:** Make boat tracks and projected trajectories more visible and useful for learning.

| Task | What to do |
|------|-----------|
| 21.1 | Color-code track by speed (green=fast, red=slow relative to polar) |
| 21.2 | Color-code track by VMG efficiency (green=optimal, red=poor) |
| 21.3 | Show tack/gybe markers on track with quality scores |
| 21.4 | Heading projection line with time marks (where will I be in 1min, 5min, 10min) |
| 21.5 | Ghost track: overlay optimal track computed from polars for comparison |
| 21.6 | Track breadcrumbs with wind barbs at each position (shows wind field over time) |

---

## Current Execution State
- **Phases 1-18 + telemetry + Colyseus decoder:** COMPLETE (2026-03-29)
- **247 tests passing**, 22 test files, lint clean, build clean
- **Active:** Phase 19 (Inshore pipeline) + Phase 20 (MFD instruments)
- Colyseus protocol decoded: headings, positions, server ticks from live Inshore races
- Extension live at https://github.com/HootieH/vregatta
