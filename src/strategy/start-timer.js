/**
 * Race start countdown timer with phase-based advice.
 */
export class StartTimer {
  constructor() {
    this._startTime = null;
  }

  /**
   * Set the race start time.
   * @param {number} timestamp - Unix timestamp (ms) of the race start
   */
  setStartTime(timestamp) {
    if (typeof timestamp !== 'number' || isNaN(timestamp)) {
      throw new Error('StartTimer: startTime must be a valid number');
    }
    this._startTime = timestamp;
  }

  /**
   * Get the start time.
   * @returns {number|null}
   */
  getStartTime() {
    return this._startTime;
  }

  /**
   * Get countdown in seconds until start. Negative = past start.
   * @param {number} [now] - current time in ms (defaults to Date.now())
   * @returns {number|null} seconds until start, or null if no start time set
   */
  getCountdown(now) {
    if (this._startTime == null) return null;
    const t = now ?? Date.now();
    return (this._startTime - t) / 1000;
  }

  /**
   * Get the current phase based on countdown.
   * @param {number} [now] - current time in ms
   * @returns {string} phase name
   */
  getPhase(now) {
    const seconds = this.getCountdown(now);
    if (seconds == null) return 'unknown';
    if (seconds > 300) return 'pre-start';     // > 5 min
    if (seconds > 60) return 'approach';        // 1-5 min
    if (seconds > 0) return 'final';            // 0-60s
    return seconds > -10 ? 'start' : 'racing';  // just started vs racing
  }

  /**
   * Get phase-appropriate advice.
   * @param {number} [now] - current time in ms
   * @returns {{phase: string, countdown: number|null, message: string, urgency: string}}
   */
  getAdvice(now) {
    const phase = this.getPhase(now);
    const countdown = this.getCountdown(now);

    switch (phase) {
    case 'pre-start':
      return {
        phase,
        countdown,
        message: 'Position for start — check wind and line bias',
        urgency: 'low',
      };
    case 'approach':
      return {
        phase,
        countdown,
        message: 'Final approach — hold position near line',
        urgency: 'medium',
      };
    case 'final':
      return {
        phase,
        countdown,
        message: `${Math.ceil(countdown)}s — accelerate to line!`,
        urgency: 'critical',
      };
    case 'start':
      return {
        phase,
        countdown,
        message: 'GO! Full speed ahead',
        urgency: 'critical',
      };
    case 'racing':
      return {
        phase,
        countdown,
        message: 'Racing — focus on VMG',
        urgency: 'low',
      };
    default:
      return {
        phase,
        countdown,
        message: 'Set start time to begin countdown',
        urgency: 'low',
      };
    }
  }
}
