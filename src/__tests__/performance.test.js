import { describe, it, expect } from 'vitest';
import {
  computeVMGEfficiency,
  computeSpeedEfficiency,
  computeSailScore,
  analyzeTackQuality,
} from '../analytics/performance.js';
import { bestVMG } from '../polars/best-vmg.js';
import { mockPolar } from './mocks/mock-polar.js';

describe('computeVMGEfficiency', () => {
  it('returns ~100% when sailing at optimal upwind TWA', () => {
    const best = bestVMG(16, mockPolar, []);
    const boatState = {
      speed: best.vmgUp / Math.cos((best.twaUp * Math.PI) / 180),
      twa: best.twaUp,
      tws: 16,
      sail: best.sailUp,
    };
    const eff = computeVMGEfficiency(boatState, mockPolar, []);
    expect(eff).toBeGreaterThanOrEqual(98);
    expect(eff).toBeLessThanOrEqual(100);
  });

  it('returns less than 100% at a suboptimal TWA', () => {
    const boatState = {
      speed: 5.0,
      twa: 70,
      tws: 16,
      sail: 1,
    };
    const eff = computeVMGEfficiency(boatState, mockPolar, []);
    expect(eff).toBeLessThan(100);
    expect(eff).toBeGreaterThan(0);
  });

  it('returns null with missing data', () => {
    expect(computeVMGEfficiency(null, mockPolar, [])).toBeNull();
    expect(computeVMGEfficiency({ speed: 5 }, mockPolar, [])).toBeNull();
    expect(computeVMGEfficiency({ speed: 5, twa: 45, tws: 0 }, mockPolar, [])).toBeNull();
  });

  it('handles downwind VMG', () => {
    const best = bestVMG(16, mockPolar, []);
    const boatState = {
      speed: Math.abs(best.vmgDown) / Math.abs(Math.cos((best.twaDown * Math.PI) / 180)),
      twa: best.twaDown,
      tws: 16,
      sail: best.sailDown,
    };
    const eff = computeVMGEfficiency(boatState, mockPolar, []);
    expect(eff).toBeGreaterThanOrEqual(98);
  });
});

describe('computeSpeedEfficiency', () => {
  it('returns 100% when at max polar speed for TWS/TWA', () => {
    // At TWS=16, TWA=80, sail 1 (Jib) gives 8.5 in the polar
    const boatState = { speed: 8.5, twa: 80, tws: 16, sail: 1 };
    const eff = computeSpeedEfficiency(boatState, mockPolar, []);
    // Sail 2 (Spi) at TWA=80 TWS=16 gives 7.5, so Jib is better
    // Max across sails 1,2 at TWA=80, TWS=16: Jib=8.5 vs Spi=7.5 => max=8.5
    expect(eff).toBeCloseTo(100);
  });

  it('returns less than 100% when below polar speed', () => {
    const boatState = { speed: 5.0, twa: 80, tws: 16, sail: 1 };
    const eff = computeSpeedEfficiency(boatState, mockPolar, []);
    expect(eff).toBeLessThan(100);
    expect(eff).toBeGreaterThan(0);
  });

  it('returns null with missing data', () => {
    expect(computeSpeedEfficiency(null, mockPolar, [])).toBeNull();
  });
});

describe('computeSailScore', () => {
  it('returns correct=true when using the optimal sail', () => {
    // At TWA=80, TWS=16, Jib (8.5) beats Spi (7.5) with basic sails
    const boatState = { speed: 8.5, twa: 80, tws: 16, sail: 1 };
    const result = computeSailScore(boatState, mockPolar, []);
    expect(result.correct).toBe(true);
    expect(result.currentSail).toBe('Jib');
    expect(result.speedLoss).toBeCloseTo(0);
  });

  it('returns correct=false when using a suboptimal sail', () => {
    // At TWA=150, TWS=16, Spi (10.8) beats Jib (5.2) with basic sails
    const boatState = { speed: 5.2, twa: 150, tws: 16, sail: 1 };
    const result = computeSailScore(boatState, mockPolar, []);
    expect(result.correct).toBe(false);
    expect(result.currentSail).toBe('Jib');
    expect(result.optimalSail).toBe('Spi');
    expect(result.speedLoss).toBeGreaterThan(0);
  });

  it('returns null with missing data', () => {
    expect(computeSailScore(null, mockPolar, [])).toBeNull();
  });
});

describe('analyzeTackQuality', () => {
  it('scores a clean tack highly', () => {
    const best = bestVMG(16, mockPolar, []);
    const before = { speed: 8.0, twa: -best.twaUp, tws: 16, timestamp: 1000 };
    const after = { speed: 7.5, twa: best.twaUp, tws: 16, timestamp: 1005 };
    const result = analyzeTackQuality(before, after, mockPolar, []);
    expect(result).not.toBeNull();
    expect(result.overallScore).toBeGreaterThan(50);
    expect(result.speedLoss).toBeCloseTo(0.5);
  });

  it('scores a sloppy tack poorly', () => {
    const before = { speed: 8.0, twa: -45, tws: 16, timestamp: 1000 };
    // Big speed loss, bad angle, slow recovery
    const after = { speed: 3.0, twa: 90, tws: 16, timestamp: 1030 };
    const result = analyzeTackQuality(before, after, mockPolar, []);
    expect(result).not.toBeNull();
    expect(result.overallScore).toBeLessThan(50);
  });

  it('returns null with missing data', () => {
    expect(analyzeTackQuality(null, {}, mockPolar, [])).toBeNull();
  });
});
