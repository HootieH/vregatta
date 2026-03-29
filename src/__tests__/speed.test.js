import { describe, it, expect } from 'vitest';
import { getBoatSpeed } from '../polars/speed.js';
import { mockPolar } from './mocks/mock-polar.js';

describe('getBoatSpeed', () => {
  it('returns exact grid point value for sail 1 at TWS=10, TWA=80', () => {
    // Sail 1 (Jib), TWA=80 (index 3), TWS=10 (index 2) → 7.8
    const speed = getBoatSpeed(mockPolar, 10, 80, 1, []);
    expect(speed).toBeCloseTo(7.8);
  });

  it('returns 0 at TWA=0 for all sails', () => {
    const speed = getBoatSpeed(mockPolar, 10, 0, 1, []);
    expect(speed).toBe(0);
  });

  it('returns 0 at TWS=0', () => {
    const speed = getBoatSpeed(mockPolar, 0, 80, 2, []);
    expect(speed).toBe(0);
  });

  it('interpolates between grid points', () => {
    // TWS=8 is between 6 and 10, TWA=80 exact
    // Sail 1: speed[3][1]=5.5, speed[3][2]=7.8
    // fraction = (8-6)/(10-6) = 0.5
    // interpolated = 5.5*0.5 + 7.8*0.5 = 6.65
    const speed = getBoatSpeed(mockPolar, 8, 80, 1, []);
    expect(speed).toBeCloseTo(6.65);
  });

  it('returns 0 for unknown sail', () => {
    const speed = getBoatSpeed(mockPolar, 10, 80, 99, []);
    expect(speed).toBe(0);
  });

  it('speed with foils > speed without in foil zone', () => {
    const withoutFoil = getBoatSpeed(mockPolar, 20, 120, 2, []);
    const withFoil = getBoatSpeed(mockPolar, 20, 120, 2, ['foil']);
    expect(withFoil).toBeGreaterThan(withoutFoil);
  });

  it('applies hull speedRatio', () => {
    const withoutHull = getBoatSpeed(mockPolar, 10, 80, 1, []);
    const withHull = getBoatSpeed(mockPolar, 10, 80, 1, ['hull']);
    expect(withHull).toBeCloseTo(withoutHull * 1.003);
  });

  it('applies globalSpeedRatio', () => {
    const polarWith2x = { ...mockPolar, globalSpeedRatio: 2.0 };
    const normal = getBoatSpeed(mockPolar, 10, 80, 1, []);
    const doubled = getBoatSpeed(polarWith2x, 10, 80, 1, []);
    expect(doubled).toBeCloseTo(normal * 2.0);
  });
});
