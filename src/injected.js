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
