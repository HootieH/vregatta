/**
 * Normalizes decoded Colyseus ROOM_STATE into a clean Inshore boat state.
 *
 * Takes the output of decodeState() (from state-decoder.js) and returns
 * a uniform structure suitable for LiveState and dashboard rendering.
 */

/** Placeholder scale factor — will be calibrated once coordinate system is understood. */
export const COORDINATE_SCALE = 1;

/**
 * @param {object} decodedState - Output of decodeState()
 * @returns {{tick: number, boats: Array<{slot: number, heading: number, x: number, y: number, rateOfTurn: number, targetHeading: number, active: boolean}>, timestamp: number}}
 */
export function normalizeInshoreState(decodedState) {
  if (!decodedState || !decodedState.boats) {
    return { tick: 0, boats: [], timestamp: Date.now() };
  }

  const boats = [];
  for (const b of decodedState.boats) {
    // Speed is a raw uint16 (~10000 = full speed). Normalize to 0-1 range.
    const rawSpeed = b.speed ?? 0;
    const speedNormalized = Math.min(rawSpeed / 10000, 1.5);

    boats.push({
      slot: b.slot ?? 0,
      heading: b.heading ?? 0,
      x: (b.posX ?? 0) * COORDINATE_SCALE,
      y: (b.posY ?? 0) * COORDINATE_SCALE,
      rateOfTurn: b.turnRate ?? 0,
      targetHeading: b.targetHeading ?? 0,
      active: b.penaltyTimer !== 65535,
      speedRaw: rawSpeed,
      speed: speedNormalized,
      penaltyTimer: b.penaltyTimer ?? 65535,
      raceProgress: b.raceProgress ?? 0,
      distanceSailed: b.distanceSailed ?? 0,
    });
  }

  return {
    tick: decodedState.tick ?? 0,
    boats,
    timestamp: Date.now(),
  };
}
