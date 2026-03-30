/**
 * Unity WebGL Memory Scanner for VR Inshore course mark discovery.
 *
 * EXPERIMENTAL — scans Unity's WASM heap (HEAPF32/HEAP16) for coordinate
 * pairs matching the game's coordinate space (~6000-25000 range). Filters
 * out known boat positions to find static objects like marks, pins, and
 * start/finish line endpoints.
 *
 * This module runs in the PAGE context (injected alongside injected.js).
 * It must NEVER crash the game — everything is wrapped in try/catch.
 */

// --- Configuration ---
const COORD_MIN = 4000;
const COORD_MAX = 28000;
const MAX_CANDIDATES = 2000;     // cap to avoid flooding
const CLUSTER_RADIUS = 100;      // merge candidates within this distance
const BOAT_EXCLUSION_RADIUS = 200; // ignore coords within this range of a known boat

// --- Logger (posts back to content script) ---
function scanLog(level, message, data) {
  try {
    window.postMessage(
      { type: 'vr-log', level, message: '[unity-scanner] ' + message, data },
      '*',
    );
  } catch {
    // Never break the game
  }
}

// --- Find the Unity WASM module ---
export function findUnityModule() {
  try {
    // Check common locations
    if (window.unityInstance?.Module?.HEAPU8) return window.unityInstance.Module;
    if (window.gameInstance?.Module?.HEAPU8) return window.gameInstance.Module;
    if (window.Module?.HEAPU8) return window.Module;

    // Search for CreateUnity-style instance
    if (window.unityInstance?.SendMessage && window.Module?.HEAPU8) {
      return window.Module;
    }

    // Search iframes
    try {
      const frames = document.querySelectorAll('iframe');
      for (const frame of frames) {
        try {
          const w = frame.contentWindow;
          if (w?.Module?.HEAPU8) return w.Module;
          if (w?.unityInstance?.Module?.HEAPU8) return w.unityInstance.Module;
        } catch {
          // Cross-origin — skip
        }
      }
    } catch {
      // DOM access failure
    }

    // Brute-force search window properties
    for (const key of Object.keys(window)) {
      try {
        const v = window[key];
        if (v && typeof v === 'object') {
          if (v.HEAPU8) return v;
          if (v.Module?.HEAPU8) return v.Module;
        }
      } catch {
        // getter threw — skip
      }
    }

    return null;
  } catch (e) {
    scanLog(3, 'findUnityModule error: ' + e.message);
    return null;
  }
}

// --- Scan HEAPF32 for coordinate pairs ---
export function scanFloat32Coords(buffer, knownBoats, options = {}) {
  const coordMin = options.coordMin ?? COORD_MIN;
  const coordMax = options.coordMax ?? COORD_MAX;
  const maxCandidates = options.maxCandidates ?? MAX_CANDIDATES;

  const results = [];

  try {
    // Ensure we have an ArrayBuffer to work with
    const ab = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
    const f32 = new Float32Array(ab);

    for (let i = 0; i < f32.length - 2; i++) {
      const x = f32[i];
      const y = f32[i + 1];

      // Quick range check — must be in game coordinate space
      if (x < coordMin || x > coordMax || y < coordMin || y > coordMax) continue;

      // Must be finite
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      // Skip if this matches a known boat position
      if (knownBoats && isNearKnownBoat(x, y, knownBoats)) continue;

      const z = f32[i + 2];
      results.push({
        offset: i * 4,
        x,
        y,
        z: Number.isFinite(z) ? z : null,
        format: 'float32',
      });

      if (results.length >= maxCandidates) break;
    }
  } catch (e) {
    scanLog(3, 'scanFloat32Coords error: ' + e.message);
  }

  return results;
}

// --- Scan HEAP16 for coordinate pairs (same encoding as boat data) ---
export function scanInt16Coords(buffer, knownBoats, options = {}) {
  const coordMin = options.coordMin ?? COORD_MIN;
  const coordMax = options.coordMax ?? COORD_MAX;
  const maxCandidates = options.maxCandidates ?? MAX_CANDIDATES;

  const results = [];

  try {
    const ab = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
    const i16 = new Int16Array(ab);

    for (let i = 0; i < i16.length - 1; i++) {
      const x = i16[i];
      const y = i16[i + 1];

      if (x < coordMin || x > coordMax || y < coordMin || y > coordMax) continue;

      if (knownBoats && isNearKnownBoat(x, y, knownBoats)) continue;

      results.push({
        offset: i * 2,
        x,
        y,
        format: 'int16',
      });

      if (results.length >= maxCandidates) break;
    }
  } catch (e) {
    scanLog(3, 'scanInt16Coords error: ' + e.message);
  }

  return results;
}

// --- Check if a coordinate is near any known boat ---
function isNearKnownBoat(x, y, boats) {
  for (const b of boats) {
    const dx = x - b.x;
    const dy = y - b.y;
    if (dx * dx + dy * dy < BOAT_EXCLUSION_RADIUS * BOAT_EXCLUSION_RADIUS) {
      return true;
    }
  }
  return false;
}

// --- Cluster nearby candidates into single positions ---
export function clusterCandidates(candidates, radius) {
  const r = radius ?? CLUSTER_RADIUS;
  const r2 = r * r;
  const clusters = [];
  const used = new Set();

  for (let i = 0; i < candidates.length; i++) {
    if (used.has(i)) continue;
    const c = candidates[i];
    const group = [c];
    used.add(i);

    for (let j = i + 1; j < candidates.length; j++) {
      if (used.has(j)) continue;
      const dx = candidates[j].x - c.x;
      const dy = candidates[j].y - c.y;
      if (dx * dx + dy * dy < r2) {
        group.push(candidates[j]);
        used.add(j);
      }
    }

    // Average the cluster
    let sx = 0, sy = 0;
    for (const g of group) {
      sx += g.x;
      sy += g.y;
    }
    clusters.push({
      x: sx / group.length,
      y: sy / group.length,
      count: group.length,
      offsets: group.map(g => g.offset),
      format: group[0].format,
    });
  }

  // Sort by hit count descending — more hits = more likely a real object
  clusters.sort((a, b) => b.count - a.count);
  return clusters;
}

// --- Search for course-related strings in WASM memory ---
export function scanForStrings(heap, searchTerms) {
  const results = [];
  if (!heap || !searchTerms || searchTerms.length === 0) return results;

  try {
    // Decode in chunks to avoid memory issues on huge heaps
    const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const terms = searchTerms.map(t => t.toLowerCase());

    for (let offset = 0; offset < heap.length; offset += CHUNK_SIZE - 100) {
      const end = Math.min(offset + CHUNK_SIZE, heap.length);
      const chunk = heap.slice(offset, end);
      const text = decoder.decode(chunk);

      for (const term of terms) {
        let idx = 0;
        while (true) {
          idx = text.toLowerCase().indexOf(term, idx);
          if (idx === -1) break;

          // Extract surrounding context (50 chars each side)
          const start = Math.max(0, idx - 50);
          const contextEnd = Math.min(text.length, idx + term.length + 50);
          const context = text.slice(start, contextEnd).replace(/[^\x20-\x7E]/g, '.');

          results.push({
            term,
            offset: offset + idx,
            context,
          });

          idx += term.length;

          // Cap results per term
          if (results.filter(r => r.term === term).length >= 20) break;
        }
      }
    }
  } catch (e) {
    scanLog(3, 'scanForStrings error: ' + e.message);
  }

  return results;
}

// --- Try querying Unity via SendMessage ---
export function tryUnityQuery(instance) {
  const results = { attempted: [], errors: [] };

  if (!instance?.SendMessage) {
    results.errors.push('No SendMessage available');
    return results;
  }

  const targets = [
    'GameManager', 'CourseManager', 'RaceManager', 'MarkManager',
    'BuoyManager', 'Course', 'RaceController', 'CourseController',
    'NavigationManager', 'WaypointManager',
  ];

  for (const name of targets) {
    try {
      // We cannot get return values from SendMessage, but we can try
      // triggering debug logging in the game. These calls will silently
      // fail if the game object doesn't exist.
      instance.SendMessage(name, 'LogState', '');
      results.attempted.push(name);
    } catch {
      // Expected — game object doesn't exist
    }
  }

  return results;
}

// --- Main scan orchestrator ---
export function scanUnityMemory(knownBoats) {
  const mod = findUnityModule();
  if (!mod) {
    scanLog(1, 'Unity module not found — scan skipped');
    return null;
  }

  scanLog(1, 'Unity module found, starting memory scan');

  const heapU8 = mod.HEAPU8;
  if (!heapU8) {
    scanLog(2, 'HEAPU8 not available');
    return null;
  }

  const heapSize = heapU8.length;
  scanLog(1, 'WASM heap size: ' + (heapSize / (1024 * 1024)).toFixed(1) + ' MB');

  const boats = knownBoats || [];

  // 1. Scan float32 coordinates
  const t0 = Date.now();
  const f32Candidates = scanFloat32Coords(heapU8, boats);
  const f32Time = Date.now() - t0;
  scanLog(1, 'Float32 scan: ' + f32Candidates.length + ' candidates in ' + f32Time + 'ms');

  // 2. Scan int16 coordinates
  const t1 = Date.now();
  const i16Candidates = scanInt16Coords(heapU8, boats);
  const i16Time = Date.now() - t1;
  scanLog(1, 'Int16 scan: ' + i16Candidates.length + ' candidates in ' + i16Time + 'ms');

  // 3. Cluster both sets
  const f32Clusters = clusterCandidates(f32Candidates);
  const i16Clusters = clusterCandidates(i16Candidates);
  scanLog(1, 'Clusters: ' + f32Clusters.length + ' float32, ' + i16Clusters.length + ' int16');

  // 4. Search for course-related strings
  const stringTerms = ['mark', 'buoy', 'gate', 'start', 'finish', 'course', 'waypoint', 'pin'];
  const strings = scanForStrings(heapU8, stringTerms);
  scanLog(1, 'String matches: ' + strings.length);

  // 5. Try Unity SendMessage queries
  const unityInstance = window.unityInstance || window.gameInstance || null;
  const queryResults = tryUnityQuery(unityInstance);

  const result = {
    timestamp: Date.now(),
    heapSizeMB: +(heapSize / (1024 * 1024)).toFixed(1),
    knownBoatCount: boats.length,
    float32: {
      rawCandidates: f32Candidates.length,
      clusters: f32Clusters.slice(0, 50), // top 50 clusters
      scanTimeMs: f32Time,
    },
    int16: {
      rawCandidates: i16Candidates.length,
      clusters: i16Clusters.slice(0, 50),
      scanTimeMs: i16Time,
    },
    strings: strings.slice(0, 50),
    unityQuery: queryResults,
  };

  scanLog(1, 'Scan complete', {
    heapMB: result.heapSizeMB,
    f32Clusters: f32Clusters.length,
    i16Clusters: i16Clusters.length,
    strings: strings.length,
  });

  return result;
}

// --- Targeted scan near known positions ---
export function scanNearKnownPositions(knownBoats) {
  const mod = findUnityModule();
  if (!mod?.HEAPU8) {
    scanLog(1, 'Unity module not found for targeted scan');
    return null;
  }

  scanLog(1, 'Running targeted scan with ' + knownBoats.length + ' known boat positions');

  const heapU8 = mod.HEAPU8;
  const boats = knownBoats;

  // Full scan excluding known boats
  const f32Candidates = scanFloat32Coords(heapU8, boats);
  const i16Candidates = scanInt16Coords(heapU8, boats);

  const f32Clusters = clusterCandidates(f32Candidates);
  const i16Clusters = clusterCandidates(i16Candidates);

  const result = {
    timestamp: Date.now(),
    triggered: true,
    knownBoatCount: boats.length,
    float32Clusters: f32Clusters.slice(0, 50),
    int16Clusters: i16Clusters.slice(0, 50),
  };

  scanLog(1, 'Targeted scan complete', {
    f32: f32Clusters.length,
    i16: i16Clusters.length,
  });

  // Post results back
  try {
    window.postMessage({
      type: 'vr-unity-scan',
      data: result,
    }, '*');
  } catch {
    // Never break the game
  }

  return result;
}
