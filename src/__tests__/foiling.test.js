import { describe, it, expect } from 'vitest';
import { foilingFactor } from '../polars/foiling.js';

const foilConfig = {
  speedRatio: 1.04,
  twaMin: 80,
  twaMax: 160,
  twsMin: 16,
  twsMax: 35,
  twaMerge: 10,
  twsMerge: 5,
};

describe('foilingFactor', () => {
  it('returns 1.0 when options does not include foil', () => {
    expect(foilingFactor(['hull'], 20, 120, foilConfig)).toBe(1.0);
  });

  it('returns 1.0 when foilConfig is null', () => {
    expect(foilingFactor(['foil'], 20, 120, null)).toBe(1.0);
  });

  it('returns 1.0 when options is null', () => {
    expect(foilingFactor(null, 20, 120, foilConfig)).toBe(1.0);
  });

  it('returns speedRatio inside foil zone', () => {
    // TWA=120 (inside 80-160), TWS=20 (inside 16-35)
    const factor = foilingFactor(['foil'], 20, 120, foilConfig);
    expect(factor).toBeCloseTo(1.04);
  });

  it('returns 1.0 outside foil zone (TWA too low)', () => {
    // TWA=40 is below twaMin-twaMerge (80-10=70)
    const factor = foilingFactor(['foil'], 20, 40, foilConfig);
    expect(factor).toBe(1.0);
  });

  it('returns 1.0 outside foil zone (TWS too low)', () => {
    // TWS=5 is below twsMin-twsMerge (16-5=11)
    const factor = foilingFactor(['foil'], 5, 120, foilConfig);
    expect(factor).toBe(1.0);
  });

  it('returns partial factor in TWA merge zone', () => {
    // TWA=75 is in merge zone [70,80], halfway → twaMerge factor = 0.5
    // TWS=20 is fully inside → twsFactor = 1.0
    // blend = 0.5, factor = 1.0 + 0.04 * 0.5 = 1.02
    const factor = foilingFactor(['foil'], 20, 75, foilConfig);
    expect(factor).toBeCloseTo(1.02);
  });

  it('returns partial factor in TWS merge zone', () => {
    // TWA=120 fully inside, TWS=13.5 in merge zone [11,16] → twsFactor = (13.5-11)/5 = 0.5
    // factor = 1.0 + 0.04 * 0.5 = 1.02
    const factor = foilingFactor(['foil'], 13.5, 120, foilConfig);
    expect(factor).toBeCloseTo(1.02);
  });
});
