import { createLogger } from '../utils/logger.js';
import {
  OSC_REFERENCE_FREQ,
  OSC_REFERENCE_VOLTAGE,
  DIAL_UNITS_PER_OCTAVE,
  TRACKING_LINEAR_HALF_RANGE,
  OSC_FREQUENCY_RANGES,
  LO_RANGE_DIVISOR
} from '../utils/voltageConstants.js';

const log = createLogger('Conversions');

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STATE CONVERSIONS - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Funciones de conversión entre valores de knob (0-1) y valores físicos.
 * Estas funciones permiten que los patches guarden valores en unidades
 * físicas (Hz, ms, ratios) independientes de la calibración de los knobs.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Convierte un valor de knob (0-1) a un valor físico según la curva.
 * 
 * @param {number} knobValue - Valor del knob (0-1)
 * @param {Object} config - Configuración del parámetro
 * @param {number} config.min - Valor mínimo físico
 * @param {number} config.max - Valor máximo físico
 * @param {string} [config.curve='linear'] - Tipo de curva
 * @param {number} [config.curveExponent=2] - Exponente para curva quadratic
 * @param {number} [config.curveK=3] - Factor K para curva exponential
 * @returns {number} Valor físico
 */
export function knobToPhysical(knobValue, config) {
  const { min, max, curve = 'linear', curveExponent = 2, curveK = 3 } = config;
  const range = max - min;
  
  // Clamp knob value
  const k = Math.max(0, Math.min(1, knobValue));
  
  switch (curve) {
    case 'linear':
      return min + k * range;
    
    case 'quadratic':
      // y = x^n, más control en valores bajos
      return min + Math.pow(k, curveExponent) * range;
    
    case 'exponential':
      // y = (e^(k*x) - 1) / (e^k - 1)
      if (curveK === 0) return min + k * range;
      const expVal = (Math.exp(curveK * k) - 1) / (Math.exp(curveK) - 1);
      return min + expVal * range;
    
    case 'logarithmic':
      // y = log(x+1) / log(2), más control en valores altos
      return min + (Math.log(k + 1) / Math.log(2)) * range;
    
    default:
      log.warn(` Unknown curve type: ${curve}, using linear`);
      return min + k * range;
  }
}

/**
 * Convierte un valor físico a un valor de knob (0-1) según la curva.
 * Es la función inversa de knobToPhysical.
 * 
 * @param {number} physicalValue - Valor físico
 * @param {Object} config - Configuración del parámetro
 * @param {number} config.min - Valor mínimo físico
 * @param {number} config.max - Valor máximo físico
 * @param {string} [config.curve='linear'] - Tipo de curva
 * @param {number} [config.curveExponent=2] - Exponente para curva quadratic
 * @param {number} [config.curveK=3] - Factor K para curva exponential
 * @returns {number} Valor de knob (0-1)
 */
export function physicalToKnob(physicalValue, config) {
  const { min, max, curve = 'linear', curveExponent = 2, curveK = 3 } = config;
  const range = max - min;
  
  if (range === 0) return 0;
  
  // Normalizar valor físico a 0-1
  const normalized = Math.max(0, Math.min(1, (physicalValue - min) / range));
  
  switch (curve) {
    case 'linear':
      return normalized;
    
    case 'quadratic':
      // Inversa de y = x^n → x = y^(1/n)
      return Math.pow(normalized, 1 / curveExponent);
    
    case 'exponential':
      // Inversa de y = (e^(k*x) - 1) / (e^k - 1)
      if (curveK === 0) return normalized;
      const expMax = Math.exp(curveK) - 1;
      return Math.log(normalized * expMax + 1) / curveK;
    
    case 'logarithmic':
      // Inversa de y = log(x+1) / log(2)
      return Math.pow(2, normalized) - 1;
    
    default:
      return normalized;
  }
}

/**
 * Obtiene la configuración de conversión para un parámetro de oscilador.
 * Combina los defaults del schema con la configuración específica del panel.
 * 
 * @param {string} paramName - Nombre del parámetro
 * @param {Object} [panelConfig] - Configuración del panel (de panel3.config.js)
 * @returns {Object} Configuración de conversión
 */
export function getOscillatorParamConfig(paramName, panelConfig = {}) {
  // Defaults globales
  const defaults = {
    frequency: { min: 1, max: 10000, curve: 'quadratic', curveExponent: 2 },
    pulseLevel: { min: 0, max: 1, curve: 'linear' },
    pulseWidth: { min: 0.01, max: 0.99, curve: 'linear' },
    sineLevel: { min: 0, max: 1, curve: 'linear' },
    sineSymmetry: { min: 0, max: 1, curve: 'linear' },
    triangleLevel: { min: 0, max: 1, curve: 'linear' },
    sawtoothLevel: { min: 0, max: 1, curve: 'linear' }
  };
  
  // Obtener config del knob desde panelConfig
  const knobConfig = panelConfig?.knobs?.[paramName] || {};
  
  // Merge: panelConfig > defaults
  return {
    ...defaults[paramName],
    ...knobConfig
  };
}

/**
 * Obtiene la configuración de conversión para un parámetro de noise.
 * 
 * @param {string} paramName - Nombre del parámetro
 * @param {Object} [moduleConfig] - Configuración del módulo
 * @returns {Object} Configuración de conversión
 */
export function getNoiseParamConfig(paramName, moduleConfig = {}) {
  const defaults = {
    colour: { min: 0, max: 1, curve: 'linear' },
    level: { min: 0, max: 1, curve: 'linear' }
  };
  
  return {
    ...defaults[paramName],
    ...moduleConfig[paramName]
  };
}

/**
 * Obtiene la configuración de conversión para un parámetro de input amplifier.
 * 
 * @param {string} paramName - Nombre del parámetro
 * @param {Object} [moduleConfig] - Configuración del módulo
 * @returns {Object} Configuración de conversión
 */
export function getInputAmplifierParamConfig(paramName, moduleConfig = {}) {
  const defaults = {
    level: { min: 0, max: 1, curve: 'linear' }
  };
  
  return {
    ...defaults[paramName],
    ...moduleConfig[paramName]
  };
}

/**
 * Obtiene la configuración de conversión para un parámetro de output fader.
 * 
 * @param {string} paramName - Nombre del parámetro
 * @param {Object} [moduleConfig] - Configuración del módulo
 * @returns {Object} Configuración de conversión
 */
export function getOutputFaderParamConfig(paramName, moduleConfig = {}) {
  const defaults = {
    levelLeft: { min: 0, max: 1, curve: 'linear' },
    levelRight: { min: 0, max: 1, curve: 'linear' },
    filter: { min: 0, max: 1, curve: 'linear' },
    pan: { min: -1, max: 1, curve: 'linear' }
  };
  
  return {
    ...defaults[paramName],
    ...moduleConfig[paramName]
  };
}

// =============================================================================
// CONVERSIÓN DE FRECUENCIA DEL OSCILADOR (Synthi 100 versión 1982 - CEM 3340)
// =============================================================================
//
// Implementa el modelo de frecuencia del VCO del Synthi 100 según el manual
// técnico Datanomics 1982 y el circuito D100-02 C1.
//
// El sistema utiliza:
// 1. Escala exponencial 1V/Octava con referencia 261 Hz en posición 5
// 2. Factor de conversión: 0.95 unidades de dial = 1 octava
// 3. Distorsión de tracking no lineal fuera de la zona central (±2.5V)
// 4. Switch HI/LO que divide la frecuencia por 10
//
// =============================================================================

/**
 * Convierte la posición del dial y CV externo a frecuencia del oscilador.
 * 
 * Implementa el modelo completo del VCO CEM 3340 del Synthi 100 (1982):
 * - Suma de voltajes: V_total = (dial / 0.95) + V_cv
 * - Distorsión de tracking fuera de la zona lineal
 * - Cálculo exponencial: f = 261 × 2^(V_distorsionado - 5)
 * - División por 10 en rango LO
 * - Clamping a límites físicos
 * 
 * @param {number} dialPosition - Posición del dial del oscilador (0-10)
 * @param {Object} [options={}] - Opciones de conversión
 * @param {number} [options.cvVoltage=0] - Voltaje de control externo sumado (en voltios internos)
 * @param {boolean} [options.rangeLow=false] - true para rango LO, false para rango HI
 * @param {Object} [options.trackingConfig] - Configuración de distorsión de tracking
 * @param {number} [options.trackingConfig.alpha=0.01] - Coeficiente de distorsión (0 = sin distorsión)
 * @param {number} [options.trackingConfig.linearHalfRange=2.5] - Mitad del rango lineal en voltios
 * @returns {number} Frecuencia en Hz (clampeada a límites físicos)
 * 
 * @example
 * // Posición central (5) sin CV → 261 Hz
 * dialToFrequency(5)  // → 261
 * 
 * // Posición 5 + 1 octava arriba
 * dialToFrequency(5 + 0.95)  // → ~522 Hz
 * 
 * // Posición central en rango LO
 * dialToFrequency(5, { rangeLow: true })  // → ~26.1 Hz
 * 
 * // Posición 0 con CV de +2V
 * dialToFrequency(0, { cvVoltage: 2 })  // → frecuencia correspondiente
 */
export function dialToFrequency(dialPosition, options = {}) {
  const {
    cvVoltage = 0,
    rangeLow = false,
    trackingConfig = {}
  } = options;
  
  const {
    alpha = 0.01,
    linearHalfRange = TRACKING_LINEAR_HALF_RANGE
  } = trackingConfig;
  
  // ─────────────────────────────────────────────────────────────────────────
  // 1. CONVERSIÓN DIAL → VOLTAJE INTERNO
  // ─────────────────────────────────────────────────────────────────────────
  // El dial de 0-10 tiene un factor de 0.95 unidades por octava.
  // Esto significa que un cambio de 0.95 en el dial produce 1 octava de cambio.
  // 
  // Interpretación: el "voltaje interno" es relativo a la referencia.
  // Si dial = 5 (referencia), entonces V_interno = 5
  // Si dial = 5 + 0.95, entonces V_interno = 5 + 1 = 6 (1 octava arriba)
  // 
  // Fórmula: V_interno = 5 + (dial - 5) / DIAL_UNITS_PER_OCTAVE
  const dialVoltage = OSC_REFERENCE_VOLTAGE + (dialPosition - 5) / DIAL_UNITS_PER_OCTAVE;
  
  // ─────────────────────────────────────────────────────────────────────────
  // 2. SUMA DE VOLTAJES (knob + CV externos)
  // ─────────────────────────────────────────────────────────────────────────
  // El voltaje total es la suma del voltaje del dial más los CV externos.
  // Esto emula los nodos de suma de tierra virtual del circuito.
  const totalVoltage = dialVoltage + cvVoltage;
  
  // ─────────────────────────────────────────────────────────────────────────
  // 3. APLICAR DISTORSIÓN DE TRACKING
  // ─────────────────────────────────────────────────────────────────────────
  // El circuito es lineal 1V/Oct solo dentro de ±2.5V del centro.
  // Fuera de ese rango, la constante de sensibilidad k deja de ser constante,
  // causando que el oscilador se quede "flat" (más grave de lo esperado).
  const distortedVoltage = applyTrackingDistortion(totalVoltage, {
    referenceVoltage: OSC_REFERENCE_VOLTAGE,
    linearHalfRange,
    alpha
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // 4. CÁLCULO DE FRECUENCIA EXPONENCIAL
  // ─────────────────────────────────────────────────────────────────────────
  // Fórmula base: f = 261 × 2^(V - 5)
  // Donde 261 Hz es la referencia en V=5
  let frequency = OSC_REFERENCE_FREQ * Math.pow(2, distortedVoltage - OSC_REFERENCE_VOLTAGE);
  
  // ─────────────────────────────────────────────────────────────────────────
  // 5. APLICAR RANGO LO (÷10)
  // ─────────────────────────────────────────────────────────────────────────
  // El switch HI/LO conmuta capacitores C9 (1nF) ↔ C10 (10nF).
  // En LO, la frecuencia es exactamente 1/10 de la frecuencia en HI.
  if (rangeLow) {
    frequency = frequency / LO_RANGE_DIVISOR;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // 6. CLAMPING A LÍMITES FÍSICOS
  // ─────────────────────────────────────────────────────────────────────────
  // Limitar a los rangos físicos del circuito (CEM 3340).
  const range = rangeLow ? OSC_FREQUENCY_RANGES.LO : OSC_FREQUENCY_RANGES.HI;
  frequency = Math.max(range.min, Math.min(range.max, frequency));
  
  return frequency;
}

/**
 * Aplica la distorsión de tracking no lineal del circuito VCO.
 * 
 * El Synthi 100 tiene un rango lineal de ~4-5 octavas centrado en V=5.
 * Fuera de este rango, la constante de sensibilidad k deja de ser constante,
 * y el oscilador tiende a quedarse "flat" (más grave de lo calculado matemáticamente).
 * 
 * Fórmula de distorsión:
 *   Si |V - 5| ≤ linearHalfRange: V_distorsionado = V (sin cambio)
 *   Si |V - 5| > linearHalfRange: V_distorsionado = 5 + (V - 5) × (1 - α × (|V - 5| - linearHalfRange)²)
 * 
 * @param {number} voltage - Voltaje total de control (dial + CV)
 * @param {Object} [config={}] - Configuración de distorsión
 * @param {number} [config.referenceVoltage=5] - Voltaje de referencia central
 * @param {number} [config.linearHalfRange=2.5] - Mitad del rango lineal
 * @param {number} [config.alpha=0.01] - Coeficiente de distorsión cuadrática
 * @returns {number} Voltaje con distorsión aplicada
 * 
 * @example
 * // Dentro del rango lineal → sin cambio
 * applyTrackingDistortion(6)  // → 6 (|6-5| = 1 < 2.5)
 * 
 * // Fuera del rango lineal → distorsionado hacia el centro
 * applyTrackingDistortion(9)  // → ~8.7 (se queda "flat")
 */
export function applyTrackingDistortion(voltage, config = {}) {
  const {
    referenceVoltage = OSC_REFERENCE_VOLTAGE,
    linearHalfRange = TRACKING_LINEAR_HALF_RANGE,
    alpha = 0.01
  } = config;
  
  // Calcular desviación desde el centro
  const deviation = voltage - referenceVoltage;
  const absDeviation = Math.abs(deviation);
  
  // Si estamos dentro del rango lineal, no hay distorsión
  if (absDeviation <= linearHalfRange) {
    return voltage;
  }
  
  // Distorsión cuadrática fuera del rango lineal
  // El factor de reducción aumenta cuadráticamente con la distancia
  const excessDeviation = absDeviation - linearHalfRange;
  const reductionFactor = 1 - alpha * excessDeviation * excessDeviation;
  
  // Aplicar reducción manteniendo el signo
  return referenceVoltage + deviation * reductionFactor;
}

/**
 * Convierte frecuencia a posición de dial del oscilador.
 * Es la función inversa de dialToFrequency (aproximada, ignora distorsión de tracking).
 * 
 * Útil para inicializar el dial a una frecuencia conocida o para mostrar
 * la frecuencia equivalente de un patch.
 * 
 * @param {number} frequency - Frecuencia objetivo en Hz
 * @param {Object} [options={}] - Opciones de conversión
 * @param {boolean} [options.rangeLow=false] - true para rango LO, false para HI
 * @returns {number} Posición del dial (0-10, clampeada)
 * 
 * @example
 * // 261 Hz → posición 5
 * frequencyToDial(261)  // → 5
 * 
 * // 522 Hz (1 octava arriba) → posición ~5.95
 * frequencyToDial(522)  // → ~5.95
 * 
 * // 26.1 Hz en rango LO → posición 5
 * frequencyToDial(26.1, { rangeLow: true })  // → 5
 */
export function frequencyToDial(frequency, options = {}) {
  const { rangeLow = false } = options;
  
  // Ajustar frecuencia si estamos en rango LO
  let adjustedFreq = rangeLow ? frequency * LO_RANGE_DIVISOR : frequency;
  
  // Calcular voltaje desde frecuencia: V = 5 + log2(f / 261)
  const voltage = OSC_REFERENCE_VOLTAGE + Math.log2(adjustedFreq / OSC_REFERENCE_FREQ);
  
  // Convertir voltaje a posición de dial (inversa de la fórmula en dialToFrequency)
  // V = 5 + (dial - 5) / 0.95
  // V - 5 = (dial - 5) / 0.95
  // (V - 5) × 0.95 = dial - 5
  // dial = 5 + (V - 5) × 0.95
  const dialPosition = 5 + (voltage - OSC_REFERENCE_VOLTAGE) * DIAL_UNITS_PER_OCTAVE;
  
  // Clamp a rango válido del dial
  return Math.max(0, Math.min(10, dialPosition));
}

/**
 * Genera una tabla de frecuencias para todas las posiciones del dial.
 * Útil para debugging, documentación y verificación de la implementación.
 * 
 * @param {Object} [options={}] - Opciones de generación
 * @param {boolean} [options.rangeLow=false] - true para rango LO
 * @param {Object} [options.trackingConfig] - Configuración de tracking
 * @param {number} [options.step=1] - Incremento entre posiciones
 * @returns {Array<{dial: number, freq: number, freqIdeal: number}>} Tabla de frecuencias
 * 
 * @example
 * // Generar tabla para rango HI
 * const table = generateFrequencyTable();
 * // → [{dial: 0, freq: ~10, freqIdeal: ~8}, {dial: 1, freq: ~14, ...}, ...]
 */
export function generateFrequencyTable(options = {}) {
  const { rangeLow = false, trackingConfig = {}, step = 1 } = options;
  const table = [];
  
  for (let dial = 0; dial <= 10; dial += step) {
    const freq = dialToFrequency(dial, { rangeLow, trackingConfig });
    const freqIdeal = dialToFrequency(dial, { rangeLow, trackingConfig: { alpha: 0 } });
    
    table.push({
      dial,
      freq: Math.round(freq * 10) / 10,
      freqIdeal: Math.round(freqIdeal * 10) / 10,
      trackingError: Math.round((freq / freqIdeal - 1) * 1000) / 10  // en %
    });
  }
  
  return table;
}