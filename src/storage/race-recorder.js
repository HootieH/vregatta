/**
 * RaceRecorder — captures Inshore race states in memory during a race,
 * then persists the complete recording to IndexedDB on stop.
 *
 * Throttle strategy: stores every 10th state (~12.5/sec from ~125/sec input).
 * Memory budget: 12.5/sec * 600sec = 7,500 states max per race.
 */

import { saveReplay } from './idb.js';

/** Store every Nth incoming state */
const THROTTLE_INTERVAL = 10;

export class RaceRecorder {
  constructor() {
    this._recording = false;
    this._raceId = null;
    this._states = [];
    this._events = [];
    this._marks = [];
    this._startTime = null;
    this._endTime = null;
    this._stateCount = 0; // total states received (pre-throttle)
  }

  /**
   * Begin recording a new race.
   * @param {string} raceId
   */
  startRecording(raceId) {
    if (this._recording) {
      this.stopRecording(); // finalize previous if still running
    }
    this._recording = true;
    this._raceId = raceId;
    this._states = [];
    this._events = [];
    this._marks = [];
    this._startTime = Date.now();
    this._endTime = null;
    this._stateCount = 0;
  }

  /**
   * Append a normalized Inshore state. Only every THROTTLE_INTERVAL-th state
   * is actually stored, to keep memory bounded.
   * @param {object} normalizedState — output of normalizeInshoreState()
   */
  addState(normalizedState) {
    if (!this._recording || !normalizedState) return;

    this._stateCount++;
    if (this._stateCount % THROTTLE_INTERVAL !== 0) return;

    // Strip to lightweight representation
    const compact = {
      tick: normalizedState.tick ?? 0,
      boats: (normalizedState.boats || []).map((b) => ({
        slot: b.slot,
        heading: b.heading,
        x: b.x,
        y: b.y,
        speed: b.speed,
        twa: b.twa,
        tack: b.tack,
      })),
      windDirection: normalizedState.windDirection ?? null,
    };

    this._states.push(compact);
  }

  /**
   * Store a discrete event (tack, gybe, rule encounter, mark rounding, etc.)
   * @param {object} event — { type, tick, timestamp, ... }
   */
  addEvent(event) {
    if (!this._recording || !event) return;
    this._events.push({ ...event });
  }

  /**
   * Register detected marks for the recording.
   * @param {Array} marks — from detectMarks()
   */
  setMarks(marks) {
    if (!this._recording || !marks) return;
    this._marks = marks.map((m) => ({ ...m }));
  }

  /**
   * Finalize the recording and return the complete race data object.
   * Does NOT persist to IndexedDB — call saveRecording() for that.
   * @returns {object|null} race data, or null if not recording
   */
  stopRecording() {
    if (!this._recording) return null;

    this._recording = false;
    this._endTime = Date.now();

    const raceData = this.getRaceData();
    return raceData;
  }

  /**
   * @returns {boolean}
   */
  isRecording() {
    return this._recording;
  }

  /**
   * Returns the current race data snapshot.
   * @returns {object} { raceId, states, events, marks, startTime, endTime, duration }
   */
  getRaceData() {
    const endTime = this._endTime ?? Date.now();
    const startTime = this._startTime ?? endTime;
    return {
      raceId: this._raceId,
      states: this._states.slice(),
      events: this._events.slice(),
      marks: this._marks.slice(),
      startTime,
      endTime,
      duration: (endTime - startTime) / 1000,
    };
  }

  /**
   * Persist the current recording to IndexedDB.
   * @param {IDBDatabase} db
   * @returns {Promise}
   */
  async saveRecording(db) {
    const data = this.getRaceData();
    if (!db || !data.raceId) return;
    await saveReplay(db, data);
  }
}
