import { describe, it, expect } from 'vitest';
import {
  detectMarks,
  detectCurrentLeg,
  isApproachingMark,
} from '../colyseus/mark-detector.js';
import { createStateHistory } from '../colyseus/inshore-pipeline.js';

/**
 * Helper: create a mock normalized state with boats at given positions/turnRates.
 */
function makeState(tick, boats) {
  return {
    tick,
    boats: boats.map((b, i) => ({
      slot: b.slot ?? i,
      x: b.x,
      y: b.y,
      heading: b.heading ?? 0,
      rateOfTurn: b.rateOfTurn ?? 0,
      speed: b.speed ?? 0.5,
      isPlayer: i === 0,
    })),
  };
}

describe('detectMarks', () => {
  it('returns empty marks for null/empty input', () => {
    expect(detectMarks(null)).toEqual({ marks: [] });
    expect(detectMarks([])).toEqual({ marks: [] });
    expect(detectMarks([{}])).toEqual({ marks: [] });
  });

  it('returns empty marks when no sharp turns exist', () => {
    const history = [
      makeState(1, [
        { slot: 1, x: 1000, y: 1000, rateOfTurn: 10 },
        { slot: 2, x: 2000, y: 2000, rateOfTurn: -20 },
      ]),
      makeState(2, [
        { slot: 1, x: 1010, y: 1010, rateOfTurn: 5 },
        { slot: 2, x: 2010, y: 2010, rateOfTurn: -10 },
      ]),
    ];
    const result = detectMarks(history);
    expect(result.marks).toEqual([]);
  });

  it('detects a mark where multiple boats turn sharply at the same location', () => {
    // Two boats both turn sharply near (5000, 5000)
    const history = [];
    for (let t = 0; t < 10; t++) {
      history.push(makeState(t, [
        { slot: 1, x: 5000 + t * 10, y: 5000 + t * 5, rateOfTurn: t < 5 ? 50 : 800 },
        { slot: 2, x: 5050 + t * 10, y: 5020 + t * 5, rateOfTurn: t < 5 ? -30 : -600 },
        { slot: 3, x: 9000, y: 9000, rateOfTurn: 0 },
      ]));
    }
    const result = detectMarks(history);
    expect(result.marks.length).toBeGreaterThanOrEqual(1);
    // The mark should be near (5000, 5000) area
    const mark = result.marks[0];
    expect(mark.x).toBeGreaterThan(4500);
    expect(mark.x).toBeLessThan(6000);
    expect(mark.y).toBeGreaterThan(4500);
    expect(mark.y).toBeLessThan(6000);
    expect(mark.passCount).toBeGreaterThanOrEqual(2);
    expect(mark.id).toBe('M1');
    expect(['port', 'starboard']).toContain(mark.roundingDirection);
  });

  it('does not detect a mark from only one boat turning', () => {
    const history = [];
    for (let t = 0; t < 10; t++) {
      history.push(makeState(t, [
        { slot: 1, x: 5000 + t * 10, y: 5000, rateOfTurn: 1000 },
        { slot: 2, x: 15000, y: 15000, rateOfTurn: 0 },
      ]));
    }
    const result = detectMarks(history);
    expect(result.marks).toEqual([]);
  });

  it('detects multiple marks at different locations', () => {
    const history = [];
    // Mark 1 at (3000, 2000)
    for (let t = 0; t < 5; t++) {
      history.push(makeState(t, [
        { slot: 1, x: 3000 + t * 5, y: 2000, rateOfTurn: 500 },
        { slot: 2, x: 3050 + t * 5, y: 2030, rateOfTurn: -400 },
      ]));
    }
    // Mark 2 at (8000, 7000) -- far from mark 1
    for (let t = 5; t < 10; t++) {
      history.push(makeState(t, [
        { slot: 1, x: 8000 + (t - 5) * 5, y: 7000, rateOfTurn: -700 },
        { slot: 2, x: 8020 + (t - 5) * 5, y: 7010, rateOfTurn: -500 },
      ]));
    }
    const result = detectMarks(history);
    expect(result.marks.length).toBe(2);
    // Sorted by y: mark at y=2000 first, then y=7000
    expect(result.marks[0].y).toBeLessThan(result.marks[1].y);
    expect(result.marks[0].id).toBe('M1');
    expect(result.marks[1].id).toBe('M2');
  });

  it('determines rounding direction from average turn rate', () => {
    const history = [];
    // All boats turn right (positive rateOfTurn) -> starboard rounding
    for (let t = 0; t < 10; t++) {
      history.push(makeState(t, [
        { slot: 1, x: 5000 + t * 5, y: 5000, rateOfTurn: 800 },
        { slot: 2, x: 5020 + t * 5, y: 5010, rateOfTurn: 600 },
      ]));
    }
    const result = detectMarks(history);
    expect(result.marks.length).toBe(1);
    expect(result.marks[0].roundingDirection).toBe('starboard');
  });

  it('detects port rounding from negative turn rates', () => {
    const history = [];
    for (let t = 0; t < 10; t++) {
      history.push(makeState(t, [
        { slot: 1, x: 5000 + t * 5, y: 5000, rateOfTurn: -900 },
        { slot: 2, x: 5020 + t * 5, y: 5010, rateOfTurn: -700 },
      ]));
    }
    const result = detectMarks(history);
    expect(result.marks.length).toBe(1);
    expect(result.marks[0].roundingDirection).toBe('port');
  });

  it('merges nearby clusters into a single mark', () => {
    const history = [];
    // Two clusters within MERGE_RADIUS of each other
    for (let t = 0; t < 5; t++) {
      history.push(makeState(t, [
        { slot: 1, x: 5000, y: 5000, rateOfTurn: 600 },
        { slot: 2, x: 5100, y: 5100, rateOfTurn: -500 },
      ]));
    }
    for (let t = 5; t < 10; t++) {
      history.push(makeState(t, [
        { slot: 1, x: 5300, y: 5200, rateOfTurn: 700 },
        { slot: 2, x: 5400, y: 5300, rateOfTurn: -400 },
      ]));
    }
    const result = detectMarks(history);
    // Should merge into 1 mark, not 2
    expect(result.marks.length).toBe(1);
  });
});

describe('detectCurrentLeg', () => {
  const marks = [
    { x: 1000, y: 1000, id: 'M1' },
    { x: 5000, y: 5000, id: 'M2' },
    { x: 9000, y: 9000, id: 'M3' },
  ];

  it('returns default for null inputs', () => {
    const result = detectCurrentLeg(null, marks);
    expect(result.legNumber).toBe(0);
    expect(result.nextMark).toBeNull();
    expect(result.distanceToMark).toBe(Infinity);
  });

  it('returns default for empty marks', () => {
    const result = detectCurrentLeg({ x: 0, y: 0, heading: 0 }, []);
    expect(result.legNumber).toBe(0);
    expect(result.nextMark).toBeNull();
  });

  it('identifies next mark when heading toward it', () => {
    // Boat near (800, 800) heading roughly toward M1 at (1000, 1000)
    // Bearing to M1 from (800,800): atan2(200, -200) = ~135 degrees
    const boat = { x: 800, y: 800, heading: 135 };
    const result = detectCurrentLeg(boat, marks);
    expect(result.nextMark.id).toBe('M1');
    expect(result.legNumber).toBe(1);
    expect(result.distanceToMark).toBeGreaterThan(0);
    expect(result.bearingToMark).toBeGreaterThan(0);
  });

  it('identifies next mark after passing closest mark', () => {
    // Boat at (1000, 1000) heading AWAY from M1 (heading 315 = northwest)
    // Closest mark is M1, but heading away, so next is M2
    const boat = { x: 1000, y: 1000, heading: 315 };
    const result = detectCurrentLeg(boat, marks);
    expect(result.nextMark.id).toBe('M2');
    expect(result.legNumber).toBe(2);
  });

  it('returns distance and bearing to next mark', () => {
    const boat = { x: 3000, y: 3000, heading: 135 };
    const result = detectCurrentLeg(boat, marks);
    expect(result.distanceToMark).toBeGreaterThan(0);
    expect(result.distanceToMark).toBeLessThan(10000);
    expect(result.bearingToMark).toBeGreaterThanOrEqual(0);
    expect(result.bearingToMark).toBeLessThan(360);
  });
});

describe('isApproachingMark', () => {
  it('returns false for null inputs', () => {
    expect(isApproachingMark(null, { x: 0, y: 0 })).toBe(false);
    expect(isApproachingMark({ x: 0, y: 0 }, null)).toBe(false);
    expect(isApproachingMark(null, null)).toBe(false);
  });

  it('returns false for missing coordinates', () => {
    expect(isApproachingMark({ x: null, y: 0 }, { x: 0, y: 0 })).toBe(false);
    expect(isApproachingMark({ x: 0, y: 0 }, { x: 0, y: null })).toBe(false);
  });

  it('returns true when boat is within default threshold of mark', () => {
    const boat = { x: 1000, y: 1000 };
    const mark = { x: 1500, y: 1000 }; // 500 units away
    expect(isApproachingMark(boat, mark)).toBe(true);
  });

  it('returns false when boat is beyond default threshold', () => {
    const boat = { x: 1000, y: 1000 };
    const mark = { x: 5000, y: 5000 }; // ~5657 units away
    expect(isApproachingMark(boat, mark)).toBe(false);
  });

  it('respects custom threshold', () => {
    const boat = { x: 1000, y: 1000 };
    const mark = { x: 1200, y: 1000 }; // 200 units away
    expect(isApproachingMark(boat, mark, 100)).toBe(false);
    expect(isApproachingMark(boat, mark, 300)).toBe(true);
  });

  it('returns true when boat is exactly at mark', () => {
    const boat = { x: 5000, y: 5000 };
    const mark = { x: 5000, y: 5000 };
    expect(isApproachingMark(boat, mark)).toBe(true);
  });
});

describe('createStateHistory', () => {
  it('accumulates states up to max size', () => {
    const history = createStateHistory(3);
    expect(history.size()).toBe(0);

    history.push({ tick: 1, boats: [] });
    history.push({ tick: 2, boats: [] });
    history.push({ tick: 3, boats: [] });
    expect(history.size()).toBe(3);

    history.push({ tick: 4, boats: [] });
    expect(history.size()).toBe(3);
    expect(history.getHistory()[0].tick).toBe(2); // oldest trimmed
  });

  it('ignores null pushes', () => {
    const history = createStateHistory(10);
    history.push(null);
    expect(history.size()).toBe(0);
  });

  it('clears history', () => {
    const history = createStateHistory(10);
    history.push({ tick: 1, boats: [] });
    history.push({ tick: 2, boats: [] });
    history.clear();
    expect(history.size()).toBe(0);
    expect(history.getHistory()).toEqual([]);
  });
});
