import { describe, it, expect, beforeEach } from 'vitest';
import { computeTWA, classifyPointOfSail, normalizeInshoreState } from '../colyseus/inshore-pipeline.js';
import { LiveState } from '../state/live-state.js';

describe('computeTWA', () => {
  it('heading=90, wind=0 → TWA=90 (starboard beam reach)', () => {
    expect(computeTWA(90, 0)).toBe(90);
  });

  it('heading=350, wind=180 → TWA=170 (running, starboard)', () => {
    expect(computeTWA(350, 180)).toBe(170);
  });

  it('heading=270, wind=0 → TWA=-90 (port beam reach)', () => {
    expect(computeTWA(270, 0)).toBe(-90);
  });

  it('heading=0, wind=0 → TWA=0 (head-to-wind)', () => {
    expect(computeTWA(0, 0)).toBe(0);
  });

  it('heading=180, wind=0 → TWA=180 (dead downwind)', () => {
    expect(computeTWA(180, 0)).toBe(180);
  });

  it('heading=10, wind=350 → TWA=20 (close-hauled starboard)', () => {
    expect(computeTWA(10, 350)).toBe(20);
  });

  it('heading=350, wind=10 → TWA=-20 (close-hauled port)', () => {
    expect(computeTWA(350, 10)).toBe(-20);
  });

  it('wraps correctly across 360/0 boundary', () => {
    // 5 degrees starboard of wind coming from 355
    expect(computeTWA(0, 355)).toBe(5);
    // 5 degrees port of wind coming from 5
    expect(computeTWA(0, 5)).toBe(-5);
  });

  it('result always in -180 to +180 range', () => {
    for (let h = 0; h < 360; h += 15) {
      for (let w = 0; w < 360; w += 15) {
        const twa = computeTWA(h, w);
        expect(twa).toBeGreaterThanOrEqual(-180);
        expect(twa).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('classifyPointOfSail', () => {
  it('0-30 → head-to-wind', () => {
    expect(classifyPointOfSail(0)).toBe('head-to-wind');
    expect(classifyPointOfSail(15)).toBe('head-to-wind');
    expect(classifyPointOfSail(29)).toBe('head-to-wind');
  });

  it('30-60 → close-hauled', () => {
    expect(classifyPointOfSail(30)).toBe('close-hauled');
    expect(classifyPointOfSail(45)).toBe('close-hauled');
    expect(classifyPointOfSail(59)).toBe('close-hauled');
  });

  it('60-80 → close-reach', () => {
    expect(classifyPointOfSail(60)).toBe('close-reach');
    expect(classifyPointOfSail(70)).toBe('close-reach');
    expect(classifyPointOfSail(79)).toBe('close-reach');
  });

  it('80-100 → beam-reach', () => {
    expect(classifyPointOfSail(80)).toBe('beam-reach');
    expect(classifyPointOfSail(90)).toBe('beam-reach');
    expect(classifyPointOfSail(99)).toBe('beam-reach');
  });

  it('100-140 → broad-reach', () => {
    expect(classifyPointOfSail(100)).toBe('broad-reach');
    expect(classifyPointOfSail(120)).toBe('broad-reach');
    expect(classifyPointOfSail(139)).toBe('broad-reach');
  });

  it('140-170 → running', () => {
    expect(classifyPointOfSail(140)).toBe('running');
    expect(classifyPointOfSail(155)).toBe('running');
    expect(classifyPointOfSail(169)).toBe('running');
  });

  it('170-180 → dead-downwind', () => {
    expect(classifyPointOfSail(170)).toBe('dead-downwind');
    expect(classifyPointOfSail(175)).toBe('dead-downwind');
    expect(classifyPointOfSail(180)).toBe('dead-downwind');
  });
});

describe('normalizeInshoreState TWA fields', () => {
  function makeDecode(heading, windDir, speed) {
    return {
      tick: 100,
      boats: [
        { slot: 1, heading, targetHeading: windDir, turnRate: 0, posX: 100, posY: 200, penaltyTimer: 0, speed: speed ?? 5000 },
      ],
      raw: { 6: [16] },
    };
  }

  it('adds twa, tack, pointOfSail, vmg to player boat', () => {
    const result = normalizeInshoreState(makeDecode(90, 0, 10000), 1);
    const boat = result.boats[0];

    expect(boat.twa).toBe(90);
    expect(boat.tack).toBe('starboard');
    expect(boat.pointOfSail).toBe('beam-reach');
    expect(boat.vmg).toBeCloseTo(0, 5); // cos(90) = 0
  });

  it('port tack detected correctly', () => {
    const result = normalizeInshoreState(makeDecode(270, 0, 10000), 1);
    const boat = result.boats[0];

    expect(boat.twa).toBe(-90);
    expect(boat.tack).toBe('port');
  });

  it('VMG is positive for upwind', () => {
    const result = normalizeInshoreState(makeDecode(45, 0, 10000), 1);
    const boat = result.boats[0];

    // speedKnots = 10000/923 ≈ 10.83, twa=45, vmg = cos(45)*10.83 ≈ 7.66
    const expectedKnots = 10000 / 923;
    expect(boat.vmg).toBeCloseTo(expectedKnots * Math.cos(45 * Math.PI / 180), 0);
    expect(boat.vmg).toBeGreaterThan(0);
  });

  it('VMG is negative for downwind', () => {
    const result = normalizeInshoreState(makeDecode(150, 0, 10000), 1);
    const boat = result.boats[0];

    expect(boat.vmg).toBeLessThan(0);
  });

  it('non-player boats get null vmg', () => {
    const decoded = {
      tick: 100,
      boats: [
        { slot: 1, heading: 90, targetHeading: 0, turnRate: 0, posX: 100, posY: 200, penaltyTimer: 0, speed: 5000 },
        { slot: 2, heading: 45, targetHeading: 0, turnRate: 0, posX: 150, posY: 250, penaltyTimer: 0, speed: 5000 },
      ],
      raw: {},
    };
    const result = normalizeInshoreState(decoded, 1);

    expect(result.boats[0].vmg).not.toBeNull(); // player (slot 1)
    expect(result.boats[1].vmg).toBeNull(); // non-player (slot 2)
  });

  it('TWA fields are null when windDirection is null', () => {
    const decoded = {
      tick: 100,
      boats: [{ slot: 1 }],
      raw: {},
    };
    // targetHeading will be undefined → windDirection=null
    const result = normalizeInshoreState(decoded);
    const boat = result.boats[0];

    expect(boat.twa).toBeNull();
    expect(boat.tack).toBeNull();
    expect(boat.pointOfSail).toBeNull();
    expect(boat.vmg).toBeNull();
  });
});

describe('LiveState inshore tack/gybe event detection', () => {
  let state;

  beforeEach(() => {
    state = new LiveState();
  });

  function makeInshore(twa, heading, windDir) {
    // Build a normalized state that already has TWA computed
    return {
      tick: Date.now(),
      boats: [{
        slot: 1,
        heading: heading ?? 90,
        x: 100,
        y: 200,
        rateOfTurn: 0,
        localWindDirection: windDir ?? 0,
        active: true,
        isPlayer: true,
        speedRaw: 5000,
        speed: 0.5,
        penaltyTimer: 0,
        raceProgress: 0,
        distanceSailed: 0,
        twa,
        tack: twa >= 0 ? 'starboard' : 'port',
        pointOfSail: 'beam-reach',
        vmg: 0,
      }],
      windDirection: windDir ?? 0,
      windSpeed: 16,
      timestamp: Date.now(),
    };
  }

  it('detects tack event when TWA flips sign and abs(TWA) <= 90', () => {
    state.updateInshore(makeInshore(45));
    const result = state.updateInshore(makeInshore(-45));

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('tack');
    expect(result.events[0].source).toBe('inshore');
  });

  it('detects gybe event when TWA flips sign and abs(TWA) > 90', () => {
    state.updateInshore(makeInshore(150));
    const result = state.updateInshore(makeInshore(-150));

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('gybe');
    expect(result.events[0].source).toBe('inshore');
  });

  it('no event when TWA does not flip sign', () => {
    state.updateInshore(makeInshore(45));
    const result = state.updateInshore(makeInshore(50));

    expect(result.events).toHaveLength(0);
  });

  it('no event when TWA is zero', () => {
    state.updateInshore(makeInshore(0));
    const result = state.updateInshore(makeInshore(-45));

    expect(result.events).toHaveLength(0);
  });

  it('events are pushed to LiveState.events array', () => {
    state.updateInshore(makeInshore(45));
    state.updateInshore(makeInshore(-45));

    expect(state.events.length).toBeGreaterThanOrEqual(1);
    expect(state.events[state.events.length - 1].type).toBe('tack');
  });

  it('events appear in snapshot', () => {
    state.updateInshore(makeInshore(45));
    state.updateInshore(makeInshore(-45));

    const snap = state.getSnapshot();
    expect(snap.events.some(e => e.type === 'tack')).toBe(true);
  });
});

describe('LiveState getSnapshot inshore fields', () => {
  it('includes inshoreTwa, inshoreTack, inshorePointOfSail, inshoreVmg, inshoreSpeed', () => {
    const state = new LiveState();
    state.updateInshore({
      tick: 100,
      boats: [{
        slot: 1,
        heading: 90,
        x: 100,
        y: 200,
        rateOfTurn: 0,
        localWindDirection: 0,
        active: true,
        isPlayer: true,
        speedRaw: 8000,
        speed: 0.8,
        penaltyTimer: 0,
        raceProgress: 50,
        distanceSailed: 100,
        twa: 90,
        tack: 'starboard',
        pointOfSail: 'beam-reach',
        vmg: 0,
      }],
      windDirection: 0,
      windSpeed: 16,
      timestamp: Date.now(),
    });

    const snap = state.getSnapshot();

    expect(snap.inshoreTwa).toBe(90);
    expect(snap.inshoreTack).toBe('starboard');
    expect(snap.inshorePointOfSail).toBe('beam-reach');
    expect(snap.inshoreVmg).toBe(0);
    expect(snap.inshoreSpeed).toBe(8000);
  });

  it('returns nulls when no inshore data', () => {
    const state = new LiveState();
    const snap = state.getSnapshot();

    expect(snap.inshoreTwa).toBeNull();
    expect(snap.inshoreTack).toBeNull();
    expect(snap.inshorePointOfSail).toBeNull();
    expect(snap.inshoreVmg).toBeNull();
    expect(snap.inshoreSpeed).toBeNull();
  });
});
