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
      console.warn(`[Conversions] Unknown curve type: ${curve}, using linear`);
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
