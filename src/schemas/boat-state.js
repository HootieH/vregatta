/**
 * Normalizes raw VR API boat state data into a consistent schema.
 * @param {object} rawData - Raw scriptData from VR API
 * @returns {object|null} Normalized boat state or null if required fields missing
 */
export function normalizeBoatState(rawData) {
  if (!rawData || typeof rawData !== 'object') return null;

  const lat = rawData.pos?.lat;
  const lon = rawData.pos?.lon;

  if (lat == null || lon == null) return null;

  return {
    lat: Number(lat),
    lon: Number(lon),
    speed: rawData.speed != null ? Number(rawData.speed) : null,
    heading: rawData.heading != null ? Number(rawData.heading) : null,
    twa: rawData.twa != null ? Number(rawData.twa) : null,
    tws: rawData.tws != null ? Number(rawData.tws) : null,
    twd: rawData.twd != null ? Number(rawData.twd) : null,
    sail: rawData.sail != null ? Number(rawData.sail) : null,
    stamina: rawData.stamina != null ? Number(rawData.stamina) : null,
    distanceToEnd: rawData.distanceToEnd != null ? Number(rawData.distanceToEnd) : null,
    aground: Boolean(rawData.aground),
    lastCalcDate: rawData.lastCalcDate ?? null,
    isRegulated: Boolean(rawData.isRegulated),
    timestamp: rawData.timestamp ?? Date.now(),
  };
}
