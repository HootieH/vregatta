import { describe, it, expect } from 'vitest';
import { efficiencyColor, segmentSpeedEff, segmentVmgEff } from '../dashboard/track-utils.js';
import { mockPolar } from './mocks/mock-polar.js';

describe('efficiencyColor', () => {
  it('returns green for >= 90%', () => {
    expect(efficiencyColor(100)).toBe('#00ff41');
    expect(efficiencyColor(90)).toBe('#00ff41');
    expect(efficiencyColor(95)).toBe('#00ff41');
  });

  it('returns yellow for 70-89%', () => {
    expect(efficiencyColor(89)).toBe('#ffbf00');
    expect(efficiencyColor(70)).toBe('#ffbf00');
    expect(efficiencyColor(75)).toBe('#ffbf00');
  });

  it('returns red for < 70%', () => {
    expect(efficiencyColor(69)).toBe('#ff3333');
    expect(efficiencyColor(50)).toBe('#ff3333');
    expect(efficiencyColor(0)).toBe('#ff3333');
  });

  it('returns plain color for null/NaN', () => {
    expect(efficiencyColor(null)).toBe('#00b4d8');
    expect(efficiencyColor(NaN)).toBe('#00b4d8');
    expect(efficiencyColor(undefined)).toBe('#00b4d8');
  });
});

describe('segmentSpeedEff', () => {
  it('returns ~100% when at polar speed for TWS=16, TWA=80, Jib', () => {
    // Jib at TWA=80, TWS=16 = 8.5 kn
    const point = { speed: 8.5, tws: 16, twa: 80, sail: 1 };
    const eff = segmentSpeedEff(point, mockPolar, []);
    expect(eff).toBeCloseTo(100, 0);
  });

  it('returns < 100% when below polar speed', () => {
    const point = { speed: 5.0, tws: 16, twa: 80, sail: 1 };
    const eff = segmentSpeedEff(point, mockPolar, []);
    expect(eff).toBeGreaterThan(0);
    expect(eff).toBeLessThan(100);
  });

  it('returns green-range efficiency for high speed', () => {
    // 8.5 kn at polar 8.5 = 100%
    const point = { speed: 8.0, tws: 16, twa: 80, sail: 1 };
    const eff = segmentSpeedEff(point, mockPolar, []);
    expect(eff).toBeGreaterThanOrEqual(90);
  });

  it('returns red-range efficiency for low speed', () => {
    // 3.0 kn vs polar 8.5 = ~35%
    const point = { speed: 3.0, tws: 16, twa: 80, sail: 1 };
    const eff = segmentSpeedEff(point, mockPolar, []);
    expect(eff).toBeLessThan(70);
  });

  it('returns null with missing data', () => {
    expect(segmentSpeedEff(null, mockPolar, [])).toBeNull();
    expect(segmentSpeedEff({}, mockPolar, [])).toBeNull();
    expect(segmentSpeedEff({ speed: 5 }, mockPolar, [])).toBeNull();
    expect(segmentSpeedEff({ speed: 5, tws: 0, twa: 80 }, mockPolar, [])).toBeNull();
  });

  it('handles missing polar gracefully', () => {
    const point = { speed: 5.0, tws: 16, twa: 80, sail: 1 };
    expect(segmentSpeedEff(point, null, [])).toBeNull();
  });
});

describe('segmentVmgEff', () => {
  it('returns efficiency for upwind sailing', () => {
    // At optimal upwind TWA, should be near 100%
    const point = { speed: 6.5, tws: 16, twa: 40, sail: 1 };
    const eff = segmentVmgEff(point, mockPolar, []);
    expect(eff).not.toBeNull();
    expect(eff).toBeGreaterThan(0);
    expect(eff).toBeLessThanOrEqual(100);
  });

  it('returns efficiency for downwind sailing', () => {
    const point = { speed: 10.8, tws: 16, twa: 150, sail: 2 };
    const eff = segmentVmgEff(point, mockPolar, []);
    expect(eff).not.toBeNull();
    expect(eff).toBeGreaterThan(0);
  });

  it('returns null with missing data', () => {
    expect(segmentVmgEff(null, mockPolar, [])).toBeNull();
    expect(segmentVmgEff({ speed: 5, twa: 45, tws: 0 }, mockPolar, [])).toBeNull();
  });

  it('handles missing polar gracefully', () => {
    const point = { speed: 5.0, tws: 16, twa: 80 };
    expect(segmentVmgEff(point, null, [])).toBeNull();
  });
});
