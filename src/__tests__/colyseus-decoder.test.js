import { describe, it, expect } from 'vitest';
import {
  parseColyseusMessage,
  decompressState,
  decodeHeading,
  decodeServerAck,
  encodeHeading,
} from '../colyseus/decoder.js';
import { decodeState, decodeMsgpack, scaledToHeading } from '../colyseus/state-decoder.js';
import { classify_ws } from '../classifier.js';

// --- Real captured data (base64 from live VR Inshore race) ---

const FIXTURES = {
  // ROOM_STATE (0x04) — 200 bytes, zlib-compressed game state
  roomState: '8wRvAAEAeAAAAL142l2OrQrCYBiF3/04N38HBgeKYvEnmkSZJkFsgk0EsWkxDaNi8AK+8qWBUYPJK7AYDIbjBYgyWPYCxDlhIHh4OA+nnRuliCuiJKuayEjiRB4RyRzL9h8hRmFGCtNVRhqjCL943o/M0+8oRzaP6gDHPpwZNjvY8xgnvM94rH25UBZxG7UTLAPmFNM9GndMXmgeMaqjW4BVhLnCWEhwlA5ouchtUXYQGaKySvrnvtEDC1cSOr10sAz6AGKlV7A=',
  // ROOM_DATA_SCHEMA (0x06) — 11 bytes, helm input with heading ~257.34 degrees
  helmInput: '8wYBAAEBaQABtv8=',
  // Another helm input with heading ~5.21 degrees (wraps past 360)
  helmInput2: '8wYBAAEBaQACA7U=',
  // ROOM_DATA_BYTES (0x07) — 20 bytes, server ack
  serverAck: '8wcBAAAqAAIBaQABtv8CabBZf2M=',
  // ROOM_DATA (0x03) — 8 bytes
  roomData: '8wP+AAAqAAA=',
  // LEAVE_ROOM (0x02) — 5 bytes
  leaveRoom: '8wL+AAA=',
};

function b64ToUint8(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

// --- parseColyseusMessage ---

describe('parseColyseusMessage', () => {
  it('identifies ROOM_STATE (0x04)', () => {
    const buf = b64ToUint8(FIXTURES.roomState);
    const { type, typeByte, payload } = parseColyseusMessage(buf);
    expect(type).toBe('room_state');
    expect(typeByte).toBe(0x04);
    expect(payload.length).toBe(buf.length - 2);
  });

  it('identifies ROOM_DATA_SCHEMA (0x06)', () => {
    const buf = b64ToUint8(FIXTURES.helmInput);
    const { type, typeByte } = parseColyseusMessage(buf);
    expect(type).toBe('room_data_schema');
    expect(typeByte).toBe(0x06);
  });

  it('identifies ROOM_DATA_BYTES (0x07)', () => {
    const buf = b64ToUint8(FIXTURES.serverAck);
    const { type, typeByte } = parseColyseusMessage(buf);
    expect(type).toBe('room_data_bytes');
    expect(typeByte).toBe(0x07);
  });

  it('identifies ROOM_DATA (0x03)', () => {
    const buf = b64ToUint8(FIXTURES.roomData);
    const { type } = parseColyseusMessage(buf);
    expect(type).toBe('room_data');
  });

  it('identifies LEAVE_ROOM (0x02)', () => {
    const buf = b64ToUint8(FIXTURES.leaveRoom);
    const { type } = parseColyseusMessage(buf);
    expect(type).toBe('leave_room');
  });

  it('returns unknown for non-0xf3 header', () => {
    const buf = new Uint8Array([0xaa, 0x04, 0x00]);
    const { type } = parseColyseusMessage(buf);
    expect(type).toBe('unknown');
  });

  it('returns unknown for empty buffer', () => {
    const { type } = parseColyseusMessage(new Uint8Array(0));
    expect(type).toBe('unknown');
  });

  it('returns unknown for null input', () => {
    const { type } = parseColyseusMessage(null);
    expect(type).toBe('unknown');
  });
});

// --- decompressState ---

describe('decompressState', () => {
  it('decompresses ROOM_STATE payload to ~200 bytes', () => {
    const buf = b64ToUint8(FIXTURES.roomState);
    const payload = buf.slice(2); // strip 0xf3 + type
    const decompressed = decompressState(payload);
    expect(decompressed).toBeInstanceOf(Uint8Array);
    expect(decompressed.length).toBeGreaterThan(100);
    expect(decompressed.length).toBeLessThan(500);
    // First byte should be 0xde (MessagePack map16)
    expect(decompressed[0]).toBe(0xde);
  });

  it('throws on payload without zlib magic', () => {
    const bad = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
    expect(() => decompressState(bad)).toThrow('no zlib magic');
  });

  it('throws on too-short payload', () => {
    expect(() => decompressState(new Uint8Array(2))).toThrow('too short');
  });
});

// --- decodeHeading ---

describe('decodeHeading', () => {
  it('decodes heading from first helm input (~257.34 degrees)', () => {
    const buf = b64ToUint8(FIXTURES.helmInput);
    const payload = buf.slice(2); // strip 0xf3 + 0x06
    const { heading, raw } = decodeHeading(payload);
    // Last 2 bytes: b6 ff = 46847 -> 46847 * 360 / 65536 = 257.34
    expect(raw).toBe(0xb6ff);
    expect(heading).toBeCloseTo(257.34, 1);
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(heading).toBeLessThanOrEqual(360);
  });

  it('decodes heading from second helm input (~5.21 degrees)', () => {
    const buf = b64ToUint8(FIXTURES.helmInput2);
    const payload = buf.slice(2);
    const { heading } = decodeHeading(payload);
    // Last 2 bytes: 03 b5 = 949 -> 949 * 360 / 65536 = 5.21
    expect(heading).toBeCloseTo(5.21, 1);
  });

  it('all headings from capture are in 0-360 range', () => {
    // Verify against all 46 helm inputs from the real capture
    const helmB64s = [
      '8wYBAAEBaQABtv8=', '8wYBAAEBaQABuyk=', '8wYBAAEBaQABv1Q=',
      '8wYBAAEBaQABwz4=', '8wYBAAEBaQABx4c=', '8wYBAAEBaQABy3A=',
      '8wYBAAEBaQABz3k=', '8wYBAAEBaQAB06U=', '8wYBAAEBaQAB16w=',
      '8wYBAAEBaQAB3Js=', '8wYBAAEBaQAB4Kg=', '8wYBAAEBaQAB5OE=',
      '8wYBAAEBaQAB6Qs=', '8wYBAAEBaQAB7Tk=', '8wYBAAEBaQAB8UU=',
      '8wYBAAEBaQAB9Uo=', '8wYBAAEBaQAB+WU=', '8wYBAAEBaQAB/ZA=',
      '8wYBAAEBaQACA7U=', '8wYBAAEBaQACC4U=', '8wYBAAEBaQACE1U=',
      '8wYBAAEBaQACFz4=', '8wYBAAEBaQACHw0=',
    ];

    for (const b64 of helmB64s) {
      const buf = b64ToUint8(b64);
      const payload = buf.slice(2);
      const { heading } = decodeHeading(payload);
      expect(heading).toBeGreaterThanOrEqual(0);
      expect(heading).toBeLessThanOrEqual(360);
    }
  });

  it('throws on too-short payload', () => {
    expect(() => decodeHeading(new Uint8Array(3))).toThrow('too short');
  });
});

// --- decodeServerAck ---

describe('decodeServerAck', () => {
  it('decodes heading and timestamp from server ack', () => {
    const buf = b64ToUint8(FIXTURES.serverAck);
    const payload = buf.slice(2);
    const { heading, headingRaw, timestamp } = decodeServerAck(payload);
    // Heading should match the helm input: 0xb6ff = 257.34
    expect(heading).toBeCloseTo(257.34, 1);
    expect(headingRaw).toBe(0xb6ff);
    // Timestamp is a server tick (uint32)
    expect(timestamp).toBeGreaterThan(0);
    expect(typeof timestamp).toBe('number');
  });

  it('heading in ack matches corresponding helm input', () => {
    // Helm: heading ~257.34
    const helmBuf = b64ToUint8(FIXTURES.helmInput);
    const { heading: helmHeading } = decodeHeading(helmBuf.slice(2));

    // Ack: should echo same heading
    const ackBuf = b64ToUint8(FIXTURES.serverAck);
    const { heading: ackHeading } = decodeServerAck(ackBuf.slice(2));

    expect(ackHeading).toBeCloseTo(helmHeading, 2);
  });

  it('throws on too-short payload', () => {
    expect(() => decodeServerAck(new Uint8Array(10))).toThrow('too short');
  });
});

// --- encodeHeading round-trip ---

describe('encodeHeading', () => {
  it('round-trips common headings', () => {
    for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const raw = encodeHeading(deg);
      const decoded = raw * 360 / 65536;
      expect(decoded).toBeCloseTo(deg, 0);
    }
  });
});

// --- State decoder (MessagePack) ---

describe('decodeState', () => {
  it('decodes decompressed state into boats', () => {
    const buf = b64ToUint8(FIXTURES.roomState);
    const payload = buf.slice(2);
    const decompressed = decompressState(payload);
    const state = decodeState(decompressed);

    expect(state.boatCount).toBe(6);
    expect(state.boats).toHaveLength(6);
    expect(state.tick).toBeGreaterThan(0);
  });

  it('boat headings are in 0-360 range', () => {
    const buf = b64ToUint8(FIXTURES.roomState);
    const decompressed = decompressState(buf.slice(2));
    const state = decodeState(decompressed);

    for (const boat of state.boats) {
      expect(boat.heading).toBeGreaterThanOrEqual(0);
      expect(boat.heading).toBeLessThanOrEqual(360);
    }
  });

  it('boat positions are numeric pairs', () => {
    const buf = b64ToUint8(FIXTURES.roomState);
    const decompressed = decompressState(buf.slice(2));
    const state = decodeState(decompressed);

    for (const boat of state.boats) {
      expect(typeof boat.posX).toBe('number');
      expect(typeof boat.posY).toBe('number');
    }
  });

  it('preserves raw MessagePack data', () => {
    const buf = b64ToUint8(FIXTURES.roomState);
    const decompressed = decompressState(buf.slice(2));
    const state = decodeState(decompressed);

    expect(state.raw).toBeDefined();
    expect(typeof state.raw).toBe('object');
    // Key 0 should be the boat slots array
    expect(Array.isArray(state.raw[0])).toBe(true);
  });

  it('throws on too-short input', () => {
    expect(() => decodeState(new Uint8Array(1))).toThrow('too short');
  });
});

// --- MessagePack decoder ---

describe('decodeMsgpack', () => {
  it('decodes positive fixint', () => {
    const [val, off] = decodeMsgpack(new Uint8Array([42]), 0);
    expect(val).toBe(42);
    expect(off).toBe(1);
  });

  it('decodes negative fixint', () => {
    const [val] = decodeMsgpack(new Uint8Array([0xff]), 0);
    expect(val).toBe(-1);
  });

  it('decodes fixarray', () => {
    // 0x93 = fixarray of 3, followed by 1, 2, 3
    const [val] = decodeMsgpack(new Uint8Array([0x93, 1, 2, 3]), 0);
    expect(val).toEqual([1, 2, 3]);
  });

  it('decodes int16 (d1)', () => {
    // d1 7f 44 = 32580
    const [val] = decodeMsgpack(new Uint8Array([0xd1, 0x7f, 0x44]), 0);
    expect(val).toBe(32580);
  });

  it('decodes negative int16', () => {
    // d1 ff ff = -1
    const [val] = decodeMsgpack(new Uint8Array([0xd1, 0xff, 0xff]), 0);
    expect(val).toBe(-1);
  });

  it('decodes uint16 (cd)', () => {
    // cd ff ff = 65535
    const [val] = decodeMsgpack(new Uint8Array([0xcd, 0xff, 0xff]), 0);
    expect(val).toBe(65535);
  });

  it('decodes uint32 (ce)', () => {
    // ce 00 01 47 50 = 83792
    const [val] = decodeMsgpack(new Uint8Array([0xce, 0x00, 0x01, 0x47, 0x50]), 0);
    expect(val).toBe(83792);
  });
});

// --- scaledToHeading ---

describe('scaledToHeading', () => {
  it('converts positive int16 to heading', () => {
    // 7199 * 360 / 65536 = 39.54
    expect(scaledToHeading(7199)).toBeCloseTo(39.54, 0);
  });

  it('converts negative int16 to heading (unsigned wrap)', () => {
    // -16301 -> 65536 - 16301 = 49235 -> 49235 * 360 / 65536 = 270.47
    expect(scaledToHeading(-16301)).toBeCloseTo(270.47, 0);
  });

  it('zero maps to zero', () => {
    expect(scaledToHeading(0)).toBe(0);
  });
});

// --- classify_ws with Colyseus decoding ---

describe('classify_ws with Colyseus binary', () => {
  const WS_URL = 'wss://game1-v5.inshore.virtualregatta.com:9091/Game';

  it('classifies helm input as ws-helm-input with decoded heading', () => {
    const data = {
      binary: true,
      base64: FIXTURES.helmInput,
      size: 11,
      firstBytes: 'f3 06 01 00 01 01 69 00 01 b6 ff',
    };
    const result = classify_ws(WS_URL, data, 'outgoing');
    expect(result.type).toBe('ws-helm-input');
    expect(result.decoded).toBeDefined();
    expect(result.decoded.heading).toBeCloseTo(257.34, 1);
  });

  it('classifies server ack as ws-ack with decoded heading', () => {
    const data = {
      binary: true,
      base64: FIXTURES.serverAck,
      size: 20,
      firstBytes: 'f3 07 01 00 00 2a 00 02 01 69 00 01 b6 ff 02 69',
    };
    const result = classify_ws(WS_URL, data, 'incoming');
    expect(result.type).toBe('ws-ack');
    expect(result.decoded.heading).toBeCloseTo(257.34, 1);
    expect(result.decoded.timestamp).toBeGreaterThan(0);
  });

  it('classifies room state as ws-state', () => {
    const data = {
      binary: true,
      base64: FIXTURES.roomState,
      size: 200,
      firstBytes: 'f3 04 6f 00 01 00 78 00 00 00 bd 78 da 5d 8e ad',
    };
    const result = classify_ws(WS_URL, data, 'incoming');
    expect(result.type).toBe('ws-state');
  });

  it('classifies room data as ws-data', () => {
    const data = {
      binary: true,
      base64: FIXTURES.roomData,
      size: 8,
    };
    const result = classify_ws(WS_URL, data, 'incoming');
    expect(result.type).toBe('ws-data');
  });

  it('classifies leave room as ws-leave', () => {
    const data = {
      binary: true,
      base64: FIXTURES.leaveRoom,
      size: 32,
    };
    const result = classify_ws(WS_URL, data, 'outgoing');
    expect(result.type).toBe('ws-leave');
  });

  it('falls back to ws-unknown for non-0xf3 binary', () => {
    const data = {
      binary: true,
      base64: Buffer.from([0xaa, 0xbb, 0xcc]).toString('base64'),
      size: 3,
    };
    const result = classify_ws(WS_URL, data, 'incoming');
    expect(result.type).toBe('ws-unknown');
  });

  it('falls back to ws-unknown for binary without base64', () => {
    const data = { binary: true, size: 100 };
    const result = classify_ws(WS_URL, data, 'incoming');
    expect(result.type).toBe('ws-unknown');
    expect(result.wsType).toBe('binary');
  });
});
