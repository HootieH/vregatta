/**
 * FleetManager: maintains the complete fleet roster by cross-referencing
 * Master server data (player names, UUIDs, teams) with Game server data
 * (boat positions, headings, speeds).
 *
 * Data flow:
 *   Master server → updateFromMaster() → player names, UUIDs, locations
 *   Game server   → updateFromGame()   → boat positions, headings, speeds
 *   getFleet()    → merged view with names + positions
 */

export class FleetManager {
  constructor() {
    /** @type {Map<string, object>} key=playerUUID, value=master player info */
    this._masterPlayers = new Map();

    /** @type {Map<number, object>} key=slotId, value=game boat state */
    this._gameBoats = new Map();

    /** @type {Map<number, string>} key=slotId, value=playerUUID (best guess mapping) */
    this._slotToUuid = new Map();

    /** @type {Map<string, number>} key=playerUUID, value=slotId */
    this._uuidToSlot = new Map();

    /** @type {number} Last update timestamp */
    this._lastMasterUpdate = 0;
    this._lastGameUpdate = 0;
  }

  /**
   * Update fleet from Master server decoded state.
   *
   * @param {{ players: Array<object> }} masterState - Output of decodeMasterState()
   */
  updateFromMaster(masterState) {
    if (!masterState || !Array.isArray(masterState.players)) return;

    for (const player of masterState.players) {
      if (!player.uuid) continue;
      this._masterPlayers.set(player.uuid, {
        ...player,
        _lastSeen: Date.now(),
      });
    }

    this._lastMasterUpdate = Date.now();
  }

  /**
   * Update fleet from Game server normalized inshore state.
   *
   * @param {{ boats: Array<object> }} gameState - Output of normalizeInshoreState()
   */
  updateFromGame(gameState) {
    if (!gameState || !Array.isArray(gameState.boats)) return;

    for (const boat of gameState.boats) {
      if (boat.slot == null) continue;
      this._gameBoats.set(boat.slot, {
        ...boat,
        _lastSeen: Date.now(),
      });
    }

    this._lastGameUpdate = Date.now();

    // Attempt to cross-reference slots with Master players
    this._tryMatchSlots();
  }

  /**
   * Try to match game slots to Master player entries.
   *
   * Matching strategies:
   * 1. Master players with inRace=true and matching slotId field
   * 2. Count-based: if same number of active racers in both, map by order
   */
  _tryMatchSlots() {
    // Strategy 1: Direct slot matching from Master data
    const inRacePlayers = Array.from(this._masterPlayers.values())
      .filter(p => p.inRace);

    for (const player of inRacePlayers) {
      if (player.slotId != null && this._gameBoats.has(player.slotId)) {
        this._slotToUuid.set(player.slotId, player.uuid);
        this._uuidToSlot.set(player.uuid, player.slotId);
      }
    }

    // Strategy 2: If we have exactly the same number of in-race players
    // as game boats, and no direct slot matches, try matching by order
    if (this._slotToUuid.size === 0 && inRacePlayers.length > 0) {
      const gameSlots = Array.from(this._gameBoats.keys()).sort((a, b) => a - b);
      if (gameSlots.length === inRacePlayers.length) {
        for (let i = 0; i < gameSlots.length; i++) {
          this._slotToUuid.set(gameSlots[i], inRacePlayers[i].uuid);
          this._uuidToSlot.set(inRacePlayers[i].uuid, gameSlots[i]);
        }
      }
    }
  }

  /**
   * Get player name for a given slot ID.
   *
   * @param {number} slotId
   * @returns {string|null}
   */
  getPlayerName(slotId) {
    const uuid = this._slotToUuid.get(slotId);
    if (!uuid) return null;
    const player = this._masterPlayers.get(uuid);
    return player?.name || null;
  }

  /**
   * Get the complete fleet roster — all known players with available data.
   *
   * @returns {Array<{
   *   uuid: string,
   *   name: string,
   *   teamName: string,
   *   location: string,
   *   slotId: number|null,
   *   inRace: boolean,
   *   level: string,
   *   wins: string,
   *   hasPosition: boolean,
   *   heading: number|null,
   *   speed: number|null,
   *   x: number|null,
   *   y: number|null,
   * }>}
   */
  getFleet() {
    const fleet = [];

    for (const [uuid, player] of this._masterPlayers) {
      const slot = this._uuidToSlot.get(uuid);
      const gameBoat = slot != null ? this._gameBoats.get(slot) : null;

      fleet.push({
        uuid: player.uuid,
        name: player.name || '',
        teamName: player.teamName || '',
        location: player.location || '',
        zoneId: player.zoneId || '',
        level: player.level || '',
        wins: player.wins || '',
        slotId: slot ?? player.slotId ?? null,
        inRace: player.inRace ?? false,
        status: player.status,
        hasPosition: !!gameBoat,
        heading: gameBoat?.heading ?? null,
        speed: gameBoat?.speed ?? null,
        x: gameBoat?.x ?? null,
        y: gameBoat?.y ?? null,
        isPlayer: gameBoat?.isPlayer ?? false,
      });
    }

    return fleet;
  }

  /**
   * Get fleet summary stats.
   *
   * @returns {{ total: number, inRace: number, withPosition: number, withName: number }}
   */
  getStats() {
    const all = this.getFleet();
    return {
      total: all.length,
      inRace: all.filter(p => p.inRace).length,
      withPosition: all.filter(p => p.hasPosition).length,
      withName: all.filter(p => !!p.name).length,
    };
  }

  /**
   * Clear all data (e.g., on race end or disconnect).
   */
  clear() {
    this._masterPlayers.clear();
    this._gameBoats.clear();
    this._slotToUuid.clear();
    this._uuidToSlot.clear();
    this._lastMasterUpdate = 0;
    this._lastGameUpdate = 0;
  }

  /**
   * Check if the fleet manager has any data.
   */
  get hasMasterData() {
    return this._masterPlayers.size > 0;
  }

  /**
   * Check if we have cross-referenced any slots.
   */
  get hasSlotMapping() {
    return this._slotToUuid.size > 0;
  }
}
