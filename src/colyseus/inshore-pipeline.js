/**
 * Normalizes decoded Colyseus ROOM_STATE into a clean Inshore boat state.
 *
 * Takes the output of decodeState() (from state-decoder.js) and returns
 * a uniform structure suitable for LiveState and dashboard rendering.
 *
 * Protocol field mapping (confirmed from 200-message capture analysis):
 *   Field 0  = boat slot IDs (6 boats per race)
 *   Field 1  = server tick (~125/sec)
 *   Field 3  = per-boat state flags (-1=inactive?, 0=normal, 1/2=racing?)
 *   Field 4  = WIND DIRECTION (same for all boats, scaled heading, e.g., 179.0°)
 *   Field 6  = [16] — possibly wind speed (16kn?) or race config
 *   Field 10 = maneuver penalty timer (65535=no penalty, spikes on sharp turns)
 *   Field 11 = current heading per boat (scaled int16 * 360/65536)
 *   Field 12 = rate of turn (converges to 0)
 *   Field 13 = position [x,y] pairs (12 values = 6 boats × 2 coords, int16, range ~13000-30000)
 *   Field 14 = boat speed (proportional, ~10000=full speed, 0=stopped)
 *   Field 15 = race progress (0→200, only non-zero for player boat)
 *   Field 16 = distance sailed accumulator (0→65535, player boat only)
 *
 * Player boat = index 0 (confirmed: only boat with field 15/16 non-zero + active heading changes)
 */

/** Placeholder scale factor — will be calibrated once coordinate system is understood. */
export const COORDINATE_SCALE = 1;

/**
 * Compute True Wind Angle from boat heading and wind direction.
 * Positive = starboard tack, Negative = port tack.
 * @param {number} heading - boat heading 0-360
 * @param {number} windDirection - true wind direction 0-360
 * @returns {number} TWA in range -180 to +180
 */
export function computeTWA(heading, windDirection) {
  let twa = heading - windDirection;
  while (twa > 180) twa -= 360;
  while (twa < -180) twa += 360;
  return twa;
}

/**
 * Determine point of sail from absolute TWA.
 * @param {number} absTwa - absolute TWA 0-180
 * @returns {string}
 */
export function classifyPointOfSail(absTwa) {
  if (absTwa < 30) return 'head-to-wind';
  if (absTwa < 60) return 'close-hauled';
  if (absTwa < 80) return 'close-reach';
  if (absTwa < 100) return 'beam-reach';
  if (absTwa < 140) return 'broad-reach';
  if (absTwa < 170) return 'running';
  return 'dead-downwind';
}

/** Speed scale: raw value ~10000 = full speed */
export const SPEED_SCALE = 10000;

/**
 * Extract wind direction from decoded state (field 4).
 * All boats share the same value = true wind direction for the race area.
 */
export function extractWindDirection(decodedState) {
  if (!decodedState?.boats?.[0]) return null;
  // Field 4 is decoded as targetHeading — same for all boats = wind direction
  return decodedState.boats[0].targetHeading ?? null;
}

/**
 * Extract possible wind speed from decoded state (field 6).
 * Currently a hypothesis — [16] in all captured states.
 */
export function extractWindSpeed(decodedState) {
  const raw = decodedState?.raw;
  if (!raw || !raw[6] || !Array.isArray(raw[6])) return null;
  return raw[6][0] ?? null;
}

/**
 * @param {object} decodedState - Output of decodeState()
 * @returns {object} Normalized Inshore state
 */
export function normalizeInshoreState(decodedState) {
  if (!decodedState || !decodedState.boats) {
    return { tick: 0, boats: [], windDirection: null, windSpeed: null, timestamp: Date.now() };
  }

  const windDirection = decodedState.boats?.[0]?.targetHeading ?? null;
  const windSpeed = decodedState.raw?.[6]?.[0] ?? null;

  const boats = [];
  for (let i = 0; i < decodedState.boats.length; i++) {
    const b = decodedState.boats[i];
    const rawSpeed = b.speed ?? 0;
    const speedNormalized = Math.min(rawSpeed / SPEED_SCALE, 1.5);
    const heading = b.heading ?? 0;

    // TWA and derived sailing metrics
    let twa = null;
    let tack = null;
    let pointOfSail = null;
    let vmg = null;

    if (windDirection != null) {
      twa = computeTWA(heading, windDirection);
      tack = twa >= 0 ? 'starboard' : 'port';
      pointOfSail = classifyPointOfSail(Math.abs(twa));

      // VMG for player boat (index 0)
      if (i === 0) {
        const twaRad = (twa * Math.PI) / 180;
        vmg = speedNormalized * Math.cos(twaRad);
      }
    }

    boats.push({
      slot: b.slot ?? 0,
      heading,
      x: (b.posX ?? 0) * COORDINATE_SCALE,
      y: (b.posY ?? 0) * COORDINATE_SCALE,
      rateOfTurn: b.turnRate ?? 0,
      targetHeading: b.targetHeading ?? 0,
      active: b.penaltyTimer !== 65535,
      isPlayer: i === 0,
      speedRaw: rawSpeed,
      speed: speedNormalized,
      penaltyTimer: b.penaltyTimer ?? 65535,
      raceProgress: b.raceProgress ?? 0,
      distanceSailed: b.distanceSailed ?? 0,
      twa,
      tack,
      pointOfSail,
      vmg,
    });
  }

  return {
    tick: decodedState.tick ?? 0,
    boats,
    windDirection,
    windSpeed,
    playerBoatIndex: 0,
    timestamp: Date.now(),
  };
}
