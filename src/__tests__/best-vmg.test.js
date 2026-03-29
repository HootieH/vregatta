import { describe, it, expect } from 'vitest';
import { bestVMG } from '../polars/best-vmg.js';
import { mockPolar } from './mocks/mock-polar.js';

describe('bestVMG', () => {
  const result = bestVMG(16, mockPolar, ['light', 'heavy', 'reach']);

  it('upwind VMG angle is between 30 and 60 degrees', () => {
    expect(result.twaUp).toBeGreaterThanOrEqual(30);
    expect(result.twaUp).toBeLessThanOrEqual(60);
  });

  it('downwind VMG angle is between 120 and 170 degrees', () => {
    expect(result.twaDown).toBeGreaterThanOrEqual(120);
    expect(result.twaDown).toBeLessThanOrEqual(170);
  });

  it('upwind VMG is positive', () => {
    expect(result.vmgUp).toBeGreaterThan(0);
  });

  it('downwind VMG is negative', () => {
    expect(result.vmgDown).toBeLessThan(0);
  });

  it('upwind sail is a headsail or staysail', () => {
    expect([1, 2, 3, 4, 5, 6, 7]).toContain(result.sailUp);
  });

  it('downwind sail is a spinnaker-type (2, 6, or 7)', () => {
    expect([2, 6, 7]).toContain(result.sailDown);
  });

  it('best speed is greater than 0', () => {
    expect(result.bspeed).toBeGreaterThan(0);
  });

  it('best speed TWA is in valid range', () => {
    expect(result.btwa).toBeGreaterThanOrEqual(25);
    expect(result.btwa).toBeLessThanOrEqual(180);
  });

  it('with only basic sails, only sails 1 and 2 are used', () => {
    const basic = bestVMG(16, mockPolar, []);
    expect([1, 2]).toContain(basic.sailUp);
    expect([1, 2]).toContain(basic.sailDown);
    expect([1, 2]).toContain(basic.sailBSpeed);
  });
});
