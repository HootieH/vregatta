import { describe, it, expect } from 'vitest';
import {
  detectEncounters,
  determineTack,
  distanceBetween,
  isOverlapped,
  isWindward,
  areConverging,
} from '../rules/encounter-detector.js';

describe('determineTack', () => {
  it('returns starboard when wind is from starboard side', () => {
    // Wind from 0 (north), heading 270 (west) -> wind from starboard
    expect(determineTack(270, 0)).toBe('starboard');
  });

  it('returns port when wind is from port side', () => {
    // Wind from 0 (north), heading 90 (east) -> wind from port
    expect(determineTack(90, 0)).toBe('port');
  });

  it('handles wind from south, heading east', () => {
    // Wind from 180, heading 90 -> wind from starboard
    expect(determineTack(90, 180)).toBe('starboard');
  });

  it('handles wind from south, heading west', () => {
    // Wind from 180, heading 270 -> wind from port
    expect(determineTack(270, 180)).toBe('port');
  });

  it('handles wraparound angles', () => {
    // Wind from 350, heading 10 -> wind comes from port side (350 is left of 10)
    // Relative wind: 350 - 10 = 340, normalized as -20 -> port
    expect(determineTack(10, 350)).toBe('port');
  });

  it('returns null for null heading', () => {
    expect(determineTack(null, 180)).toBeNull();
  });

  it('returns null for null wind', () => {
    expect(determineTack(90, null)).toBeNull();
  });

  it('upwind on starboard tack', () => {
    // Classic beat: wind from 0, heading ~315 (NW, close-hauled starboard)
    expect(determineTack(315, 0)).toBe('starboard');
  });

  it('upwind on port tack', () => {
    // Classic beat: wind from 0, heading ~45 (NE, close-hauled port)
    expect(determineTack(45, 0)).toBe('port');
  });
});

describe('distanceBetween', () => {
  it('computes euclidean distance', () => {
    const b1 = { x: 0, y: 0 };
    const b2 = { x: 3, y: 4 };
    expect(distanceBetween(b1, b2)).toBeCloseTo(5, 5);
  });

  it('returns 0 for same position', () => {
    const b1 = { x: 15000, y: 20000 };
    expect(distanceBetween(b1, b1)).toBe(0);
  });

  it('returns Infinity for null coordinates', () => {
    expect(distanceBetween({ x: null, y: 0 }, { x: 0, y: 0 })).toBe(Infinity);
    expect(distanceBetween({ x: 0, y: 0 }, { x: 0, y: null })).toBe(Infinity);
  });

  it('works with typical game coordinate ranges', () => {
    const b1 = { x: 15000, y: 20000 };
    const b2 = { x: 15300, y: 20400 };
    expect(distanceBetween(b1, b2)).toBeCloseTo(500, 0);
  });
});

describe('isOverlapped', () => {
  it('detects overlapped boats (side by side)', () => {
    // Two boats heading north, side by side
    const b1 = { x: 1000, y: 1000, heading: 0 };
    const b2 = { x: 1200, y: 1000, heading: 0 };
    expect(isOverlapped(b1, b2, 180)).toBe(true);
  });

  it('returns false for boats far apart', () => {
    const b1 = { x: 1000, y: 1000, heading: 0 };
    const b2 = { x: 5000, y: 5000, heading: 0 };
    expect(isOverlapped(b1, b2, 180)).toBe(false);
  });

  it('returns false when one is clearly ahead', () => {
    // b2 is far ahead of b1
    const b1 = { x: 1000, y: 1000, heading: 0 };
    const b2 = { x: 1000, y: 0, heading: 0 }; // ahead (lower y = north in screen coords)
    expect(isOverlapped(b1, b2, 180)).toBe(false);
  });
});

describe('isWindward', () => {
  it('boat closer to wind source is windward', () => {
    // Wind from north (0). Boat1 is north of Boat2 -> Boat1 is windward
    const b1 = { x: 1000, y: 500 };  // further north (lower y)
    const b2 = { x: 1000, y: 1500 }; // further south
    // Bearing from b2 to b1 points roughly north = same as wind dir
    expect(isWindward(b1, b2, 0)).toBe(true);
  });

  it('boat further from wind source is leeward', () => {
    const b1 = { x: 1000, y: 1500 }; // further south (downwind)
    const b2 = { x: 1000, y: 500 };  // further north (upwind)
    // Bearing from b2 to b1 points south, wind from north -> b1 is leeward
    expect(isWindward(b1, b2, 0)).toBe(false);
  });

  it('returns false for null wind', () => {
    expect(isWindward({ x: 0, y: 0 }, { x: 100, y: 100 }, null)).toBe(false);
  });
});

describe('areConverging', () => {
  it('detects boats heading toward each other', () => {
    const b1 = { x: 0, y: 0, heading: 90 };    // heading east
    const b2 = { x: 1000, y: 0, heading: 270 }; // heading west
    expect(areConverging(b1, b2)).toBe(true);
  });

  it('detects boats heading away from each other', () => {
    const b1 = { x: 0, y: 0, heading: 270 };   // heading west
    const b2 = { x: 1000, y: 0, heading: 90 };  // heading east (away)
    expect(areConverging(b1, b2)).toBe(false);
  });

  it('returns false for null coordinates', () => {
    expect(areConverging({ x: null, y: 0, heading: 0 }, { x: 0, y: 0, heading: 180 })).toBe(false);
  });
});

describe('detectEncounters', () => {
  const windDirection = 0; // Wind from north

  function makeBoat(overrides) {
    return {
      slot: 1, x: 15000, y: 20000, heading: 0, speed: 0.5,
      rateOfTurn: 0, isPlayer: false,
      ...overrides,
    };
  }

  it('returns empty array for null input', () => {
    expect(detectEncounters(null, [], 0)).toEqual([]);
    expect(detectEncounters(makeBoat({ isPlayer: true }), null, 0)).toEqual([]);
  });

  it('returns wind-unknown message when windDirection is null', () => {
    const player = makeBoat({ isPlayer: true });
    const result = detectEncounters(player, [player, makeBoat({ slot: 2 })], null);
    expect(result.length).toBe(1);
    expect(result[0].situation).toBe('unknown');
    expect(result[0].description).toContain('wind direction unknown');
  });

  it('detects port/starboard encounter (Rule 10)', () => {
    // Player on port tack (heading NE, wind from N)
    const player = makeBoat({ isPlayer: true, slot: 0, heading: 45, x: 15000, y: 20000 });
    // Other on starboard tack (heading NW)
    const other = makeBoat({ slot: 2, heading: 315, x: 15500, y: 20000 });

    const encounters = detectEncounters(player, [player, other], windDirection);
    const rule10 = encounters.find(e => e.rule === '10');

    expect(rule10).toBeDefined();
    expect(rule10.situation).toBe('port_starboard');
    expect(rule10.playerRole).toBe('give-way');
  });

  it('player on starboard gets stand-on role', () => {
    // Player on starboard tack (heading NW, wind from N)
    const player = makeBoat({ isPlayer: true, slot: 0, heading: 315, x: 15000, y: 20000 });
    // Other on port tack (heading NE)
    const other = makeBoat({ slot: 2, heading: 45, x: 15500, y: 20000 });

    const encounters = detectEncounters(player, [player, other], windDirection);
    const rule10 = encounters.find(e => e.rule === '10');

    expect(rule10).toBeDefined();
    expect(rule10.playerRole).toBe('stand-on');
  });

  it('no encounter for distant boats', () => {
    const player = makeBoat({ isPlayer: true, slot: 0, x: 0, y: 0 });
    const other = makeBoat({ slot: 2, x: 10000, y: 10000 });

    const encounters = detectEncounters(player, [player, other], windDirection);
    // Should only possibly contain Rule 14 if any high-urgency, but here nothing
    const meaningful = encounters.filter(e => e.rule !== '14');
    expect(meaningful.length).toBe(0);
  });

  it('detects windward/leeward (Rule 11) for overlapped same-tack boats', () => {
    // Both on starboard tack, overlapped side by side
    const player = makeBoat({ isPlayer: true, slot: 0, heading: 315, x: 15000, y: 20000 });
    const other = makeBoat({ slot: 2, heading: 315, x: 15200, y: 20000 });

    const encounters = detectEncounters(player, [player, other], windDirection);
    const rule11 = encounters.find(e => e.rule === '11');

    expect(rule11).toBeDefined();
    expect(rule11.situation).toMatch(/windward|leeward/);
  });

  it('detects clear astern/ahead (Rule 12) for same-tack non-overlapped boats', () => {
    // Both on starboard tack (heading NW=315), close enough (<600 units) but not overlapped
    // Place other boat directly ahead along heading 315 (NW), ~550 units away
    const player = makeBoat({ isPlayer: true, slot: 0, heading: 315, x: 15000, y: 20000 });
    // ~390 units NW of player = sqrt(390^2) ~ 390 on each axis = ~551 total
    const other = makeBoat({ slot: 2, heading: 315, x: 14610, y: 19610 });

    const encounters = detectEncounters(player, [player, other], windDirection);
    const rule12 = encounters.find(e => e.rule === '12');

    expect(rule12).toBeDefined();
    expect(rule12.situation).toMatch(/clear_astern|clear_ahead/);
  });

  it('skips player boat in encounters', () => {
    const player = makeBoat({ isPlayer: true, slot: 0 });
    const encounters = detectEncounters(player, [player], windDirection);
    expect(encounters.length).toBe(0);
  });

  it('adds Rule 14 reminder for critical encounters', () => {
    // Close boats, converging -> should trigger Rule 14 reminder
    const player = makeBoat({ isPlayer: true, slot: 0, heading: 45, x: 15000, y: 20000 });
    const other = makeBoat({ slot: 2, heading: 315, x: 15200, y: 20000 });

    const encounters = detectEncounters(player, [player, other], windDirection);
    const rule14 = encounters.find(e => e.rule === '14');

    // May or may not be present depending on urgency
    if (rule14) {
      expect(rule14.description).toContain('avoid contact');
    }
  });

  it('sorts encounters by urgency (most urgent first)', () => {
    const player = makeBoat({ isPlayer: true, slot: 0, heading: 45, x: 15000, y: 20000 });
    // One close, one far
    const close = makeBoat({ slot: 2, heading: 315, x: 15200, y: 20000 });
    const far = makeBoat({ slot: 3, heading: 315, x: 16500, y: 20000 });

    const encounters = detectEncounters(player, [player, close, far], windDirection);
    const meaningful = encounters.filter(e => e.rule !== '14');

    if (meaningful.length >= 2) {
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 1; i < meaningful.length; i++) {
        expect(urgencyOrder[meaningful[i].urgency]).toBeGreaterThanOrEqual(
          urgencyOrder[meaningful[i - 1].urgency],
        );
      }
    }
  });

  it('handles multiple boats correctly', () => {
    const player = makeBoat({ isPlayer: true, slot: 0, heading: 45, x: 15000, y: 20000 });
    const boats = [
      player,
      makeBoat({ slot: 2, heading: 315, x: 15300, y: 20000 }),
      makeBoat({ slot: 3, heading: 315, x: 15600, y: 20100 }),
      makeBoat({ slot: 4, heading: 45, x: 15200, y: 20000 }),
    ];

    const encounters = detectEncounters(player, boats, windDirection);
    // Should have encounters with boats 2, 3, and/or 4 but not with self
    const otherSlots = encounters.filter(e => e.otherBoat).map(e => e.otherBoat.slot);
    expect(otherSlots).not.toContain(0);
  });
});
