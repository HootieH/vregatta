import { describe, it, expect } from 'vitest';
import { fractionStep, bilinear } from '../polars/interpolation.js';

describe('fractionStep', () => {
  const steps = [0, 6, 10, 16, 22, 30];

  it('returns index 0 fraction 0 when value is at first breakpoint', () => {
    const result = fractionStep(0, steps);
    expect(result).toEqual({ index: 0, fraction: 0 });
  });

  it('returns exact breakpoint as top of lower interval', () => {
    const result = fractionStep(10, steps);
    // 10 is steps[2], sits at fraction=1.0 of the [6,10] interval
    expect(result.index).toBe(2);
    expect(result.fraction).toBeCloseTo(1.0);
  });

  it('returns correct interpolation between breakpoints', () => {
    // Value 8 is between steps[1]=6 and steps[2]=10 → fraction = (8-6)/(10-6) = 0.5
    const result = fractionStep(8, steps);
    expect(result.index).toBe(2);
    expect(result.fraction).toBeCloseTo(0.5);
  });

  it('clamps below minimum', () => {
    const result = fractionStep(-5, steps);
    expect(result).toEqual({ index: 0, fraction: 0 });
  });

  it('clamps above maximum', () => {
    const result = fractionStep(50, steps);
    expect(result).toEqual({ index: 5, fraction: 0 });
  });

  it('handles value between first two breakpoints', () => {
    // Value 3 between 0 and 6 → fraction = 3/6 = 0.5
    const result = fractionStep(3, steps);
    expect(result.index).toBe(1);
    expect(result.fraction).toBeCloseTo(0.5);
  });
});

describe('bilinear', () => {
  it('returns f00 when x=0 y=0', () => {
    expect(bilinear(0, 0, 1, 2, 3, 4)).toBe(1);
  });

  it('returns f10 when x=1 y=0', () => {
    expect(bilinear(1, 0, 1, 2, 3, 4)).toBe(2);
  });

  it('returns f01 when x=0 y=1', () => {
    expect(bilinear(0, 1, 1, 2, 3, 4)).toBe(3);
  });

  it('returns f11 when x=1 y=1', () => {
    expect(bilinear(1, 1, 1, 2, 3, 4)).toBe(4);
  });

  it('returns average at center', () => {
    // x=0.5, y=0.5 with values 0,10,10,20 → 0*0.25 + 10*0.25 + 10*0.25 + 20*0.25 = 10
    expect(bilinear(0.5, 0.5, 0, 10, 10, 20)).toBeCloseTo(10);
  });

  it('interpolates correctly along x axis', () => {
    // x=0.5, y=0, values 2,8,_,_ → 2*0.5 + 8*0.5 = 5
    expect(bilinear(0.5, 0, 2, 8, 0, 0)).toBeCloseTo(5);
  });
});
