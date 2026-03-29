/**
 * Normalizes raw VR API action data into a consistent schema.
 * @param {object} rawData - Raw action data from VR API
 * @returns {object|null} Normalized action or null if required fields missing
 */
export function normalizeAction(rawData) {
  if (!rawData || typeof rawData !== 'object') return null;

  const type = rawData.type;
  if (!type) return null;

  return {
    timestamp: rawData.timestamp ?? Date.now(),
    type,
    value: rawData.value ?? null,
    autoTwa: rawData.autoTwa != null ? Boolean(rawData.autoTwa) : null,
  };
}
