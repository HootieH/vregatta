import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerDetector } from '../colyseus/player-detector.js';

describe('PlayerDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new PlayerDetector();
  });

  function makeState(boats) {
    return {
      tick: Date.now(),
      boats: boats.map(b => ({
        slot: b.slot,
        heading: b.heading,
        x: 0,
        y: 0,
        speedRaw: 5000,
        localWindDirection: 0,
      })),
      windDirection: 0,
      timestamp: Date.now(),
    };
  }

  it('detects player with consistent helm inputs', () => {
    // Player is slot 3, heading 90. Helm inputs at 90.
    detector.addHelmInput(90, 1);

    // Feed many state updates where slot 3 matches helm, others do not
    for (let i = 0; i < 20; i++) {
      detector.updateFromState(makeState([
        { slot: 1, heading: 0 },
        { slot: 2, heading: 45 },
        { slot: 3, heading: 90 },   // matches helm input
        { slot: 4, heading: 180 },
        { slot: 5, heading: 270 },
        { slot: 6, heading: 315 },
      ]));
    }

    expect(detector.getPlayerSlot()).toBe(3);
    expect(detector.getConfidence()).toBeGreaterThan(0);
  });

  it('detects player with noisy data (some matches are wrong)', () => {
    // Player is slot 2. Most helm inputs match slot 2, some don't.
    for (let i = 0; i < 30; i++) {
      // 80% of helm inputs near slot 2's heading (120), 20% off
      const helmHeading = i % 5 === 0 ? 300 : 120;
      detector.addHelmInput(helmHeading, i);

      detector.updateFromState(makeState([
        { slot: 1, heading: 45 },
        { slot: 2, heading: 118 + Math.random() * 4 }, // near 120, within 5 deg
        { slot: 3, heading: 200 },
        { slot: 4, heading: 350 },
      ]));
    }

    expect(detector.getPlayerSlot()).toBe(2);
    expect(detector.getConfidence()).toBeGreaterThan(0);
  });

  it('reset clears all state', () => {
    detector.addHelmInput(90, 1);
    for (let i = 0; i < 20; i++) {
      detector.updateFromState(makeState([
        { slot: 1, heading: 90 },
        { slot: 2, heading: 0 },
      ]));
    }
    expect(detector.getPlayerSlot()).toBe(1);

    detector.reset();

    expect(detector.getPlayerSlot()).toBeNull();
    expect(detector.getConfidence()).toBe(0);
  });

  it('no detection with no helm inputs', () => {
    // No helm inputs, just state updates
    for (let i = 0; i < 50; i++) {
      detector.updateFromState(makeState([
        { slot: 1, heading: 90 },
        { slot: 2, heading: 180 },
      ]));
    }

    expect(detector.getPlayerSlot()).toBeNull();
    expect(detector.getConfidence()).toBe(0);
  });

  it('no detection with insufficient data', () => {
    detector.addHelmInput(90, 1);
    // Only 1 state update — not enough to cross threshold of 10
    detector.updateFromState(makeState([
      { slot: 1, heading: 90 },
      { slot: 2, heading: 0 },
    ]));

    expect(detector.getPlayerSlot()).toBeNull();
  });

  it('helm history is capped at 10 entries', () => {
    for (let i = 0; i < 15; i++) {
      detector.addHelmInput(i * 10, i);
    }
    // Internal check: helmHistory should have at most 10
    expect(detector.helmHistory).toHaveLength(10);
  });
});
