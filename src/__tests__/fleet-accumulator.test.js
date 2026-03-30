/**
 * Tests for FleetAccumulator (src/colyseus/fleet-accumulator.js).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FleetAccumulator } from '../colyseus/fleet-accumulator.js';

function makeState(boats, tick, timestamp) {
  return {
    tick: tick ?? 1,
    boats: boats.map((b, i) => ({
      slot: b.slot ?? i,
      heading: b.heading ?? 90,
      x: b.x ?? 1000 + i * 100,
      y: b.y ?? 2000 + i * 100,
      speed: b.speed ?? 0.5,
      speedRaw: b.speedRaw ?? 5000,
      twa: b.twa ?? 45,
      tack: b.tack ?? 'starboard',
      active: b.active ?? true,
      isPlayer: b.isPlayer ?? false,
      rateOfTurn: 0,
      targetHeading: 0,
      penaltyTimer: 65535,
      raceProgress: 0,
      distanceSailed: 0,
      pointOfSail: 'close-hauled',
      vmg: null,
      ...b,
    })),
    windDirection: 180,
    windSpeed: 16,
    timestamp: timestamp ?? Date.now(),
  };
}

describe('FleetAccumulator', () => {
  let acc;

  beforeEach(() => {
    acc = new FleetAccumulator();
  });

  describe('update — accumulation', () => {
    it('adds boats from first update', () => {
      const result = acc.update(makeState([
        { slot: 0, isPlayer: true },
        { slot: 1 },
        { slot: 2 },
        { slot: 3 },
      ]));

      expect(result.visibleBoats).toHaveLength(4);
      expect(result.allKnownBoats).toHaveLength(4);
      expect(result.newBoatSpotted).toBe(true);
    });

    it('accumulates boats from multiple updates', () => {
      acc.update(makeState([
        { slot: 0, isPlayer: true },
        { slot: 1 },
        { slot: 2 },
        { slot: 3 },
      ]));

      const result = acc.update(makeState([
        { slot: 0, isPlayer: true },
        { slot: 4 },
        { slot: 5 },
        { slot: 6 },
      ]));

      expect(result.visibleBoats).toHaveLength(4);
      expect(result.allKnownBoats).toHaveLength(7);
      expect(result.newBoatSpotted).toBe(true);
    });

    it('returns newBoatSpotted=false when no new boats', () => {
      acc.update(makeState([{ slot: 0 }, { slot: 1 }]));
      const result = acc.update(makeState([{ slot: 0 }, { slot: 1 }]));
      expect(result.newBoatSpotted).toBe(false);
    });

    it('updates position of previously seen boats', () => {
      acc.update(makeState([{ slot: 1, x: 100, y: 200 }]));
      acc.update(makeState([{ slot: 1, x: 150, y: 250 }]));

      const fleet = acc.getFleet();
      const boat = fleet.find(b => b.slot === 1);
      expect(boat.x).toBe(150);
      expect(boat.y).toBe(250);
    });
  });

  describe('stale detection', () => {
    it('marks boats not in current update as not visible', () => {
      acc.update(makeState([{ slot: 0 }, { slot: 1 }]));
      acc.update(makeState([{ slot: 0 }])); // slot 1 disappears

      const fleet = acc.getFleet();
      const boat1 = fleet.find(b => b.slot === 1);
      expect(boat1).toBeDefined();
      expect(boat1.visible).toBe(false);
    });

    it('marks boats as stale after timeout', () => {
      const oldTime = Date.now() - 10000; // 10 seconds ago
      acc.update(makeState([{ slot: 0 }, { slot: 1 }], 1, oldTime));
      acc.update(makeState([{ slot: 0 }], 2, Date.now())); // slot 1 gone

      const fleet = acc.getFleet();
      const boat1 = fleet.find(b => b.slot === 1);
      expect(boat1.stale).toBe(true);
    });

    it('visible boats are not stale', () => {
      acc.update(makeState([{ slot: 0 }, { slot: 1 }]));

      const fleet = acc.getFleet();
      for (const boat of fleet) {
        expect(boat.stale).toBe(false);
        expect(boat.visible).toBe(true);
      }
    });
  });

  describe('track history', () => {
    it('accumulates track points', () => {
      acc.update(makeState([{ slot: 1, x: 100, y: 200 }]));
      acc.update(makeState([{ slot: 1, x: 110, y: 210 }]));
      acc.update(makeState([{ slot: 1, x: 120, y: 220 }]));

      const fleet = acc.getFleet();
      const boat = fleet.find(b => b.slot === 1);
      expect(boat.trackHistory).toHaveLength(3);
      expect(boat.trackHistory[0]).toEqual(expect.objectContaining({ x: 100, y: 200 }));
      expect(boat.trackHistory[2]).toEqual(expect.objectContaining({ x: 120, y: 220 }));
    });

    it('deduplicates same-position points', () => {
      acc.update(makeState([{ slot: 1, x: 100, y: 200 }]));
      acc.update(makeState([{ slot: 1, x: 100, y: 200 }])); // same position

      const track = acc.trackHistory.get(1);
      expect(track).toHaveLength(1);
    });

    it('caps track history at 200 points', () => {
      for (let i = 0; i < 250; i++) {
        acc.update(makeState([{ slot: 1, x: i, y: i }]));
      }

      const track = acc.trackHistory.get(1);
      expect(track).toHaveLength(200);
      // Should have trimmed the oldest
      expect(track[0].x).toBe(50);
    });
  });

  describe('getStats', () => {
    it('returns correct counts', () => {
      const oldTime = Date.now() - 10000;
      acc.update(makeState([
        { slot: 0 }, { slot: 1 }, { slot: 2 }, { slot: 3 },
      ], 1, oldTime));

      // Second update: only slots 0, 4 visible. Slots 1-3 are stale (old timestamp).
      acc.update(makeState([{ slot: 0 }, { slot: 4 }], 2, Date.now()));

      const stats = acc.getStats();
      expect(stats.totalSeen).toBe(5);
      expect(stats.currentlyVisible).toBe(2);
      expect(stats.stale).toBe(3); // slots 1, 2, 3
    });
  });

  describe('setPlayerNames', () => {
    it('attaches names to boats', () => {
      acc.update(makeState([{ slot: 0 }, { slot: 1 }]));

      const names = new Map([[0, 'Alice'], [1, 'Bob']]);
      acc.setPlayerNames(names);

      const fleet = acc.getFleet();
      expect(fleet.find(b => b.slot === 0).name).toBe('Alice');
      expect(fleet.find(b => b.slot === 1).name).toBe('Bob');
    });

    it('updates existing boat data in place', () => {
      acc.update(makeState([{ slot: 5 }]));
      acc.setPlayerNames(new Map([[5, 'Charlie']]));

      const boat = acc.boats.get(5);
      expect(boat.name).toBe('Charlie');
    });

    it('handles null gracefully', () => {
      expect(() => acc.setPlayerNames(null)).not.toThrow();
    });
  });

  describe('reset', () => {
    it('clears all data', () => {
      acc.update(makeState([{ slot: 0 }, { slot: 1 }]));
      acc.setPlayerNames(new Map([[0, 'Alice']]));

      acc.reset();

      expect(acc.boats.size).toBe(0);
      expect(acc.trackHistory.size).toBe(0);
      expect(acc.getFleet()).toHaveLength(0);
      expect(acc.getStats()).toEqual({ totalSeen: 0, currentlyVisible: 0, stale: 0 });
    });
  });

  describe('edge cases', () => {
    it('handles null normalizedState', () => {
      const result = acc.update(null);
      expect(result.visibleBoats).toHaveLength(0);
      expect(result.newBoatSpotted).toBe(false);
    });

    it('handles empty boats array', () => {
      const result = acc.update(makeState([]));
      expect(result.visibleBoats).toHaveLength(0);
      expect(result.allKnownBoats).toHaveLength(0);
    });

    it('preserves firstSeen timestamp across updates', () => {
      const t1 = 1000;
      acc.update(makeState([{ slot: 1 }], 1, t1));
      acc.update(makeState([{ slot: 1 }], 2, 2000));

      const boat = acc.boats.get(1);
      expect(boat.firstSeen).toBe(t1);
      expect(boat.lastSeen).toBe(2000);
    });
  });
});
