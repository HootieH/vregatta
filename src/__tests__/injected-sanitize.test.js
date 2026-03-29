// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('injected fetch interceptor — sanitization', () => {
  let postedMessages;

  beforeEach(() => {
    postedMessages = [];
    vi.stubGlobal('postMessage', (data) => {
      postedMessages.push(data);
    });
  });

  function makeInterceptedFetch(responseBody) {
    const originalFetch = vi.fn(() =>
      Promise.resolve({
        clone() {
          return {
            text: () => Promise.resolve(JSON.stringify(responseBody)),
          };
        },
      }),
    );
    vi.stubGlobal('fetch', originalFetch);

    // Load interceptor
    const VR_DOMAINS = [
      'prod.vro.sparks.virtualregatta.com',
      'vro-api-client.prod.virtualregatta.com',
      'vro-api-ranking.prod.virtualregatta.com',
      'static.virtualregatta.com/winds/live/',
    ];
    const SENSITIVE_FIELDS = ['password', 'userName', 'email'];

    function isVrUrl(url) {
      return VR_DOMAINS.some((d) => url.includes(d));
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
          .then((response) => response.clone().text())
          .then((responseText) => {
            try {
              let parsed = JSON.parse(responseText);
              parsed = stripSensitive(parsed);
              responseText = JSON.stringify(parsed);
            } catch {
              // not JSON
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

  it('strips password field from response', async () => {
    makeInterceptedFetch({
      token: 'abc123',
      password: 'secret',
      data: { id: 1 },
    });
    await window.fetch(
      'https://prod.vro.sparks.virtualregatta.com/auth',
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(postedMessages.length).toBe(1);
    const body = JSON.parse(postedMessages[0].body);
    expect(body.token).toBe('abc123');
    expect(body.password).toBeUndefined();
    expect(body.data.id).toBe(1);
  });

  it('strips email field from response', async () => {
    makeInterceptedFetch({
      email: 'user@example.com',
      rank: 42,
    });
    await window.fetch(
      'https://prod.vro.sparks.virtualregatta.com/profile',
    );
    await new Promise((r) => setTimeout(r, 10));

    const body = JSON.parse(postedMessages[0].body);
    expect(body.email).toBeUndefined();
    expect(body.rank).toBe(42);
  });

  it('strips userName field from response', async () => {
    makeInterceptedFetch({
      userName: 'sailor99',
      speed: 12.5,
    });
    await window.fetch(
      'https://prod.vro.sparks.virtualregatta.com/user',
    );
    await new Promise((r) => setTimeout(r, 10));

    const body = JSON.parse(postedMessages[0].body);
    expect(body.userName).toBeUndefined();
    expect(body.speed).toBe(12.5);
  });

  it('strips sensitive fields from nested objects', async () => {
    makeInterceptedFetch({
      user: { userName: 'sailor99', email: 'a@b.com', id: 5 },
      data: { password: 'x', score: 100 },
    });
    await window.fetch(
      'https://prod.vro.sparks.virtualregatta.com/nested',
    );
    await new Promise((r) => setTimeout(r, 10));

    const body = JSON.parse(postedMessages[0].body);
    expect(body.user.userName).toBeUndefined();
    expect(body.user.email).toBeUndefined();
    expect(body.user.id).toBe(5);
    expect(body.data.password).toBeUndefined();
    expect(body.data.score).toBe(100);
  });

  it('strips sensitive fields from arrays', async () => {
    makeInterceptedFetch([
      { userName: 'a', id: 1 },
      { userName: 'b', id: 2 },
    ]);
    await window.fetch(
      'https://prod.vro.sparks.virtualregatta.com/list',
    );
    await new Promise((r) => setTimeout(r, 10));

    const body = JSON.parse(postedMessages[0].body);
    expect(body).toHaveLength(2);
    expect(body[0].userName).toBeUndefined();
    expect(body[0].id).toBe(1);
    expect(body[1].userName).toBeUndefined();
    expect(body[1].id).toBe(2);
  });
});
