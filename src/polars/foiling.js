/**
 * Computes foiling speed multiplier based on TWS, TWA, and foil configuration.
 * @param {string[]} options - e.g. ['foil', 'hull']
 * @param {number} tws - true wind speed
 * @param {number} twa - true wind angle (0-180)
 * @param {object|null} foilConfig - {speedRatio, twaMin, twaMax, twsMin, twsMax, twaMerge, twsMerge}
 * @returns {number} speed multiplier (>=1.0)
 */
export function foilingFactor(options, tws, twa, foilConfig) {
  if (!options || !options.includes('foil') || !foilConfig) return 1.0;

  const { speedRatio, twaMin, twaMax, twsMin, twsMax, twaMerge, twsMerge } = foilConfig;

  // Compute TWA blend factor (0 = outside, 1 = inside foil zone)
  const twaFactor = zoneFactor(twa, twaMin, twaMax, twaMerge);
  if (twaFactor === 0) return 1.0;

  // Compute TWS blend factor
  const twsFactor = zoneFactor(tws, twsMin, twsMax, twsMerge);
  if (twsFactor === 0) return 1.0;

  // Bilinear blend: both factors combine
  const blend = twaFactor * twsFactor;
  return 1.0 + (speedRatio - 1.0) * blend;
}

/**
 * Computes a 0-1 blend factor for a value within a zone with merge transitions.
 * 0 = fully outside, 1 = fully inside.
 */
function zoneFactor(value, min, max, merge) {
  if (value >= min && value <= max) return 1.0;

  // Below min: merge zone is [min - merge, min]
  if (value < min) {
    if (value < min - merge) return 0;
    return (value - (min - merge)) / merge;
  }

  // Above max: merge zone is [max, max + merge]
  if (value > max + merge) return 0;
  return (max + merge - value) / merge;
}
