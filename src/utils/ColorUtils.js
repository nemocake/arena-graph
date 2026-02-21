import { AGE_GRADIENT } from '../constants.js';

/**
 * Parse hex color to [r, g, b] in 0-1 range.
 */
export function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  return [r, g, b];
}

/**
 * Interpolate along the age gradient. t in [0, 1].
 */
export function ageGradientColor(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < AGE_GRADIENT.length - 1; i++) {
    const [t0, c0] = AGE_GRADIENT[i];
    const [t1, c1] = AGE_GRADIENT[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
      ];
    }
  }
  return AGE_GRADIENT[AGE_GRADIENT.length - 1][1];
}
