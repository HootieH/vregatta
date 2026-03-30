/**
 * Tests for Master server decoder (src/colyseus/master-decoder.js).
 *
 * Uses actual captured data from a VR Inshore Master server session.
 */
import { describe, it, expect } from 'vitest';
import {
  decodeMasterState,
  decodeMasterUpdate,
  isMasterState,
  parseSchemaValue,
  isPlayerKey,
} from '../colyseus/master-decoder.js';

// --- Test fixtures from actual capture ---

// 1355-byte full ROOM_STATE with 8 players (2 named racers + 6 idle)
const BIG_STATE_B64 = '8wTmAAHeaAAIcwAkNmQ0MTUxNzgtMjAyNC00Zjg0LTk0ZDItMDY4MzQxNGUwZDQwaAAQcwABTnMAAHMAAUxzAABi/2IScwABQ2kAABcvYvxiAXMAAUdpAAAAAHMAAUVvAGL9bwFzAAFacwAAcwABUmIAcwABU2n/////cwABUHMAAHMAAVZzAABzAAFXcwAAcwABVGkAAAAAcwABVWkAAAABcwAkZTY4NmI3NzItODY2Mi00YmIzLWEzZjAtYzU0YjljMzIxMDVlaAAQcwABTnMAAHMAAUxzAABi/2IScwABQ2kAABcvYvxiAnMAAUdpAAAAAHMAAUVvAGL9bwFzAAFacwAAcwABUmIAcwABU2n/////cwABUHMAAHMAAVZzAABzAAFXcwAAcwABVGkAAAAAcwABVWkAAAABcwAkZmI5N2IwZmUtNjAwNi00N2NiLThhMTQtNjAxY2ZmZjgwY2Y2aAAQcwABTnMAAHMAAUxzAABi/2IScwABQ2kAABcvYvxiDHMAAUdpAAAAAHMAAUVvAGL9bwFzAAFacwAAcwABUmICcwABU2n/////cwABUHMAAHMAAVZzAABzAAFXcwAAcwABVGlpyhHgcwABVWkAAAABcwAYNjljYTExNDcwMWY4NWY5ZDU5NTc3OGJhaAAQcwABTnMAHVN1cGVyIHBybyByYWNpbmcgWFRSRU1FIC0gMS8xcwABTHMAB2FudGlndWFi/2IIcwABQ2kAAAn9YvxiAnMAAUdpAAAAHnMAAUVvAGL9bwFzAAFacwAYNjljYTExNDcwMWY4NWY5ZDU5NTc3OGI5cwABUmIAcwABU2kAAAAAcwABUHMADlRvbSBTbGluZ3NieTY5cwABVnMAAjQ1cwABV3MAAjIycwABVGkAAAAAcwABVWkAAAABcwAYNjljYTExZGNhNmE2YTY0ZjIxZGJhMDI5aAAQcwABTnMAD1Byb3JhY2luZyAtIDEvMXMAAUxzAAxjaHJpc3RjaHVyY2hi/2INcwABQ2kAAAn9YvxiAXMAAUdpAAAAHnMAAUVvAGL9bwFzAAFacwAYNjljYTExZGIwNDAxNmUxZTUzNmZhOGE4cwABUmIAcwABU2kAAAAAcwABUHMADUZseWluZyBDYXJwZXRzAAFWcwACNDVzAAFXcwACMjdzAAFUaQAAAABzAAFVaQAAAAFzACQ0NGI2MDA2ZC0xYjc5LTQ0NDktYmNkZC1lMDRkMDk3NjZmZGFoABBzAAFOcwAAcwABTHMAAGL/YhJzAAFDaQAAFy9i/GINcwABR2kAAAAAcwABRW8AYv1vAXMAAVpzAABzAAFSYgNzAAFTaf////9zAAFQcwAAcwABVnMAAHMAAVdzAABzAAFUaWnKEDRzAAFVaQAAAAFzACQ1ZjQwYjQwMi05MDBiLTRlZGYtOWI1YS1hYzMzNjdhMmNjMzVoABBzAAFOcwAAcwABTHMAAGL/YhJzAAFDaQAAFy9i/GIKcwABR2kAAAAAcwABRW8AYv1vAXMAAVpzAABzAAFSYgNzAAFTaf////9zAAFQcwAAcwABVnMAAHMAAVdzAABzAAFUaWnKEPZzAAFVaQAAAAFzACQ0ODUyNTJkZS0wM2MwLTQ5YzItOGNmOC0xYjhjMTcxODU4ZGNoABBzAAFOcwAAcwABTHMAAGL/YhJzAAFDaQAAFy9i/GINcwABR2kAAAAAcwABRW8AYv1vAXMAAVpzAABzAAFSYgNzAAFTaf////9zAAFQcwAAcwABVnMAAHMAAVdzAABzAAFUaWnKEXRzAAFVaQAAAAE=';

// 55-byte incremental update (single field change on existing player)
const SMALL_UPDATE_B64 = '8wTlAAHeaAABcwAkNmQ0MTUxNzgtMjAyNC00Zjg0LTk0ZDItMDY4MzQxNGUwZDQwaAABYvtvAQ==';

// 23-byte tiny update (top-level field changes, no player data)
const TINY_UPDATE_B64 = '8wTiAAPjaQAAABXlaQAAADfkaQAAAAk=';

function b64ToUint8Array(b64) {
  const bin = Buffer.from(b64, 'base64');
  return new Uint8Array(bin);
}

describe('master-decoder', () => {
  describe('isMasterState', () => {
    it('returns true for a Master ROOM_STATE buffer', () => {
      const buf = b64ToUint8Array(BIG_STATE_B64);
      expect(isMasterState(buf)).toBe(true);
    });

    it('returns false for a Game ROOM_STATE with zlib', () => {
      // Simulate a Game server state with zlib magic at offset 4
      const buf = new Uint8Array([0xf3, 0x04, 0x00, 0x00, 0x78, 0xda, 0x01, 0x02]);
      expect(isMasterState(buf)).toBe(false);
    });

    it('returns false for too-short buffer', () => {
      expect(isMasterState(new Uint8Array([0xf3]))).toBe(false);
      expect(isMasterState(null)).toBe(false);
    });

    it('returns false for wrong header', () => {
      expect(isMasterState(new Uint8Array([0x00, 0x04, 0x01, 0x02, 0x03]))).toBe(false);
    });
  });

  describe('isPlayerKey', () => {
    it('recognizes UUID format', () => {
      expect(isPlayerKey('6d415178-2024-4f84-94d2-0683414e0d40')).toBe(true);
    });

    it('recognizes 24-char hex ID', () => {
      expect(isPlayerKey('69ca114701f85f9d595778ba')).toBe(true);
    });

    it('rejects short strings', () => {
      expect(isPlayerKey('abc')).toBe(false);
      expect(isPlayerKey('')).toBe(false);
      expect(isPlayerKey(null)).toBe(false);
    });

    it('rejects non-hex strings', () => {
      expect(isPlayerKey('ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ')).toBe(false);
    });
  });

  describe('parseSchemaValue', () => {
    it('decodes a string value', () => {
      // 73 00 05 'hello'
      const buf = new Uint8Array([0x73, 0x00, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]);
      const result = parseSchemaValue(buf, 0);
      expect(result.type).toBe('string');
      expect(result.value).toBe('hello');
      expect(result.endPos).toBe(8);
    });

    it('decodes an int32 value', () => {
      // 69 00 00 09 fd
      const buf = new Uint8Array([0x69, 0x00, 0x00, 0x09, 0xfd]);
      const result = parseSchemaValue(buf, 0);
      expect(result.type).toBe('int32');
      expect(result.value).toBe(2557);
    });

    it('decodes a negative int32', () => {
      // 69 ff ff ff ff = -1
      const buf = new Uint8Array([0x69, 0xff, 0xff, 0xff, 0xff]);
      const result = parseSchemaValue(buf, 0);
      expect(result.type).toBe('int32');
      expect(result.value).toBe(-1);
    });

    it('decodes an int8 value', () => {
      const buf = new Uint8Array([0x62, 0x08]);
      const result = parseSchemaValue(buf, 0);
      expect(result.type).toBe('int8');
      expect(result.value).toBe(8);
    });

    it('decodes a bool value', () => {
      const buf = new Uint8Array([0x6f, 0x01]);
      const result = parseSchemaValue(buf, 0);
      expect(result.type).toBe('bool');
      expect(result.value).toBe(1);
    });

    it('decodes a map header', () => {
      const buf = new Uint8Array([0x68, 0x00, 0x10]);
      const result = parseSchemaValue(buf, 0);
      expect(result.type).toBe('map');
      expect(result.count).toBe(16);
    });

    it('returns null for unrecognized byte', () => {
      const buf = new Uint8Array([0x99]);
      expect(parseSchemaValue(buf, 0)).toBeNull();
    });
  });

  describe('decodeMasterState', () => {
    it('decodes the full 1355-byte state with 8 players', () => {
      const buf = b64ToUint8Array(BIG_STATE_B64);
      const result = decodeMasterState(buf);

      expect(result.playerCount).toBe(8);
      expect(result.players).toHaveLength(8);
    });

    it('extracts Tom Slingsby69 player data', () => {
      const buf = b64ToUint8Array(BIG_STATE_B64);
      const result = decodeMasterState(buf);

      const tom = result.players.find(p => p.name === 'Tom Slingsby69');
      expect(tom).toBeDefined();
      expect(tom.uuid).toBe('69ca114701f85f9d595778ba');
      expect(tom.teamName).toBe('Super pro racing XTREME - 1/1');
      expect(tom.location).toBe('antigua');
      expect(tom.zoneId).toBe('69ca114701f85f9d595778b9');
      expect(tom.level).toBe('45');
      expect(tom.wins).toBe('22');
      expect(tom.status).toBe(0);
      expect(tom.inRace).toBe(true);
      expect(tom.active).toBe(true);
    });

    it('extracts Flying Carpet player data', () => {
      const buf = b64ToUint8Array(BIG_STATE_B64);
      const result = decodeMasterState(buf);

      const carpet = result.players.find(p => p.name === 'Flying Carpet');
      expect(carpet).toBeDefined();
      expect(carpet.uuid).toBe('69ca11dca6a6a64f21dba029');
      expect(carpet.teamName).toBe('Proracing - 1/1');
      expect(carpet.location).toBe('christchurch');
      expect(carpet.level).toBe('45');
      expect(carpet.wins).toBe('27');
      expect(carpet.inRace).toBe(true);
    });

    it('marks idle players correctly', () => {
      const buf = b64ToUint8Array(BIG_STATE_B64);
      const result = decodeMasterState(buf);

      const idle = result.players.filter(p => !p.inRace);
      expect(idle.length).toBeGreaterThanOrEqual(4);
      for (const p of idle) {
        expect(p.name).toBe('');
        expect(p.status).toBe(-1);
      }
    });

    it('extracts UUIDs for session-based players', () => {
      const buf = b64ToUint8Array(BIG_STATE_B64);
      const result = decodeMasterState(buf);

      const uuidPlayers = result.players.filter(p => p.uuid.includes('-'));
      expect(uuidPlayers.length).toBeGreaterThanOrEqual(4);
    });

    it('throws on invalid header', () => {
      expect(() => decodeMasterState(new Uint8Array([0x00, 0x04, 0x01, 0x02, 0x03]))).toThrow('expected 0xf3 0x04 header');
    });

    it('throws on too-short buffer', () => {
      expect(() => decodeMasterState(new Uint8Array([0xf3]))).toThrow('buffer too short');
    });
  });

  describe('decodeMasterUpdate', () => {
    it('decodes a 55-byte incremental update', () => {
      const buf = b64ToUint8Array(SMALL_UPDATE_B64);
      const result = decodeMasterUpdate(buf);

      expect(result.isIncremental).toBe(true);
      // The 55-byte update references an existing player UUID
      expect(result.players.length).toBeGreaterThanOrEqual(1);
      if (result.players.length > 0) {
        expect(result.players[0].uuid).toBe('6d415178-2024-4f84-94d2-0683414e0d40');
      }
    });

    it('returns empty for tiny 23-byte update with no player data', () => {
      const buf = b64ToUint8Array(TINY_UPDATE_B64);
      const result = decodeMasterUpdate(buf);

      expect(result.isIncremental).toBe(true);
      expect(result.players).toHaveLength(0);
    });

    it('handles null gracefully', () => {
      const result = decodeMasterUpdate(null);
      expect(result.isIncremental).toBe(true);
      expect(result.players).toHaveLength(0);
    });
  });

  describe('round-trip with real data', () => {
    it('finds exactly 2 named racers in the full state', () => {
      const buf = b64ToUint8Array(BIG_STATE_B64);
      const result = decodeMasterState(buf);

      const named = result.players.filter(p => p.name !== '');
      expect(named).toHaveLength(2);
      expect(named.map(p => p.name).sort()).toEqual(['Flying Carpet', 'Tom Slingsby69']);
    });

    it('all players have courseId field', () => {
      const buf = b64ToUint8Array(BIG_STATE_B64);
      const result = decodeMasterState(buf);

      for (const p of result.players) {
        expect(p.courseId).toBeTypeOf('number');
      }
    });
  });
});
