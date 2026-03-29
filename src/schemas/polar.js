/**
 * Extracts and normalizes polar data from a raw VR API response.
 * @param {object} rawData - raw API response
 * @returns {object|null} normalized polar or null if invalid
 */
export function normalizePolar(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    console.warn('[vRegatta:normalizePolar] Expected object, got', typeof rawData);
    return null;
  }

  const polar =
    rawData?.scriptData?.polar ??
    rawData?.scriptData?.extendsData?.boatPolar ??
    null;

  if (!polar) {
    const keys = Object.keys(rawData?.scriptData ?? rawData);
    console.warn(
      '[vRegatta:normalizePolar] No polar found. Expected scriptData.polar or scriptData.extendsData.boatPolar. Available keys:', keys.join(', ')
    );
    return null;
  }

  const missing = [];
  if (!Array.isArray(polar.tws)) missing.push('tws (expected array, got ' + typeof polar.tws + ')');
  if (!Array.isArray(polar.twa)) missing.push('twa (expected array, got ' + typeof polar.twa + ')');
  if (!Array.isArray(polar.sail)) missing.push('sail (expected array, got ' + typeof polar.sail + ')');

  if (missing.length > 0) {
    console.warn('[vRegatta:normalizePolar] Polar object missing required fields:', missing.join('; '));
    return null;
  }

  return polar;
}
