import { describe, it, expect } from 'vitest';
import {
  bearingTo,
  distanceNm,
  destinationPoint,
  twaForHeading,
  headingForTwa,
  vmgToWaypoint,
} from '../routing/geometry.js';

describe('bearingTo', () => {
  it('returns ~0 for due north', () => {
    const b = bearingTo({ lat: 0, lon: 0 }, { lat: 10, lon: 0 });
    expect(b).toBeCloseTo(0, 0);
  });

  it('returns ~90 for due east on equator', () => {
    const b = bearingTo({ lat: 0, lon: 0 }, { lat: 0, lon: 10 });
    expect(b).toBeCloseTo(90, 0);
  });

  it('returns ~180 for due south', () => {
    const b = bearingTo({ lat: 10, lon: 0 }, { lat: 0, lon: 0 });
    expect(b).toBeCloseTo(180, 0);
  });

  it('returns ~270 for due west on equator', () => {
    const b = bearingTo({ lat: 0, lon: 10 }, { lat: 0, lon: 0 });
    expect(b).toBeCloseTo(270, 0);
  });

  it('computes known bearing NYC to London', () => {
    // NYC (40.7128, -74.0060) to London (51.5074, -0.1278)
    const b = bearingTo(
      { lat: 40.7128, lon: -74.0060 },
      { lat: 51.5074, lon: -0.1278 },
    );
    // Expected ~51 degrees (NE great circle)
    expect(b).toBeGreaterThan(45);
    expect(b).toBeLessThan(60);
  });
});

describe('distanceNm', () => {
  it('returns ~60 nm for 1 degree latitude', () => {
    const d = distanceNm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(d).toBeCloseTo(60, 0);
  });

  it('returns 0 for same point', () => {
    const d = distanceNm({ lat: 48.5, lon: -3.2 }, { lat: 48.5, lon: -3.2 });
    expect(d).toBeCloseTo(0);
  });

  it('computes known distance NYC to London (~3000 nm)', () => {
    const d = distanceNm(
      { lat: 40.7128, lon: -74.0060 },
      { lat: 51.5074, lon: -0.1278 },
    );
    expect(d).toBeGreaterThan(2900);
    expect(d).toBeLessThan(3100);
  });
});

describe('destinationPoint', () => {
  it('returns point north at correct distance', () => {
    const dest = destinationPoint({ lat: 0, lon: 0 }, 0, 60);
    expect(dest.lat).toBeCloseTo(1, 1);
    expect(dest.lon).toBeCloseTo(0, 1);
  });

  it('round-trips with distanceNm', () => {
    const start = { lat: 48.5, lon: -3.2 };
    const dest = destinationPoint(start, 135, 100);
    const d = distanceNm(start, dest);
    expect(d).toBeCloseTo(100, 0);
  });
});

describe('twaForHeading', () => {
  it('returns 0 when heading equals TWD', () => {
    expect(twaForHeading(90, 90)).toBeCloseTo(0);
  });

  it('returns 180 when heading is opposite TWD', () => {
    expect(twaForHeading(90, 270)).toBeCloseTo(180);
  });

  it('returns 45 for 45 degree offset', () => {
    expect(twaForHeading(135, 90)).toBeCloseTo(45);
  });

  it('wraps around 360/0 boundary', () => {
    expect(twaForHeading(10, 350)).toBeCloseTo(20);
  });
});

describe('headingForTwa', () => {
  it('returns starboard and port headings', () => {
    const { starboard, port } = headingForTwa(45, 180);
    expect(starboard).toBeCloseTo(225);
    expect(port).toBeCloseTo(135);
  });

  it('wraps correctly near 0/360', () => {
    const { starboard, port } = headingForTwa(30, 10);
    expect(starboard).toBeCloseTo(40);
    expect(port).toBeCloseTo(340);
  });
});

describe('vmgToWaypoint', () => {
  it('returns full speed when heading directly to waypoint', () => {
    const vmg = vmgToWaypoint(10, 90, 90);
    expect(vmg).toBeCloseTo(10);
  });

  it('returns 0 when heading perpendicular to waypoint', () => {
    const vmg = vmgToWaypoint(10, 90, 0);
    expect(vmg).toBeCloseTo(0, 0);
  });

  it('returns negative when heading away from waypoint', () => {
    const vmg = vmgToWaypoint(10, 90, 270);
    expect(vmg).toBeLessThan(0);
  });

  it('returns partial VMG for angled heading', () => {
    // 45 degree offset: cos(45) * 10 ≈ 7.07
    const vmg = vmgToWaypoint(10, 135, 90);
    expect(vmg).toBeCloseTo(7.07, 1);
  });
});
