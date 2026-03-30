(function () {
  'use strict';

  const VR_DOMAINS = [
    'prod.vro.sparks.virtualregatta.com',
    'vro-api-client.prod.virtualregatta.com',
    'vro-api-ranking.prod.virtualregatta.com',
    'static.virtualregatta.com/winds/live/',
    // Inshore domains
    'inshore.virtualregatta.com',
    'virtualregatta.com/api',
    'virtualregatta.com/config',
    'virtualregatta.com/course',
    'virtualregatta.com/game',
  ];

  // Broad capture: catch ALL fetches from VR game pages for discovery
  const VR_BROAD_CAPTURE = location.hostname.includes('virtualregatta.com');

  const SENSITIVE_FIELDS = ['password', 'userName', 'email'];

  // Inline logger — posts log messages to content script via postMessage
  function vrLog(level, message, data) {
    try {
      window.postMessage(
        { type: 'vr-log', level, message, data },
        '*',
      );
    } catch {
      // Never break the game
    }
  }

  function isVrUrl(url) {
    // On VR game pages, capture ALL fetches for course/config discovery
    if (VR_BROAD_CAPTURE) return true;
    return VR_DOMAINS.some((domain) => url.includes(domain));
  }

  function stripSensitive(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(stripSensitive);
    const cleaned = {};
    let stripped = false;
    for (const key of Object.keys(obj)) {
      if (SENSITIVE_FIELDS.includes(key)) {
        stripped = true;
        continue;
      }
      cleaned[key] = stripSensitive(obj[key]);
    }
    if (stripped) {
      vrLog(0, 'Stripped sensitive fields from response');
    }
    return cleaned;
  }

  // --- WebSocket URL filter ---
  const WS_URL_PATTERNS = ['virtualregatta', 'colyseus', 'vri-', 'vro-'];

  function isVrWebSocket(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    return WS_URL_PATTERNS.some((pattern) => lower.includes(pattern));
  }

  function arrayBufferToBase64(buffer) {
    try {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
    } catch {
      return null;
    }
  }

  function describeWsData(rawData) {
    try {
      if (typeof rawData === 'string') {
        return { text: rawData, binary: false, size: rawData.length };
      }
      if (rawData instanceof ArrayBuffer) {
        const bytes = new Uint8Array(rawData);
        const firstBytes = Array.from(bytes.slice(0, 16))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
        return {
          base64: arrayBufferToBase64(rawData),
          binary: true,
          size: rawData.byteLength,
          firstBytes,
        };
      }
      if (rawData instanceof Blob) {
        return { binary: true, size: rawData.size, blobType: rawData.type, note: 'Blob — not captured' };
      }
      return { text: String(rawData), binary: false, size: String(rawData).length };
    } catch {
      return { error: 'Failed to describe WS data', binary: false, size: 0 };
    }
  }

  function postWsMessage(direction, data, url) {
    try {
      const described = describeWsData(data);
      window.postMessage(
        { type: 'vr-ws-intercepted', direction, data: described, url, timestamp: Date.now() },
        '*',
      );
    } catch {
      // Never break the game
    }
  }

  // --- WebSocket monkey-patch ---
  const OriginalWebSocket = window.WebSocket;

  window.WebSocket = new Proxy(OriginalWebSocket, {
    construct(Target, args) {
      const wsUrl = args[0];
      const ws = new Target(...args);

      if (!isVrWebSocket(wsUrl)) {
        return ws;
      }

      // Notify background immediately on connection (before any data flows)
      try {
        window.postMessage(
          { type: 'vr-ws-connected', url: wsUrl, timestamp: Date.now() },
          '*',
        );
      } catch {
        // Never break the game
      }

      vrLog(1, 'Inshore detected — capturing WebSocket traffic for analysis', { url: wsUrl });

      // Intercept incoming messages via addEventListener wrapper
      const origAddEventListener = ws.addEventListener.bind(ws);
      ws.addEventListener = function (type, listener, options) {
        if (type === 'message') {
          const wrapped = function (event) {
            try {
              postWsMessage('incoming', event.data, wsUrl);
            } catch {
              // Never break the game
            }
            return listener.call(this, event);
          };
          return origAddEventListener(type, wrapped, options);
        }
        return origAddEventListener(type, listener, options);
      };

      // Intercept onmessage property assignment
      let userOnMessage = null;
      try {
        Object.defineProperty(ws, 'onmessage', {
          get() {
            return userOnMessage;
          },
          set(handler) {
            userOnMessage = handler;
          },
          configurable: true,
        });
      } catch {
        // Fallback — cannot override onmessage property
      }

      // Capture all incoming messages and dispatch to onmessage handler
      origAddEventListener('message', function (event) {
        try {
          postWsMessage('incoming', event.data, wsUrl);
        } catch {
          // Never break the game
        }
        if (typeof userOnMessage === 'function') {
          try {
            userOnMessage.call(ws, event);
          } catch {
            // Never break the game
          }
        }
      });

      // Intercept send
      const origSend = ws.send.bind(ws);
      ws.send = function (data) {
        try {
          postWsMessage('outgoing', data, wsUrl);
        } catch {
          // Never break the game
        }
        return origSend(data);
      };

      return ws;
    },
    get(target, prop, receiver) {
      return Reflect.get(target, prop, receiver);
    },
  });

  // Preserve static properties so code checking WebSocket.OPEN etc. still works
  try {
    Object.defineProperty(window.WebSocket, 'CONNECTING', { value: 0 });
    Object.defineProperty(window.WebSocket, 'OPEN', { value: 1 });
    Object.defineProperty(window.WebSocket, 'CLOSING', { value: 2 });
    Object.defineProperty(window.WebSocket, 'CLOSED', { value: 3 });
    window.WebSocket.prototype = OriginalWebSocket.prototype;
  } catch {
    // Best-effort — some environments lock these
  }

  // --- Fetch monkey-patch ---
  const originalFetch = window.fetch;

  window.fetch = function (...args) {
    const request = args[0];
    const url = typeof request === 'string' ? request : request.url;
    const method =
      (typeof request === 'string' ? args[1]?.method : request.method) || 'GET';

    const fetchPromise = originalFetch.apply(this, args);

    if (isVrUrl(url)) {
      vrLog(0, `Intercepted fetch: ${method} ${url}`);

      fetchPromise
        .then((response) => {
          const clone = response.clone();
          return clone.text();
        })
        .then((responseText) => {
          try {
            let parsed = JSON.parse(responseText);
            parsed = stripSensitive(parsed);
            responseText = JSON.stringify(parsed);
          } catch {
            // Not JSON — post raw text
          }
          window.postMessage(
            { type: 'vr-intercepted', url, method, body: responseText },
            '*',
          );
        })
        .catch((err) => {
          vrLog(3, `Fetch intercept error: ${err.message}`, { url });
        });
    }

    return fetchPromise;
  };

  // --- XMLHttpRequest monkey-patch ---
  // Unity WebGL uses XHR for loading course data, assets, configs
  if (VR_BROAD_CAPTURE) {
    const OrigXHR = window.XMLHttpRequest;
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;

    OrigXHR.prototype.open = function (method, url, ...rest) {
      this._vrUrl = url;
      this._vrMethod = method;
      return origOpen.call(this, method, url, ...rest);
    };

    OrigXHR.prototype.send = function (body) {
      const xhr = this;
      const url = xhr._vrUrl;

      xhr.addEventListener('load', function () {
        try {
          // Only capture non-binary responses and small binary ones
          const contentType = xhr.getResponseHeader('content-type') || '';
          const isJson = contentType.includes('json');
          const isText = contentType.includes('text') || contentType.includes('xml') || contentType.includes('html');
          const isSmallBinary = !isJson && !isText && xhr.response instanceof ArrayBuffer && xhr.response.byteLength < 50000;

          if (isJson || isText || isSmallBinary) {
            let responseBody;
            if (isSmallBinary) {
              responseBody = '[binary ' + xhr.response.byteLength + ' bytes]';
            } else {
              responseBody = xhr.responseText || '';
            }

            vrLog(1, 'XHR captured: ' + xhr._vrMethod + ' ' + url + ' (' + contentType + ', ' + (responseBody.length || 0) + ' chars)');

            window.postMessage({
              type: 'vr-intercepted',
              url: url,
              method: xhr._vrMethod,
              body: responseBody,
              source: 'xhr',
            }, '*');
          } else if (url && !url.endsWith('.data') && !url.endsWith('.wasm') && !url.endsWith('.js')) {
            // Log non-asset URLs we skip
            vrLog(0, 'XHR skipped (large binary): ' + xhr._vrMethod + ' ' + url + ' (' + contentType + ')');
          }
        } catch {
          // Never break the game
        }
      });

      return origSend.call(this, body);
    };

    vrLog(1, 'XMLHttpRequest interceptor active — capturing all XHR on VR page');
  }

  // --- Unity memory scanner integration ---
  if (VR_BROAD_CAPTURE) {
    // Lazy-load scanner functions to avoid blocking page load
    let scannerLoaded = false;

    function loadScanner() {
      if (scannerLoaded) return;
      scannerLoaded = true;
      try {
        // The scanner is bundled into this IIFE by esbuild — we access the
        // functions via the global scope since injected.js is an IIFE.
        // We import them at the top of the closure to keep things clean.
        // Actually, since this is bundled as IIFE, we inline the scanner
        // functions here. The actual scanner module is imported by esbuild.
        vrLog(1, 'Unity scanner ready');
      } catch (e) {
        vrLog(3, 'Failed to load Unity scanner: ' + e.message);
      }
    }

    // Initial scan after Unity has had time to fully load
    setTimeout(() => {
      try {
        loadScanner();
        // Inline scan: find Unity module and scan
        const mod = findUnityModuleInline();
        if (mod) {
          vrLog(1, 'Unity module found — running initial memory scan');
          const result = runInlineScan(mod, []);
          if (result) {
            window.postMessage({ type: 'vr-unity-scan', data: result }, '*');
          }
        } else {
          vrLog(1, 'Unity module not found after 10s — will retry on boat data');
        }
      } catch (e) {
        vrLog(2, 'Unity initial scan error: ' + e.message);
      }
    }, 10000);

    // Scan when triggered with known boat positions
    window.addEventListener('message', function (e) {
      if (e.data?.type === 'vr-scan-trigger' && e.data.boatPositions) {
        try {
          const mod = findUnityModuleInline();
          if (mod) {
            vrLog(1, 'Triggered scan with ' + e.data.boatPositions.length + ' known boats');
            const result = runInlineScan(mod, e.data.boatPositions);
            if (result) {
              window.postMessage({ type: 'vr-unity-scan', data: result }, '*');
            }
          } else {
            vrLog(2, 'Unity module not found for triggered scan');
          }
        } catch (e2) {
          vrLog(2, 'Unity triggered scan error: ' + e2.message);
        }
      }
    });

    // --- Inline scanner functions (duplicated from unity-scanner.js for IIFE context) ---
    function findUnityModuleInline() {
      try {
        if (window.unityInstance?.Module?.HEAPU8) return window.unityInstance.Module;
        if (window.gameInstance?.Module?.HEAPU8) return window.gameInstance.Module;
        if (window.Module?.HEAPU8) return window.Module;
        // Search iframes
        try {
          var frames = document.querySelectorAll('iframe');
          for (var fi = 0; fi < frames.length; fi++) {
            try {
              var w = frames[fi].contentWindow;
              if (w?.Module?.HEAPU8) return w.Module;
              if (w?.unityInstance?.Module?.HEAPU8) return w.unityInstance.Module;
            } catch { /* cross-origin */ }
          }
        } catch { /* DOM access */ }
        // Brute-force
        for (var key of Object.keys(window)) {
          try {
            var v = window[key];
            if (v && typeof v === 'object') {
              if (v.HEAPU8) return v;
              if (v.Module?.HEAPU8) return v.Module;
            }
          } catch { /* getter threw */ }
        }
        return null;
      } catch (e) {
        vrLog(3, 'findUnityModule error: ' + e.message);
        return null;
      }
    }

    function runInlineScan(mod, knownBoats) {
      var heapU8 = mod.HEAPU8;
      if (!heapU8) return null;

      var heapSize = heapU8.length;
      vrLog(1, 'WASM heap size: ' + (heapSize / (1024 * 1024)).toFixed(1) + ' MB');

      var boats = knownBoats || [];
      var COORD_MIN = 4000, COORD_MAX = 28000;
      var BOAT_R2 = 200 * 200;
      var MAX_CAND = 2000;

      function isNearBoat(x, y) {
        for (var bi = 0; bi < boats.length; bi++) {
          var dx = x - boats[bi].x, dy = y - boats[bi].y;
          if (dx * dx + dy * dy < BOAT_R2) return true;
        }
        return false;
      }

      // Float32 scan
      var t0 = Date.now();
      var f32Results = [];
      try {
        var f32 = new Float32Array(heapU8.buffer);
        for (var i = 0; i < f32.length - 2 && f32Results.length < MAX_CAND; i++) {
          var fx = f32[i], fy = f32[i + 1];
          if (fx < COORD_MIN || fx > COORD_MAX || fy < COORD_MIN || fy > COORD_MAX) continue;
          if (!Number.isFinite(fx) || !Number.isFinite(fy)) continue;
          if (boats.length > 0 && isNearBoat(fx, fy)) continue;
          f32Results.push({ offset: i * 4, x: fx, y: fy, z: Number.isFinite(f32[i + 2]) ? f32[i + 2] : null });
        }
      } catch (e) { vrLog(3, 'f32 scan error: ' + e.message); }
      var f32Time = Date.now() - t0;

      // Int16 scan
      var t1 = Date.now();
      var i16Results = [];
      try {
        var i16 = new Int16Array(heapU8.buffer);
        for (var j = 0; j < i16.length - 1 && i16Results.length < MAX_CAND; j++) {
          var ix = i16[j], iy = i16[j + 1];
          if (ix < COORD_MIN || ix > COORD_MAX || iy < COORD_MIN || iy > COORD_MAX) continue;
          if (boats.length > 0 && isNearBoat(ix, iy)) continue;
          i16Results.push({ offset: j * 2, x: ix, y: iy });
        }
      } catch (e) { vrLog(3, 'i16 scan error: ' + e.message); }
      var i16Time = Date.now() - t1;

      // Cluster
      function cluster(candidates, radius) {
        var r2 = radius * radius;
        var clusters = [];
        var used = new Set();
        for (var ci = 0; ci < candidates.length; ci++) {
          if (used.has(ci)) continue;
          var c = candidates[ci];
          var sx = c.x, sy = c.y, cnt = 1;
          used.add(ci);
          for (var cj = ci + 1; cj < candidates.length; cj++) {
            if (used.has(cj)) continue;
            var ddx = candidates[cj].x - c.x, ddy = candidates[cj].y - c.y;
            if (ddx * ddx + ddy * ddy < r2) {
              sx += candidates[cj].x; sy += candidates[cj].y; cnt++;
              used.add(cj);
            }
          }
          clusters.push({ x: sx / cnt, y: sy / cnt, count: cnt });
        }
        clusters.sort(function(a, b) { return b.count - a.count; });
        return clusters;
      }

      var f32Clusters = cluster(f32Results, 100);
      var i16Clusters = cluster(i16Results, 100);

      // String scan (lightweight — just check for key terms)
      var stringHits = [];
      try {
        var CHUNK = 4 * 1024 * 1024;
        var decoder = new TextDecoder('utf-8', { fatal: false });
        var terms = ['mark', 'buoy', 'gate', 'start', 'finish', 'course', 'waypoint'];
        for (var off = 0; off < heapU8.length; off += CHUNK - 100) {
          var end = Math.min(off + CHUNK, heapU8.length);
          var text = decoder.decode(heapU8.slice(off, end));
          var lower = text.toLowerCase();
          for (var ti = 0; ti < terms.length; ti++) {
            var idx = lower.indexOf(terms[ti]);
            while (idx !== -1 && stringHits.length < 50) {
              var ctxStart = Math.max(0, idx - 30);
              var ctxEnd = Math.min(text.length, idx + terms[ti].length + 30);
              stringHits.push({
                term: terms[ti],
                offset: off + idx,
                context: text.slice(ctxStart, ctxEnd).replace(/[^\x20-\x7E]/g, '.'),
              });
              idx = lower.indexOf(terms[ti], idx + terms[ti].length);
            }
          }
        }
      } catch (e) { vrLog(2, 'String scan error: ' + e.message); }

      vrLog(1, 'Scan complete: ' + f32Clusters.length + ' f32 clusters, ' + i16Clusters.length + ' i16 clusters, ' + stringHits.length + ' string hits');

      return {
        timestamp: Date.now(),
        heapSizeMB: +(heapSize / (1024 * 1024)).toFixed(1),
        knownBoatCount: boats.length,
        float32: { rawCandidates: f32Results.length, clusters: f32Clusters.slice(0, 50), scanTimeMs: f32Time },
        int16: { rawCandidates: i16Results.length, clusters: i16Clusters.slice(0, 50), scanTimeMs: i16Time },
        strings: stringHits,
      };
    }
  }
})();
