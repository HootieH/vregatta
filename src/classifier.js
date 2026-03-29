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
 * Classifies a WebSocket message. Since we don't yet know the Inshore protocol,
 * this attempts basic heuristic detection and falls back to 'ws-unknown'.
 * @param {string} url - The WebSocket URL
 * @param {object} data - Described message data from injected.js
 * @param {string} direction - 'incoming' or 'outgoing'
 * @returns {{type: string, wsType: string|null, data: object}}
 */
export function classify_ws(url, data, direction) {
  if (!data) return { type: 'ws-unknown', wsType: null, data };

  // Binary messages — likely Colyseus/MessagePack protocol
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
