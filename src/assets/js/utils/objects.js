/**
 * Utilidades para manipulación de objetos
 */

/**
 * Combina objetos recursivamente (deep merge).
 * Las propiedades del source sobrescriben las del target.
 * Los arrays se reemplazan (no se concatenan).
 * 
 * @param {Object} target - Objeto base
 * @param {Object} source - Objeto con valores a aplicar
 * @returns {Object} Nuevo objeto combinado
 */
export function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
