/**
 * Mark/gate detection for VR Inshore races.
 *
 * Since mark positions are NOT directly transmitted in the WebSocket protocol,
 * we infer them from boat behavior patterns:
 *   - Boats converge at marks (multiple boats pass through the same area)
 *   - Boats turn sharply at marks (high absolute rateOfTurn)
 *   - Marks appear as spatial clusters of convergence + turning events
 *
 * Protocol field analysis (from 200-message capture):
 *   Field 2  = race event codes ([0]=normal, [2]=tacking event, [32]/[3]/[4]=other events)
 *   Field 3  = per-boat tack direction flags (-1=port tack, 0=straight, 1=starboard tack)
 *   Fields 5,7,8,9 = always 0 (unused or reserved)
 *   Field 23 = always [0,0,0,0,0,0] (unused)
 *   Field 24 = always 0 (unused)
 *
 * None of the unexplored fields encode mark positions or leg numbers,
 * so detection relies entirely on position + turn-rate clustering.
 */

/** Minimum boats that must pass near a point to consider it a mark */
const MIN_BOATS_FOR_MARK = 2;

/** Distance threshold (game units) for clustering nearby turn events */
const CLUSTER_RADIUS = 500;

/** Rate-of-turn threshold to flag a sharp turn (absolute value) */
const SHARP_TURN_THRESHOLD = 300;

/** Distance threshold for merging clusters that are close together */
const MERGE_RADIUS = 800;

/** Default approach distance threshold */
const DEFAULT_APPROACH_THRESHOLD = 1500;

/**
 * Euclidean distance between two points in game coordinates.
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @returns {number}
 */
function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Bearing from point a to point b in game coordinates (degrees, 0=up/north).
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @returns {number} 0-360
 */
function bearingTo(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // atan2(dx, -dy) gives angle from north (up) clockwise
  const rad = Math.atan2(dx, -dy);
  return ((rad * 180 / Math.PI) + 360) % 360;
}

/**
 * Detect marks from accumulated Inshore state history.
 *
 * Analyzes position and turn-rate data across multiple ticks to find
 * spatial clusters where boats converge and turn sharply — these are marks.
 *
 * @param {Array<object>} stateHistory - Array of normalized Inshore states
 *   (each from normalizeInshoreState, with .boats[].{x, y, rateOfTurn, slot, heading})
 * @returns {{marks: Array<{x: number, y: number, id: string, roundingDirection: 'port'|'starboard', passCount: number}>}}
 */
export function detectMarks(stateHistory) {
  if (!stateHistory || stateHistory.length < 2) {
    return { marks: [] };
  }

  // Step 1: Collect all sharp-turn events across all boats and ticks
  const turnEvents = [];

  for (const state of stateHistory) {
    if (!state.boats || !Array.isArray(state.boats)) continue;

    for (const boat of state.boats) {
      if (boat.x == null || boat.y == null) continue;
      if (Math.abs(boat.rateOfTurn || 0) >= SHARP_TURN_THRESHOLD) {
        turnEvents.push({
          x: boat.x,
          y: boat.y,
          slot: boat.slot,
          rateOfTurn: boat.rateOfTurn,
          heading: boat.heading,
          tick: state.tick,
        });
      }
    }
  }

  if (turnEvents.length === 0) {
    return { marks: [] };
  }

  // Step 2: Cluster turn events spatially
  const clusters = [];

  for (const evt of turnEvents) {
    let bestCluster = null;
    let bestDist = Infinity;

    for (const c of clusters) {
      const d = dist(evt, { x: c.cx, y: c.cy });
      if (d < CLUSTER_RADIUS && d < bestDist) {
        bestCluster = c;
        bestDist = d;
      }
    }

    if (bestCluster) {
      bestCluster.events.push(evt);
      // Update centroid
      bestCluster.cx = bestCluster.events.reduce((s, e) => s + e.x, 0) / bestCluster.events.length;
      bestCluster.cy = bestCluster.events.reduce((s, e) => s + e.y, 0) / bestCluster.events.length;
    } else {
      clusters.push({
        cx: evt.x,
        cy: evt.y,
        events: [evt],
      });
    }
  }

  // Step 3: Merge clusters that are close together
  const merged = [];
  const used = new Set();

  for (let i = 0; i < clusters.length; i++) {
    if (used.has(i)) continue;
    const mergedCluster = { ...clusters[i], events: [...clusters[i].events] };

    for (let j = i + 1; j < clusters.length; j++) {
      if (used.has(j)) continue;
      if (dist({ x: mergedCluster.cx, y: mergedCluster.cy }, { x: clusters[j].cx, y: clusters[j].cy }) < MERGE_RADIUS) {
        mergedCluster.events.push(...clusters[j].events);
        mergedCluster.cx = mergedCluster.events.reduce((s, e) => s + e.x, 0) / mergedCluster.events.length;
        mergedCluster.cy = mergedCluster.events.reduce((s, e) => s + e.y, 0) / mergedCluster.events.length;
        used.add(j);
      }
    }

    merged.push(mergedCluster);
  }

  // Step 4: Filter clusters that have enough distinct boats passing through
  const marks = [];
  let markId = 1;

  for (const cluster of merged) {
    const uniqueBoats = new Set(cluster.events.map(e => e.slot));
    if (uniqueBoats.size < MIN_BOATS_FOR_MARK) continue;

    // Determine rounding direction from average turn rate
    const avgTurnRate = cluster.events.reduce((s, e) => s + e.rateOfTurn, 0) / cluster.events.length;
    // Positive turnRate = turning right = starboard rounding
    // Negative turnRate = turning left = port rounding
    const roundingDirection = avgTurnRate >= 0 ? 'starboard' : 'port';

    marks.push({
      x: Math.round(cluster.cx),
      y: Math.round(cluster.cy),
      id: `M${markId}`,
      roundingDirection,
      passCount: uniqueBoats.size,
    });

    markId++;
  }

  // Sort marks by y-coordinate (roughly top-to-bottom course order)
  marks.sort((a, b) => a.y - b.y);

  // Re-assign IDs after sorting
  marks.forEach((m, i) => { m.id = `M${i + 1}`; });

  return { marks };
}

/**
 * Determine which leg the player is on based on position relative to known marks.
 *
 * @param {{x: number, y: number, heading: number}} playerBoat - Player boat state
 * @param {Array<{x: number, y: number, id: string}>} marks - Detected marks
 * @returns {{legNumber: number, nextMark: {x: number, y: number, id: string}|null, distanceToMark: number, bearingToMark: number}}
 */
export function detectCurrentLeg(playerBoat, marks) {
  if (!playerBoat || !marks || marks.length === 0) {
    return { legNumber: 0, nextMark: null, distanceToMark: Infinity, bearingToMark: 0 };
  }

  // Find the closest mark
  let closestIdx = 0;
  let closestDist = Infinity;

  for (let i = 0; i < marks.length; i++) {
    const d = dist(playerBoat, marks[i]);
    if (d < closestDist) {
      closestDist = d;
      closestIdx = i;
    }
  }

  // Determine if the boat is heading toward or away from the closest mark
  const closestMark = marks[closestIdx];
  const brg = bearingTo(playerBoat, closestMark);
  const headingDiff = Math.abs(((playerBoat.heading - brg + 540) % 360) - 180);

  // If heading roughly toward the closest mark (within 90 degrees), it's the next mark
  // Otherwise, the next mark is the one after the closest
  let nextMarkIdx;
  if (headingDiff < 90) {
    nextMarkIdx = closestIdx;
  } else {
    nextMarkIdx = (closestIdx + 1) % marks.length;
  }

  const nextMark = marks[nextMarkIdx];
  const distToNext = dist(playerBoat, nextMark);
  const brgToNext = bearingTo(playerBoat, nextMark);

  // Leg number is the index of the next mark (leg 1 = heading to mark 1)
  const legNumber = nextMarkIdx + 1;

  return {
    legNumber,
    nextMark: { x: nextMark.x, y: nextMark.y, id: nextMark.id },
    distanceToMark: Math.round(distToNext),
    bearingToMark: Math.round(brgToNext * 10) / 10,
  };
}

/**
 * Check if a boat is approaching a mark (within threshold distance).
 *
 * @param {{x: number, y: number}} boat - Boat position
 * @param {{x: number, y: number}} mark - Mark position
 * @param {number} [threshold=1500] - Distance threshold in game units
 * @returns {boolean}
 */
export function isApproachingMark(boat, mark, threshold) {
  if (!boat || !mark) return false;
  if (boat.x == null || boat.y == null || mark.x == null || mark.y == null) return false;
  const t = threshold ?? DEFAULT_APPROACH_THRESHOLD;
  return dist(boat, mark) <= t;
}

// Export constants for testing
export {
  MIN_BOATS_FOR_MARK,
  CLUSTER_RADIUS,
  SHARP_TURN_THRESHOLD,
  MERGE_RADIUS,
  DEFAULT_APPROACH_THRESHOLD,
};
