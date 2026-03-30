import { describe, it, expect } from 'vitest';
import { normalizeInshoreState, COORDINATE_SCALE } from '../colyseus/inshore-pipeline.js';

describe('normalizeInshoreState', () => {
  const mockDecodedState = {
    tick: 12345,
    boatCount: 6,
    boats: [
      { slot: 6, heading: 257.34, targetHeading: 179.0, turnRate: -3, posX: 15000, posY: 22000, penaltyTimer: 100, speed: 5 },
      { slot: 2, heading: 90.5, targetHeading: 179.0, turnRate: 0, posX: 15200, posY: 22100, penaltyTimer: 200, speed: 3 },
      { slot: 3, heading: 45.0, targetHeading: 179.0, turnRate: 1, posX: 14800, posY: 21900, penaltyTimer: 65535, speed: 0 },
      { slot: 4, heading: 120.0, targetHeading: 179.0, turnRate: -1, posX: 15500, posY: 22300, penaltyTimer: 50, speed: 7 },
      { slot: 8, heading: 300.0, targetHeading: 179.0, turnRate: 2, posX: 14500, posY: 21500, penaltyTimer: 0, speed: 1 },
      { slot: 9, heading: 180.0, targetHeading: 179.0, turnRate: 0, posX: 15100, posY: 22050, penaltyTimer: 65535, speed: 0 },
    ],
    raw: {},
  };

  it('returns correct structure with all fields', () => {
    const result = normalizeInshoreState(mockDecodedState);

    expect(result.tick).toBe(12345);
    expect(result.boats).toHaveLength(6);
    expect(typeof result.timestamp).toBe('number');
  });

  it('maps boat fields correctly', () => {
    const result = normalizeInshoreState(mockDecodedState);
    const boat = result.boats[0];

    expect(boat.slot).toBe(6);
    expect(boat.heading).toBe(257.34);
    expect(boat.x).toBe(15000 * COORDINATE_SCALE);
    expect(boat.y).toBe(22000 * COORDINATE_SCALE);
    expect(boat.rateOfTurn).toBe(-3);
    expect(boat.targetHeading).toBe(179.0);
    expect(boat.active).toBe(true);
  });

  it('detects inactive boats (field10 === 65535)', () => {
    const result = normalizeInshoreState(mockDecodedState);

    expect(result.boats[0].active).toBe(true);
    expect(result.boats[1].active).toBe(true);
    expect(result.boats[2].active).toBe(false); // slot 3, field10=65535
    expect(result.boats[3].active).toBe(true);
    expect(result.boats[4].active).toBe(true);
    expect(result.boats[5].active).toBe(false); // slot 9, field10=65535
  });

  it('returns defaults for missing fields', () => {
    const sparse = {
      tick: 100,
      boats: [
        { slot: 1 },
        {},
      ],
      raw: {},
    };
    const result = normalizeInshoreState(sparse);

    expect(result.boats).toHaveLength(2);
    expect(result.boats[0].slot).toBe(1);
    expect(result.boats[0].heading).toBe(0);
    expect(result.boats[0].x).toBe(0);
    expect(result.boats[0].y).toBe(0);
    expect(result.boats[0].rateOfTurn).toBe(0);
    expect(result.boats[0].targetHeading).toBe(0);
    // field10 is undefined, not 65535, so active defaults correctly
    expect(result.boats[0].active).toBe(true);

    expect(result.boats[1].slot).toBe(0);
  });

  it('returns empty result for null input', () => {
    const result = normalizeInshoreState(null);
    expect(result.tick).toBe(0);
    expect(result.boats).toEqual([]);
  });

  it('returns empty result for input without boats', () => {
    const result = normalizeInshoreState({ tick: 5 });
    expect(result.tick).toBe(0);
    expect(result.boats).toEqual([]);
  });

  it('returns empty result for undefined input', () => {
    const result = normalizeInshoreState(undefined);
    expect(result.tick).toBe(0);
    expect(result.boats).toEqual([]);
  });
});

describe('COORDINATE_SCALE', () => {
  it('is exported and equals 1 (uncalibrated)', () => {
    expect(COORDINATE_SCALE).toBe(1);
  });
});

describe('performance', () => {
  it('normalizes 1000 states under 100ms (~125 msgs/sec budget)', () => {
    const decoded = {
      tick: 12345,
      boatCount: 6,
      boats: Array.from({ length: 6 }, (_, i) => ({
        slot: i + 1,
        heading: i * 60,
        targetHeading: 179,
        turnRate: 0,
        posX: 15000 + i * 100,
        posY: 22000 + i * 100,
        penaltyTimer: i === 5 ? 65535 : 100,
        speed: 0,
      })),
      raw: {},
    };

    const { performance: perf } = require('node:perf_hooks');
    const start = perf.now();
    for (let i = 0; i < 1000; i++) {
      normalizeInshoreState(decoded);
    }
    const elapsed = perf.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});
