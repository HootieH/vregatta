# vRegatta

Virtual Regatta sailing companion — captures live race data and gives you analytics to improve your sailing.

## Quickstart (60 seconds)

```bash
git clone https://github.com/HootieH/vregatta.git
cd vregatta
./setup.sh
```

Then:
1. Open `chrome://extensions` in Chrome
2. Flip **Developer mode** on (top-right toggle)
3. Click **Load unpacked** -> pick the `dist/` folder
4. Go to [Virtual Regatta Offshore](https://www.virtualregatta.com/en/offshore-game/) and join a race
5. Click the vRegatta icon -> **Open Dashboard**

That's it. The extension captures data automatically.

## What You Get

- **2D Map + 3D Globe** — live boat position, track, competitors, side-by-side
- **Polar Chart** — interactive speed diagram for all 7 sails, animated current angle needle, bestVMG markers
- **Wind Tools** — compass rose, wind arrows, TWS/TWD history, wind shift detection (veering/backing)
- **Routing** — click map to set waypoint, get recommended heading/sail/VMG, laylines, tack/gybe alerts
- **Performance** — efficiency gauge (0-100%), actual vs optimal speed trace, wrong sail warnings, tack/gybe scoring
- **Telemetry** — pipeline stats, raw API capture for debugging, fail-visible error reporting

## Commands

```bash
npm run build    # Bundle src/ -> dist/
npm run dev      # Watch mode with auto-rebuild
npm test         # Run 178 tests
npm run lint     # ESLint
```

## How It Works

The extension passively intercepts Virtual Regatta's API traffic via a fetch monkey-patch. It classifies, normalizes, and stores race data in IndexedDB. The dashboard visualizes everything in real-time.

```
VR Game -> injected.js (fetch patch) -> content.js (relay) -> background.js (pipeline) -> dashboard
```

No data is sent anywhere — everything stays local in your browser.
