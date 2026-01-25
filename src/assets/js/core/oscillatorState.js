/**
 * Gestión del estado de osciladores SGME.
 * 
 * Funciones para crear, mantener y aplicar estado de osciladores
 * a nodos de audio (worklets o nativos).
 * 
 * @module core/oscillatorState
 */

import { dialToFrequency } from '../state/conversions.js';
import { oscillatorConfig } from '../configs/index.js';

/**
 * Estado de un oscilador individual.
 * @typedef {Object} OscillatorNodeState
 * @property {number} freq - Frecuencia en Hz
 * @property {number} oscLevel - Nivel de onda sine (0-1)
 * @property {number} sawLevel - Nivel de onda sawtooth (0-1)
 * @property {number} triLevel - Nivel de onda triangle (0-1)
 * @property {number} pulseLevel - Nivel de onda pulse (0-1)
 * @property {number} pulseWidth - Ancho de pulso (0-1)
 * @property {number} sineSymmetry - Simetría de sine (0-1)
 */

/**
 * Genera el estado inicial de un oscilador desde la configuración.
 * Deriva todos los valores de oscillator.config.js para evitar hardcodear.
 * 
 * @param {Object} [knobsConfig] - Configuración de knobs (defaults: oscillatorConfig.defaults.knobs)
 * @param {boolean} [rangeLow=false] - Si el oscilador está en rango LO
 * @returns {OscillatorNodeState} Estado inicial del oscilador
 */
export function createInitialOscState(knobsConfig = null, rangeLow = false) {
  const knobs = knobsConfig || oscillatorConfig?.defaults?.knobs || {};
  
  // Obtener valores iniciales de la config (con fallbacks seguros)
  const pulseLevel = knobs.pulseLevel?.initial ?? 0;
  const pulseWidth = knobs.pulseWidth?.initial ?? 0.5;
  const sineLevel = knobs.sineLevel?.initial ?? 0;
  const sineSymmetry = knobs.sineSymmetry?.initial ?? 0.5;
  const triangleLevel = knobs.triangleLevel?.initial ?? 0;
  const sawtoothLevel = knobs.sawtoothLevel?.initial ?? 0;
  const frequencyDial = knobs.frequency?.initial ?? 5;
  
  // Convertir posición del dial a frecuencia real en Hz
  const freq = dialToFrequency(frequencyDial, { rangeLow });
  
  return {
    freq,
    oscLevel: sineLevel,
    sawLevel: sawtoothLevel,
    triLevel: triangleLevel,
    pulseLevel,
    pulseWidth,
    sineSymmetry
  };
}

/**
 * Valores por defecto para el estado de un oscilador.
 * NOTA: Para nuevos osciladores, usar createInitialOscState() que deriva
 * los valores desde la configuración. Este objeto se mantiene como fallback
 * para compatibilidad con código existente.
 */
export const DEFAULT_OSC_STATE = {
  // Frecuencia correspondiente a dial=5 en rango HI (~261 Hz)
  // Calculado con dialToFrequency(5) - valor de referencia C4
  freq: 261,
  oscLevel: 0,
  sawLevel: 0,
  triLevel: 0,
  pulseLevel: 0,
  pulseWidth: 0.5,
  sineSymmetry: 0.5
};

/**
 * Obtiene o crea el estado de un oscilador en un panel de audio.
 * 
 * @param {Object} panelAudio - Objeto de audio del panel
 * @param {number} index - Índice del oscilador
 * @param {Object} [options] - Opciones de inicialización
 * @param {Object} [options.knobsConfig] - Config de knobs para valores iniciales
 * @param {boolean} [options.rangeLow=false] - Si el oscilador está en rango LO
 * @returns {OscillatorNodeState} Estado del oscilador
 */
export function getOrCreateOscState(panelAudio, index, options = {}) {
  panelAudio.state = panelAudio.state || [];
  let state = panelAudio.state[index];
  if (!state) {
    // Crear estado inicial desde configuración
    state = createInitialOscState(options.knobsConfig, options.rangeLow);
    panelAudio.state[index] = state;
  }
  return state;
}

/**
 * Aplica el estado de un oscilador a sus nodos de audio de forma inmediata.
 * Soporta tanto osciladores worklet como nativos.
 * 
 * Los try-catch protegen contra estados inválidos de AudioParam
 * (nodo no iniciado, contexto cerrado, etc.).
 * 
 * @param {Object} node - Nodo de audio del oscilador
 * @param {OscillatorNodeState} state - Estado a aplicar
 * @param {AudioContext} ctx - Contexto de audio
 */
export function applyOscStateImmediate(node, state, ctx) {
  if (!node || !state || !ctx) return;
  const now = ctx.currentTime;

  // Sine oscillator - puede ser worklet o nativo
  if (node.osc && Number.isFinite(state.freq)) {
    try {
      if (node._useWorklet && node.osc.setFrequency) {
        node.osc.setFrequency(state.freq);
      } else if (node.osc.frequency) {
        node.osc.frequency.cancelScheduledValues(now);
        node.osc.frequency.setValueAtTime(state.freq, now);
      }
    } catch { /* AudioParam puede no estar listo */ }
  }

  // Sawtooth oscillator
  if (node.sawOsc && node.sawOsc.frequency && Number.isFinite(state.freq)) {
    try {
      node.sawOsc.frequency.cancelScheduledValues(now);
      node.sawOsc.frequency.setValueAtTime(state.freq, now);
    } catch { /* AudioParam puede no estar listo */ }
  }

  // Sine gain
  if (node.gain && node.gain.gain && Number.isFinite(state.oscLevel)) {
    try {
      node.gain.gain.cancelScheduledValues(now);
      node.gain.gain.setValueAtTime(state.oscLevel, now);
    } catch { /* AudioParam puede no estar listo */ }
  }

  // Sawtooth gain
  if (node.sawGain && node.sawGain.gain && Number.isFinite(state.sawLevel)) {
    try {
      node.sawGain.gain.cancelScheduledValues(now);
      node.sawGain.gain.setValueAtTime(state.sawLevel, now);
    } catch { /* AudioParam puede no estar listo */ }
  }

  // Triangle oscillator
  if (node.triOsc && node.triOsc.frequency && Number.isFinite(state.freq)) {
    try {
      node.triOsc.frequency.cancelScheduledValues(now);
      node.triOsc.frequency.setValueAtTime(state.freq, now);
    } catch { /* AudioParam puede no estar listo */ }
  }

  // Triangle gain
  if (node.triGain && node.triGain.gain && Number.isFinite(state.triLevel)) {
    try {
      node.triGain.gain.cancelScheduledValues(now);
      node.triGain.gain.setValueAtTime(state.triLevel, now);
    } catch { /* AudioParam puede no estar listo */ }
  }

  // Pulse oscillator - puede ser worklet o nativo
  if (node.pulseOsc && Number.isFinite(state.freq)) {
    try {
      if (node._useWorklet && node.pulseOsc.setFrequency) {
        node.pulseOsc.setFrequency(state.freq);
      } else if (node.pulseOsc.frequency) {
        node.pulseOsc.frequency.cancelScheduledValues(now);
        node.pulseOsc.frequency.setValueAtTime(state.freq, now);
      }
    } catch { /* AudioParam puede no estar listo */ }
  }

  // Pulse gain
  if (node.pulseGain && node.pulseGain.gain && Number.isFinite(state.pulseLevel)) {
    try {
      node.pulseGain.gain.cancelScheduledValues(now);
      node.pulseGain.gain.setValueAtTime(state.pulseLevel, now);
    } catch { /* AudioParam puede no estar listo */ }
  }
}
