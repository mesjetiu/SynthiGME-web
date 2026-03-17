/**
 * Conversiones de parámetros de audio.
 *
 * Funciones reutilizables para transformar valores de controles
 * (diales, potenciómetros) a parámetros de la Web Audio API.
 */

/**
 * Convierte un valor de dial lineal (0–10) a ganancia logarítmica (0–1).
 *
 * Emula la curva del potenciómetro 10K LOG del hardware Synthi 100.
 * Valores de dial ≤ 0 devuelven 0 (silencio absoluto).
 *
 * @param {number} dialValue - Valor del dial (0–10)
 * @param {number} logBase   - Base logarítmica de la curva (p. ej. 100)
 * @returns {number} Ganancia lineal (0–1)
 */
export function dialToLogGain(dialValue, logBase) {
  if (dialValue <= 0) return 0;
  const normalized = Math.min(dialValue, 10) / 10;
  return (Math.pow(logBase, normalized) - 1) / (logBase - 1);
}
