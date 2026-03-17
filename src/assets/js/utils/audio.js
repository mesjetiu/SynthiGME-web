/**
 * Utilidades de audio genéricas
 * @module utils/audio
 */

import { createLogger } from './logger.js';
import { reportError } from './errorHandler.js';
import { trackEvent as telemetryTrackEvent } from './telemetry.js';

const log = createLogger('Audio');

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

/**
 * Envía un mensaje al port de un AudioWorkletNode de forma segura.
 * No hace nada si el nodo o su port no están disponibles.
 *
 * @param {AudioWorkletNode|null|undefined} node    - Nodo worklet destino
 * @param {object}                          message - Mensaje a enviar
 */
export function sendWorkletMessage(node, message) {
  node?.port?.postMessage(message);
}

/**
 * Añade un handler `processorerror` a un AudioWorkletNode para detectar
 * fallos en tiempo de ejecución del worklet processor.
 * 
 * Cuando un worklet lanza una excepción en su método process(), el navegador
 * deja de invocarlo silenciosamente. Este handler captura ese evento,
 * lo loguea y lo reporta al errorHandler global.
 * 
 * @param {AudioWorkletNode} node - Nodo al que añadir el handler
 * @param {string} processorName - Nombre descriptivo del procesador (para logs)
 * @returns {AudioWorkletNode} El mismo nodo (para encadenar)
 */
export function attachProcessorErrorHandler(node, processorName) {
  if (!node || typeof node.addEventListener !== 'function') return node;
  
  node.addEventListener('processorerror', (event) => {
    const message = `AudioWorklet "${processorName}" falló en runtime`;
    log.error(message, event);
    reportError(message, {
      source: `worklet:${processorName}`,
      type: 'processorerror'
    });
    telemetryTrackEvent('worklet_crash', { processor: processorName });
  });
  
  return node;
}
