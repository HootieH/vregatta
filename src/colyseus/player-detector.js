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

  /**
   * Fallback: pick a player using heuristics when no helm inputs available.
   * Uses the boat with the highest heading variance (most active steering).
   * @param {object} normalizedState
   */
  updateFallback(normalizedState) {
    if (this.detectedSlot !== null) return; // already detected via helm
    if (!normalizedState?.boats) return;

    for (const boat of normalizedState.boats) {
      if (!this._headingHistory) this._headingHistory = new Map();
      if (!this._headingHistory.has(boat.slot)) this._headingHistory.set(boat.slot, []);
      const hist = this._headingHistory.get(boat.slot);
      hist.push(boat.heading);
      if (hist.length > 100) hist.shift();
    }

    // After 50+ samples, pick the boat with most heading variance
    if (!this._headingHistory || this._fallbackChecked) return;
    const minSamples = 50;
    let ready = true;
    for (const [, hist] of this._headingHistory) {
      if (hist.length < minSamples) { ready = false; break; }
    }
    if (!ready) return;

    let bestSlot = null, bestVariance = 0;
    for (const [slot, hist] of this._headingHistory) {
      let totalChange = 0;
      for (let i = 1; i < hist.length; i++) {
        let d = Math.abs(hist[i] - hist[i - 1]);
        if (d > 180) d = 360 - d;
        totalChange += d;
      }
      if (totalChange > bestVariance) {
        bestVariance = totalChange;
        bestSlot = slot;
      }
    }

    if (bestSlot !== null && bestVariance > 20) {
      this.detectedSlot = bestSlot;
      this.confidence = 0.3; // low confidence — heuristic only
      this._fallbackChecked = true;
    }
  }

  /** @returns {number|null} the detected player slot, or null if not yet determined */
  getPlayerSlot() { return this.detectedSlot; }

  /** @returns {number} confidence 0-1 */
  getConfidence() { return this.confidence; }

  /** @returns {string} 'helm' | 'fallback' | 'none' */
  getMethod() {
    if (this.detectedSlot === null) return 'none';
    return this.confidence > 0.5 ? 'helm' : 'fallback';
  }

  /** Reset all state (e.g., on race restart) */
  reset() {
    this.helmHistory = [];
    this.scores.clear();
    this.detectedSlot = null;
    this.confidence = 0;
    this._headingHistory = null;
    this._fallbackChecked = false;
  }
}
