import { describe, it, expect } from 'vitest';
import { adviseBestHeading } from '../routing/heading-advisor.js';
import { mockPolar } from './mocks/mock-polar.js';

describe('adviseBestHeading', () => {
  it('returns error when polar is missing', () => {
    const result = adviseBestHeading(
      { lat: 0, lon: 0, tws: 10, twd: 0 },
      { lat: 1, lon: 0 },
      null,
      [],
    );
    expect(result.error).toBeTruthy();
  });

  it('returns error when wind data is missing', () => {
    const result = adviseBestHeading(
      { lat: 0, lon: 0, tws: null, twd: null },
      { lat: 1, lon: 0 },
      mockPolar,
      [],
    );
    expect(result.error).toBeTruthy();
  });

  it('recommends reasonable heading for upwind scenario', () => {
    // Waypoint is due north, wind from north (TWD=0) -> upwind
    const result = adviseBestHeading(
      { lat: 0, lon: 0, tws: 10, twd: 0 },
      { lat: 10, lon: 0 },
      mockPolar,
      [],
    );
    expect(result.error).toBeUndefined();
    expect(result.isUpwind).toBe(true);
    // Best heading should be offset from bearing (can't sail straight into wind)
    expect(result.bestTwa).toBeGreaterThan(20);
    expect(result.bestTwa).toBeLessThan(90);
    expect(result.bestVmgToWP).toBeGreaterThan(0);
    expect(result.bestSail).toBeDefined();
    expect(result.bearingToWP).toBeCloseTo(0, 0);
  });

  it('recommends reasonable heading for downwind scenario', () => {
    // Waypoint is due north, wind from south (TWD=180) -> downwind
    const result = adviseBestHeading(
      { lat: 0, lon: 0, tws: 10, twd: 180 },
      { lat: 10, lon: 0 },
      mockPolar,
      [],
    );
    expect(result.error).toBeUndefined();
    expect(result.isDownwind).toBe(true);
    expect(result.bestVmgToWP).toBeGreaterThan(0);
    expect(result.bestTwa).toBeGreaterThan(90);
  });

  it('flags direct route when reaching', () => {
    // Waypoint due east, wind from north -> reaching at TWA ~90
    const result = adviseBestHeading(
      { lat: 0, lon: 0, tws: 10, twd: 0 },
      { lat: 0, lon: 10 },
      mockPolar,
      [],
    );
    expect(result.error).toBeUndefined();
    expect(result.directRoutePossible).toBe(true);
    expect(result.directTwa).toBeCloseTo(90, 0);
  });

  it('returns alternatives', () => {
    const result = adviseBestHeading(
      { lat: 0, lon: 0, tws: 10, twd: 0 },
      { lat: 10, lon: 0 },
      mockPolar,
      [],
    );
    expect(result.alternatives).toBeDefined();
    expect(result.alternatives.length).toBeLessThanOrEqual(3);
  });

  it('computes distance and ETA', () => {
    const result = adviseBestHeading(
      { lat: 0, lon: 0, tws: 10, twd: 90 },
      { lat: 1, lon: 0 },
      mockPolar,
      [],
    );
    expect(result.distanceToWP).toBeCloseTo(60, 0);
    expect(result.etaHours).toBeGreaterThan(0);
    expect(result.etaHours).toBeLessThan(100);
  });
});
