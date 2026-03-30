/**
 * Encounter detector for Racing Rules of Sailing.
 *
 * Analyzes boat positions, headings, and wind direction to detect
 * situations where RRS rules apply between the player and other boats.
 */

/** Maximum distance (game units) to flag an encounter */
const ENCOUNTER_DISTANCE = 2000;

/** Distance for overlap detection (game units, lateral) */
const OVERLAP_DISTANCE = 500;

/** Rate-of-turn threshold to detect active tacking (raw units from protocol) */
const TACKING_ROT_THRESHOLD = 500;

/** Distance thresholds for urgency levels */
const URGENCY_CRITICAL = 300;
const URGENCY_HIGH = 600;
const URGENCY_MEDIUM = 1200;

/**
 * Normalize an angle to 0-360 range.
 * @param {number} angle
 * @returns {number}
 */
function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

/**
 * Compute the shortest signed difference between two angles.
 * Result is in range -180..180.
 * @param {number} a - angle in degrees
 * @param {number} b - angle in degrees
 * @returns {number}
 */
function angleDiff(a, b) {
  let d = normalizeAngle(a) - normalizeAngle(b);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Determine which tack a boat is on based on heading and wind direction.
 *
 * A boat is on starboard tack when the wind comes over the starboard (right) side,
 * meaning the boom is to port. In terms of angles: if the wind is coming from
 * the right of the boat's heading, the boat is on starboard tack.
 *
 * More precisely: the relative wind angle (wind direction - heading) determines tack.
 * If wind comes from starboard side (relative angle 0-180 clockwise) -> starboard tack.
 *
 * @param {number} heading - boat heading in degrees (0-360)
 * @param {number} windDirection - true wind direction in degrees (where wind comes FROM)
 * @returns {'port'|'starboard'|null}
 */
export function determineTack(heading, windDirection) {
  if (heading == null || windDirection == null) return null;

  // Relative wind angle: where does the wind come from relative to the boat's heading?
  // Positive = wind from starboard side, Negative = wind from port side
  const relWind = angleDiff(windDirection, heading);

  // Wind from starboard (right) side → starboard tack (boom to port)
  // Wind from port (left) side → port tack (boom to starboard)
  // relWind > 0 means wind is clockwise from heading → starboard side
  if (relWind > 0 && relWind <= 180) return 'starboard';
  if (relWind < 0 && relWind >= -180) return 'port';

  // Edge case: dead downwind or dead upwind — use convention
  return 'starboard';
}

/**
 * Euclidean distance between two boats using game x,y coordinates.
 * @param {object} boat1 - {x, y}
 * @param {object} boat2 - {x, y}
 * @returns {number} distance in game units
 */
export function distanceBetween(boat1, boat2) {
  if (boat1.x == null || boat1.y == null || boat2.x == null || boat2.y == null) {
    return Infinity;
  }
  const dx = boat2.x - boat1.x;
  const dy = boat2.y - boat1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute the bearing from boat1 to boat2 in game coordinates.
 * Returns degrees 0-360 where 0=up/north in game space.
 * @param {object} boat1 - {x, y}
 * @param {object} boat2 - {x, y}
 * @returns {number} bearing in degrees
 */
function bearingBetween(boat1, boat2) {
  const dx = boat2.x - boat1.x;
  const dy = boat2.y - boat1.y;
  // atan2(dx, -dy) gives angle from north (up) clockwise
  // Negate dy because in screen coordinates y typically increases downward
  const rad = Math.atan2(dx, -dy);
  return normalizeAngle(rad * 180 / Math.PI);
}

/**
 * Check if two boats are overlapped (roughly side-by-side).
 *
 * Two boats are overlapped when neither is clear astern of the other.
 * We approximate this by checking if the lateral (perpendicular to heading) distance
 * is significant relative to the longitudinal distance.
 *
 * @param {object} boat1 - {x, y, heading}
 * @param {object} boat2 - {x, y, heading}
 * @param {number} _windDirection - wind direction (unused but in API for consistency)
 * @returns {boolean}
 */
export function isOverlapped(boat1, boat2 /* windDirection */) {
  const dist = distanceBetween(boat1, boat2);
  if (dist === Infinity || dist > ENCOUNTER_DISTANCE) return false;

  // Use the average heading to determine fore-aft axis
  const avgHeading = boat1.heading;
  const headingRad = avgHeading * Math.PI / 180;

  // Project the vector from boat1 to boat2 onto the heading axis
  const dx = boat2.x - boat1.x;
  const dy = boat2.y - boat1.y;

  // Fore-aft component (along heading direction)
  const foreAft = dx * Math.sin(headingRad) + dy * (-Math.cos(headingRad));
  // Lateral component (perpendicular to heading)
  const lateral = Math.abs(dx * Math.cos(headingRad) - dy * (-Math.sin(headingRad)));

  // Overlapped if lateral separation is significant relative to fore-aft
  // and the lateral distance is within overlap threshold
  return lateral < OVERLAP_DISTANCE && Math.abs(foreAft) < OVERLAP_DISTANCE;
}

/**
 * Determine if boat1 is to windward of boat2.
 *
 * The windward boat is the one closer to the direction the wind is coming from.
 *
 * @param {object} boat1 - {x, y}
 * @param {object} boat2 - {x, y}
 * @param {number} windDirection - true wind direction (where wind comes from)
 * @returns {boolean} true if boat1 is windward of boat2
 */
export function isWindward(boat1, boat2, windDirection) {
  if (windDirection == null) return false;

  // Bearing from boat2 to boat1
  const bearing = bearingBetween(boat2, boat1);

  // The windward side is the side the wind is coming FROM
  // If the bearing from boat2 to boat1 is close to the wind direction, boat1 is windward
  const diff = Math.abs(angleDiff(bearing, windDirection));
  return diff < 90;
}

/**
 * Determine if two boats are on converging courses (getting closer).
 *
 * @param {object} boat1 - {x, y, heading, speed}
 * @param {object} boat2 - {x, y, heading, speed}
 * @returns {boolean}
 */
export function areConverging(boat1, boat2) {
  if (boat1.x == null || boat2.x == null) return false;

  // Simple approach: check if bearing from each boat to the other
  // is roughly aligned with their heading (they're heading toward each other)
  const bearing1to2 = bearingBetween(boat1, boat2);
  const bearing2to1 = bearingBetween(boat2, boat1);

  const headingDiff1 = Math.abs(angleDiff(boat1.heading, bearing1to2));
  const headingDiff2 = Math.abs(angleDiff(boat2.heading, bearing2to1));

  // Converging if both boats are heading somewhat toward each other
  // (within 90 degrees of the bearing to the other boat)
  return headingDiff1 < 90 && headingDiff2 < 90;
}

/**
 * Check if a boat is actively tacking (high rate of turn through head-to-wind).
 *
 * @param {object} boat - {rateOfTurn, heading, windDirection}
 * @param {number} windDirection
 * @returns {boolean}
 */
function isTacking(boat, windDirection) {
  if (boat.rateOfTurn == null || windDirection == null) return false;

  // High rate of turn indicates active maneuvering
  if (Math.abs(boat.rateOfTurn) < TACKING_ROT_THRESHOLD) return false;

  // Check if heading is near head-to-wind (within 30 degrees of wind direction)
  const headToWind = Math.abs(angleDiff(boat.heading, windDirection));
  return headToWind < 30;
}

/**
 * Determine urgency level based on distance and convergence.
 *
 * @param {number} distance - distance in game units
 * @param {boolean} converging - whether boats are converging
 * @returns {'low'|'medium'|'high'|'critical'}
 */
function getUrgency(distance, converging) {
  if (distance < URGENCY_CRITICAL) return 'critical';
  if (distance < URGENCY_HIGH) return converging ? 'critical' : 'high';
  if (distance < URGENCY_MEDIUM) return converging ? 'high' : 'medium';
  return converging ? 'medium' : 'low';
}

/**
 * Get a slot label for display (e.g., "Boat #3").
 * @param {object} boat
 * @returns {string}
 */
function boatLabel(boat) {
  return `Boat #${boat.slot}`;
}

/**
 * Detect all active encounters between the player and other boats.
 *
 * @param {object} playerBoat - Player boat data {x, y, heading, speed, rateOfTurn, slot, isPlayer}
 * @param {Array<object>} boats - All boats including player
 * @param {number|null} windDirection - Wind direction in degrees (where wind comes from)
 * @returns {Array<object>} Array of encounter objects
 */
export function detectEncounters(playerBoat, boats, windDirection) {
  if (!playerBoat || !boats || !Array.isArray(boats)) return [];
  if (windDirection == null) {
    return [{
      rule: null,
      otherBoat: null,
      distance: 0,
      situation: 'unknown',
      playerRole: null,
      urgency: 'low',
      description: 'Cannot determine tack -- wind direction unknown',
    }];
  }

  const encounters = [];
  const playerTack = determineTack(playerBoat.heading, windDirection);

  for (const boat of boats) {
    // Skip player boat
    if (boat.isPlayer || boat.slot === playerBoat.slot) continue;

    const dist = distanceBetween(playerBoat, boat);
    if (dist > ENCOUNTER_DISTANCE || dist === Infinity) continue;

    const otherTack = determineTack(boat.heading, windDirection);
    const converging = areConverging(playerBoat, boat);
    const urgency = getUrgency(dist, converging);

    // Skip non-converging distant boats (low urgency and not close)
    if (!converging && dist > URGENCY_MEDIUM) continue;

    // Check for tacking (Rule 13)
    const playerIsTacking = isTacking(playerBoat, windDirection);
    const otherIsTacking = isTacking(boat, windDirection);

    if (playerIsTacking) {
      encounters.push({
        rule: '13',
        otherBoat: boat,
        distance: dist,
        situation: 'player_tacking',
        playerRole: 'give-way',
        urgency,
        description: `You are TACKING -- keep clear of ${boatLabel(boat)}. Complete your tack before asserting any rights.`,
      });
      continue;
    }

    if (otherIsTacking) {
      encounters.push({
        rule: '13',
        otherBoat: boat,
        distance: dist,
        situation: 'other_tacking',
        playerRole: 'stand-on',
        urgency,
        description: `${boatLabel(boat)} is TACKING -- they must keep clear of you. Hold your course.`,
      });
      continue;
    }

    // Opposite tacks (Rule 10)
    if (playerTack && otherTack && playerTack !== otherTack) {
      if (converging || dist < URGENCY_MEDIUM) {
        const playerRole = playerTack === 'port' ? 'give-way' : 'stand-on';
        const desc = playerTack === 'port'
          ? `You are on PORT tack -- ${boatLabel(boat)} on STARBOARD has right of way. Prepare to duck or tack.`
          : `You are on STARBOARD tack -- ${boatLabel(boat)} on PORT must keep clear. Hold your course.`;

        encounters.push({
          rule: '10',
          otherBoat: boat,
          distance: dist,
          situation: 'port_starboard',
          playerRole,
          urgency,
          description: desc,
        });
      }
      continue;
    }

    // Same tack rules
    if (playerTack && otherTack && playerTack === otherTack) {
      const overlapped = isOverlapped(playerBoat, boat, windDirection);

      if (overlapped) {
        // Rule 11: Windward/Leeward
        const playerIsWindward = isWindward(playerBoat, boat, windDirection);
        const playerRole = playerIsWindward ? 'give-way' : 'stand-on';
        const situation = playerIsWindward ? 'windward' : 'leeward';
        const desc = playerIsWindward
          ? `You are the WINDWARD boat -- ${boatLabel(boat)} to leeward has right of way. Keep clear, stay high.`
          : `You are the LEEWARD boat -- you have right of way over ${boatLabel(boat)} to windward.`;

        encounters.push({
          rule: '11',
          otherBoat: boat,
          distance: dist,
          situation,
          playerRole,
          urgency,
          description: desc,
        });
      } else {
        // Rule 12: Clear astern/ahead
        // Determine if player is ahead or behind
        const bearingToOther = bearingBetween(playerBoat, boat);
        const headingDiff = Math.abs(angleDiff(playerBoat.heading, bearingToOther));

        // If other boat is roughly behind us (bearing to them is opposite our heading)
        const playerIsAhead = headingDiff > 90;
        const playerRole = playerIsAhead ? 'stand-on' : 'give-way';
        const situation = playerIsAhead ? 'clear_ahead' : 'clear_astern';
        const desc = playerIsAhead
          ? `You are CLEAR AHEAD of ${boatLabel(boat)} -- you have right of way. They must keep clear.`
          : `You are CLEAR ASTERN of ${boatLabel(boat)} -- they are ahead, you must keep clear.`;

        if (converging || dist < URGENCY_HIGH) {
          encounters.push({
            rule: '12',
            otherBoat: boat,
            distance: dist,
            situation,
            playerRole,
            urgency,
            description: desc,
          });
        }
      }
    }
  }

  // Always add Rule 14 reminder if there are any high/critical encounters
  const hasCritical = encounters.some(e => e.urgency === 'critical' || e.urgency === 'high');
  if (hasCritical) {
    encounters.push({
      rule: '14',
      otherBoat: null,
      distance: 0,
      situation: 'avoiding_contact',
      playerRole: null,
      urgency: 'medium',
      description: 'Remember Rule 14: ALL boats must try to avoid contact, even if you have right of way.',
    });
  }

  // Sort by urgency (critical first)
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  encounters.sort((a, b) => (urgencyOrder[a.urgency] ?? 4) - (urgencyOrder[b.urgency] ?? 4));

  return encounters;
}
