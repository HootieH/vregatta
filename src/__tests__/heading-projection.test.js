import { describe, it, expect } from 'vitest';
import { projectionDistance, computeTimeMarks } from '../dashboard/track-utils.js';

describe('projectionDistance', () => {
  it('computes correct distance for speed and time', () => {
    // 10 knots for 1 minute = 10/60 = 0.1667 nm
    expect(projectionDistance(10, 1)).toBeCloseTo(10 / 60, 3);
  });

  it('computes 1 nm for 6 knots over 10 minutes', () => {
    // 6 kn * 10/60 = 1 nm
    expect(projectionDistance(6, 10)).toBeCloseTo(1, 3);
  });

  it('computes correct for high speed', () => {
    // 20 kn for 5 min = 20 * 5/60 = 1.667 nm
    expect(projectionDistance(20, 5)).toBeCloseTo(20 * 5 / 60, 3);
  });

  it('returns 0 for zero speed', () => {
    expect(projectionDistance(0, 10)).toBe(0);
  });

  it('returns 0 for zero time', () => {
    expect(projectionDistance(10, 0)).toBe(0);
  });

  it('returns 0 for negative speed', () => {
    expect(projectionDistance(-5, 10)).toBe(0);
  });

  it('returns 0 for null inputs', () => {
    expect(projectionDistance(null, 10)).toBe(0);
    expect(projectionDistance(10, null)).toBe(0);
  });
});

describe('computeTimeMarks — Offshore', () => {
  it('returns marks at 1m, 5m, 10m', () => {
    const from = { lat: 48.0, lon: -5.0 };
    const marks = computeTimeMarks(from, 0, 10, false);
    expect(marks).toHaveLength(3);
    expect(marks[0].label).toBe('1m');
    expect(marks[1].label).toBe('5m');
    expect(marks[2].label).toBe('10m');
  });

  it('returns lat/lon for each mark', () => {
    const from = { lat: 48.0, lon: -5.0 };
    const marks = computeTimeMarks(from, 0, 10, false);
    for (const mark of marks) {
      expect(mark.lat).toBeDefined();
      expect(mark.lon).toBeDefined();
    }
  });

  it('marks at progressively farther distances heading north', () => {
    const from = { lat: 48.0, lon: -5.0 };
    const marks = computeTimeMarks(from, 0, 10, false);
    // All marks should be north of starting point (higher lat)
    for (const mark of marks) {
      expect(mark.lat).toBeGreaterThan(from.lat);
    }
    // Each successive mark should be farther north
    expect(marks[1].lat).toBeGreaterThan(marks[0].lat);
    expect(marks[2].lat).toBeGreaterThan(marks[1].lat);
  });

  it('returns empty for zero speed', () => {
    const marks = computeTimeMarks({ lat: 48, lon: -5 }, 0, 0, false);
    expect(marks).toHaveLength(0);
  });

  it('returns empty for null speed', () => {
    const marks = computeTimeMarks({ lat: 48, lon: -5 }, 90, null, false);
    expect(marks).toHaveLength(0);
  });
});

describe('computeTimeMarks — Inshore', () => {
  it('returns marks with x, y coordinates', () => {
    const from = { x: 100, y: 200 };
    const marks = computeTimeMarks(from, 90, 10, true);
    expect(marks).toHaveLength(3);
    for (const mark of marks) {
      expect(mark.x).toBeDefined();
      expect(mark.y).toBeDefined();
      expect(mark.label).toBeDefined();
    }
  });

  it('projects east when heading = 90', () => {
    const from = { x: 100, y: 200 };
    const marks = computeTimeMarks(from, 90, 10, true);
    // Heading 90 = east, sin(90)=1, cos(90)=0
    // x should increase, y should stay roughly same
    for (const mark of marks) {
      expect(mark.x).toBeGreaterThan(from.x);
      expect(mark.y).toBeCloseTo(from.y, 0);
    }
  });

  it('projects north when heading = 0', () => {
    const from = { x: 100, y: 200 };
    const marks = computeTimeMarks(from, 0, 10, true);
    // Heading 0 = north, sin(0)=0, cos(0)=1
    // y should increase, x should stay same
    for (const mark of marks) {
      expect(mark.x).toBeCloseTo(from.x, 0);
      expect(mark.y).toBeGreaterThan(from.y);
    }
  });
});
