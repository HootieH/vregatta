import { describe, it, expect } from 'vitest';
import { computeSessionStats } from '../analytics/session-stats.js';
import { mockPolar } from './mocks/mock-polar.js';

function makeState(overrides, i) {
  return {
    speed: 8.0,
    twa: 45,
    tws: 16,
    sail: 1,
    lat: 48.0 + i * 0.001,
    lon: -5.0 + i * 0.001,
    timestamp: 1000 + i * 5000,
    ...overrides,
  };
}

describe('computeSessionStats', () => {
  const history = Array.from({ length: 20 }, (_, i) => makeState({}, i));
  const events = [
    { type: 'tack', timestamp: 1000 + 5 * 5000 },
    { type: 'gybe', timestamp: 1000 + 15 * 5000 },
  ];
  const stats = computeSessionStats(history, events, mockPolar, []);

  it('computes avgSpeedEfficiency', () => {
    expect(stats.avgSpeedEfficiency).not.toBeNull();
    expect(stats.avgSpeedEfficiency).toBeGreaterThan(0);
    expect(stats.avgSpeedEfficiency).toBeLessThanOrEqual(100);
  });

  it('computes avgVMGEfficiency', () => {
    expect(stats.avgVMGEfficiency).not.toBeNull();
    expect(stats.avgVMGEfficiency).toBeGreaterThan(0);
  });

  it('counts tacks and gybes', () => {
    expect(stats.tackCount).toBe(1);
    expect(stats.gybeCount).toBe(1);
  });

  it('computes bestSpeed', () => {
    expect(stats.bestSpeed).toBe(8.0);
  });

  it('computes distanceSailed > 0', () => {
    expect(stats.distanceSailed).toBeGreaterThan(0);
  });

  it('computes distanceMadeGood > 0', () => {
    expect(stats.distanceMadeGood).toBeGreaterThan(0);
  });

  it('has sailDistribution with sail 1', () => {
    expect(stats.sailDistribution).toHaveProperty('1');
    expect(stats.sailDistribution['1']).toBe(100);
  });

  it('computes timeOnWrongSail', () => {
    // At TWA=45, Jib is optimal for basic sails, so should be 0
    expect(stats.timeOnWrongSail).toBe(0);
  });

  it('detects wrong sail time', () => {
    // Use sail 1 (Jib) at TWA=150 where Spi is better
    const wrongSailHistory = Array.from({ length: 10 }, (_, i) =>
      makeState({ twa: 150, sail: 1 }, i),
    );
    const wrongStats = computeSessionStats(wrongSailHistory, [], mockPolar, []);
    expect(wrongStats.timeOnWrongSail).toBeGreaterThan(0);
  });

  it('returns empty stats for empty history', () => {
    const empty = computeSessionStats([], [], mockPolar, []);
    expect(empty.avgSpeedEfficiency).toBeNull();
    expect(empty.tackCount).toBe(0);
    expect(empty.distanceSailed).toBe(0);
  });

  it('includes worstVMGMoment', () => {
    expect(stats.worstVMGMoment).not.toBeNull();
    expect(stats.worstVMGMoment).toHaveProperty('timestamp');
    expect(stats.worstVMGMoment).toHaveProperty('vmgEfficiency');
  });
});
