/**
 * Finds which two breakpoints a value falls between in a sorted steps array.
 * @param {number} value
 * @param {number[]} steps - sorted ascending
 * @returns {{index: number, fraction: number}}
 */
export function fractionStep(value, steps) {
  if (steps.length === 0) return { index: 0, fraction: 0 };

  if (value <= steps[0]) return { index: 0, fraction: 0 };
  if (value >= steps[steps.length - 1]) return { index: steps.length - 1, fraction: 0 };

  for (let i = 1; i < steps.length; i++) {
    if (value <= steps[i]) {
      const range = steps[i] - steps[i - 1];
      const fraction = range === 0 ? 0 : (value - steps[i - 1]) / range;
      return { index: i, fraction };
    }
  }

  return { index: steps.length - 1, fraction: 0 };
}

/**
 * Standard bilinear interpolation.
 * @param {number} x - fraction 0-1 in x dimension
 * @param {number} y - fraction 0-1 in y dimension
 * @param {number} f00 - value at (0,0)
 * @param {number} f10 - value at (1,0)
 * @param {number} f01 - value at (0,1)
 * @param {number} f11 - value at (1,1)
 * @returns {number}
 */
export function bilinear(x, y, f00, f10, f01, f11) {
  return f00 * (1 - x) * (1 - y) + f10 * x * (1 - y) + f01 * (1 - x) * y + f11 * x * y;
}
