/**
 * @fileoverview Constantes y utilidades para emulación de voltajes del Synthi 100.
 *
 * Este módulo implementa el modelo eléctrico de la versión Cuenca/Datanomics (1982)
 * del Synthi 100, basado en el sistema de suma por tierra virtual (virtual-earth summing).
 *
 * Referencias técnicas:
 * - Manual Técnico Datanomics 1982 (D100-02 C1)
 * - Manual de Radio Belgrado (Paul Pignon)
 *
 * Conceptos clave:
 * - Las señales digitales (-1 a +1) se mapean a voltajes reales (±4V = 8V p-p)
 * - La matriz usa pines con resistencias que determinan la ganancia de mezcla
 * - Cada módulo tiene una Rf (resistencia de realimentación) que define su sensibilidad
 * - Fórmula de mezcla: V_destino = Σ(V_fuente / R_pin) × Rf
 *
 * @module utils/voltageConstants
 */

// =============================================================================
// CONSTANTES GLOBALES DEL SISTEMA
// =============================================================================

/**
 * Factor de conversión digital a voltaje.
 * 1.0 digital = 4V (por tanto, rango -1 a +1 = -4V a +4V = 8V p-p)
 * Basado en la calibración de amplitud total del manual Datanomics.
 * @constant {number}
 */
export const DIGITAL_TO_VOLTAGE = 4.0;

/**
 * Voltaje pico a pico máximo del sistema (8V p-p = ±4V).
 * Este es el estándar de "amplitud total" para señales de audio.
 * @constant {number}
 */
export const MAX_VOLTAGE_PP = 8.0;

/**
 * Voltaje de alimentación del sistema analógico.
 * @constant {number}
 */
export const SUPPLY_VOLTAGE = 12.0;

/**
 * Estándar de control de voltaje: 1 Voltio por Octava.
 * @constant {number}
 */
export const VOLTS_PER_OCTAVE = 1.0;

/**
 * Voltaje máximo del teclado (nota más alta = C5).
 * @constant {number}
 */
export const KEYBOARD_MAX_VOLTAGE = 5.0;

// =============================================================================
// RESISTENCIAS DE PIN (Interconexión de Matriz)
// =============================================================================

/**
 * Configuración de los diferentes tipos de pines de la matriz.
 * Cada pin contiene una resistencia que determina cuánta corriente
 * aporta a los nodos de suma de tierra virtual.
 *
 * @constant {Object}
 */
export const PIN_RESISTANCES = {
  /**
   * Pin blanco (estándar): 100kΩ con tolerancia ±10%.
   * Uso: Parches de audio generales.
   */
  WHITE: {
    value: 100000,      // 100k Ω
    tolerance: 0.10,    // ±10%
    description: 'Standard audio patching'
  },

  /**
   * Pin gris (precisión): 100kΩ con tolerancia ±0.5%.
   * Uso: Control de voltaje donde se requiere precisión (acordes, intervalos).
   */
  GREY: {
    value: 100000,      // 100k Ω
    tolerance: 0.005,   // ±0.5%
    description: 'Precision CV patching (tuned intervals)'
  },

  /**
   * Pin rojo (baja impedancia): 2.7kΩ.
   * Uso: Conexiones al osciloscopio para señal más nítida.
   */
  RED: {
    value: 2700,        // 2.7k Ω (2k7)
    tolerance: 0.05,    // ±5%
    description: 'Oscilloscope connections (strong signal)'
  },

  /**
   * Pin verde (alta impedancia): 68kΩ o más.
   * Uso: Mezclas donde se requiere señal más débil.
   */
  GREEN: {
    value: 68000,       // 68k Ω
    tolerance: 0.10,    // ±10%
    description: 'Attenuated mixing'
  },

  /**
   * Pin naranja (cortocircuito): 0Ω.
   * ⚠️ NO USAR en la versión moderna - puede dañar nodos de tierra virtual.
   */
  ORANGE: {
    value: 0,           // 0 Ω (cortocircuito)
    tolerance: 0,
    description: 'Short circuit - DO NOT USE in Cuenca version',
    dangerous: true
  }
};

/**
 * Pin por defecto para nuevas conexiones.
 * En la versión actual usamos gris (precisión) para mejor reproducibilidad.
 * @constant {string}
 */
export const DEFAULT_PIN_TYPE = 'GREY';

// =============================================================================
// RESISTENCIAS DE REALIMENTACIÓN (Rf) POR MÓDULO
// =============================================================================

/**
 * Resistencia de realimentación estándar (Rf).
 * Rf determina la ganancia en los nodos de suma de tierra virtual.
 * Con Rf = 100k y pin blanco (100k), la ganancia es unitaria (1:1).
 *
 * Valores específicos por módulo se definen en sus respectivos configs:
 * - Osciladores: panel3.config.js (100k seno/sierra, 300k pulso/triángulo)
 * - VCA dual: cuando se implemente
 *
 * @constant {number}
 */
export const STANDARD_FEEDBACK_RESISTANCE = 100000;  // 100k Ω

// =============================================================================
// LÍMITES DE VOLTAJE DE ENTRADA (Soft Clipping)
// =============================================================================

/**
 * Límite de voltaje de entrada por defecto.
 * Superar este límite causa saturación (soft clipping).
 *
 * Límites específicos por módulo se definen en sus respectivos configs:
 * - Osciladores: panel3.config.js
 * - Filtros, Ring Mod, Reverb: cuando se implementen
 *
 * Referencia de límites del hardware (para futura implementación):
 * - Input Amplifier: 20V (±10V DC)
 * - Ring Modulator: 8V p-p
 * - VCF / Octave Filter: 8V p-p
 * - Reverb: 2V p-p
 * - Envelope VCA: 3V p-p
 *
 * @constant {number}
 */
export const DEFAULT_INPUT_VOLTAGE_LIMIT = 8.0;  // 8V p-p

// =============================================================================
// NIVELES DE SALIDA POR DEFECTO
// =============================================================================

/**
 * Nivel de salida por defecto para módulos sin configuración específica.
 * Los niveles específicos de cada módulo se definen en sus respectivos
 * archivos de configuración (ej: panel3.config.js para osciladores).
 *
 * @constant {number}
 */
export const DEFAULT_OUTPUT_LEVEL = 8.0;  // 8V p-p (amplitud total)



// =============================================================================
// FUNCIONES DE CONVERSIÓN
// =============================================================================

/**
 * Convierte un valor digital normalizado (-1 a +1) a voltaje.
 *
 * @param {number} digitalValue - Valor en rango -1 a +1
 * @returns {number} Voltaje equivalente (±4V para entrada ±1)
 *
 * @example
 * digitalToVoltage(1.0)   // → 4.0V
 * digitalToVoltage(-1.0)  // → -4.0V
 * digitalToVoltage(0.5)   // → 2.0V
 */
export function digitalToVoltage(digitalValue) {
  return digitalValue * DIGITAL_TO_VOLTAGE;
}

/**
 * Convierte un voltaje a valor digital normalizado.
 *
 * @param {number} voltage - Voltaje en V
 * @returns {number} Valor normalizado (-1 a +1 para ±4V)
 *
 * @example
 * voltageToDigital(4.0)   // → 1.0
 * voltageToDigital(-4.0)  // → -1.0
 * voltageToDigital(2.0)   // → 0.5
 */
export function voltageToDigital(voltage) {
  return voltage / DIGITAL_TO_VOLTAGE;
}

/**
 * Calcula la ganancia de un pin según la fórmula de tierra virtual.
 * Ganancia = Rf / R_pin
 *
 * @param {number} rfOhms - Resistencia de realimentación del módulo destino
 * @param {number} rPinOhms - Resistencia del pin
 * @returns {number} Factor de ganancia
 *
 * @example
 * // Pin blanco (100k) con Rf estándar (100k) → ganancia 1.0
 * calculatePinGain(100000, 100000)  // → 1.0
 *
 * // Pin rojo (2.7k) con Rf estándar → ganancia ~37
 * calculatePinGain(100000, 2700)    // → 37.037
 */
export function calculatePinGain(rfOhms, rPinOhms) {
  if (rPinOhms === 0) {
    console.warn('Pin con resistencia 0 (cortocircuito) - esto puede causar problemas');
    return Infinity;
  }
  return rfOhms / rPinOhms;
}

/**
 * Aplica tolerancia de error a una resistencia.
 * Genera un valor fijo basado en un seed para reproducibilidad.
 *
 * @param {number} nominalValue - Valor nominal de la resistencia en Ω
 * @param {number} tolerance - Tolerancia como decimal (ej: 0.10 para ±10%)
 * @param {number} seed - Seed para reproducibilidad (ej: connectionId)
 * @returns {number} Valor de resistencia con error aplicado
 *
 * @example
 * // Resistencia de 100k con ±10% tolerancia
 * applyResistanceTolerance(100000, 0.10, 12345)  // → ~95000-105000
 */
export function applyResistanceTolerance(nominalValue, tolerance, seed) {
  // Generador pseudoaleatorio simple basado en seed (LCG)
  const a = 1664525;
  const c = 1013904223;
  const m = Math.pow(2, 32);
  const random = ((a * seed + c) % m) / m; // 0 a 1

  // Convertir a rango -1 a +1 y aplicar tolerancia
  const errorFactor = (random * 2 - 1) * tolerance;
  return nominalValue * (1 + errorFactor);
}

/**
 * Aplica soft clipping (saturación suave) usando función tanh.
 * Emula el comportamiento de saturación de los amplificadores operacionales.
 *
 * @param {number} voltage - Voltaje de entrada
 * @param {number} maxVoltage - Límite de voltaje donde comienza la saturación
 * @param {number} [softness=1.0] - Suavidad de la curva (1.0 = estándar)
 * @returns {number} Voltaje saturado
 *
 * @example
 * applySoftClip(4.0, 8.0)   // → ~4.0 (dentro del límite, sin cambio notable)
 * applySoftClip(10.0, 8.0)  // → ~7.6 (saturado suavemente)
 * applySoftClip(20.0, 8.0)  // → ~8.0 (casi límite)
 */
export function applySoftClip(voltage, maxVoltage, softness = 1.0) {
  // Normalizar al rango del límite
  const halfMax = maxVoltage / 2;
  const normalized = voltage / halfMax;

  // Aplicar tanh para saturación suave
  const clipped = Math.tanh(normalized * softness);

  // Escalar de vuelta al rango de voltaje
  return clipped * halfMax;
}

/**
 * Calcula el voltaje resultante en un nodo de suma de tierra virtual.
 * Implementa la fórmula: V_dest = Σ(V_fuente / R_pin) × Rf
 *
 * @param {Array<{voltage: number, resistance: number}>} sources - Fuentes conectadas
 * @param {number} rf - Resistencia de realimentación del módulo destino
 * @param {number} [inputLimit] - Límite de voltaje de entrada (aplica soft clip)
 * @returns {number} Voltaje resultante en el nodo
 *
 * @example
 * // Dos osciladores (4V cada uno) con pines blancos (100k) a módulo con Rf=100k
 * calculateVirtualEarthSum(
 *   [{voltage: 4, resistance: 100000}, {voltage: 4, resistance: 100000}],
 *   100000
 * )  // → 8V (suma lineal)
 */
export function calculateVirtualEarthSum(sources, rf, inputLimit = null) {
  // Sumar corrientes: I = V/R para cada fuente
  let totalCurrent = 0;
  for (const source of sources) {
    if (source.resistance > 0) {
      totalCurrent += source.voltage / source.resistance;
    }
  }

  // Convertir corriente a voltaje: V = I × Rf
  let resultVoltage = totalCurrent * rf;

  // Aplicar soft clipping si hay límite definido
  if (inputLimit !== null && Math.abs(resultVoltage) > inputLimit / 2) {
    resultVoltage = applySoftClip(resultVoltage, inputLimit);
  }

  return resultVoltage;
}

// =============================================================================
// EXPORTACIÓN DE CONFIGURACIÓN POR DEFECTO
// =============================================================================

/**
 * Lee un valor de emulación de voltajes desde localStorage.
 * Retorna el valor por defecto si no está configurado.
 * 
 * @param {string} key - Clave de localStorage (sin prefijo)
 * @param {boolean} defaultValue - Valor por defecto
 * @returns {boolean}
 * @private
 */
function _readVoltageSetting(key, defaultValue) {
  if (typeof localStorage === 'undefined') return defaultValue;
  const stored = localStorage.getItem(`synthigme-${key}`);
  return stored === null ? defaultValue : stored === 'true';
}

/**
 * Configuración por defecto para el sistema de voltajes.
 * Los valores se leen desde Settings (localStorage) si están disponibles.
 *
 * @constant {Object}
 */
export const VOLTAGE_DEFAULTS = {
  /** Tipo de pin por defecto para nuevas conexiones */
  defaultPinType: DEFAULT_PIN_TYPE,

  /** Aplicar error de tolerancia en pines (lee de Settings) */
  get applyPinTolerance() {
    return _readVoltageSetting('voltage-pin-tolerance-enabled', true);
  },

  /** Aplicar deriva térmica en osciladores (lee de Settings) */
  get applyThermalDrift() {
    return _readVoltageSetting('voltage-thermal-drift-enabled', true);
  },

  /** Soft clipping habilitado (lee de Settings) */
  get softClipEnabled() {
    return _readVoltageSetting('voltage-soft-clip-enabled', true);
  }
};

// =============================================================================
// UTILIDADES PARA WEB AUDIO
// =============================================================================

/**
 * Calcula la ganancia completa de un pin de matriz.
 * Combina tipo de pin, tolerancia opcional y Rf del destino.
 * 
 * Esta función implementa la fórmula de tierra virtual:
 *   Ganancia = Rf / R_pin
 * 
 * Con opción de aplicar tolerancia del componente para realismo analógico.
 * 
 * @param {string} pinType - Tipo de pin ('GREY', 'WHITE', 'RED', 'GREEN')
 * @param {number} [rf=100000] - Resistencia de realimentación del destino (Ω)
 * @param {Object} [options] - Opciones adicionales
 * @param {boolean} [options.applyTolerance=false] - Aplicar tolerancia del componente
 * @param {number} [options.seed=0] - Seed para reproducibilidad de la tolerancia
 * @returns {number} Factor de ganancia para el GainNode de la conexión
 * 
 * @example
 * // Pin gris estándar (100k) a módulo con Rf=100k → ganancia 1.0
 * calculateMatrixPinGain('GREY')  // → 1.0
 * 
 * // Pin rojo (2.7k) a módulo con Rf=100k → ganancia ~37
 * calculateMatrixPinGain('RED')  // → 37.037
 * 
 * // Pin blanco con tolerancia
 * calculateMatrixPinGain('WHITE', 100000, { applyTolerance: true, seed: 42 })
 */
export function calculateMatrixPinGain(pinType, rf = STANDARD_FEEDBACK_RESISTANCE, options = {}) {
  const { applyTolerance = false, seed = 0 } = options;
  
  const pinConfig = PIN_RESISTANCES[pinType] || PIN_RESISTANCES.GREY;
  
  if (pinConfig.dangerous) {
    console.warn(`Pin tipo ${pinType} marcado como peligroso - no usar`);
    return 1.0; // Fallback seguro
  }
  
  let resistance = pinConfig.value;
  
  if (applyTolerance && pinConfig.tolerance > 0) {
    resistance = applyResistanceTolerance(resistance, pinConfig.tolerance, seed);
  }
  
  return calculatePinGain(rf, resistance);
}

/**
 * Crea una curva de saturación tanh para WaveShaperNode.
 * 
 * Emula el comportamiento de soft clipping de los amplificadores operacionales
 * del Synthi 100 cuando la señal supera los límites de entrada.
 * 
 * La curva mapea entrada [-1, +1] a salida saturada, donde valores cercanos
 * a ±inputLimit se comprimen suavemente hacia el límite.
 * 
 * @param {number} [samples=256] - Número de muestras de la curva (potencia de 2 recomendado)
 * @param {number} [inputLimit=1.0] - Límite de entrada normalizado
 *        (1.0 = señal ±1 se satura a ±1, 2.0 = señal ±2 se satura a ±2)
 * @param {number} [softness=1.0] - Factor de suavidad (menor = más agresivo)
 * @returns {Float32Array} Curva de saturación para WaveShaperNode.curve
 * 
 * @example
 * // Crear curva para limitar CV a ±2 unidades digitales (8V)
 * const curve = createSoftClipCurve(256, 2.0, 1.0);
 * waveShaperNode.curve = curve;
 */
export function createSoftClipCurve(samples = 256, inputLimit = 1.0, softness = 1.0) {
  const curve = new Float32Array(samples);
  const halfSamples = samples / 2;
  
  for (let i = 0; i < samples; i++) {
    // Mapear índice a rango -1 a +1
    const x = (i - halfSamples) / halfSamples;
    
    // Normalizar por límite de entrada y aplicar tanh
    const normalized = x / (inputLimit * softness);
    curve[i] = Math.tanh(normalized) * inputLimit;
  }
  
  return curve;
}
