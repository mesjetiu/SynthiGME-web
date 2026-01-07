/**
 * Utilidades de audio genéricas
 * @module utils/audio
 */

/**
 * Desconecta un nodo de audio de forma segura, ignorando errores
 * si el nodo ya fue desconectado o es inválido.
 * 
 * @param {AudioNode|null|undefined} node - Nodo a desconectar
 * @returns {boolean} true si se desconectó, false si no había nada que desconectar
 */
export function safeDisconnect(node) {
  if (!node || typeof node.disconnect !== 'function') {
    return false;
  }
  try {
    node.disconnect();
    return true;
  } catch {
    // El nodo ya estaba desconectado o hubo un error esperado
    return false;
  }
}

/**
 * Desconecta múltiples nodos de audio de forma segura.
 * 
 * @param {...(AudioNode|null|undefined)} nodes - Nodos a desconectar
 * @returns {number} Cantidad de nodos que se desconectaron exitosamente
 */
export function safeDisconnectAll(...nodes) {
  return nodes.reduce((count, node) => count + (safeDisconnect(node) ? 1 : 0), 0);
}
