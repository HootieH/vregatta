import { describe, it, expect } from 'vitest';
import { computeLaylines } from '../routing/layline.js';
import { mockPolar } from './mocks/mock-polar.js';

describe('computeLaylines', () => {
  const boat = { lat: 48.0, lon: -3.0, tws: 10, twd: 0 };
  const mark = { lat: 48.5, lon: -3.0 };

  it('returns upwind and downwind layline objects', () => {
    const result = computeLaylines(boat, mark, mockPolar, []);
    expect(result.upwind).toBeDefined();
    expect(result.upwind.port).toBeDefined();
    expect(result.upwind.starboard).toBeDefined();
    expect(result.downwind).toBeDefined();
    expect(result.downwind.port).toBeDefined();
    expect(result.downwind.starboard).toBeDefined();
  });

  it('layline lines start at the mark', () => {
    const result = computeLaylines(boat, mark, mockPolar, []);
    const firstPoint = result.upwind.port.line[0];
    expect(firstPoint.lat).toBeCloseTo(mark.lat, 3);
    expect(firstPoint.lon).toBeCloseTo(mark.lon, 3);
  });

  it('upwind laylines are at correct TWA angles from wind', () => {
    const result = computeLaylines(boat, mark, mockPolar, []);
    // Port and starboard headings should be symmetric around TWD
    const portH = result.upwind.port.heading;
    const stbdH = result.upwind.starboard.heading;
    // Both should be roughly the same angular distance from TWD=0
    const portDiff = Math.min(Math.abs(portH), 360 - Math.abs(portH));
    const stbdDiff = Math.min(Math.abs(stbdH), 360 - Math.abs(stbdH));
    expect(portDiff).toBeCloseTo(stbdDiff, 0);
  });

  it('returns onLayline boolean', () => {
    const result = computeLaylines(boat, mark, mockPolar, []);
    expect(typeof result.onLayline).toBe('boolean');
  });

  it('returns laylineDistance as a number', () => {
    const result = computeLaylines(boat, mark, mockPolar, []);
    expect(typeof result.laylineDistance).toBe('number');
    expect(result.laylineDistance).toBeGreaterThanOrEqual(0);
  });

  it('laylines have multiple points', () => {
    const result = computeLaylines(boat, mark, mockPolar, []);
    expect(result.upwind.port.line.length).toBeGreaterThan(2);
    expect(result.upwind.starboard.line.length).toBeGreaterThan(2);
  });
});
