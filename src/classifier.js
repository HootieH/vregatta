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
