/**
 * Decoder for VR Inshore Master server state messages.
 *
 * The Master server (wss://master-v5.inshore.virtualregatta.com:9090/Master)
 * uses Colyseus Schema binary encoding (NOT standard MessagePack).
 * Messages are NOT zlib-compressed — raw Schema binary after the 0xf3 header.
 *
 * Wire types:
 *   0x73 = string: field_index(1 byte), length(1 byte), data
 *   0x69 = int32:  4 bytes big-endian
 *   0x62 = int8:   1 byte signed
 *   0x6f = bool:   1 byte
 *   0x68 = map/schema header: field_index(1 byte), field_count(1 byte)
 *
 * Player schema fields (single-char string keys within each map entry):
 *   P = player display name (e.g., "Tom Slingsby69")
 *   N = team/race name (e.g., "Super pro racing XTREME - 1/1")
 *   L = location (e.g., "antigua", "christchurch")
 *   Z = zone/race ID (24-char hex)
 *   V = level (string, e.g., "45")
 *   W = wins/rating (string, e.g., "22")
 *   R = slot/role (int8, 0-3)
 *   S = status (int32, -1=idle/waiting, 0=in race)
 *   C = course/config ID (int32)
 *   G = group/game ID (int32)
 *   E = unknown (bool)
 *   T = timestamp (int32, 0 for active racers)
 *   U = active flag (int32, always 1)
 */

/**
 * Parse a single Colyseus Schema value at the given position.
 * Returns { type, value, endPos } or null if unrecognized.
 */
function parseSchemaValue(buf, pos) {
  if (pos >= buf.length) return null;
  const type = buf[pos];

  if (type === 0x73) { // string
    if (pos + 3 > buf.length) return null;
    const fieldIndex = buf[pos + 1];
    const len = buf[pos + 2];
    if (pos + 3 + len > buf.length) return null;
    const val = bufToString(buf, pos + 3, len);
    return { type: 'string', fieldIndex, value: val, endPos: pos + 3 + len };
  }

  if (type === 0x62) { // int8
    if (pos + 2 > buf.length) return null;
    const raw = buf[pos + 1];
    const val = raw > 127 ? raw - 256 : raw;
    return { type: 'int8', value: val, endPos: pos + 2 };
  }

  if (type === 0x69) { // int32
    if (pos + 5 > buf.length) return null;
    const val = readI32BE(buf, pos + 1);
    return { type: 'int32', value: val, endPos: pos + 5 };
  }

  if (type === 0x6f) { // bool
    if (pos + 2 > buf.length) return null;
    return { type: 'bool', value: buf[pos + 1], endPos: pos + 2 };
  }

  if (type === 0x68) { // map/schema header
    if (pos + 3 > buf.length) return null;
    return { type: 'map', fieldIndex: buf[pos + 1], count: buf[pos + 2], endPos: pos + 3 };
  }

  return null;
}

/**
 * Read a big-endian signed int32 from a buffer.
 */
function readI32BE(buf, off) {
  return (buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
}

/**
 * Convert buffer bytes to UTF-8 string (works in both Node.js and browser).
 */
function bufToString(buf, offset, length) {
  const slice = buf.slice(offset, offset + length);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buf)) {
    return Buffer.from(slice).toString('utf8');
  }
  return new TextDecoder().decode(slice);
}

/**
 * Check if a string looks like a player key (UUID or 24-char hex).
 */
function isPlayerKey(str) {
  if (!str) return false;
  // UUID format: 8-4-4-4-12
  if (str.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(str)) {
    return true;
  }
  // 24-char hex ID
  if (str.length === 24 && /^[0-9a-f]{24}$/.test(str)) {
    return true;
  }
  return false;
}

/**
 * Parse named fields after a MAP header.
 * Reads field_name (1-char string) + field_value pairs.
 * Stops when hitting a new player key, another MAP, or end of buffer.
 *
 * @param {Uint8Array|Buffer} buf
 * @param {number} pos - Position after the MAP header
 * @param {number} bufEnd - End of buffer
 * @returns {{ fields: object, endPos: number }}
 */
function parseNamedFields(buf, pos, bufEnd) {
  const fields = {};

  while (pos < bufEnd) {
    const v = parseSchemaValue(buf, pos);
    if (!v) { pos++; continue; }

    // Stop if we hit a key string (next player entry)
    if (v.type === 'string' && isPlayerKey(v.value)) {
      break;
    }

    // Named field: 1-char uppercase string key followed by a value
    if (v.type === 'string' && v.value.length === 1 && /^[A-Z]$/.test(v.value)) {
      const fieldName = v.value;
      pos = v.endPos;
      const val = parseSchemaValue(buf, pos);
      if (val) {
        fields[fieldName] = val.value;
        pos = val.endPos;
      }
    } else {
      // Skip unnamed fields (internal Colyseus schema state)
      pos = v.endPos;
    }
  }

  return { fields, endPos: pos };
}

/**
 * Normalize a raw player entry into a clean structure.
 */
function normalizePlayer(key, fields) {
  return {
    uuid: key,
    name: fields.P || '',
    teamName: fields.N || '',
    location: fields.L || '',
    zoneId: fields.Z || '',
    level: fields.V || '',
    wins: fields.W || '',
    slotId: typeof fields.R === 'number' ? fields.R : null,
    status: typeof fields.S === 'number' ? fields.S : null,
    courseId: typeof fields.C === 'number' ? fields.C : null,
    groupId: typeof fields.G === 'number' ? fields.G : null,
    timestamp: typeof fields.T === 'number' ? fields.T : null,
    active: typeof fields.U === 'number' ? fields.U === 1 : null,
    inRace: fields.S === 0 && !!fields.P,
  };
}

/**
 * Decode the full Master ROOM_STATE message.
 *
 * Scans the Colyseus Schema binary for player key strings (UUIDs / hex IDs)
 * followed by MAP headers, then extracts named fields for each player.
 *
 * @param {Uint8Array|Buffer} buffer - Raw binary message (including 0xf3 0x04 header)
 * @returns {{ players: Array<object>, playerCount: number, raw: Uint8Array }}
 */
export function decodeMasterState(buffer) {
  if (!buffer || buffer.length < 4) {
    throw new Error(`decodeMasterState: buffer too short (${buffer?.length ?? 0} bytes)`);
  }

  // Verify Colyseus header
  if (buffer[0] !== 0xf3 || buffer[1] !== 0x04) {
    throw new Error(
      `decodeMasterState: expected 0xf3 0x04 header, got 0x${buffer[0].toString(16)} 0x${buffer[1].toString(16)}`
    );
  }

  const players = [];
  let pos = 2; // Skip 0xf3 + 0x04
  const bufEnd = buffer.length;

  while (pos < bufEnd) {
    const v = parseSchemaValue(buffer, pos);
    if (!v) { pos++; continue; }

    // Look for player key strings
    if (v.type === 'string' && isPlayerKey(v.value)) {
      const playerKey = v.value;
      pos = v.endPos;

      // Expect MAP header next
      const mapVal = parseSchemaValue(buffer, pos);
      if (mapVal && mapVal.type === 'map') {
        pos = mapVal.endPos;
        const { fields, endPos } = parseNamedFields(buffer, pos, bufEnd);
        players.push(normalizePlayer(playerKey, fields));
        pos = endPos;
      }
      // If no MAP header, this might be a partial update — still record the key
      continue;
    }

    pos = v.endPos;
  }

  return {
    players,
    playerCount: players.length,
    raw: buffer,
  };
}

/**
 * Decode a Master server incremental state update.
 *
 * These are smaller messages that add/modify individual player entries.
 * Format is the same Colyseus Schema binary, just with fewer entries.
 *
 * @param {Uint8Array|Buffer} buffer - Raw binary message (including 0xf3 0x04 header)
 * @returns {{ players: Array<object>, isIncremental: true }}
 */
export function decodeMasterUpdate(buffer) {
  if (!buffer || buffer.length < 4) {
    return { players: [], isIncremental: true };
  }

  // Same decoding as full state — the format is identical,
  // just with fewer player entries
  try {
    const result = decodeMasterState(buffer);
    return {
      players: result.players,
      isIncremental: true,
    };
  } catch {
    // For very small updates (e.g., 23 bytes) that don't contain player data,
    // return empty
    return { players: [], isIncremental: true };
  }
}

/**
 * Check if a raw message buffer is a Master server ROOM_STATE.
 * Must start with 0xf3 0x04 and NOT contain zlib magic bytes (78 da/9c/01).
 *
 * @param {Uint8Array|Buffer} buffer
 * @returns {boolean}
 */
export function isMasterState(buffer) {
  if (!buffer || buffer.length < 4) return false;
  if (buffer[0] !== 0xf3 || buffer[1] !== 0x04) return false;

  // Master states are NOT zlib compressed — check for absence of zlib magic
  for (let i = 2; i < Math.min(buffer.length - 1, 20); i++) {
    if (buffer[i] === 0x78 && (buffer[i + 1] === 0xda || buffer[i + 1] === 0x9c || buffer[i + 1] === 0x01)) {
      return false; // This is a Game server state (zlib compressed)
    }
  }

  return true;
}

// Export internals for testing
export { parseSchemaValue, isPlayerKey, parseNamedFields, normalizePlayer };
