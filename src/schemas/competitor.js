/**
 * Normalizes raw VR API competitor data into a consistent schema.
 * @param {object} rawData - Raw competitor object from VR API
 * @returns {object|null} Normalized competitor or null if required fields missing
 */
export function normalizeCompetitor(rawData) {
  if (!rawData || typeof rawData !== 'object') return null;

  const id = rawData.id ?? rawData.odPairId;
  if (id == null) return null;

  return {
    id,
    name: rawData.displayName ?? rawData.name ?? null,
    lat: rawData.pos?.lat != null ? Number(rawData.pos.lat) : null,
    lon: rawData.pos?.lon != null ? Number(rawData.pos.lon) : null,
    speed: rawData.speed != null ? Number(rawData.speed) : null,
    heading: rawData.heading != null ? Number(rawData.heading) : null,
    twa: rawData.twa != null ? Number(rawData.twa) : null,
    sail: rawData.sail != null ? Number(rawData.sail) : null,
    rank: rawData.rank != null ? Number(rawData.rank) : null,
    dtf: rawData.dtf != null ? Number(rawData.dtf) : null,
    dtl: rawData.dtl != null ? Number(rawData.dtl) : null,
    country: rawData.country ?? null,
    playerType: rawData.playerType ?? null,
  };
}
