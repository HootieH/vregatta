import { describe, it, expect, beforeEach } from 'vitest';
import { LiveState } from '../state/live-state.js';

function makeBoat(overrides = {}) {
  return {
    lat: 48.0,
    lon: -5.0,
    speed: 10,
    heading: 180,
    twa: 45,
    tws: 15,
    twd: 225,
    sail: 1,
    stamina: 100,
    distanceToEnd: 500,
    aground: false,
    lastCalcDate: null,
    isRegulated: false,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('LiveState', () => {
  let state;

  beforeEach(() => {
    state = new LiveState();
  });

  describe('updateBoat', () => {
    it('stores state and caps history at 20', () => {
      for (let i = 0; i < 25; i++) {
        state.updateBoat(makeBoat({ twa: i + 1 }));
      }

      expect(state.boat.twa).toBe(25);
      expect(state.history).toHaveLength(20);
      expect(state.history[0].twa).toBe(6);
      expect(state.history[19].twa).toBe(25);
    });

    it('returns changed true and detected events', () => {
      state.updateBoat(makeBoat({ twa: 30 }));
      const result = state.updateBoat(makeBoat({ twa: -30 }));

      expect(result.changed).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('tack');
    });
  });

  describe('detectEvents', () => {
    it('detects tack when TWA sign changes and abs(TWA) <= 90', () => {
      const prev = makeBoat({ twa: 30 });
      const next = makeBoat({ twa: -30 });
      const events = state.detectEvents(prev, next);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('tack');
      expect(events[0].timestamp).toBeDefined();
    });

    it('detects gybe when TWA sign changes and abs(TWA) > 90', () => {
      const prev = makeBoat({ twa: 150 });
      const next = makeBoat({ twa: -150 });
      const events = state.detectEvents(prev, next);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('gybe');
    });

    it('detects sail change', () => {
      const prev = makeBoat({ sail: 1 });
      const next = makeBoat({ sail: 2 });
      const events = state.detectEvents(prev, next);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('sailChange');
      expect(events[0].from).toBe(1);
      expect(events[0].to).toBe(2);
    });

    it('returns empty array when nothing changed', () => {
      const prev = makeBoat({ twa: 45, sail: 1 });
      const next = makeBoat({ twa: 45, sail: 1 });
      const events = state.detectEvents(prev, next);

      expect(events).toHaveLength(0);
    });
  });

  describe('computeVMG', () => {
    it('computes upwind VMG correctly (speed=10, TWA=45)', () => {
      const result = state.computeVMG(makeBoat({ speed: 10, twa: 45 }));

      expect(result.component).toBe('upwind');
      expect(result.vmg).toBeCloseTo(7.071, 2);
    });

    it('computes downwind VMG correctly (speed=10, TWA=135)', () => {
      const result = state.computeVMG(makeBoat({ speed: 10, twa: 135 }));

      expect(result.component).toBe('downwind');
      expect(result.vmg).toBeCloseTo(-7.071, 2);
    });

    it('returns null for missing data', () => {
      expect(state.computeVMG(null)).toBeNull();
      expect(state.computeVMG(makeBoat({ speed: null }))).toBeNull();
    });
  });

  describe('computeDistanceSailed', () => {
    it('computes haversine distance (0,0 to 0,1 ≈ 60nm)', () => {
      const prev = { lat: 0, lon: 0 };
      const curr = { lat: 0, lon: 1 };
      const dist = state.computeDistanceSailed(prev, curr);

      expect(dist).toBeCloseTo(60, 0);
    });

    it('returns null for missing data', () => {
      expect(state.computeDistanceSailed(null, { lat: 0, lon: 0 })).toBeNull();
      expect(state.computeDistanceSailed({ lat: 0, lon: 0 }, null)).toBeNull();
    });
  });

  describe('getSnapshot', () => {
    it('returns correct shape when no data', () => {
      const snap = state.getSnapshot();

      expect(snap.boat).toBeNull();
      expect(snap.race).toBeNull();
      expect(snap.competitorCount).toBe(0);
      expect(snap.vmg).toBeNull();
      expect(snap.events).toEqual([]);
      expect(snap.connected).toBe(false);
    });

    it('returns correct shape with data', () => {
      state.updateBoat(makeBoat({ speed: 10, twa: 45 }));
      state.race = { raceId: 'r1', name: 'Test Race' };
      state.competitors.set('c1', { id: 'c1' });
      state.competitors.set('c2', { id: 'c2' });

      const snap = state.getSnapshot();

      expect(snap.boat).toBeDefined();
      expect(snap.race.raceId).toBe('r1');
      expect(snap.competitorCount).toBe(2);
      expect(snap.vmg.component).toBe('upwind');
      expect(snap.connected).toBe(true);
    });

    it('returns only last 5 events', () => {
      // Generate 8 events via alternating tacks
      let twa = 30;
      state.updateBoat(makeBoat({ twa }));
      for (let i = 0; i < 8; i++) {
        twa = -twa;
        state.updateBoat(makeBoat({ twa }));
      }

      const snap = state.getSnapshot();
      expect(snap.events).toHaveLength(5);
    });
  });
});
