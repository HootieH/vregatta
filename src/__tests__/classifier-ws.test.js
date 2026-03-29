import { describe, it, expect } from 'vitest';
import { classify_ws } from '../classifier.js';

describe('classify_ws', () => {
  const WS_URL = 'wss://play.inshore.virtualregatta.com/ws';

  describe('null/empty data', () => {
    it('returns ws-unknown for null data', () => {
      const result = classify_ws(WS_URL, null, 'incoming');
      expect(result.type).toBe('ws-unknown');
      expect(result.wsType).toBeNull();
    });

    it('returns ws-unknown for undefined data', () => {
      const result = classify_ws(WS_URL, undefined, 'incoming');
      expect(result.type).toBe('ws-unknown');
      expect(result.wsType).toBeNull();
    });
  });

  describe('binary messages', () => {
    it('classifies binary data with size and firstBytes', () => {
      const data = { binary: true, size: 128, firstBytes: 'ca fe ba be', base64: 'abc=' };
      const result = classify_ws(WS_URL, data, 'incoming');
      expect(result.type).toBe('ws-unknown');
      expect(result.wsType).toBe('binary');
      expect(result.meta.size).toBe(128);
      expect(result.meta.firstBytes).toBe('ca fe ba be');
    });

    it('handles binary data without firstBytes', () => {
      const data = { binary: true, size: 64 };
      const result = classify_ws(WS_URL, data, 'incoming');
      expect(result.type).toBe('ws-unknown');
      expect(result.wsType).toBe('binary');
      expect(result.meta.firstBytes).toBeNull();
    });
  });

  describe('JSON text messages', () => {
    it('detects position-like data (array with x/lat fields)', () => {
      const data = { binary: false, text: JSON.stringify([{ x: 1, y: 2 }, { x: 3, y: 4 }]) };
      const result = classify_ws(WS_URL, data, 'incoming');
      expect(result.type).toBe('ws-unknown');
      expect(result.wsType).toBe('position-like');
    });

    it('detects session-like data (roomId/sessionId)', () => {
      const data = { binary: false, text: JSON.stringify({ roomId: 'abc123', sessionId: 'xyz' }) };
      const result = classify_ws(WS_URL, data, 'incoming');
      expect(result.type).toBe('ws-unknown');
      expect(result.wsType).toBe('session-like');
    });

    it('detects state-like data (state/players/wind/boats)', () => {
      const data = { binary: false, text: JSON.stringify({ players: [], wind: { speed: 10 } }) };
      const result = classify_ws(WS_URL, data, 'incoming');
      expect(result.type).toBe('ws-unknown');
      expect(result.wsType).toBe('state-like');
    });

    it('classifies generic JSON as json', () => {
      const data = { binary: false, text: JSON.stringify({ foo: 'bar', count: 42 }) };
      const result = classify_ws(WS_URL, data, 'incoming');
      expect(result.type).toBe('ws-unknown');
      expect(result.wsType).toBe('json');
    });

    it('preserves direction in parsed data', () => {
      const data = { binary: false, text: JSON.stringify({ hello: true }) };
      const result = classify_ws(WS_URL, data, 'outgoing');
      expect(result.data.direction).toBe('outgoing');
    });
  });

  describe('non-JSON text messages', () => {
    it('classifies non-JSON text', () => {
      const data = { binary: false, text: 'PING' };
      const result = classify_ws(WS_URL, data, 'incoming');
      expect(result.type).toBe('ws-unknown');
      expect(result.wsType).toBe('text');
      expect(result.data.text).toBe('PING');
    });
  });

  describe('empty text', () => {
    it('returns ws-unknown with null wsType for empty text', () => {
      const data = { binary: false, text: '' };
      const result = classify_ws(WS_URL, data, 'incoming');
      expect(result.type).toBe('ws-unknown');
      expect(result.wsType).toBeNull();
    });
  });

  describe('all messages are ws-unknown (expected for initial Inshore capture)', () => {
    it('never returns a non-ws-unknown type', () => {
      const testCases = [
        { binary: true, size: 100 },
        { binary: false, text: '{"position": [1,2,3]}' },
        { binary: false, text: 'hello' },
        { binary: false, text: JSON.stringify({ roomId: 'x' }) },
        null,
      ];

      for (const data of testCases) {
        const result = classify_ws(WS_URL, data, 'incoming');
        expect(result.type).toBe('ws-unknown');
      }
    });
  });
});
