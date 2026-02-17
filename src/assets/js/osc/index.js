/**
 * Módulo OSC - Comunicación peer-to-peer entre instancias SynthiGME
 * 
 * Este módulo proporciona toda la funcionalidad necesaria para sincronizar
 * múltiples instancias de SynthiGME en red local usando el protocolo OSC.
 * 
 * @module osc
 * @see /OSC.md - Documentación completa del protocolo
 * 
 * @example
 * import { oscBridge } from './osc/index.js';
 * 
 * // Iniciar conexión OSC
 * await oscBridge.start({ verbose: true });
 * 
 * // Enviar cambio de parámetro
 * oscBridge.send('osc/1/frequency', 5.0);
 * 
 * // Escuchar cambios remotos
 * oscBridge.on('osc/1/frequency', (value) => {
 *   console.log('Frecuencia remota:', value);
 * });
 */

// Bridge principal (singleton)
export { oscBridge, OSCBridge } from './oscBridge.js';

// Mapeo de direcciones y conversión de valores
export {
  parseOSCAddress,
  buildOSCAddress,
  uiToOSCValue,
  oscToUIValue,
  getParameterInfo,
  MODULE_PARAMETERS
} from './oscAddressMap.js';

// Sincronización de osciladores
export {
  oscillatorOSCSync,
  KNOB_INDEX_TO_OSC_KEY,
  OSC_KEY_TO_KNOB_INDEX
} from './oscOscillatorSync.js';

// Sincronización de amplificadores de entrada
export { inputAmplifierOSCSync } from './oscInputAmplifierSync.js';

// Sincronización de canales de salida
export { outputChannelOSCSync } from './oscOutputChannelSync.js';

// Sincronización de generadores de ruido
export { noiseGeneratorOSCSync } from './oscNoiseGeneratorSync.js';

// Sincronización de joysticks
export { joystickOSCSync } from './oscJoystickSync.js';

// Re-exportar oscBridge como default para uso simplificado
export { default } from './oscBridge.js';
