import { describe, it, expect, beforeEach } from 'vitest';
import { RaceRecorder } from '../storage/race-recorder.js';

function makeState(tick, boats) {
  return {
    tick,
    boats: boats || [
      { slot: 0, heading: 90, x: 1000, y: 2000, speed: 0.8, twa: 45, tack: 'starboard' },
      { slot: 1, heading: 100, x: 1100, y: 2100, speed: 0.7, twa: 50, tack: 'starboard' },
    ],
    windDirection: 180,
  };
}

describe('RaceRecorder', () => {
  let recorder;

  beforeEach(() => {
    recorder = new RaceRecorder();
  });

  it('starts in non-recording state', () => {
    expect(recorder.isRecording()).toBe(false);
  });

  it('starts and stops recording', () => {
    recorder.startRecording('race_1');
    expect(recorder.isRecording()).toBe(true);

    const data = recorder.stopRecording();
    expect(recorder.isRecording()).toBe(false);
    expect(data.raceId).toBe('race_1');
  });

  it('throttles states — stores every 10th', () => {
    recorder.startRecording('race_1');

    // Feed 30 states, only 3 should be stored (10th, 20th, 30th)
    for (let i = 1; i <= 30; i++) {
      recorder.addState(makeState(i));
    }

    const data = recorder.getRaceData();
    expect(data.states).toHaveLength(3);
    expect(data.states[0].tick).toBe(10);
    expect(data.states[1].tick).toBe(20);
    expect(data.states[2].tick).toBe(30);
  });

  it('strips unnecessary fields from stored states', () => {
    recorder.startRecording('race_1');

    const fullState = {
      tick: 10,
      boats: [{
        slot: 0,
        heading: 90,
        x: 1000,
        y: 2000,
        speed: 0.8,
        twa: 45,
        tack: 'starboard',
        rateOfTurn: 500,
        targetHeading: 180,
        active: true,
        isPlayer: true,
        speedRaw: 8000,
        penaltyTimer: 65535,
        raceProgress: 50,
        distanceSailed: 1234,
        pointOfSail: 'close-hauled',
        vmg: 0.5,
      }],
      windDirection: 180,
      windSpeed: 16,
      raceEventCode: 0,
      tackFlags: [0, 0],
      playerBoatIndex: 0,
      timestamp: Date.now(),
    };

    // Need to feed 10 to get one stored
    for (let i = 0; i < 10; i++) {
      recorder.addState({ ...fullState, tick: i + 1 });
    }

    const data = recorder.getRaceData();
    expect(data.states).toHaveLength(1);

    const stored = data.states[0];
    expect(stored.boats[0]).toHaveProperty('slot');
    expect(stored.boats[0]).toHaveProperty('heading');
    expect(stored.boats[0]).toHaveProperty('x');
    expect(stored.boats[0]).toHaveProperty('y');
    expect(stored.boats[0]).toHaveProperty('speedRaw');
    expect(stored.boats[0]).toHaveProperty('speedKnots');
    expect(stored.boats[0]).toHaveProperty('twa');
    expect(stored.boats[0]).toHaveProperty('tack');
    expect(stored.boats[0]).toHaveProperty('pointOfSail');
    expect(stored.boats[0]).toHaveProperty('rateOfTurn');
    expect(stored.boats[0]).toHaveProperty('isPlayer');
    // Now we store more fields for richer replay data
    expect(stored.boats[0]).toHaveProperty('penaltyTimer');
    expect(stored).toHaveProperty('windDirection');
    expect(stored).toHaveProperty('raceEventCode');
  });

  it('stores events', () => {
    recorder.startRecording('race_1');

    recorder.addEvent({ type: 'tack', tick: 100, timestamp: Date.now() });
    recorder.addEvent({ type: 'gybe', tick: 200, timestamp: Date.now() });

    const data = recorder.getRaceData();
    expect(data.events).toHaveLength(2);
    expect(data.events[0].type).toBe('tack');
    expect(data.events[1].type).toBe('gybe');
  });

  it('does not store events or states when not recording', () => {
    recorder.addState(makeState(1));
    recorder.addEvent({ type: 'tack', tick: 1 });

    recorder.startRecording('race_1');
    const data = recorder.stopRecording();
    expect(data.states).toHaveLength(0);
    expect(data.events).toHaveLength(0);
  });

  it('returns complete race data with duration', () => {
    recorder.startRecording('race_1');

    for (let i = 1; i <= 10; i++) {
      recorder.addState(makeState(i));
    }

    const data = recorder.stopRecording();
    expect(data.raceId).toBe('race_1');
    expect(data.startTime).toBeGreaterThan(0);
    expect(data.endTime).toBeGreaterThanOrEqual(data.startTime);
    expect(data.duration).toBeGreaterThanOrEqual(0);
    expect(data.states).toHaveLength(1);
    expect(data.marks).toEqual([]);
  });

  it('memory bounded — states array grows at throttled rate', () => {
    recorder.startRecording('race_1');

    // Simulate 75000 states (max race of ~600s at 125/sec)
    // Throttled to every 10th = 7500 stored states
    for (let i = 1; i <= 75000; i++) {
      recorder.addState(makeState(i));
    }

    const data = recorder.getRaceData();
    expect(data.states).toHaveLength(7500);
  });

  it('handles null/undefined state gracefully', () => {
    recorder.startRecording('race_1');
    recorder.addState(null);
    recorder.addState(undefined);
    recorder.addState({});

    const data = recorder.getRaceData();
    // Only the {} state increments counter, but tick 1 is not at throttle boundary
    expect(data.states).toHaveLength(0);
  });

  it('sets marks', () => {
    recorder.startRecording('race_1');
    recorder.setMarks([{ x: 100, y: 200, id: 'M1' }]);

    const data = recorder.getRaceData();
    expect(data.marks).toHaveLength(1);
    expect(data.marks[0].id).toBe('M1');
  });

  it('finalizes previous recording when starting a new one', () => {
    recorder.startRecording('race_1');
    for (let i = 1; i <= 10; i++) recorder.addState(makeState(i));

    recorder.startRecording('race_2');
    expect(recorder.isRecording()).toBe(true);

    const data = recorder.getRaceData();
    expect(data.raceId).toBe('race_2');
    expect(data.states).toHaveLength(0); // fresh recording
  });
});
