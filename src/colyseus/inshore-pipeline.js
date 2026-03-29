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
    boats.push({
      slot: b.slot ?? 0,
      heading: b.heading ?? 0,
      x: (b.posX ?? 0) * COORDINATE_SCALE,
      y: (b.posY ?? 0) * COORDINATE_SCALE,
      rateOfTurn: b.turnRate ?? 0,
      targetHeading: b.targetHeading ?? 0,
      active: b.field10 !== 65535,
    });
  }

  return {
    tick: decodedState.tick ?? 0,
    boats,
    timestamp: Date.now(),
  };
}
