// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('injected fetch interceptor', () => {
  let originalFetch;
  let postedMessages;

  beforeEach(() => {
    postedMessages = [];

    // Mock window.postMessage
    vi.stubGlobal('postMessage', (data, origin) => {
      postedMessages.push({ data, origin });
    });

    // Create a mock fetch that returns a Response-like object
    originalFetch = vi.fn(() => {
      const body = JSON.stringify({ test: true });
      return Promise.resolve({
        clone() {
          return { text: () => Promise.resolve(body) };
        },
      });
    });
    vi.stubGlobal('fetch', originalFetch);

    // Load the injected script — it will wrap window.fetch
    // We need to re-run the IIFE each time
  });

  function loadInterceptor() {
    // Reset fetch to original mock before loading
    window.fetch = originalFetch;

    // Inline the interceptor logic for testing
    const VR_DOMAINS = [
      'prod.vro.sparks.virtualregatta.com',
      'vro-api-client.prod.virtualregatta.com',
      'vro-api-ranking.prod.virtualregatta.com',
      'static.virtualregatta.com/winds/live/',
    ];

    const SENSITIVE_FIELDS = ['password', 'userName', 'email'];

    function isVrUrl(url) {
      return VR_DOMAINS.some((domain) => url.includes(domain));
    }

    function stripSensitive(obj) {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(stripSensitive);
      const cleaned = {};
      for (const key of Object.keys(obj)) {
        if (SENSITIVE_FIELDS.includes(key)) continue;
        cleaned[key] = stripSensitive(obj[key]);
      }
      return cleaned;
    }

    const saved = window.fetch;

    window.fetch = function (...args) {
      const request = args[0];
      const url = typeof request === 'string' ? request : request.url;
      const method =
        (typeof request === 'string' ? args[1]?.method : request.method) ||
        'GET';

      const fetchPromise = saved.apply(this, args);

      if (isVrUrl(url)) {
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
              // Not JSON
            }
            window.postMessage(
              { type: 'vr-intercepted', url, method, body: responseText },
              '*',
            );
          })
          .catch(() => {});
      }

      return fetchPromise;
    };
  }

  it('calls original fetch and returns its result', async () => {
    loadInterceptor();
    const result = await window.fetch('https://example.com/api');
    expect(originalFetch).toHaveBeenCalledWith('https://example.com/api');
    expect(result).toBeDefined();
    expect(result.clone).toBeDefined();
  });

  it('posts message for VR API URLs', async () => {
    loadInterceptor();
    await window.fetch(
      'https://prod.vro.sparks.virtualregatta.com/some/endpoint',
    );
    // Wait for the async postMessage chain
    await new Promise((r) => setTimeout(r, 10));

    expect(postedMessages.length).toBe(1);
    expect(postedMessages[0].data.type).toBe('vr-intercepted');
    expect(postedMessages[0].data.url).toContain(
      'prod.vro.sparks.virtualregatta.com',
    );
    expect(postedMessages[0].data.method).toBe('GET');
  });

  it('posts message for wind data URLs', async () => {
    loadInterceptor();
    await window.fetch(
      'https://static.virtualregatta.com/winds/live/data.wnd',
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(postedMessages.length).toBe(1);
    expect(postedMessages[0].data.url).toContain('winds/live');
  });

  it('does NOT post message for non-VR URLs', async () => {
    loadInterceptor();
    await window.fetch('https://example.com/some/api');
    await new Promise((r) => setTimeout(r, 10));

    expect(postedMessages.length).toBe(0);
  });

  it('does not break if response clone fails', async () => {
    originalFetch.mockImplementation(() =>
      Promise.resolve({
        clone() {
          throw new Error('clone failed');
        },
      }),
    );
    loadInterceptor();

    // Should not throw
    const result = await window.fetch(
      'https://prod.vro.sparks.virtualregatta.com/endpoint',
    );
    expect(result).toBeDefined();
  });
});
