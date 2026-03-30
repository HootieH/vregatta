(function () {
  'use strict';

  const VR_DOMAINS = [
    'prod.vro.sparks.virtualregatta.com',
    'vro-api-client.prod.virtualregatta.com',
    'vro-api-ranking.prod.virtualregatta.com',
    'static.virtualregatta.com/winds/live/',
  ];

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
})();
