/**
 * Normalizes raw VR API wind snapshot data into a consistent schema.
 * @param {object} rawData - Raw wind data from VR API
 * @returns {object|null} Normalized wind snapshot or null if required fields missing
 */
export function normalizeWindSnapshot(rawData) {
  if (!rawData || typeof rawData !== 'object') return null;

  const fileUrl = rawData.fileUrl ?? rawData.url;
  if (!fileUrl) return null;

  return {
    timestamp: rawData.timestamp ?? Date.now(),
    fileUrl,
    gridResolution: rawData.gridResolution ?? rawData.resolution ?? null,
  };
}
