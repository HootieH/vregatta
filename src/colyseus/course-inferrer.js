/**
 * Infers course layout from mark crossings detected in LEAVE messages.
 *
 * Each LEAVE message tells us which mark the player crossed.
 * By recording the player's position at that moment, we can infer
 * where marks are on the course.
 *
 * Mark semantics:
 *   - Mark 2 = start/finish line (two crossings at different ends give endpoints)
 *   - Mark 0 = windward gate port pin
 *   - Mark 1 = windward gate starboard pin
 */

const MARK_LABELS = {
  0: 'Windward Port',
  1: 'Windward Stbd',
  2: 'Start/Finish',
};

/** Upwind angle assumption for layline computation (degrees off wind). */
const UPWIND_ANGLE = 45;

export class CourseInferrer {
  constructor() {
    this.reset();
  }

  /**
   * Record a mark crossing with player position at that moment.
   *
   * @param {number} markId - 0, 1, or 2
   * @param {number} crossingAngle - float, NaN if not available
   * @param {number} playerX - player X position (game units)
   * @param {number} playerY - player Y position (game units)
   * @param {number} playerHeading - player heading in degrees
   * @param {number} tick - game tick at crossing time
   */
  addCrossing(markId, crossingAngle, playerX, playerY, playerHeading, tick) {
    if (markId == null || playerX == null || playerY == null) return;

    if (!this._crossings.has(markId)) {
      this._crossings.set(markId, []);
    }

    this._crossings.get(markId).push({
      x: playerX,
      y: playerY,
      heading: playerHeading,
      angle: crossingAngle,
      tick: tick || 0,
    });
  }

  /**
   * Get inferred mark positions (averaged from crossings).
   * For mark 2, if we have 2+ crossings, they represent different ends
   * of the start/finish line — we keep both positions as separate marks.
   *
   * @returns {Array<{id: number, x: number, y: number, crossingCount: number, label: string}>}
   */
  getMarks() {
    const marks = [];

    for (const [markId, crossings] of this._crossings) {
      if (crossings.length === 0) continue;

      if (markId === 2 && crossings.length >= 2) {
        // Start/finish line: first and last crossings are different ends
        // Use weighted positions: first crossing = one end, most recent = other end
        const first = crossings[0];
        const last = crossings[crossings.length - 1];
        marks.push({
          id: 2,
          x: first.x,
          y: first.y,
          crossingCount: crossings.length,
          label: 'Start/Finish',
          endIndex: 0,
        });
        // Only add second endpoint if positions differ meaningfully
        const dist = Math.hypot(last.x - first.x, last.y - first.y);
        if (dist > 50) {
          marks.push({
            id: 2,
            x: last.x,
            y: last.y,
            crossingCount: crossings.length,
            label: 'Start/Finish',
            endIndex: 1,
          });
        }
      } else {
        // Single mark position: weighted average (newer crossings weighted higher)
        const pos = this._weightedAverage(crossings);
        marks.push({
          id: markId,
          x: pos.x,
          y: pos.y,
          crossingCount: crossings.length,
          label: MARK_LABELS[markId] || `Mark ${markId}`,
        });
      }
    }

    return marks;
  }

  /**
   * Get inferred course layout.
   *
   * @returns {{
   *   startLine: {x1: number, y1: number, x2: number, y2: number}|null,
   *   windwardGate: {port: {x: number, y: number}, stbd: {x: number, y: number}}|null,
   *   courseAxis: number,
   *   courseLength: number
   * }}
   */
  getCourse() {
    const marks = this.getMarks();
    const startMarks = marks.filter(m => m.id === 2);
    const mark0 = marks.find(m => m.id === 0);
    const mark1 = marks.find(m => m.id === 1);

    // Start line from two mark-2 endpoints
    let startLine = null;
    if (startMarks.length >= 2) {
      startLine = {
        x1: startMarks[0].x,
        y1: startMarks[0].y,
        x2: startMarks[1].x,
        y2: startMarks[1].y,
      };
    }

    // Windward gate from marks 0 and 1
    let windwardGate = null;
    if (mark0 && mark1) {
      windwardGate = {
        port: { x: mark0.x, y: mark0.y },
        stbd: { x: mark1.x, y: mark1.y },
      };
    }

    // Course axis: bearing from start area center to windward gate center
    let courseAxis = 0;
    let courseLength = 0;
    const startCenter = this._getMarkCenter(2, startMarks);
    const gateCenter = this._getGateCenter(mark0, mark1);

    if (startCenter && gateCenter) {
      const dx = gateCenter.x - startCenter.x;
      const dy = gateCenter.y - startCenter.y;
      courseAxis = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
      courseLength = Math.hypot(dx, dy);
    }

    return { startLine, windwardGate, courseAxis, courseLength };
  }

  /**
   * Get laylines from windward gate given wind direction.
   * Laylines extend downwind from the windward gate on each tack.
   *
   * @param {number} windDirection - wind FROM direction in degrees
   * @returns {{
   *   port: {heading: number, line: [{x: number, y: number}, {x: number, y: number}]},
   *   stbd: {heading: number, line: [{x: number, y: number}, {x: number, y: number}]}
   * }|null}
   */
  getLaylines(windDirection) {
    if (windDirection == null) return null;

    const marks = this.getMarks();
    const mark0 = marks.find(m => m.id === 0);
    const mark1 = marks.find(m => m.id === 1);

    if (!mark0 && !mark1) return null;

    const course = this.getCourse();
    const len = course.courseLength > 0 ? course.courseLength : 3000;

    // Wind is FROM windDirection, so downwind is windDirection (the direction it's going TO is windDirection + 180)
    // Upwind heading on port tack = windDirection + UPWIND_ANGLE (turning right of the wind)
    // Upwind heading on stbd tack = windDirection - UPWIND_ANGLE (turning left of the wind)
    // Laylines extend downwind FROM the gate, so we invert:
    // Port layline from gate = heading downwind-to-left = windDirection + 180 - UPWIND_ANGLE
    // Stbd layline from gate = heading downwind-to-right = windDirection + 180 + UPWIND_ANGLE

    const portLaylineHdg = ((windDirection + 180 - UPWIND_ANGLE) + 360) % 360;
    const stbdLaylineHdg = ((windDirection + 180 + UPWIND_ANGLE) + 360) % 360;

    // Gate center or single mark
    const gateCenter = this._getGateCenter(mark0, mark1);
    if (!gateCenter) return null;

    const portRad = portLaylineHdg * Math.PI / 180;
    const stbdRad = stbdLaylineHdg * Math.PI / 180;

    return {
      port: {
        heading: Math.round(portLaylineHdg * 100) / 100,
        line: [
          { x: gateCenter.x, y: gateCenter.y },
          { x: gateCenter.x + len * Math.cos(portRad), y: gateCenter.y + len * Math.sin(portRad) },
        ],
      },
      stbd: {
        heading: Math.round(stbdLaylineHdg * 100) / 100,
        line: [
          { x: gateCenter.x, y: gateCenter.y },
          { x: gateCenter.x + len * Math.cos(stbdRad), y: gateCenter.y + len * Math.sin(stbdRad) },
        ],
      },
    };
  }

  /**
   * Reset all crossing data.
   */
  reset() {
    this._crossings = new Map();
  }

  // --- Internal helpers ---

  /**
   * Weighted average of crossing positions (newer = higher weight).
   */
  _weightedAverage(crossings) {
    if (crossings.length === 1) {
      return { x: crossings[0].x, y: crossings[0].y };
    }

    let totalWeight = 0;
    let wx = 0;
    let wy = 0;

    for (let i = 0; i < crossings.length; i++) {
      // Weight increases linearly: first=1, last=crossings.length
      const weight = i + 1;
      wx += crossings[i].x * weight;
      wy += crossings[i].y * weight;
      totalWeight += weight;
    }

    return { x: wx / totalWeight, y: wy / totalWeight };
  }

  /**
   * Get the center of a mark group (for mark 2 which may have two endpoints).
   */
  _getMarkCenter(markId, markList) {
    const relevant = markList || this.getMarks().filter(m => m.id === markId);
    if (relevant.length === 0) return null;
    if (relevant.length === 1) return { x: relevant[0].x, y: relevant[0].y };
    return {
      x: (relevant[0].x + relevant[1].x) / 2,
      y: (relevant[0].y + relevant[1].y) / 2,
    };
  }

  /**
   * Get the center of the windward gate from port and starboard marks.
   */
  _getGateCenter(mark0, mark1) {
    if (mark0 && mark1) {
      return { x: (mark0.x + mark1.x) / 2, y: (mark0.y + mark1.y) / 2 };
    }
    if (mark0) return { x: mark0.x, y: mark0.y };
    if (mark1) return { x: mark1.x, y: mark1.y };
    return null;
  }
}
