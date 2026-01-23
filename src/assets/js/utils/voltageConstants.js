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
// CONSTANTES DE FRECUENCIA DEL OSCILADOR (Synthi 100 versión 1982 - CEM 3340)
// =============================================================================
//
// Basado en el Manual Técnico Datanomics 1982 y análisis del circuito D100-02 C1.
//
// El sistema de frecuencia del Synthi 100 utiliza una escala exponencial 1V/Octava
// con un punto de referencia central de 261 Hz (Do central, C4) en la posición 5
// del dial. La escala del dial está calibrada a 0.95 unidades por octava, lo que
// permite cubrir aproximadamente 10.5 octavas en el rango completo (0-10).
//
// Características clave:
// - Zona lineal de 4-5 octavas centradas en el punto 5 (tracking preciso)
// - Distorsión de tracking no lineal fuera de la zona lineal (tracking error)
// - Switch HI/LO que divide la frecuencia por 10 (conmutación de capacitor)
// - Límites físicos absolutos del circuito
//
// =============================================================================

/**
 * Frecuencia de referencia en el punto central del dial (posición 5).
 * Corresponde al Do central (C4) según la calibración estándar del manual técnico.
 * @constant {number}
 */
export const OSC_REFERENCE_FREQ = 261;  // Hz (C4)

/**
 * Voltaje de referencia correspondiente al punto central del dial.
 * El sistema considera que la posición 5 del dial equivale a 5V internos.
 * @constant {number}
 */
export const OSC_REFERENCE_VOLTAGE = 5;  // V

/**
 * Unidades de dial por octava.
 * El Synthi 100 NO asigna exactamente 1 octava por unidad de dial.
 * Un cambio de 0.95 unidades en el dial produce un cambio de 1 octava.
 * Esto permite cubrir ~10.5 octavas en el rango 0-10 del dial.
 * 
 * Relación matemática: V_interno = posición_dial / DIAL_UNITS_PER_OCTAVE
 * @constant {number}
 */
export const DIAL_UNITS_PER_OCTAVE = 0.95;

/**
 * Rango de la zona lineal (tracking preciso) medido desde el centro.
 * El circuito garantiza linealidad 1V/Octava dentro de ±2.5V del centro (V=5).
 * Fuera de este rango, la constante de sensibilidad k deja de ser constante,
 * produciendo distorsión de tracking (el oscilador se queda "flat" en agudos).
 * @constant {number}
 */
export const TRACKING_LINEAR_HALF_RANGE = 2.5;  // ±2.5V desde el centro

/**
 * Rangos de frecuencia físicos del oscilador según el switch HI/LO.
 * Estos son límites absolutos del circuito, no de la escala del dial.
 * El chip CEM 3340 puede ser forzado hasta estos límites con CV externos.
 * 
 * @constant {Object}
 * @property {Object} HI - Rango de audio (capacitor C9 = 1nF)
 * @property {number} HI.min - Frecuencia mínima en Hz (límite inferior físico)
 * @property {number} HI.max - Frecuencia máxima en Hz (límite superior físico)
 * @property {Object} LO - Rango sub-audio/control (capacitor C10 = 10nF)
 * @property {number} LO.min - Frecuencia mínima en Hz
 * @property {number} LO.max - Frecuencia máxima en Hz
 */
export const OSC_FREQUENCY_RANGES = {
  HI: { min: 5, max: 20000 },      // Rango de audio
  LO: { min: 0.5, max: 2000 }      // Rango sub-audio/control (÷10)
};

/**
 * Factor de división para el rango LO.
 * El switch HI/LO conmuta entre capacitores C9 (1nF) y C10 (10nF).
 * Al ser C10 10 veces mayor, la frecuencia en LO es exactamente 1/10 de HI.
 * @constant {number}
 */
export const LO_RANGE_DIVISOR = 10;

// =============================================================================
// RESISTENCIAS DE PIN (Interconexión de Matriz)
// =============================================================================

/**
 * Configuración de los diferentes tipos de pines de la matriz.
 * Cada pin contiene una resistencia que determina cuánta corriente
 * aporta a los nodos de suma de tierra virtual.
 * 
 * Basado en manuales Datanomics 1982 y Paul Pignon (Belgrado).
 * 
 * Categorías:
 * - ESTÁNDAR (Cuenca 1982): WHITE, GREY, GREEN, RED
 * - ESPECIALES (mezcla personalizada): BLUE, YELLOW, CYAN, PURPLE
 * - PROHIBIDO: ORANGE (cortocircuito - daña el equipo)
 *
 * @constant {Object}
 */
export const PIN_RESISTANCES = {
  // ─────────────────────────────────────────────────────────────────────────
  // PINES ESTÁNDAR (Cuenca/Datanomics 1982)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Pin blanco (estándar): 100kΩ con tolerancia ±10%.
   * Uso: Parches de audio generales en matriz de señal.
   * Ganancia: 1× (unitaria con Rf=100k)
   */
  WHITE: {
    value: 100000,      // 100k Ω
    tolerance: 0.10,    // ±10%
    description: 'Standard audio patching',
    category: 'standard'
  },

  /**
   * Pin gris (precisión): 100kΩ con tolerancia ±0.5%.
   * Uso: Control de voltaje donde se requiere precisión (acordes, intervalos).
   * Ganancia: 1× (unitaria con Rf=100k)
   */
  GREY: {
    value: 100000,      // 100k Ω
    tolerance: 0.005,   // ±0.5%
    description: 'Precision CV patching (tuned intervals)',
    category: 'standard'
  },

  /**
   * Pin verde (alta impedancia): 68kΩ.
   * Uso: Mezclas donde se requiere señal atenuada.
   * Ganancia: ~1.47× (100k/68k)
   */
  GREEN: {
    value: 68000,       // 68k Ω
    tolerance: 0.10,    // ±10%
    description: 'Attenuated mixing',
    category: 'standard'
  },

  /**
   * Pin rojo (baja impedancia): 2.7kΩ.
   * Uso: Conexiones al osciloscopio para señal fuerte y nítida.
   * Ganancia: ~37× (100k/2.7k)
   */
  RED: {
    value: 2700,        // 2.7k Ω (2k7)
    tolerance: 0.10,    // ±10%
    description: 'Oscilloscope connections (strong signal)',
    category: 'standard'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PINES ESPECIALES (Mezcla personalizada - Manual técnico)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Pin azul (legacy Belgrado): 10kΩ.
   * Uso: Alta ganancia, referencia histórica del manual de Paul Pignon.
   * Ganancia: 10× (100k/10k)
   */
  BLUE: {
    value: 10000,       // 10k Ω
    tolerance: 0.10,    // ±10%
    description: 'High gain (Belgrado legacy)',
    category: 'special'
  },

  /**
   * Pin amarillo (jumper): 22kΩ.
   * Uso: Conexiones entre matrices, boost de señal.
   * Ganancia: ~4.5× (100k/22k)
   */
  YELLOW: {
    value: 22000,       // 22k Ω
    tolerance: 0.10,    // ±10%
    description: 'Jumper connections / signal boost',
    category: 'special'
  },

  /**
   * Pin cian (muy atenuado): 250kΩ.
   * Uso: Señales muy atenuadas para mezclas sutiles.
   * Ganancia: 0.4× (100k/250k)
   */
  CYAN: {
    value: 250000,      // 250k Ω
    tolerance: 0.10,    // ±10%
    description: 'Very attenuated mixing',
    category: 'special'
  },

  /**
   * Pin púrpura (influencia mínima): 1MΩ.
   * Uso: Cuando solo se requiere influencia mínima de la fuente.
   * Ganancia: 0.1× (100k/1M)
   */
  PURPLE: {
    value: 1000000,     // 1M Ω (1 Megaohmio)
    tolerance: 0.10,    // ±10%
    description: 'Minimal influence mixing',
    category: 'special'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PIN PROHIBIDO
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Pin naranja (cortocircuito): 0Ω.
   * ⚠️ NO USAR en la versión Cuenca/Datanomics 1982.
   * Conectar 0Ω al nodo de suma de tierra virtual causa distorsión severa
   * y posibles daños físicos permanentes a los circuitos de entrada.
   */
  ORANGE: {
    value: 0,           // 0 Ω (cortocircuito)
    tolerance: 0,
    description: 'Short circuit - DO NOT USE in Cuenca version',
    category: 'forbidden',
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

// =============================================================================
// SUAVIZADO DE FORMAS DE ONDA (Waveform Smoothing)
// =============================================================================
//
// El sistema de suavizado emula dos características eléctricas del Synthi 100:
//
// 1. SLEW INHERENTE DEL MÓDULO
//    Los amplificadores operacionales (CA3140) tienen un slew rate finito que
//    impide transiciones de voltaje instantáneas. Esto afecta principalmente
//    a los edges de pulse y el reset de sawtooth.
//    Referencia: Manual Datanomics 1982 - "la verticalidad está limitada por
//    el slew rate de los CA3140"
//
// 2. INTEGRACIÓN POR RESISTENCIA DE PIN
//    La resistencia del pin combinada con la capacitancia parásita del bus
//    de la matriz (~100pF) crea un filtro RC natural que suaviza transitorios.
//    Referencia: Manual Datanomics 1982 - "con pines de 100k se produce
//    integración de transitorios rápidos"
//
// =============================================================================

/**
 * Capacitancia parásita estimada del bus de la matriz.
 * 
 * Valor derivado del comportamiento descrito en el manual técnico:
 * - Pin WHITE (100kΩ) produce integración visible
 * - Pin RED (2.7kΩ) es transparente para el osciloscopio
 * 
 * Con C = 100pF:
 * - fc(WHITE) = 1/(2π×100k×100pF) ≈ 15.9 kHz (suavizado audible)
 * - fc(RED) = 1/(2π×2.7k×100pF) ≈ 589 kHz (muy por encima del audio)
 * 
 * @constant {number} Faradios
 */
export const MATRIX_BUS_CAPACITANCE = 100e-12;  // 100 pF

/**
 * Frecuencia de corte inherente del módulo oscilador.
 * 
 * Determinada por el slew rate del CA3140 y circuitos de salida.
 * Este es el límite superior de velocidad de transición del hardware,
 * independiente del tipo de pin usado.
 * 
 * Con fc ≈ 20 kHz, el rise time 10%-90% es aproximadamente:
 * t_rise ≈ 2.2 / (2π × fc) ≈ 17.5 µs
 * 
 * @constant {number} Hz
 */
export const MODULE_INHERENT_CUTOFF = 20000;  // ~20 kHz

/**
 * Slew rate máximo del módulo Slew Limiter (control voluntario).
 * 
 * Este valor es para referencia - el slew limiter del sintetizador
 * es un módulo separado, no el suavizado inherente del oscilador.
 * 
 * Referencia: Manual Datanomics 1982 - "1 V/ms en ajuste rápido"
 * 
 * @constant {number} V/ms
 */
export const MAX_SLEW_RATE_V_PER_MS = 1.0;

/**
 * Calcula la frecuencia de corte RC de un pin dado.
 * 
 * Fórmula: fc = 1 / (2π × R × C)
 * 
 * Esta frecuencia determina el punto donde el filtro RC natural
 * comienza a atenuar los armónicos de la señal.
 * 
 * @param {number} resistance - Resistencia del pin en ohmios
 * @param {number} [capacitance=MATRIX_BUS_CAPACITANCE] - Capacitancia del bus en faradios
 * @returns {number} Frecuencia de corte en Hz
 * 
 * @example
 * // Pin WHITE (100kΩ) → ~15.9 kHz
 * computePinCutoff(100000)  // → 15915.49...
 * 
 * // Pin RED (2.7kΩ) → ~589 kHz (bypass efectivo)
 * computePinCutoff(2700)    // → 589463.05...
 */
export function computePinCutoff(resistance, capacitance = MATRIX_BUS_CAPACITANCE) {
  if (resistance <= 0) {
    console.warn('Resistencia ≤ 0 no válida para cálculo de cutoff');
    return Infinity;  // Bypass
  }
  return 1 / (2 * Math.PI * resistance * capacitance);
}

/**
 * Calcula la frecuencia de corte combinada (módulo + pin).
 * 
 * El suavizado total es el efecto combinado del slew inherente del módulo
 * y el filtro RC del pin. Usamos el mínimo de ambas frecuencias como
 * aproximación conservadora (el filtro más restrictivo domina).
 * 
 * @param {number} moduleCutoff - Frecuencia de corte del módulo en Hz
 * @param {number} pinCutoff - Frecuencia de corte del pin en Hz
 * @returns {number} Frecuencia de corte combinada en Hz
 * 
 * @example
 * // Módulo (20 kHz) + Pin WHITE (15.9 kHz) → 15.9 kHz (pin domina)
 * computeCombinedCutoff(20000, 15915)  // → 15915
 * 
 * // Módulo (20 kHz) + Pin RED (589 kHz) → 20 kHz (módulo domina)
 * computeCombinedCutoff(20000, 589000)  // → 20000
 */
export function computeCombinedCutoff(moduleCutoff, pinCutoff) {
  return Math.min(moduleCutoff, pinCutoff);
}

/**
 * Calcula el coeficiente alpha de un filtro one-pole lowpass.
 * 
 * El filtro one-pole es: y[n] = α × x[n] + (1 - α) × y[n-1]
 * 
 * Donde α = 1 - e^(-2π × fc / fs)
 * 
 * Propiedades del coeficiente:
 * - α = 1: bypass total (salida = entrada)
 * - α = 0: DC puro (sample & hold)
 * - α cercano a 1: suavizado leve
 * - α cercano a 0: suavizado fuerte
 * 
 * @param {number} cutoffHz - Frecuencia de corte en Hz
 * @param {number} sampleRate - Frecuencia de muestreo en Hz
 * @returns {number} Coeficiente alpha (0-1)
 * 
 * @example
 * // Filtro a 20 kHz con 44.1 kHz sample rate
 * computeOnePoleAlpha(20000, 44100)  // → ~0.94 (suavizado leve)
 * 
 * // Filtro a 1 kHz (suavizado fuerte)
 * computeOnePoleAlpha(1000, 44100)   // → ~0.13
 */
export function computeOnePoleAlpha(cutoffHz, sampleRate) {
  if (cutoffHz >= sampleRate / 2) return 1.0;  // Bypass (Nyquist o superior)
  if (cutoffHz <= 0) return 0;  // DC only
  return 1 - Math.exp(-2 * Math.PI * cutoffHz / sampleRate);
}

/**
 * Frecuencias de corte pre-calculadas para cada tipo de pin.
 * 
 * Estas constantes permiten evitar cálculos repetidos cuando se conoce
 * el tipo de pin. Basadas en MATRIX_BUS_CAPACITANCE = 100pF.
 * 
 * @constant {Object.<string, number>}
 */
export const PIN_CUTOFF_FREQUENCIES = {
  WHITE:  computePinCutoff(PIN_RESISTANCES.WHITE.value),   // ~15.9 kHz
  GREY:   computePinCutoff(PIN_RESISTANCES.GREY.value),    // ~15.9 kHz
  GREEN:  computePinCutoff(PIN_RESISTANCES.GREEN.value),   // ~23.4 kHz
  RED:    computePinCutoff(PIN_RESISTANCES.RED.value),     // ~589 kHz (bypass)
  BLUE:   computePinCutoff(PIN_RESISTANCES.BLUE.value),    // ~159 kHz
  YELLOW: computePinCutoff(PIN_RESISTANCES.YELLOW.value),  // ~72 kHz
  CYAN:   computePinCutoff(PIN_RESISTANCES.CYAN.value),    // ~6.4 kHz
  PURPLE: computePinCutoff(PIN_RESISTANCES.PURPLE.value),  // ~1.6 kHz
  // ORANGE no incluido (resistencia 0, no tiene sentido calcular cutoff)
};

/**
 * Crea un BiquadFilterNode configurado para emular el filtro RC del pin.
 * 
 * Emula el comportamiento del circuito RC formado por la resistencia del pin
 * y la capacitancia parásita del bus de la matriz (~100pF).
 * 
 * El filtro usa tipo 'lowpass' con Q bajo (0.5) para aproximar la respuesta
 * de un filtro RC pasivo de primer orden (pendiente de -6dB/octava, aunque
 * BiquadFilter tiene -12dB/octava, el Q bajo suaviza la transición).
 * 
 * NOTAS DE IMPLEMENTACIÓN:
 * - BiquadFilter es más eficiente que IIRFilter para este caso simple
 * - Q=0.5 evita resonancia y suaviza la curva de respuesta
 * - Para pines con fc > Nyquist (RED, BLUE, YELLOW), el filtro es transparente
 * 
 * @param {AudioContext} audioContext - Contexto de audio para crear el nodo
 * @param {string} [pinType='WHITE'] - Tipo de pin (WHITE, GREY, GREEN, RED, etc.)
 * @returns {BiquadFilterNode} Nodo de filtro configurado
 * 
 * @example
 * // Crear filtro para pin blanco (100kΩ → fc ≈ 15.9kHz)
 * const filter = createPinFilter(audioCtx, 'WHITE');
 * source.connect(filter).connect(destination);
 * 
 * // Cambiar tipo de pin dinámicamente
 * filter.frequency.value = PIN_CUTOFF_FREQUENCIES.CYAN;  // 6.4kHz
 */
export function createPinFilter(audioContext, pinType = 'WHITE') {
  const filter = audioContext.createBiquadFilter();
  filter.type = 'lowpass';
  
  // Q bajo para aproximar respuesta de primer orden
  // Q=0.5 da una curva sin resonancia, más cercana a RC pasivo
  filter.Q.value = 0.5;
  
  // Obtener frecuencia de corte del pin, con fallback a WHITE
  const cutoff = PIN_CUTOFF_FREQUENCIES[pinType] ?? PIN_CUTOFF_FREQUENCIES.WHITE;
  
  // Limitar a Nyquist/2 para evitar inestabilidad
  // (aunque para RED será ~589kHz que se clampea a Nyquist internamente)
  filter.frequency.value = cutoff;
  
  return filter;
}

/**
 * Actualiza la frecuencia de corte de un filtro de pin existente.
 * 
 * Útil cuando el usuario cambia el color del pin en tiempo real.
 * Usa setValueAtTime para evitar glitches de audio.
 * 
 * @param {BiquadFilterNode} filter - Filtro a actualizar
 * @param {string} pinType - Nuevo tipo de pin
 * @param {number} [time] - Tiempo de AudioContext para el cambio (default: currentTime)
 * 
 * @example
 * // Cambiar pin de WHITE a CYAN en tiempo real
 * updatePinFilter(filter, 'CYAN', audioCtx.currentTime);
 */
export function updatePinFilter(filter, pinType, time = null) {
  const cutoff = PIN_CUTOFF_FREQUENCIES[pinType] ?? PIN_CUTOFF_FREQUENCIES.WHITE;
  
  if (time !== null) {
    filter.frequency.setValueAtTime(cutoff, time);
  } else {
    filter.frequency.value = cutoff;
  }
}
