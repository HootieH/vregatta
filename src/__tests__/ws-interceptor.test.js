import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for WebSocket interception in injected.js.
 *
 * Since injected.js is an IIFE that runs in page context, we simulate
 * its behavior by recreating the key functions and testing the Proxy
 * pattern in isolation.
 */

// Replicate the URL-matching logic from injected.js
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
    return globalThis.btoa(binary);
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
    return { text: String(rawData), binary: false, size: String(rawData).length };
  } catch {
    return { error: 'Failed to describe WS data', binary: false, size: 0 };
  }
}

describe('WebSocket URL matching', () => {
  it('matches virtualregatta URLs', () => {
    expect(isVrWebSocket('wss://play.inshore.virtualregatta.com/ws')).toBe(true);
    expect(isVrWebSocket('wss://game.virtualregatta.com/socket')).toBe(true);
  });

  it('matches colyseus URLs', () => {
    expect(isVrWebSocket('wss://colyseus-server.example.com/room')).toBe(true);
  });

  it('matches vri- and vro- prefixed URLs', () => {
    expect(isVrWebSocket('wss://vri-game.example.com/ws')).toBe(true);
    expect(isVrWebSocket('wss://vro-api.example.com/ws')).toBe(true);
  });

  it('does NOT match non-VR URLs', () => {
    expect(isVrWebSocket('wss://api.example.com/ws')).toBe(false);
    expect(isVrWebSocket('wss://chat.discord.com/gateway')).toBe(false);
    expect(isVrWebSocket('wss://echo.websocket.org')).toBe(false);
  });

  it('handles null/undefined/empty input', () => {
    expect(isVrWebSocket(null)).toBe(false);
    expect(isVrWebSocket(undefined)).toBe(false);
    expect(isVrWebSocket('')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isVrWebSocket('wss://PLAY.INSHORE.VIRTUALREGATTA.COM/ws')).toBe(true);
    expect(isVrWebSocket('wss://Colyseus-Server.com/room')).toBe(true);
  });
});

describe('describeWsData', () => {
  it('describes text messages', () => {
    const result = describeWsData('{"hello":"world"}');
    expect(result.binary).toBe(false);
    expect(result.text).toBe('{"hello":"world"}');
    expect(result.size).toBe(17);
  });

  it('describes ArrayBuffer messages', () => {
    const buf = new ArrayBuffer(4);
    const view = new Uint8Array(buf);
    view[0] = 0xCA;
    view[1] = 0xFE;
    view[2] = 0xBA;
    view[3] = 0xBE;

    const result = describeWsData(buf);
    expect(result.binary).toBe(true);
    expect(result.size).toBe(4);
    expect(result.firstBytes).toBe('ca fe ba be');
    expect(result.base64).toBeTruthy();
  });

  it('handles empty string', () => {
    const result = describeWsData('');
    expect(result.binary).toBe(false);
    expect(result.size).toBe(0);
  });

  it('handles empty ArrayBuffer', () => {
    const result = describeWsData(new ArrayBuffer(0));
    expect(result.binary).toBe(true);
    expect(result.size).toBe(0);
  });
});

describe('WebSocket Proxy behavior', () => {
  let MockWebSocket;
  let postMessageSpy;
  let ProxiedWebSocket;

  beforeEach(() => {
    // Minimal mock WebSocket
    MockWebSocket = class {
      constructor(url, protocols) {
        this.url = url;
        this.protocols = protocols;
        this.readyState = 0;
        this._listeners = {};
      }
      send(data) {
        this._lastSent = data;
      }
      addEventListener(type, listener) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(listener);
      }
      _emit(type, event) {
        for (const fn of (this._listeners[type] || [])) {
          fn(event);
        }
      }
    };

    postMessageSpy = vi.fn();

    // Build the proxy similarly to injected.js
    ProxiedWebSocket = new Proxy(MockWebSocket, {
      construct(Target, args) {
        const wsUrl = args[0];
        const ws = new Target(...args);

        if (!isVrWebSocket(wsUrl)) {
          return ws;
        }

        const origAddEventListener = ws.addEventListener.bind(ws);
        ws.addEventListener = function (type, listener, options) {
          if (type === 'message') {
            const wrapped = function (event) {
              try {
                postMessageSpy({ type: 'vr-ws-intercepted', direction: 'incoming', data: describeWsData(event.data), url: wsUrl });
              } catch { /* */ }
              return listener.call(this, event);
            };
            return origAddEventListener(type, wrapped, options);
          }
          return origAddEventListener(type, listener, options);
        };

        const origSend = ws.send.bind(ws);
        ws.send = function (data) {
          try {
            postMessageSpy({ type: 'vr-ws-intercepted', direction: 'outgoing', data: describeWsData(data), url: wsUrl });
          } catch { /* */ }
          return origSend(data);
        };

        return ws;
      },
    });
  });

  it('intercepts constructor for VR WebSocket URLs', () => {
    const ws = new ProxiedWebSocket('wss://play.inshore.virtualregatta.com/ws');
    expect(ws).toBeDefined();
    expect(ws.url).toBe('wss://play.inshore.virtualregatta.com/ws');
  });

  it('passes through non-VR WebSockets untouched', () => {
    const ws = new ProxiedWebSocket('wss://echo.websocket.org');
    const listener = vi.fn();
    ws.addEventListener('message', listener);
    ws._emit('message', { data: 'test' });
    expect(listener).toHaveBeenCalled();
    // No interception — postMessage not called
    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it('captures outgoing send() calls', () => {
    const ws = new ProxiedWebSocket('wss://play.inshore.virtualregatta.com/ws');
    ws.send('hello');
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'vr-ws-intercepted',
        direction: 'outgoing',
        url: 'wss://play.inshore.virtualregatta.com/ws',
      }),
    );
    expect(ws._lastSent).toBe('hello');
  });

  it('captures incoming messages via addEventListener', () => {
    const ws = new ProxiedWebSocket('wss://play.inshore.virtualregatta.com/ws');
    const listener = vi.fn();
    ws.addEventListener('message', listener);
    ws._emit('message', { data: '{"pos":1}' });

    expect(listener).toHaveBeenCalled();
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'vr-ws-intercepted',
        direction: 'incoming',
      }),
    );
  });

  it('captures binary ArrayBuffer messages', () => {
    const ws = new ProxiedWebSocket('wss://play.inshore.virtualregatta.com/ws');
    const buf = new ArrayBuffer(4);
    ws.send(buf);
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'outgoing',
        data: expect.objectContaining({ binary: true, size: 4 }),
      }),
    );
  });

  it('does not break send even if postMessage throws', () => {
    postMessageSpy.mockImplementation(() => { throw new Error('boom'); });
    const ws = new ProxiedWebSocket('wss://play.inshore.virtualregatta.com/ws');
    // Should not throw
    expect(() => ws.send('test')).not.toThrow();
    expect(ws._lastSent).toBe('test');
  });
});
