/**
 * Colyseus WebSocket protocol decoder for VR Inshore.
 *
 * All messages start with 0xf3 header byte.
 * Byte at offset 1 identifies the message type.
 */

/**
 * Message type byte -> human-readable name.
 */
const MSG_TYPES = {
  0x02: 'leave_room',
  0x03: 'room_data',
  0x04: 'room_state',
  0x06: 'room_data_schema',
  0x07: 'room_data_bytes',
};

/**
 * Parses the Colyseus protocol envelope.
 * Strips the 0xf3 header and identifies the message type.
 *
 * @param {Uint8Array|Buffer} buffer - Raw binary message
 * @returns {{type: string, typeByte: number, payload: Uint8Array}}
 */
export function parseColyseusMessage(buffer) {
  if (!buffer || buffer.length < 2) {
    return { type: 'unknown', typeByte: -1, payload: buffer || new Uint8Array(0) };
  }

  const header = buffer[0];
  if (header !== 0xf3) {
    return { type: 'unknown', typeByte: -1, payload: buffer };
  }

  const typeByte = buffer[1];
  const type = MSG_TYPES[typeByte] || 'unknown';
  const payload = buffer.slice(2);

  return { type, typeByte, payload };
}

/**
 * Finds the zlib stream (magic bytes 78 da, 78 9c, or 78 01) in the
 * ROOM_STATE payload and decompresses it.
 *
 * The payload layout before zlib:
 *   - variable-length room/sequence header
 *   - then zlib-compressed data
 *
 * @param {Uint8Array|Buffer} payload - ROOM_STATE payload (after stripping 0xf3 + type byte)
 * @returns {Uint8Array} Decompressed state bytes
 * @throws {Error} if no zlib magic found or decompression fails
 */
export function decompressState(payload) {
  if (!payload || payload.length < 4) {
    throw new Error('decompressState: payload too short');
  }

  // Find zlib magic bytes
  let zlibStart = -1;
  for (let i = 0; i < payload.length - 1; i++) {
    if (payload[i] === 0x78 && (payload[i + 1] === 0xda || payload[i + 1] === 0x9c || payload[i + 1] === 0x01)) {
      zlibStart = i;
      break;
    }
  }

  if (zlibStart < 0) {
    throw new Error('decompressState: no zlib magic bytes (78 da/9c/01) found in payload');
  }

  const compressed = payload.slice(zlibStart);

  // Node.js path (sync) — used in tests and analysis scripts.
  // In browser, use decompressStateAsync instead.
  if (typeof require === 'function') {
    const zlib = require('zlib');
    return new Uint8Array(zlib.inflateSync(Buffer.from(compressed)));
  }

  throw new Error('decompressState: sync decompression requires Node.js — use decompressStateAsync in browser');
}

/**
 * Async decompression for browser (DecompressionStream API).
 *
 * @param {Uint8Array} payload - ROOM_STATE payload
 * @returns {Promise<Uint8Array>}
 */
export async function decompressStateAsync(payload) {
  if (!payload || payload.length < 4) {
    throw new Error('decompressStateAsync: payload too short');
  }

  let zlibStart = -1;
  for (let i = 0; i < payload.length - 1; i++) {
    if (payload[i] === 0x78 && (payload[i + 1] === 0xda || payload[i + 1] === 0x9c || payload[i + 1] === 0x01)) {
      zlibStart = i;
      break;
    }
  }

  if (zlibStart < 0) {
    throw new Error('decompressStateAsync: no zlib magic bytes found');
  }

  const compressed = payload.slice(zlibStart);

  if (typeof globalThis.DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    writer.write(compressed);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  // Fallback to Node sync
  return decompressState(payload);
}

/**
 * Decodes a heading value from a ROOM_DATA_SCHEMA outgoing helm command.
 *
 * Message format (11 bytes after stripping 0xf3 header):
 *   06 01 00 01 01 69 00 01 [HH HH]
 *
 * The last 2 bytes encode heading as a big-endian uint16 scaled to 0-360:
 *   heading_degrees = raw_uint16 * 360 / 65536
 *
 * @param {Uint8Array|Buffer} payload - Payload after 0xf3 + 0x06 bytes are stripped
 * @returns {{heading: number, raw: number}}
 */
export function decodeHeading(payload) {
  if (!payload || payload.length < 7) {
    throw new Error(`decodeHeading: payload too short (${payload?.length ?? 0} bytes, need >= 7)`);
  }

  // Last 2 bytes of the payload are the heading
  const offset = payload.length - 2;
  const raw = (payload[offset] << 8) | payload[offset + 1];
  const heading = raw * 360 / 65536;

  return { heading: Math.round(heading * 100) / 100, raw };
}

/**
 * Decodes a server acknowledgement (ROOM_DATA_BYTES).
 *
 * Message format (18 bytes payload after 0xf3 0x07):
 *   01 00 00 2a 00 02 01 69 00 01 [HH HH] 02 69 [TT TT TT TT]
 *
 * Heading at offset 10-11 (same encoding as helm input).
 * Timestamp at offset 14-17 (big-endian uint32, server tick).
 *
 * @param {Uint8Array|Buffer} payload - Payload after 0xf3 + 0x07
 * @returns {{heading: number, headingRaw: number, timestamp: number}}
 */
export function decodeServerAck(payload) {
  if (!payload || payload.length < 16) {
    throw new Error(`decodeServerAck: payload too short (${payload?.length ?? 0} bytes, need >= 16)`);
  }

  // Heading at offset 10-11
  const headingRaw = (payload[10] << 8) | payload[10 + 1];
  const heading = headingRaw * 360 / 65536;

  // Timestamp at offset 14-17 (big-endian uint32)
  const timestamp = ((payload[14] << 24) >>> 0) + (payload[15] << 16) + (payload[16] << 8) + payload[17];

  return {
    heading: Math.round(heading * 100) / 100,
    headingRaw,
    timestamp,
  };
}

/**
 * Encodes a heading in degrees to the protocol's uint16 format.
 * Useful for testing round-trips.
 *
 * @param {number} degrees - Heading in degrees (0-360)
 * @returns {number} Raw uint16 value
 */
export function encodeHeading(degrees) {
  return Math.round((degrees % 360) * 65536 / 360);
}
