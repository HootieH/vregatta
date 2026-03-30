/**
 * Detects which boat slot belongs to the player by correlating helm inputs
 * with boat heading changes over time.
 *
 * The player's boat heading will converge toward helm input values. By
 * tracking which slot most consistently follows helm inputs, we can
 * identify the player without relying on array position.
 */
export class PlayerDetector {
  constructor() {
    this.helmHistory = []; // last 10 helm inputs [{heading, tick}]
    this.scores = new Map(); // slot -> match score
    this.detectedSlot = null;
    this.confidence = 0;
  }

  /**
   * Called when a helm input is received (ws-helm-input with decoded heading).
   * @param {number} heading - the commanded heading
   * @param {number} tick - server tick or timestamp
   */
  addHelmInput(heading, tick) {
    this.helmHistory.push({ heading, tick });
    if (this.helmHistory.length > 10) this.helmHistory.shift();
  }

  /**
   * Called with each normalized state update. Compares each boat's heading
   * against the latest helm input and scores matches.
   * @param {object} normalizedState - output of normalizeInshoreState()
   */
  updateFromState(normalizedState) {
    if (this.helmHistory.length === 0 || !normalizedState.boats) return;

    const latestHelm = this.helmHistory[this.helmHistory.length - 1];

    // For each boat, check if its heading is close to the latest helm input
    for (const boat of normalizedState.boats) {
      let diff = Math.abs(boat.heading - latestHelm.heading);
      if (diff > 180) diff = 360 - diff;

      // Score: closer heading = higher score
      const score = diff < 5 ? 3 : diff < 15 ? 2 : diff < 30 ? 1 : 0;
      this.scores.set(boat.slot, (this.scores.get(boat.slot) || 0) + score);
    }

    // The slot with the highest cumulative score is the player
    let bestSlot = null, bestScore = 0;
    for (const [slot, score] of this.scores) {
      if (score > bestScore) { bestScore = score; bestSlot = slot; }
    }

    if (bestSlot !== null && bestScore > 10) {
      this.detectedSlot = bestSlot;
      this.confidence = Math.min(bestScore / 50, 1);
    }
  }

  /** @returns {number|null} the detected player slot, or null if not yet determined */
  getPlayerSlot() { return this.detectedSlot; }

  /** @returns {number} confidence 0-1 */
  getConfidence() { return this.confidence; }

  /** Reset all state (e.g., on race restart) */
  reset() {
    this.helmHistory = [];
    this.scores.clear();
    this.detectedSlot = null;
    this.confidence = 0;
  }
}
