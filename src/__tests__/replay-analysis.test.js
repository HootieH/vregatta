import { describe, it, expect } from 'vitest';
import { analyzeReplay } from '../dashboard/replay-analysis.js';

function makeState(tick, speed, twa) {
  return {
    tick,
    boats: [
      { slot: 0, heading: 90, x: 1000 + tick, y: 2000 + tick, speed: speed ?? 0.8, twa: twa ?? 45, tack: 'starboard' },
      { slot: 1, heading: 100, x: 1100, y: 2100, speed: 0.7, twa: 50, tack: 'starboard' },
    ],
    windDirection: 180,
  };
}

function makeRaceData(stateCount, events, marks) {
  const states = [];
  for (let i = 0; i < stateCount; i++) {
    states.push(makeState(i * 10, 0.5 + (i % 5) * 0.1, 40 + (i % 3) * 10));
  }
  return {
    raceId: 'test_race',
    states,
    events: events || [],
    marks: marks || [],
    startTime: 1000,
    endTime: 1000 + stateCount * 80,
    duration: (stateCount * 80) / 1000,
  };
}

describe('analyzeReplay', () => {
  it('returns empty analysis for null input', () => {
    const result = analyzeReplay(null);
    expect(result.summary.duration).toBe(0);
    expect(result.summary.totalTacks).toBe(0);
    expect(result.timeline).toEqual([]);
  });

  it('returns empty analysis for empty states', () => {
    const result = analyzeReplay({ raceId: 'x', states: [], events: [], marks: [], duration: 120 });
    expect(result.summary.duration).toBe(120);
    expect(result.summary.avgSpeed).toBe(0);
    expect(result.summary.distanceSailed).toBe(0);
  });

  it('computes duration, tack/gybe counts', () => {
    const events = [
      { type: 'tack', tick: 10 },
      { type: 'tack', tick: 50 },
      { type: 'gybe', tick: 80 },
    ];
    const raceData = makeRaceData(100, events);
    const result = analyzeReplay(raceData);

    expect(result.summary.totalTacks).toBe(2);
    expect(result.summary.totalGybes).toBe(1);
    expect(result.summary.duration).toBeGreaterThan(0);
  });

  it('computes average and max speed', () => {
    const raceData = makeRaceData(50);
    const result = analyzeReplay(raceData);

    expect(result.summary.avgSpeed).toBeGreaterThan(0);
    expect(result.summary.maxSpeed).toBeGreaterThanOrEqual(result.summary.avgSpeed);
  });

  it('computes distance sailed', () => {
    const raceData = makeRaceData(50);
    const result = analyzeReplay(raceData);

    // States have incrementing x and y, so distance should be positive
    expect(result.summary.distanceSailed).toBeGreaterThan(0);
  });

  it('builds timeline from events', () => {
    const events = [
      { type: 'tack', tick: 100 },
      { type: 'gybe', tick: 200 },
      { type: 'mark', tick: 50 },
    ];
    const raceData = makeRaceData(30, events);
    const result = analyzeReplay(raceData);

    expect(result.timeline).toHaveLength(3);
    // Should be sorted by tick
    expect(result.timeline[0].tick).toBe(50);
    expect(result.timeline[1].tick).toBe(100);
    expect(result.timeline[2].tick).toBe(200);
  });

  it('identifies worst moments when speed drops significantly', () => {
    // Create 200 states with a sharp speed drop in the middle
    // Need enough high-speed states so the global average stays high
    const states = [];
    for (let i = 0; i < 200; i++) {
      let speed = 0.8;
      // States 100-130 have very low speed (sustained drop)
      if (i >= 100 && i < 130) speed = 0.05;
      states.push(makeState(i * 10, speed, 45));
    }

    const raceData = {
      raceId: 'test',
      states,
      events: [],
      marks: [],
      startTime: 0,
      endTime: 8000,
      duration: 8,
    };

    const result = analyzeReplay(raceData);
    // Should detect the speed drop zone as a worst moment
    expect(result.heatmap.worstMoments.length).toBeGreaterThan(0);
    // The worst moment should be around the low-speed zone
    const worst = result.heatmap.worstMoments[0];
    expect(worst.reason).toBe('speed_drop');
    expect(worst.speedLoss).toBeGreaterThan(0);
  });

  it('identifies best moments when speed peaks', () => {
    const states = [];
    for (let i = 0; i < 100; i++) {
      let speed = 0.5;
      // States 50-60 have very high speed
      if (i >= 50 && i < 60) speed = 1.2;
      states.push(makeState(i * 10, speed, 45));
    }

    const raceData = {
      raceId: 'test',
      states,
      events: [],
      marks: [],
      startTime: 0,
      endTime: 8000,
      duration: 8,
    };

    const result = analyzeReplay(raceData);
    expect(result.heatmap.bestMoments.length).toBeGreaterThan(0);
    expect(result.heatmap.bestMoments[0].reason).toBe('speed_peak');
  });

  it('handles minimal data (single state)', () => {
    const raceData = {
      raceId: 'test',
      states: [makeState(0, 0.5, 45)],
      events: [],
      marks: [],
      startTime: 0,
      endTime: 100,
      duration: 0.1,
    };

    const result = analyzeReplay(raceData);
    expect(result.summary.avgSpeed).toBeCloseTo(0.5, 2);
    expect(result.summary.distanceSailed).toBe(0);
  });

  it('computes speed by leg when marks are present', () => {
    const marks = [{ x: 1050, y: 2050, id: 'M1' }];
    const raceData = makeRaceData(50, [], marks);
    const result = analyzeReplay(raceData);

    // With 1 mark, should have 2 legs
    expect(result.heatmap.speedByLeg.length).toBe(2);
    expect(result.heatmap.speedByLeg[0].leg).toBe(1);
    expect(result.heatmap.speedByLeg[1].leg).toBe(2);
    expect(result.heatmap.speedByLeg[0].avgSpeed).toBeGreaterThan(0);
  });

  it('extracts rules encounters from events', () => {
    const events = [
      { type: 'encounter', tick: 100, rule: '10', playerRole: 'give-way', outcome: 'avoided' },
      { type: 'tack', tick: 50 },
    ];
    const raceData = makeRaceData(30, events);
    const result = analyzeReplay(raceData);

    expect(result.rulesEncounters).toHaveLength(1);
    expect(result.rulesEncounters[0].rule).toBe('10');
    expect(result.rulesEncounters[0].playerRole).toBe('give-way');
  });

  it('extracts mark roundings from events', () => {
    const events = [
      { type: 'mark', tick: 100, markId: 'M1', approachAngle: 45, exitAngle: 135, quality: 80 },
    ];
    const raceData = makeRaceData(30, events);
    const result = analyzeReplay(raceData);

    expect(result.markRoundings).toHaveLength(1);
    expect(result.markRoundings[0].markId).toBe('M1');
    expect(result.markRoundings[0].quality).toBe(80);
  });
});
