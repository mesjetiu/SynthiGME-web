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
 * Resistencias de realimentación estándar.
 * Rf determina la ganancia en los nodos de suma de tierra virtual.
 * Con Rf = 100k y pin blanco (100k), la ganancia es unitaria (1:1).
 *
 * @constant {Object}
 */
export const FEEDBACK_RESISTANCES = {
  /** Rf estándar para la mayoría de entradas de audio y control */
  STANDARD: 100000,     // 100k Ω

  /** Rf para compensar amplitud de pulso/triángulo en osciladores (×3) */
  OSCILLATOR_PULSE_TRIANGLE: 300000,  // 300k Ω

  /** Rf del VCA dual (CEM 3330) */
  VCA_DUAL: 51000       // 51k Ω
};

// =============================================================================
// LÍMITES DE VOLTAJE DE ENTRADA (Soft Clipping)
// =============================================================================

/**
 * Límites de voltaje de entrada por tipo de módulo.
 * Superar estos límites causa saturación (soft clipping).
 * Valores en voltios pico a pico (V p-p).
 *
 * @constant {Object}
 */
export const INPUT_VOLTAGE_LIMITS = {
  /** Amplificadores de entrada: ±10V DC */
  INPUT_AMPLIFIER: 20.0,

  /** Moduladores de anillo: 8V p-p para resultado óptimo */
  RING_MODULATOR: 8.0,

  /** Banco de filtros de octava */
  OCTAVE_FILTER_BANK: 8.0,

  /** Filtros VCF generales */
  VCF: 8.0,

  /** Unidades de reverberación: 2V p-p máximo */
  REVERB: 2.0,

  /** VCA de envolvente: 3V p-p recomendado */
  ENVELOPE_VCA: 3.0,

  /** Valor por defecto para módulos no especificados */
  DEFAULT: 8.0
};

// =============================================================================
// NIVELES DE SALIDA DE OSCILADORES
// =============================================================================

/**
 * Niveles de voltaje de salida por forma de onda.
 * Basado en mediciones del manual técnico Datanomics y Belgrado.
 *
 * Nota: En el circuito real, pulso y triángulo tienen Rf=300k (×3)
 * para compensar su menor amplitud nativa. Aquí definimos los
 * niveles finales después de esa compensación.
 *
 * @constant {Object}
 */
export const OSCILLATOR_OUTPUT_LEVELS = {
  /**
   * Osciladores 1-12: Niveles a amplitud total.
   * Seno y sierra usan Rf=100k, pulso y triángulo usan Rf=300k.
   */
  OSCILLATOR_1_12: {
    SINE: 8.0,          // 8V p-p (amplitud total de referencia)
    SAWTOOTH: 8.0,      // 8V p-p
    PULSE: 8.0,         // 8V p-p (después de compensación ×3)
    TRIANGLE: 8.0,      // 8V p-p (después de compensación ×3)
    CUSP: 0.5           // 0.5V p-p (deformación extrema de seno)
  },

  /**
   * Valores históricos del manual de Belgrado (referencia).
   * Útiles si se quiere emular comportamiento de versiones anteriores.
   */
  LEGACY_BELGRADO: {
    SINE: 4.0,          // 4V p-p
    SAWTOOTH: 5.0,      // 5V p-p
    SAWTOOTH_HI: 7.4,   // 7.4V p-p (Osc 7-9)
    PULSE: 3.2,         // 3.2V p-p
    NOISE: 3.0          // 3V p-p
  }
};

// =============================================================================
// DERIVA TÉRMICA
// =============================================================================

/**
 * Configuración de deriva térmica para osciladores CEM 3340.
 * La deriva es la inestabilidad natural de frecuencia durante una sesión.
 *
 * @constant {Object}
 */
export const THERMAL_DRIFT = {
  /** Desviación máxima de frecuencia (±0.1%) */
  MAX_DEVIATION: 0.001,

  /** Período de oscilación de la deriva en segundos (muy lento) */
  PERIOD_SECONDS: 120,

  /** Habilitado por defecto */
  ENABLED_DEFAULT: true
};

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
 * Configuración por defecto para el sistema de voltajes.
 * Usada para inicializar settings y estado.
 *
 * @constant {Object}
 */
export const VOLTAGE_DEFAULTS = {
  /** Tipo de pin por defecto para nuevas conexiones */
  defaultPinType: DEFAULT_PIN_TYPE,

  /** Aplicar error de tolerancia en pines */
  applyPinTolerance: true,

  /** Aplicar deriva térmica en osciladores */
  applyThermalDrift: true,

  /** Soft clipping habilitado */
  softClipEnabled: true
};
