/**
 * Utilidades compartidas para tooltips de controles (knobs, sliders, etc.)
 * 
 * Proporciona:
 * - Helpers para verificar preferencias de tooltips
 * - Conversión de ganancia a dB
 * - Formateo consistente de valores técnicos
 * 
 * @module utils/tooltipUtils
 */

import { STORAGE_KEYS } from './constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE PREFERENCIAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica si se deben mostrar valores eléctricos (V, Vp-p, Ω) en tooltips.
 * Se lee en cada llamada para reflejar cambios en tiempo real.
 * @returns {boolean}
 */
export function showVoltageTooltip() {
  return localStorage.getItem(STORAGE_KEYS.TOOLTIP_SHOW_VOLTAGE) !== 'false';
}

/**
 * Verifica si se deben mostrar valores de audio (frecuencia, ganancia, dB) en tooltips.
 * Se lee en cada llamada para reflejar cambios en tiempo real.
 * @returns {boolean}
 */
export function showAudioTooltip() {
  return localStorage.getItem(STORAGE_KEYS.TOOLTIP_SHOW_AUDIO_VALUES) !== 'false';
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSIONES DE GANANCIA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convierte ganancia lineal a decibelios (dB).
 * 
 * @param {number} gain - Ganancia lineal (0 = silencio, 1 = 0dB)
 * @returns {string} Valor formateado con unidad, "-∞ dB" para ganancia ≤ 0
 * 
 * @example
 * gainToDb(1.0)    // "0.0 dB"
 * gainToDb(0.5)    // "-6.0 dB"
 * gainToDb(0.1)    // "-20.0 dB"
 * gainToDb(0)      // "-∞ dB"
 */
export function gainToDb(gain) {
  if (gain <= 0) {
    return '-∞ dB';
  }
  const dB = 20 * Math.log10(gain);
  return `${dB.toFixed(1)} dB`;
}

/**
 * Formatea ganancia lineal para display.
 * 
 * @param {number} gain - Ganancia lineal
 * @returns {string} Valor formateado (ej: "×0.50")
 */
export function formatGain(gain) {
  return `×${gain.toFixed(2)}`;
}

/**
 * Formatea voltaje para display.
 * 
 * @param {number} voltage - Voltaje en voltios
 * @param {number} [decimals=1] - Número de decimales
 * @returns {string} Valor formateado con unidad (ej: "-6.0 V")
 */
export function formatVoltage(voltage, decimals = 1) {
  return `${voltage.toFixed(decimals)} V`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatFrequencyHz(hz) {
  if (hz >= 1000) {
    const scaled = hz >= 10000 ? (hz / 1000).toFixed(1) : (hz / 1000).toFixed(2);
    return `${Number(scaled)} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERADORES DE TOOLTIPS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera la información técnica para tooltips de niveles de señal.
 * Muestra Vp-p (si showVoltage), ganancia y dB (si showAudio).
 * 
 * @param {number} maxVpp - Voltaje pico a pico máximo de la señal
 * @returns {function(number, number): string|null} Función getTooltipInfo
 * 
 * @example
 * const getInfo = getLevelTooltipInfo(8.0);
 * getInfo(0.5, 5.0);  // "4.00 Vp-p · ×0.50 · -6.0 dB"
 */
export function getLevelTooltipInfo(maxVpp) {
  return (value, scaleValue) => {
    const parts = [];
    
    if (showVoltageTooltip()) {
      const vpp = (value * maxVpp).toFixed(2);
      parts.push(`${vpp} Vp-p`);
    }
    
    if (showAudioTooltip()) {
      parts.push(formatGain(value));
      parts.push(gainToDb(value));
    }
    
    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

/**
 * Genera tooltip técnico para cutoff de filtros 1982 (CEM3320).
 * @param {Object} options
 * @param {number} [options.referenceCutoffHz=320]
 * @param {number} [options.referenceDial=5]
 * @param {number} [options.octaveDialSpan=0.7]
 * @param {number} [options.minCutoffHz=5]
 * @param {number} [options.maxCutoffHz=20000]
 * @returns {function(number): string|null}
 */
export function getFilterFrequencyTooltipInfo({
  referenceCutoffHz = 320,
  referenceDial = 5,
  octaveDialSpan = 0.7,
  voltsPerOctave = 0.55,
  minCutoffHz = 5,
  maxCutoffHz = 20000
} = {}) {
  return (dialValue) => {
    const parts = [];
    const octaves = (dialValue - referenceDial) / octaveDialSpan;
    const cutoffHz = clamp(referenceCutoffHz * Math.pow(2, octaves), minCutoffHz, maxCutoffHz);
    const controlVoltage = octaves * voltsPerOctave;

    if (showAudioTooltip()) {
      parts.push(`fc ≈ ${formatFrequencyHz(cutoffHz)}`);
    }

    if (showVoltageTooltip()) {
      parts.push(`ΣCV ${formatVoltage(controlVoltage, 2)}`);
    }

    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

/**
 * Genera tooltip técnico para resonancia/response de filtros 1982.
 * @param {number} [maxQ=20]
 * @param {number} [selfOscillationThreshold=5.5]
 * @returns {function(number): string|null}
 */
export function getFilterResponseTooltipInfo(maxQ = 20, selfOscillationThreshold = 5.5) {
  return (dialValue) => {
    if (!showAudioTooltip()) return null;

    const q = 0.7 + (clamp(dialValue, 0, 10) / 10) * (maxQ - 0.7);
    const parts = [`Q ≈ ${q.toFixed(q >= 10 ? 0 : 1)}`];
    if (dialValue >= selfOscillationThreshold) {
      parts.push('self-osc');
    }
    return parts.join(' · ');
  };
}

/**
 * Genera tooltip técnico para el mando Signal Level de filtros.
 * Potenciómetro LOG 10k: muestra la ganancia efectiva y el techo equivalente
 * de oscilación (hasta 5 Vp-p a ganancia máxima).
 * @param {number} [maxVpp=5]
 * @param {number} [logBase=100]
 * @returns {function(number): string|null}
 */
export function getFilterLevelTooltipInfo(maxVpp = 5, logBase = 100) {
  return (dialValue) => {
    const parts = [];

    let gain;
    if (dialValue <= 0) {
      gain = 0;
    } else {
      const normalized = clamp(dialValue, 0, 10) / 10;
      gain = (Math.pow(logBase, normalized) - 1) / (logBase - 1);
    }

    if (showVoltageTooltip()) {
      parts.push(`${(gain * maxVpp).toFixed(2)} Vp-p max`);
    }

    if (showAudioTooltip()) {
      parts.push(formatGain(gain));
      parts.push(gainToDb(gain));
    }

    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

/**
 * Genera la información técnica para tooltips de VCA (faders de salida).
 * Muestra voltaje de control (-12V a 0V), ganancia y dB.
 * 
 * @param {function(number, number): number} vcaDialToVoltage - Función de conversión dial→voltaje
 * @param {function(number, number): number} vcaCalculateGain - Función de cálculo de ganancia
 * @param {function(): number} [getExternalCV] - Función que devuelve el CV externo actual
 * @returns {function(number): string|null} Función que genera info del tooltip
 * 
 * @example
 * const getInfo = getVCATooltipInfo(vcaDialToVoltage, vcaCalculateGain, () => externalCV);
 * getInfo(5.0);  // "-6.0 V · ×0.001 · -60.0 dB"
 */
export function getVCATooltipInfo(vcaDialToVoltage, vcaCalculateGain, getExternalCV = () => 0) {
  return (dialValue) => {
    const parts = [];
    const externalCV = getExternalCV();
    
    // Calcular voltaje de control del VCA
    if (showVoltageTooltip()) {
      const voltage = vcaDialToVoltage(dialValue);
      const totalVoltage = voltage + externalCV;
      // Mostrar voltaje base si no hay CV, o total si hay CV
      if (externalCV !== 0) {
        parts.push(`${formatVoltage(totalVoltage)} (${formatVoltage(voltage)}+CV)`);
      } else {
        parts.push(formatVoltage(totalVoltage));
      }
    }
    
    // Calcular ganancia y dB
    if (showAudioTooltip()) {
      const gain = vcaCalculateGain(dialValue, externalCV);
      parts.push(formatGain(gain));
      parts.push(gainToDb(gain));
    }
    
    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOLTIPS PARA NOISE GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera información para tooltip del knob COLOUR del noise generator.
 * Muestra tipo de ruido y frecuencia de corte del filtro.
 * 
 * Dial 0  → "LP · fc ≈ 965 Hz" (ruido oscuro/rosa)
 * Dial 5  → "White noise" (espectro plano)
 * Dial 10 → "HP · +6 dB shelf" (ruido brillante/azul)
 * 
 * @param {number} fcHz - Frecuencia de corte del filtro en Hz (≈ 965 para el Synthi 100)
 * @returns {function(number, number): string|null} Función getTooltipInfo
 */
export function getNoiseColourTooltipInfo(fcHz) {
  return (dialValue, scaleValue) => {
    if (!showAudioTooltip()) return null;
    
    // Posición bipolar: 0→-1, 5→0, 10→+1
    const p = (dialValue / 5) - 1;
    const absp = Math.abs(p);
    
    if (absp < 0.02) {
      return 'White noise';
    } else if (p < 0) {
      // LP — ruido oscuro
      return `LP · fc ≈ ${Math.round(fcHz)} Hz`;
    } else {
      // HP — ruido brillante
      return `HP · +6 dB shelf`;
    }
  };
}

/**
 * Genera información para tooltip del knob LEVEL del noise generator.
 * Muestra Vp-p, ganancia LOG y dB.
 * 
 * La ganancia se calcula con la curva LOG del pot real:
 *   gain = (B^(dial/max) - 1) / (B - 1)
 * 
 * @param {number} maxVpp - Voltaje pico a pico máximo (~3V para el Synthi 100)
 * @param {number} logBase - Base de la curva logarítmica (100 para audio taper)
 * @returns {function(number, number): string|null} Función getTooltipInfo
 */
export function getNoiseLevelTooltipInfo(maxVpp, logBase) {
  return (dialValue, scaleValue) => {
    const parts = [];
    
    // Calcular ganancia LOG
    let gain;
    if (dialValue <= 0) {
      gain = 0;
    } else {
      const normalized = dialValue / 10;
      gain = (Math.pow(logBase, normalized) - 1) / (logBase - 1);
    }
    
    if (showVoltageTooltip()) {
      const vpp = (gain * maxVpp).toFixed(2);
      parts.push(`${vpp} Vp-p`);
    }
    
    if (showAudioTooltip()) {
      parts.push(formatGain(gain));
      parts.push(gainToDb(gain));
    }
    
    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RANDOM CONTROL VOLTAGE GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera información para tooltip del knob MEAN del Random CV Generator.
 * Muestra la frecuencia del reloj (Hz), el período (ms/s) y el voltaje
 * interno equivalente (dato informativo, no hay entrada CV de matriz).
 *
 * Mapeo exponencial: dial -5 → 0.2 Hz, dial 0 → ~2 Hz, dial +5 → 20 Hz
 *   freq = 0.2 × 100^((dial + 5) / 10)
 *
 * El voltaje interno mostrado corresponde a la sensibilidad de 0.55V/octava
 * del circuito original (placa PC-21).
 *
 * @param {number} [voltsPerOctave=0.55] - Sensibilidad CV del Mean Rate
 * @returns {function(number, number): string|null} Función getTooltipInfo
 */
export function getRandomCVMeanTooltipInfo(voltsPerOctave = 0.55) {
  const minFreq = 0.2;
  const freqRatio = 100; // 20 / 0.2
  
  return (dialValue) => {
    const parts = [];
    
    // Calcular frecuencia
    const normalized = (dialValue + 5) / 10; // 0..1
    const freq = minFreq * Math.pow(freqRatio, normalized);
    
    if (showAudioTooltip()) {
      // Frecuencia
      parts.push(`${freq.toFixed(1)} Hz`);
      
      // Período en unidad legible
      const period = 1 / freq;
      if (period >= 1) {
        parts.push(`${period.toFixed(1)} s`);
      } else {
        parts.push(`${(period * 1000).toFixed(0)} ms`);
      }
    }
    
    if (showVoltageTooltip()) {
      // Voltaje interno equivalente (informativo)
      // Referencia: 0V = frecuencia central (~2 Hz)
      // Cada 0.55V = 1 octava
      const octavesFromCenter = (dialValue) / (10 / Math.log2(freqRatio));
      const voltage = octavesFromCenter * voltsPerOctave;
      parts.push(`${voltage >= 0 ? '+' : ''}${voltage.toFixed(2)}V`);
    }
    
    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

/**
 * Genera información para tooltip del knob VARIANCE del Random CV Generator.
 * Muestra el porcentaje de varianza y una descripción textual.
 *
 * Mapeo lineal: dial -5 → 0% (constante), dial +5 → 100% (máxima irregularidad)
 *
 * @returns {function(number, number): string|null} Función getTooltipInfo
 */
export function getRandomCVVarianceTooltipInfo() {
  return (dialValue) => {
    if (!showAudioTooltip()) return null;
    
    const pct = ((dialValue + 5) / 10) * 100;
    
    if (pct <= 0) {
      return 'Constante';
    } else if (pct < 25) {
      return `${pct.toFixed(0)}% · Estable`;
    } else if (pct < 75) {
      return `${pct.toFixed(0)}% · Moderada`;
    } else {
      return `${pct.toFixed(0)}% · Máxima`;
    }
  };
}

/**
 * Genera información para tooltip de los knobs VOLTAGE 1 / VOLTAGE 2 del Random CV.
 * Muestra voltaje pico (±V), ganancia y dB.
 *
 * Usa curva LOG idéntica a la del potenciómetro 10K logarítmico (D100-21 W1).
 * Voltaje máximo de salida: ±2.5V (5V pico a pico).
 *
 * @param {number} [maxVoltage=2.5] - Voltaje pico máximo (±V)
 * @param {number} [logBase=100] - Base de la curva logarítmica
 * @returns {function(number, number): string|null} Función getTooltipInfo
 */
export function getRandomCVVoltageLevelTooltipInfo(maxVoltage = 2.5, logBase = 100) {
  return (dialValue) => {
    const parts = [];
    
    // Calcular ganancia LOG (misma curva que noise level)
    let gain;
    if (dialValue <= 0) {
      gain = 0;
    } else {
      const normalized = dialValue / 10;
      gain = (Math.pow(logBase, normalized) - 1) / (logBase - 1);
    }
    
    if (showVoltageTooltip()) {
      const vpeak = (gain * maxVoltage).toFixed(2);
      parts.push(`±${vpeak}V`);
    }
    
    if (showAudioTooltip()) {
      parts.push(formatGain(gain));
      parts.push(gainToDb(gain));
    }
    
    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

/**
 * Genera información para tooltip del knob KEY del Random CV Generator.
 * Muestra el voltaje del pulso y su ancho (5ms fijo).
 *
 * Mapeo lineal bipolar: dial -5 → -5V, dial 0 → sin pulso, dial +5 → +5V
 *
 * @param {number} [pulseWidthMs=5] - Ancho del pulso en ms
 * @returns {function(number, number): string|null} Función getTooltipInfo
 */
export function getRandomCVKeyTooltipInfo(pulseWidthMs = 5) {
  return (dialValue) => {
    if (!showVoltageTooltip() && !showAudioTooltip()) return null;
    
    const voltage = dialValue; // directo: dial = voltaje
    
    if (Math.abs(voltage) < 0.05) {
      return 'Sin pulso';
    }
    
    const sign = voltage > 0 ? '+' : '';
    return `${sign}${voltage.toFixed(1)}V · ${pulseWidthMs} ms`;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD TOOLTIPS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tooltip para el knob Pitch Spread del teclado.
 *
 * Muestra:
 * - V/Oct a la posición actual del dial (a spread=9 → 1.00 V/Oct)
 * - Span total sobre 5 octavas (a spread=9 → 5.00V)
 *
 * @param {number} [spreadUnity=9] - Valor del dial que da 1V/Oct
 * @param {number} [octaves=5] - Número de octavas del teclado
 * @returns {function(number, number): string|null}
 */
export function getKeyboardPitchSpreadTooltipInfo(spreadUnity = 9, octaves = 5) {
  return (_value, scaleValue) => {
    const parts = [];

    // V/Oct
    const vPerOct = spreadUnity > 0 ? scaleValue / spreadUnity : 0;

    if (showVoltageTooltip()) {
      parts.push(`${vPerOct.toFixed(3)} V/Oct`);
      const span = vPerOct * octaves;
      parts.push(`${span.toFixed(2)}V span`);
    }

    if (showAudioTooltip()) {
      const centsPerSemitone = (vPerOct * 1200) / 12;
      parts.push(`${centsPerSemitone.toFixed(0)} cents/st`);
    }

    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

/**
 * Tooltip para el knob Key Velocity del teclado.
 *
 * Muestra el voltaje máximo (vel=127): directo del dial.
 * A dial=0 muestra "Sin efecto".
 *
 * @returns {function(number, number): string|null}
 */
export function getKeyboardVelocityTooltipInfo() {
  return (_value, scaleValue) => {
    if (!showVoltageTooltip() && !showAudioTooltip()) return null;

    if (Math.abs(scaleValue) < 0.05) {
      return 'Sin efecto';
    }

    const parts = [];

    if (showVoltageTooltip()) {
      const sign = scaleValue > 0 ? '+' : '';
      parts.push(`Vmax ${sign}${scaleValue.toFixed(1)}V`);
    }

    if (showAudioTooltip()) {
      const digital = scaleValue / 4; // DIGITAL_TO_VOLTAGE
      parts.push(`${digital.toFixed(2)} dig`);
    }

    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

/**
 * Tooltip para el knob Env. Control (gate level) del teclado.
 *
 * Muestra el voltaje del pulso gate: directo del dial.
 * A dial=0 muestra "Sin gate".
 *
 * @returns {function(number, number): string|null}
 */
export function getKeyboardGateTooltipInfo() {
  return (_value, scaleValue) => {
    if (!showVoltageTooltip() && !showAudioTooltip()) return null;

    if (Math.abs(scaleValue) < 0.05) {
      return 'Sin gate';
    }

    const parts = [];

    if (showVoltageTooltip()) {
      const sign = scaleValue > 0 ? '+' : '';
      parts.push(`Gate ${sign}${scaleValue.toFixed(1)}V`);
    }

    if (showAudioTooltip()) {
      const digital = scaleValue / 4; // DIGITAL_TO_VOLTAGE
      parts.push(`${digital.toFixed(2)} dig`);
    }

    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REVERB TOOLTIPS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera tooltip para el knob Mix de la reverb.
 * Muestra porcentaje wet y voltaje equivalente.
 *
 * @returns {function(number): string|null}
 */
export function getReverbMixTooltipInfo() {
  return (dialValue) => {
    const parts = [];
    const mixNorm = clamp(dialValue, 0, 10) / 10;

    if (showAudioTooltip()) {
      const pct = (mixNorm * 100).toFixed(0);
      parts.push(`${pct}% wet`);
    }

    if (showVoltageTooltip()) {
      // ±2V cubre rango completo, dial 5 = 0V
      const voltage = (dialValue - 5) * 0.4;
      parts.push(`${voltage >= 0 ? '+' : ''}${voltage.toFixed(1)} V`);
    }

    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

/**
 * Genera tooltip para el knob Level de la reverb.
 * Muestra ganancia y dB (curva log base 100).
 *
 * @param {number} [maxVpp=5] - Voltaje pico a pico máximo
 * @param {number} [logBase=100] - Base logarítmica de la curva
 * @returns {function(number): string|null}
 */
export function getReverbLevelTooltipInfo(maxVpp = 5, logBase = 100) {
  return (dialValue) => {
    const parts = [];

    let gain;
    if (dialValue <= 0) {
      gain = 0;
    } else {
      const normalized = clamp(dialValue, 0, 10) / 10;
      gain = (Math.pow(logBase, normalized) - 1) / (logBase - 1);
    }

    if (showVoltageTooltip()) {
      parts.push(`${(gain * maxVpp).toFixed(2)} Vp-p max`);
    }

    if (showAudioTooltip()) {
      parts.push(formatGain(gain));
      parts.push(gainToDb(gain));
    }

    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

/**
 * Genera tooltip para el knob Level del Ring Modulator.
 * Muestra ganancia y dB (curva log base 100).
 * Misma curva logarítmica que el Level de la reverb (10K LOG pot).
 *
 * @param {number} [maxVpp=8] - Voltaje pico a pico máximo de entrada
 * @param {number} [logBase=100] - Base logarítmica de la curva
 * @returns {function(number): string|null}
 */
export function getRingModLevelTooltipInfo(maxVpp = 8, logBase = 100) {
  return (dialValue) => {
    const parts = [];

    let gain;
    if (dialValue <= 0) {
      gain = 0;
    } else {
      const normalized = clamp(dialValue, 0, 10) / 10;
      gain = (Math.pow(logBase, normalized) - 1) / (logBase - 1);
    }

    if (showVoltageTooltip()) {
      parts.push(`${(gain * maxVpp).toFixed(2)} Vp-p max`);
    }

    if (showAudioTooltip()) {
      parts.push(formatGain(gain));
      parts.push(gainToDb(gain));
    }

    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOLTIPS PARA ENVELOPE SHAPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera tooltip para knobs de tiempo (Delay, Attack, Decay, Release)
 * del Envelope Shaper. Conversión exponencial dial 0-10 → 1ms-20s.
 *
 * @param {number} [minMs=1] - Tiempo mínimo en ms
 * @param {number} [maxMs=20000] - Tiempo máximo en ms
 * @returns {function(number): string|null}
 */
export function getEnvelopeShaperTimeTooltipInfo(minMs = 1, maxMs = 20000) {
  const ratio = maxMs / minMs;
  return (dialValue) => {
    if (!showAudioTooltip()) return null;
    const normalized = clamp(dialValue, 0, 10) / 10;
    const timeMs = minMs * Math.pow(ratio, normalized);
    if (timeMs >= 1000) {
      return `${(timeMs / 1000).toFixed(2)} s`;
    }
    return `${timeMs.toFixed(1)} ms`;
  };
}

/**
 * Genera tooltip para el knob Sustain del Envelope Shaper.
 * Muestra porcentaje del nivel pico.
 *
 * @returns {function(number): string|null}
 */
export function getEnvelopeShaperSustainTooltipInfo() {
  return (dialValue) => {
    if (!showAudioTooltip()) return null;
    const pct = clamp(dialValue, 0, 10) * 10;
    return `${pct.toFixed(0)}%`;
  };
}

/**
 * Genera tooltip para el knob Envelope Level (bipolar ±5V).
 * Muestra voltaje y polaridad.
 *
 * @returns {function(number): string|null}
 */
export function getEnvelopeShaperEnvLevelTooltipInfo() {
  return (dialValue) => {
    const parts = [];
    if (showVoltageTooltip()) {
      parts.push(`${dialValue >= 0 ? '+' : ''}${dialValue.toFixed(1)} V`);
    }
    if (showAudioTooltip()) {
      if (Math.abs(dialValue) < 0.01) {
        parts.push('off');
      } else {
        parts.push(dialValue > 0 ? 'normal' : 'inverted');
      }
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

/**
 * Genera tooltip para el knob Signal Level del Envelope Shaper.
 * Potenciómetro LOG 10K: ganancia y dB.
 *
 * @param {number} [maxVpp=3] - Voltaje pico a pico máximo de la señal
 * @param {number} [logBase=100] - Base de la curva logarítmica
 * @returns {function(number): string|null}
 */
export function getEnvelopeShaperSignalLevelTooltipInfo(maxVpp = 3, logBase = 100) {
  return (dialValue) => {
    const parts = [];
    let gain;
    if (dialValue <= 0) {
      gain = 0;
    } else {
      const normalized = clamp(dialValue, 0, 10) / 10;
      gain = (Math.pow(logBase, normalized) - 1) / (logBase - 1);
    }
    if (showVoltageTooltip()) {
      parts.push(`${(gain * maxVpp).toFixed(2)} Vp-p`);
    }
    if (showAudioTooltip()) {
      parts.push(formatGain(gain));
      parts.push(gainToDb(gain));
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

/**
 * Genera tooltip para el selector de modo del Envelope Shaper.
 *
 * @param {string[]} modeNames - Array con los nombres de los 5 modos
 * @returns {function(number): string|null}
 */
export function getEnvelopeShaperModeTooltipInfo(modeNames) {
  return (dialValue) => {
    const index = clamp(Math.round(dialValue), 0, modeNames.length - 1);
    return modeNames[index];
  };
}