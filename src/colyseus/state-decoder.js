/**
 * Best-effort decoder for Colyseus ROOM_STATE data.
 *
 * After decompression, the state turns out to be standard MessagePack encoding
 * (NOT Colyseus Schema binary). The top-level structure is a map16 with
 * numeric keys and array values.
 *
 * Discovered field mapping (from 200-message capture analysis):
 *
 *  Key 0  - Array[6] of uint8:  Boat slot indices (e.g. [6, 2, 3, 4, 8, 9])
 *  Key 1  - uint32:             Server tick / game clock (increments ~125/sec)
 *  Key 3  - Array[6] of int16: Unknown per-boat metric (often 0 or -1)
 *  Key 4  - Array[6] of int16: Target heading per boat (scaled uint16, * 360/65536)
 *                               Often identical across boats (e.g., all 179.0 = wind direction?)
 *  Key 10 - Array[6] of uint16: MANEUVER PENALTY / turn penalty timer
 *                               65535 = no penalty (idle/straight), spikes on sharp turns,
 *                               decays toward ~150-200 as boat stabilizes
 *  Key 11 - Array[6] of int16: CURRENT HEADING per boat (scaled, * 360/65536)
 *                               Smoothly changing values confirmed against helm inputs
 *  Key 12 - Array[6] of int16: Rate of turn / angular velocity (converges toward 0)
 *  Key 13 - Array[12] of int16: Position pairs [x, y] for 6 boats (game coordinates)
 *                               Values in ~13000-30000 range. ~125 ticks/sec, position
 *                               delta ~30-40 units/tick at full speed
 *  Key 14 - Array[6] of uint16: BOAT SPEED (proportional to position change rate)
 *                               ~10000 = full speed, decays toward 0 when stopped/turning
 *                               Correlates directly with sqrt(dx²+dy²)/dt
 *  Key 15 - Array[6] of uint16: RACE PROGRESS (ramps 0→200 over race duration)
 *                               Only non-zero for actively racing boats
 *  Key 16 - Array[6] of uint16: DISTANCE SAILED or score accumulator
 *                               Ramps 0→65535 over race, only for active boats
 *
 * The 6-element arrays correspond to the 6 boats in the race.
 */

/**
 * Minimal MessagePack decoder. Handles the subset used by VR Inshore state.
 *
 * @param {Uint8Array|Buffer} buf
 * @param {number} off - Starting offset
 * @returns {[any, number]} Tuple of [decoded value, new offset]
 */
function decodeMsgpack(buf, off) {
  if (off >= buf.length) return [null, off];
  const b = buf[off];

  // positive fixint 0x00-0x7f
  if (b <= 0x7f) return [b, off + 1];
  // negative fixint 0xe0-0xff
  if (b >= 0xe0) return [b - 256, off + 1];

  // fixmap 0x80-0x8f
  if (b >= 0x80 && b <= 0x8f) {
    const n = b & 0x0f;
    const obj = {};
    let pos = off + 1;
    for (let i = 0; i < n; i++) {
      const r1 = decodeMsgpack(buf, pos);
      const r2 = decodeMsgpack(buf, r1[1]);
      obj[r1[0]] = r2[0];
      pos = r2[1];
    }
    return [obj, pos];
  }

  // fixarray 0x90-0x9f
  if (b >= 0x90 && b <= 0x9f) {
    const n = b & 0x0f;
    const arr = [];
    let pos = off + 1;
    for (let i = 0; i < n; i++) {
      const r = decodeMsgpack(buf, pos);
      arr.push(r[0]);
      pos = r[1];
    }
    return [arr, pos];
  }

  // fixstr 0xa0-0xbf
  if (b >= 0xa0 && b <= 0xbf) {
    const n = b & 0x1f;
    const bytes = buf.slice(off + 1, off + 1 + n);
    const str = typeof Buffer !== 'undefined'
      ? Buffer.from(bytes).toString('utf8')
      : new TextDecoder().decode(bytes);
    return [str, off + 1 + n];
  }

  switch (b) {
    case 0xc0: return [null, off + 1];               // nil
    case 0xc2: return [false, off + 1];               // false
    case 0xc3: return [true, off + 1];                // true
    case 0xcc: return [buf[off + 1], off + 2];        // uint8
    case 0xcd: return [readU16(buf, off + 1), off + 3]; // uint16
    case 0xce: return [readU32(buf, off + 1), off + 5]; // uint32
    case 0xd0: return [readI8(buf, off + 1), off + 2];  // int8
    case 0xd1: return [readI16(buf, off + 1), off + 3]; // int16
    case 0xd2: return [readI32(buf, off + 1), off + 5]; // int32
    case 0xca: return [readF32(buf, off + 1), off + 5]; // float32
    case 0xcb: return [readF64(buf, off + 1), off + 9]; // float64
    case 0xd9: {
      const n = buf[off + 1];
      const bytes = buf.slice(off + 2, off + 2 + n);
      const str = typeof Buffer !== 'undefined'
        ? Buffer.from(bytes).toString('utf8')
        : new TextDecoder().decode(bytes);
      return [str, off + 2 + n];
    }
    case 0xda: {
      const n = readU16(buf, off + 1);
      const bytes = buf.slice(off + 3, off + 3 + n);
      const str = typeof Buffer !== 'undefined'
        ? Buffer.from(bytes).toString('utf8')
        : new TextDecoder().decode(bytes);
      return [str, off + 3 + n];
    }
    case 0xdc: {
      const n = readU16(buf, off + 1);
      const arr = [];
      let pos = off + 3;
      for (let i = 0; i < n; i++) {
        const r = decodeMsgpack(buf, pos);
        arr.push(r[0]);
        pos = r[1];
      }
      return [arr, pos];
    }
    case 0xde: {
      const n = readU16(buf, off + 1);
      const obj = {};
      let pos = off + 3;
      for (let i = 0; i < n; i++) {
        const r1 = decodeMsgpack(buf, pos);
        const r2 = decodeMsgpack(buf, r1[1]);
        obj[r1[0]] = r2[0];
        pos = r2[1];
      }
      return [obj, pos];
    }
    default:
      // Unknown type — skip 1 byte and mark it
      return [{ _unknown: '0x' + b.toString(16), _offset: off }, off + 1];
  }
}

// --- Big-endian readers that work on both Buffer and Uint8Array ---

function readI8(buf, off) {
  const v = buf[off];
  return v > 0x7f ? v - 0x100 : v;
}

function readU16(buf, off) {
  return (buf[off] << 8) | buf[off + 1];
}

function readI16(buf, off) {
  const v = (buf[off] << 8) | buf[off + 1];
  return v > 0x7fff ? v - 0x10000 : v;
}

function readU32(buf, off) {
  return ((buf[off] << 24) >>> 0) + (buf[off + 1] << 16) + (buf[off + 2] << 8) + buf[off + 3];
}

function readI32(buf, off) {
  return (buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
}

function readF32(buf, off) {
  const dv = new DataView(buf.buffer || new Uint8Array(buf).buffer, buf.byteOffset || 0);
  return dv.getFloat32(off, false); // big-endian
}

function readF64(buf, off) {
  const dv = new DataView(buf.buffer || new Uint8Array(buf).buffer, buf.byteOffset || 0);
  return dv.getFloat64(off, false);
}

/**
 * Converts a scaled int16 to heading degrees (0-360).
 * The protocol uses: raw_uint16 = heading * 65536 / 360
 * Negative int16 values are treated as unsigned (add 65536).
 *
 * @param {number} raw - int16 value from MessagePack
 * @returns {number} Heading in degrees
 */
function scaledToHeading(raw) {
  const unsigned = raw < 0 ? raw + 65536 : raw;
  return Math.round((unsigned * 360 / 65536) * 100) / 100;
}

/**
 * Decodes decompressed ROOM_STATE bytes into a structured game state.
 *
 * @param {Uint8Array|Buffer} bytes - Decompressed state bytes (MessagePack)
 * @returns {{
 *   raw: object,
 *   tick: number,
 *   boats: Array<{
 *     slot: number,
 *     heading: number,
 *     targetHeading: number,
 *     turnRate: number,
 *     posX: number,
 *     posY: number,
 *     field10: number,
 *     field14: number,
 *   }>,
 *   boatCount: number,
 * }}
 */
export function decodeState(bytes) {
  if (!bytes || bytes.length < 3) {
    throw new Error(`decodeState: input too short (${bytes?.length ?? 0} bytes)`);
  }

  const [raw] = decodeMsgpack(bytes, 0);

  if (raw === null || typeof raw !== 'object') {
    throw new Error('decodeState: MessagePack decode returned non-object');
  }

  const result = {
    raw,
    tick: raw[1] ?? 0,
    boats: [],
    boatCount: 0,
  };

  // Field 0 = boat slot IDs
  const slots = raw[0];
  if (!Array.isArray(slots)) {
    return result;
  }

  const boatCount = slots.length;
  result.boatCount = boatCount;

  // Extract per-boat data
  const headings = raw[11] || [];    // current heading (scaled int16)
  const targets = raw[4] || [];      // target heading
  const turnRates = raw[12] || [];   // rate of turn
  const positions = raw[13] || [];   // [x, y] pairs interleaved
  const field10 = raw[10] || [];     // maneuver penalty
  const field14 = raw[14] || [];     // speed (proportional)
  const field15 = raw[15] || [];     // race progress
  const field16 = raw[16] || [];     // distance sailed

  for (let i = 0; i < boatCount; i++) {
    const boat = {
      slot: slots[i],
      heading: i < headings.length ? scaledToHeading(headings[i]) : null,
      targetHeading: i < targets.length ? scaledToHeading(targets[i]) : null,
      turnRate: i < turnRates.length ? turnRates[i] : null,
      posX: (i * 2) < positions.length ? positions[i * 2] : null,
      posY: (i * 2 + 1) < positions.length ? positions[i * 2 + 1] : null,
      speed: i < field14.length ? field14[i] : null,
      penaltyTimer: i < field10.length ? field10[i] : null,
      raceProgress: i < field15.length ? field15[i] : null,
      distanceSailed: i < field16.length ? field16[i] : null,
    };
    result.boats.push(boat);
  }

  return result;
}

/**
 * Formats a decoded state for debug logging.
 *
 * @param {object} state - Result from decodeState
 * @returns {string}
 */
export function formatStateDebug(state) {
  if (!state || !state.boats) return 'decodeState: no data';

  const lines = [`tick=${state.tick} boats=${state.boatCount}`];
  for (const b of state.boats) {
    const heading = b.heading !== null ? b.heading.toFixed(1) + '\u00b0' : '?';
    const target = b.targetHeading !== null ? b.targetHeading.toFixed(1) + '\u00b0' : '?';
    const turn = b.turnRate !== null ? b.turnRate : '?';
    const pos = b.posX !== null ? `(${b.posX},${b.posY})` : '(?,?)';
    const spd = b.speed !== null ? `spd=${b.speed}` : 'spd=?';
    const penalty = b.penaltyTimer !== null ? (b.penaltyTimer === 65535 ? 'idle' : `pen=${b.penaltyTimer}`) : '';
    lines.push(`  boat[${b.slot}]: hdg=${heading} ${spd} tgt=${target} turn=${turn} pos=${pos} ${penalty}`);
  }
  return lines.join('\n');
}

// Export the msgpack decoder for testing
export { decodeMsgpack, scaledToHeading };
