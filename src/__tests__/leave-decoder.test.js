import { describe, it, expect } from 'vitest';
import { decodeLeaveMessage } from '../colyseus/leave-decoder.js';

/**
 * Helper: build a LEAVE message buffer with given markId and crossing angle.
 * Format: 0xf3 0x02 [20 bytes padding] [markId] [float32 BE angle]
 */
function buildLeaveBuffer(markId, angle) {
  const buf = new Uint8Array(2 + 25); // header(2) + payload(25)
  buf[0] = 0xf3;
  buf[1] = 0x02;
  // Payload offset 20 = markId
  buf[2 + 20] = markId;
  // Float32 BE at payload offset 21..24
  const dv = new DataView(buf.buffer, 2 + 21, 4);
  dv.setFloat32(0, angle, false); // big-endian
  return buf;
}

describe('decodeLeaveMessage', () => {
  it('returns null for null/short buffer', () => {
    expect(decodeLeaveMessage(null)).toBeNull();
    expect(decodeLeaveMessage(new Uint8Array(5))).toBeNull();
  });

  it('decodes mark ID 0 (windward port)', () => {
    const buf = buildLeaveBuffer(0, 45.5);
    const result = decodeLeaveMessage(buf);
    expect(result).not.toBeNull();
    expect(result.markId).toBe(0);
  });

  it('decodes mark ID 1 (windward starboard)', () => {
    const buf = buildLeaveBuffer(1, -30.0);
    const result = decodeLeaveMessage(buf);
    expect(result.markId).toBe(1);
  });

  it('decodes mark ID 2 (start/finish)', () => {
    const buf = buildLeaveBuffer(2, 90.0);
    const result = decodeLeaveMessage(buf);
    expect(result.markId).toBe(2);
  });

  it('decodes crossing angle as float32 BE', () => {
    const angle = 123.45;
    const buf = buildLeaveBuffer(0, angle);
    const result = decodeLeaveMessage(buf);
    expect(result.hasAngle).toBe(true);
    // Float32 precision: ~0.01
    expect(result.crossingAngle).toBeCloseTo(angle, 1);
  });

  it('decodes negative crossing angle', () => {
    const buf = buildLeaveBuffer(1, -67.89);
    const result = decodeLeaveMessage(buf);
    expect(result.hasAngle).toBe(true);
    expect(result.crossingAngle).toBeCloseTo(-67.89, 1);
  });

  it('handles NaN angle (no crossing angle)', () => {
    const buf = buildLeaveBuffer(2, NaN);
    const result = decodeLeaveMessage(buf);
    expect(result.hasAngle).toBe(false);
    expect(isNaN(result.crossingAngle)).toBe(true);
  });

  it('works without 0xf3 header (raw payload)', () => {
    // Build a buffer that starts without header — 25+ bytes payload
    const buf = new Uint8Array(25);
    buf[20] = 1; // markId
    const dv = new DataView(buf.buffer, 21, 4);
    dv.setFloat32(0, 55.5, false);
    const result = decodeLeaveMessage(buf);
    expect(result.markId).toBe(1);
    expect(result.crossingAngle).toBeCloseTo(55.5, 1);
  });

  it('returns null for payload too short', () => {
    // Only 10 bytes after header — not enough
    const buf = new Uint8Array(12);
    buf[0] = 0xf3;
    buf[1] = 0x02;
    expect(decodeLeaveMessage(buf)).toBeNull();
  });
});
