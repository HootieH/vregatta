/**
 * Normalizes raw VR API race metadata into a consistent schema.
 * @param {object} rawData - Raw race data from VR API
 * @returns {object|null} Normalized race meta or null if required fields missing
 */
export function normalizeRaceMeta(rawData) {
  if (!rawData || typeof rawData !== 'object') return null;

  const raceId = rawData.raceId ?? rawData.legId ?? rawData._id;
  if (raceId == null) return null;

  return {
    raceId,
    legNum: rawData.legNum != null ? Number(rawData.legNum) : null,
    name: rawData.name ?? null,
    polarId: rawData.polarId ?? null,
    startDate: rawData.startDate ?? null,
    endDate: rawData.endDate ?? null,
    playerCount: rawData.playerCount != null ? Number(rawData.playerCount) : null,
  };
}
