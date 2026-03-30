/**
 * Classifies intercepted VR API messages by URL and payload content.
 * @param {string} url - The request URL
 * @param {object} body - Parsed JSON response body
 * @returns {{type: string, data: object}}
 */
export function classify(url, body) {
  if (!url && !body) return { type: 'unknown', data: body };

  // URL-based checks first
  if (url && url.includes('AuthenticationRequest')) {
    return { type: 'auth', data: body };
  }

  if (url && url.includes('Meta_GetPolar')) {
    return { type: 'polar', data: body };
  }

  if (url && url.includes('winds/live')) {
    return { type: 'wind', data: body };
  }

  if (url && url.includes('ranking')) {
    return { type: 'ranking', data: body };
  }

  // Body-based checks
  if (body && typeof body === 'object') {
    if (body.eventKey === 'Game_AddBoatAction') {
      return { type: 'action', data: body };
    }

    const sd = body.scriptData;
    if (sd && typeof sd === 'object') {
      if (sd.rankings) {
        return { type: 'ranking', data: body };
      }

      if (sd.polar || sd.extendsData?.boatPolar) {
        return { type: 'polar', data: body };
      }

      if (sd.currentLegs) {
        return { type: 'race', data: body };
      }

      if (sd.pos || sd.speed !== undefined || sd.heading !== undefined) {
        return { type: 'boat', data: body };
      }
    }

    // Check for fleet: array of competitor-like objects
    const candidates = Array.isArray(body) ? body : (sd && Array.isArray(sd) ? sd : null);
    if (candidates && candidates.length > 0) {
      const first = candidates[0];
      if (first && typeof first === 'object' && (first.pos || first.displayName)) {
        return { type: 'fleet', data: body };
      }
    }
  }

  return { type: 'unknown', data: body };
}

/**
 * Classifies a WebSocket message using the Colyseus protocol decoder.
 *
 * Binary messages starting with 0xf3 are decoded by type:
 *   0x04 -> ws-state        (ROOM_STATE — compressed game state)
 *   0x04 -> ws-master-state (ROOM_STATE from Master server — uncompressed)
 *   0x06 -> ws-helm-input   (ROOM_DATA_SCHEMA — outgoing helm command)
 *   0x07 -> ws-ack          (ROOM_DATA_BYTES — server acknowledgement)
 *   0x03 -> ws-data         (ROOM_DATA — session/token data)
 *   0x02 -> ws-leave        (LEAVE_ROOM)
 *
 * @param {string} url - The WebSocket URL
 * @param {object} data - Described message data from injected.js
 * @param {string} direction - 'incoming' or 'outgoing'
 * @returns {{type: string, wsType: string|null, data: object, meta?: object, decoded?: object}}
 */
export function classify_ws(url, data, direction) {
  if (!data) return { type: 'ws-unknown', wsType: null, data };

  // Detect Master server by URL
  const isMasterServer = url && url.includes('Master');

  // Binary messages — decode Colyseus protocol
  if (data.binary && data.base64) {
    return classifyBinaryWs(data, direction, isMasterServer);
  }

  if (data.binary) {
    return {
      type: 'ws-unknown',
      wsType: 'binary',
      data,
      meta: { size: data.size, firstBytes: data.firstBytes || null },
    };
  }

  // Text messages — try JSON parse for pattern detection
  const text = data.text;
  if (typeof text === 'string' && text.length > 0) {
    try {
      const parsed = JSON.parse(text);

      // Look for common game-state patterns
      if (parsed && typeof parsed === 'object') {
        // Array with positional data (possible boat positions)
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0] != null) {
          const first = parsed[0];
          if (typeof first === 'object' && (first.x !== undefined || first.lat !== undefined || first.pos !== undefined)) {
            return { type: 'ws-unknown', wsType: 'position-like', data: { parsed, direction } };
          }
        }

        // Object with room/session fields (Colyseus patterns)
        if (parsed.room || parsed.sessionId || parsed.roomId) {
          return { type: 'ws-unknown', wsType: 'session-like', data: { parsed, direction } };
        }

        // Object with game state fields
        if (parsed.state || parsed.players || parsed.wind || parsed.boats) {
          return { type: 'ws-unknown', wsType: 'state-like', data: { parsed, direction } };
        }

        return { type: 'ws-unknown', wsType: 'json', data: { parsed, direction } };
      }
    } catch {
      // Not JSON — raw text protocol
    }

    return { type: 'ws-unknown', wsType: 'text', data: { text, direction } };
  }

  return { type: 'ws-unknown', wsType: null, data };
}

/**
 * Decodes a binary Colyseus message and classifies it by protocol type.
 * @param {object} data - Binary message data with base64 field
 * @param {string} direction - 'incoming' or 'outgoing'
 * @param {boolean} isMasterServer - Whether the URL is a Master server
 * @returns {{type: string, wsType: string, data: object, meta?: object, decoded?: object}}
 */
function classifyBinaryWs(data, direction, isMasterServer) {
  let bytes;
  try {
    // Decode base64 to bytes
    if (typeof atob === 'function') {
      const binary = atob(data.base64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else if (typeof Buffer !== 'undefined') {
      // Node.js (test environment)
      bytes = new Uint8Array(Buffer.from(data.base64, 'base64'));
    } else {
      return { type: 'ws-unknown', wsType: 'binary', data, meta: { size: data.size, firstBytes: data.firstBytes || null } };
    }
  } catch {
    return { type: 'ws-unknown', wsType: 'binary', data, meta: { size: data.size, firstBytes: data.firstBytes || null } };
  }

  if (bytes.length < 2 || bytes[0] !== 0xf3) {
    return { type: 'ws-unknown', wsType: 'binary', data, meta: { size: data.size, firstBytes: data.firstBytes || null } };
  }

  const typeByte = bytes[1];
  const payload = bytes.slice(2);

  const TYPE_MAP = {
    0x04: 'ws-state',
    0x06: 'ws-helm-input',
    0x07: 'ws-ack',
    0x03: 'ws-data',
    0x02: 'ws-leave',
  };

  let type = TYPE_MAP[typeByte] || 'ws-unknown';

  // LEAVE (0x02) from Game server outgoing with enough payload = mark crossing
  if (typeByte === 0x02 && direction === 'outgoing' && !isMasterServer && payload.length >= 23) {
    type = 'ws-mark-crossing';
  }

  // Master server: ROOM_STATE (0x04) is uncompressed Colyseus Schema,
  // other types from Master get prefixed with 'ws-master-'
  if (isMasterServer) {
    if (typeByte === 0x04) {
      type = 'ws-master-state';
    } else if (TYPE_MAP[typeByte]) {
      type = 'ws-master-data';
    }
  }
  const meta = { size: data.size, firstBytes: data.firstBytes || null, typeByte };

  // Attempt to decode known types
  let decoded = null;
  try {
    if (typeByte === 0x06 && payload.length >= 7) {
      // Helm input — decode heading from last 2 bytes
      const off = payload.length - 2;
      const raw = (payload[off] << 8) | payload[off + 1];
      const heading = Math.round((raw * 360 / 65536) * 100) / 100;
      decoded = { heading, raw };
    } else if (typeByte === 0x07 && payload.length >= 16) {
      // Server ack — heading at offset 10-11, timestamp at 14-17
      const headingRaw = (payload[10] << 8) | payload[10 + 1];
      const heading = Math.round((headingRaw * 360 / 65536) * 100) / 100;
      const timestamp = ((payload[14] << 24) >>> 0) + (payload[15] << 16) + (payload[16] << 8) + payload[17];
      decoded = { heading, headingRaw, timestamp };
    } else if (typeByte === 0x02 && payload.length >= 23) {
      // Mark crossing — markId at payload[20], float32 BE at payload[21..24]
      const markId = payload[20];
      const dv = new DataView(payload.buffer, payload.byteOffset + 21, 4);
      const crossingAngle = dv.getFloat32(0, false);
      const hasAngle = !isNaN(crossingAngle);
      decoded = {
        markId,
        crossingAngle: hasAngle ? Math.round(crossingAngle * 100) / 100 : NaN,
        hasAngle,
      };
    }
  } catch {
    // Best-effort decode — failure is OK
  }

  return { type, wsType: 'binary', data, meta, decoded, direction };
}
