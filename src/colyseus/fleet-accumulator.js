/**
 * FleetAccumulator: accumulates the full Inshore fleet over time.
 *
 * The game room only sends ~4 nearby boats per state update, but as
 * the player moves around the course, different boats enter and leave
 * the visibility radius. Over a full race (5-10 min), all 18 boats
 * should be spotted at various points.
 *
 * This class maintains a complete fleet map that grows as new boats
 * are seen, tracks last-known positions for boats that leave visibility,
 * and stores position history for track rendering.
 */

const MAX_TRACK_POINTS = 200;
const STALE_THRESHOLD_MS = 5000;

export class FleetAccumulator {
  constructor() {
    /** @type {Map<number, object>} slotId -> boat data with metadata */
    this.boats = new Map();

    /** @type {Map<number, Array<{x: number, y: number, timestamp: number}>>} */
    this.trackHistory = new Map();

    /** @type {Map<number, string>} slotId -> player name */
    this._playerNames = new Map();

    /** @type {Set<number>} slots visible in the most recent update */
    this._currentlyVisible = new Set();
  }

  /**
   * Called with each game state update (~125/sec, ~4 boats per update).
   *
   * @param {object} normalizedState - Output of normalizeInshoreState()
   * @returns {{ visibleBoats: Array, allKnownBoats: Array, newBoatSpotted: boolean }}
   */
  update(normalizedState) {
    if (!normalizedState || !Array.isArray(normalizedState.boats)) {
      return { visibleBoats: [], allKnownBoats: this.getFleet(), newBoatSpotted: false };
    }

    const now = normalizedState.timestamp ?? Date.now();
    let newBoatSpotted = false;

    // Record which slots are in this update
    this._currentlyVisible.clear();

    for (const boat of normalizedState.boats) {
      const slot = boat.slot;
      if (slot == null) continue;

      this._currentlyVisible.add(slot);

      const isNew = !this.boats.has(slot);
      if (isNew) {
        newBoatSpotted = true;
      }

      // Merge: keep existing metadata, update position/state
      const existing = this.boats.get(slot) || {};
      this.boats.set(slot, {
        ...existing,
        ...boat,
        lastSeen: now,
        firstSeen: existing.firstSeen ?? now,
        visible: true,
        stale: false,
        name: this._playerNames.get(slot) || existing.name || null,
      });

      // Add track point
      this.addTrackPoint(slot, boat.x, boat.y, now);
    }

    // Mark boats NOT in this update as not-visible
    for (const [slot, data] of this.boats) {
      if (!this._currentlyVisible.has(slot)) {
        data.visible = false;
        data.stale = (now - data.lastSeen) > STALE_THRESHOLD_MS;
      }
    }

    const visibleBoats = [];
    const allKnownBoats = [];
    for (const data of this.boats.values()) {
      allKnownBoats.push(data);
      if (data.visible) visibleBoats.push(data);
    }

    return { visibleBoats, allKnownBoats, newBoatSpotted };
  }

  /**
   * Get all known boats with visibility status and track history.
   *
   * @returns {Array<object>}
   */
  getFleet() {
    const now = Date.now();
    const fleet = [];

    for (const [slot, data] of this.boats) {
      fleet.push({
        ...data,
        slot,
        visible: this._currentlyVisible.has(slot),
        stale: !this._currentlyVisible.has(slot) && (now - (data.lastSeen ?? 0)) > STALE_THRESHOLD_MS,
        name: this._playerNames.get(slot) || data.name || null,
        trackHistory: this.trackHistory.get(slot) || [],
      });
    }

    return fleet;
  }

  /**
   * Get fleet statistics.
   *
   * @returns {{ totalSeen: number, currentlyVisible: number, stale: number }}
   */
  getStats() {
    const now = Date.now();
    let staleCount = 0;

    for (const [slot, data] of this.boats) {
      if (!this._currentlyVisible.has(slot) && (now - (data.lastSeen ?? 0)) > STALE_THRESHOLD_MS) {
        staleCount++;
      }
    }

    return {
      totalSeen: this.boats.size,
      currentlyVisible: this._currentlyVisible.size,
      stale: staleCount,
    };
  }

  /**
   * Add a position to a boat's track history.
   *
   * @param {number} slotId
   * @param {number} x
   * @param {number} y
   * @param {number} timestamp
   */
  addTrackPoint(slotId, x, y, timestamp) {
    let track = this.trackHistory.get(slotId);
    if (!track) {
      track = [];
      this.trackHistory.set(slotId, track);
    }

    // Deduplicate: skip if same position as last point
    const last = track[track.length - 1];
    if (last && last.x === x && last.y === y) return;

    track.push({ x, y, timestamp: timestamp ?? Date.now() });

    if (track.length > MAX_TRACK_POINTS) {
      track.splice(0, track.length - MAX_TRACK_POINTS);
    }
  }

  /**
   * Attach player names from fleet manager or master data.
   *
   * @param {Map<number, string>} nameMap - slotId -> player name
   */
  setPlayerNames(nameMap) {
    if (!nameMap) return;
    for (const [slot, name] of nameMap) {
      this._playerNames.set(slot, name);
      // Update existing boat data
      const boat = this.boats.get(slot);
      if (boat) boat.name = name;
    }
  }

  /**
   * Clear all data (for new race).
   */
  reset() {
    this.boats.clear();
    this.trackHistory.clear();
    this._playerNames.clear();
    this._currentlyVisible.clear();
  }
}
