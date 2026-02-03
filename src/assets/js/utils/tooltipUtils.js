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
