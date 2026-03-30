/**
 * Tests for FleetManager (src/colyseus/fleet-manager.js).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FleetManager } from '../colyseus/fleet-manager.js';

function makeMasterState(players) {
  return { players };
}

function makeGameState(boats) {
  return { boats };
}

describe('FleetManager', () => {
  let fm;

  beforeEach(() => {
    fm = new FleetManager();
  });

  describe('updateFromMaster', () => {
    it('stores player data from Master state', () => {
      fm.updateFromMaster(makeMasterState([
        { uuid: 'uuid-1', name: 'Tom', teamName: 'Team A', location: 'antigua', slotId: 0, status: 0, inRace: true },
        { uuid: 'uuid-2', name: 'Sarah', teamName: 'Team B', location: 'christchurch', slotId: 1, status: 0, inRace: true },
      ]));

      expect(fm.hasMasterData).toBe(true);
      const fleet = fm.getFleet();
      expect(fleet).toHaveLength(2);
      expect(fleet.find(p => p.name === 'Tom')).toBeDefined();
      expect(fleet.find(p => p.name === 'Sarah')).toBeDefined();
    });

    it('handles null/undefined gracefully', () => {
      fm.updateFromMaster(null);
      fm.updateFromMaster(undefined);
      fm.updateFromMaster({});
      expect(fm.getFleet()).toHaveLength(0);
    });

    it('updates existing players on subsequent calls', () => {
      fm.updateFromMaster(makeMasterState([
        { uuid: 'uuid-1', name: 'Tom', status: -1, inRace: false },
      ]));
      expect(fm.getFleet()[0].name).toBe('Tom');
      expect(fm.getFleet()[0].inRace).toBe(false);

      fm.updateFromMaster(makeMasterState([
        { uuid: 'uuid-1', name: 'Tom', status: 0, inRace: true },
      ]));
      expect(fm.getFleet()[0].inRace).toBe(true);
    });
  });

  describe('updateFromGame', () => {
    it('stores game boat data', () => {
      fm.updateFromGame(makeGameState([
        { slot: 2, heading: 90, speed: 0.5, x: 100, y: 200, isPlayer: true },
        { slot: 5, heading: 180, speed: 0.3, x: 150, y: 250, isPlayer: false },
      ]));

      // No fleet data without Master, but internal state is stored
      expect(fm.getFleet()).toHaveLength(0); // no master data yet
    });

    it('handles null gracefully', () => {
      fm.updateFromGame(null);
      fm.updateFromGame({});
      expect(fm.getFleet()).toHaveLength(0);
    });
  });

  describe('cross-referencing', () => {
    it('matches Master players to game slots by slotId', () => {
      fm.updateFromMaster(makeMasterState([
        { uuid: 'uuid-1', name: 'Tom', slotId: 2, status: 0, inRace: true },
        { uuid: 'uuid-2', name: 'Sarah', slotId: 5, status: 0, inRace: true },
      ]));

      fm.updateFromGame(makeGameState([
        { slot: 2, heading: 90, speed: 0.5, x: 100, y: 200, isPlayer: true },
        { slot: 5, heading: 180, speed: 0.3, x: 150, y: 250, isPlayer: false },
      ]));

      const fleet = fm.getFleet();
      const tom = fleet.find(p => p.name === 'Tom');
      expect(tom.hasPosition).toBe(true);
      expect(tom.heading).toBe(90);
      expect(tom.isPlayer).toBe(true);

      const sarah = fleet.find(p => p.name === 'Sarah');
      expect(sarah.hasPosition).toBe(true);
      expect(sarah.heading).toBe(180);
    });

    it('matches by count when slotIds dont match game slots', () => {
      fm.updateFromMaster(makeMasterState([
        { uuid: 'uuid-1', name: 'Tom', slotId: null, status: 0, inRace: true },
        { uuid: 'uuid-2', name: 'Sarah', slotId: null, status: 0, inRace: true },
      ]));

      fm.updateFromGame(makeGameState([
        { slot: 2, heading: 90, speed: 0.5, x: 100, y: 200, isPlayer: true },
        { slot: 5, heading: 180, speed: 0.3, x: 150, y: 250, isPlayer: false },
      ]));

      const fleet = fm.getFleet();
      const withPos = fleet.filter(p => p.hasPosition);
      expect(withPos).toHaveLength(2);
    });
  });

  describe('getPlayerName', () => {
    it('returns player name for a matched slot', () => {
      fm.updateFromMaster(makeMasterState([
        { uuid: 'uuid-1', name: 'Tom', slotId: 2, status: 0, inRace: true },
      ]));
      fm.updateFromGame(makeGameState([
        { slot: 2, heading: 90, speed: 0.5, x: 100, y: 200, isPlayer: true },
      ]));

      expect(fm.getPlayerName(2)).toBe('Tom');
    });

    it('returns null for unknown slot', () => {
      expect(fm.getPlayerName(99)).toBeNull();
    });

    it('returns null when no master data', () => {
      fm.updateFromGame(makeGameState([
        { slot: 2, heading: 90, speed: 0.5, x: 100, y: 200, isPlayer: true },
      ]));
      expect(fm.getPlayerName(2)).toBeNull();
    });
  });

  describe('getStats', () => {
    it('returns correct stats', () => {
      fm.updateFromMaster(makeMasterState([
        { uuid: 'uuid-1', name: 'Tom', slotId: 2, status: 0, inRace: true },
        { uuid: 'uuid-2', name: '', slotId: null, status: -1, inRace: false },
        { uuid: 'uuid-3', name: 'Sarah', slotId: 5, status: 0, inRace: true },
      ]));
      fm.updateFromGame(makeGameState([
        { slot: 2, heading: 90, speed: 0.5, x: 100, y: 200, isPlayer: true },
      ]));

      const stats = fm.getStats();
      expect(stats.total).toBe(3);
      expect(stats.inRace).toBe(2);
      expect(stats.withName).toBe(2);
      expect(stats.withPosition).toBe(1);
    });
  });

  describe('clear', () => {
    it('removes all data', () => {
      fm.updateFromMaster(makeMasterState([
        { uuid: 'uuid-1', name: 'Tom', slotId: 2, status: 0, inRace: true },
      ]));
      fm.updateFromGame(makeGameState([
        { slot: 2, heading: 90, speed: 0.5, x: 100, y: 200, isPlayer: true },
      ]));

      expect(fm.hasMasterData).toBe(true);
      fm.clear();
      expect(fm.hasMasterData).toBe(false);
      expect(fm.getFleet()).toHaveLength(0);
      expect(fm.getPlayerName(2)).toBeNull();
    });
  });
});
