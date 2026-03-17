/**
 * Utilidades matemáticas de propósito general.
 */

/**
 * Limita un valor entre un mínimo y un máximo.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
