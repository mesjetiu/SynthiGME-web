/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STATE SCHEMA - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Define la estructura y validación de los patches/estados guardados.
 * Los valores se almacenan en unidades físicas (Hz, ms, ratios 0-1) para
 * ser independientes de la calibración de los knobs.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Versión actual del formato de patches.
 * Incrementar cuando cambie la estructura del schema.
 */
export const FORMAT_VERSION = 1;

/**
 * IDs fijos de módulos del sintetizador.
 * Estos IDs son estables y no deben cambiar.
 */
export const MODULE_IDS = {
  // Osciladores (Panel 3) - 12 osciladores
  oscillators: ['osc1', 'osc2', 'osc3', 'osc4', 'osc5', 'osc6', 
                'osc7', 'osc8', 'osc9', 'osc10', 'osc11', 'osc12'],
  
  // Generadores de ruido - 2 unidades
  noise: ['noise1', 'noise2'],
  
  // Generadores de voltaje aleatorio - 2 unidades
  randomVoltage: ['random1', 'random2'],
  
  // Input Amplifiers - 8 canales
  inputAmplifiers: ['input1', 'input2', 'input3', 'input4',
                    'input5', 'input6', 'input7', 'input8'],
  
  // Output Faders - 4 canales estéreo (8 total)
  outputFaders: ['out1', 'out2', 'out3', 'out4'],
  
  // Osciloscopio (Panel 2)
  oscilloscope: ['scope']
};

/**
 * Descriptores de parámetros para cada tipo de módulo.
 * Define unidades, rangos y funciones de conversión knob↔físico.
 */
export const PARAM_DESCRIPTORS = {
  
  // ─────────────────────────────────────────────────────────────────────────
  // OSCILADORES
  // ─────────────────────────────────────────────────────────────────────────
  oscillator: {
    frequency: {
      unit: 'Hz',
      defaultRange: [1, 10000],
      defaultCurve: 'quadratic',
      defaultValue: 10
    },
    pulseLevel: {
      unit: 'ratio',
      range: [0, 1],
      curve: 'linear',
      defaultValue: 0
    },
    pulseWidth: {
      unit: 'ratio',
      range: [0.01, 0.99],
      curve: 'linear',
      defaultValue: 0.5
    },
    sineLevel: {
      unit: 'ratio',
      range: [0, 1],
      curve: 'linear',
      defaultValue: 0
    },
    sineSymmetry: {
      unit: 'ratio',
      range: [0, 1],
      curve: 'linear',
      defaultValue: 0.5
    },
    triangleLevel: {
      unit: 'ratio',
      range: [0, 1],
      curve: 'linear',
      defaultValue: 0
    },
    sawtoothLevel: {
      unit: 'ratio',
      range: [0, 1],
      curve: 'linear',
      defaultValue: 0
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // GENERADORES DE RUIDO
  // ─────────────────────────────────────────────────────────────────────────
  noise: {
    colour: {
      unit: 'ratio',
      range: [0, 1],  // 0 = white, 1 = pink
      curve: 'linear',
      defaultValue: 0
    },
    level: {
      unit: 'ratio',
      range: [0, 1],
      curve: 'linear',
      defaultValue: 0
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // INPUT AMPLIFIERS
  // ─────────────────────────────────────────────────────────────────────────
  inputAmplifier: {
    level: {
      unit: 'ratio',
      range: [0, 1],
      curve: 'linear',
      defaultValue: 0
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // OUTPUT FADERS
  // ─────────────────────────────────────────────────────────────────────────
  outputFader: {
    levelLeft: {
      unit: 'ratio',
      range: [0, 1],
      curve: 'linear',
      defaultValue: 0
    },
    levelRight: {
      unit: 'ratio',
      range: [0, 1],
      curve: 'linear',
      defaultValue: 0
    },
    filter: {
      unit: 'ratio',
      range: [0, 1],  // 0 = A (bass), 1 = B (treble)
      curve: 'linear',
      defaultValue: 0.5
    },
    pan: {
      unit: 'ratio',
      range: [-1, 1],  // -1 = left, 0 = center, 1 = right
      curve: 'linear',
      defaultValue: 0
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // OSCILOSCOPIO
  // ─────────────────────────────────────────────────────────────────────────
  oscilloscope: {
    timeScale: {
      unit: 'ms/div',
      defaultRange: [0.1, 100],
      defaultCurve: 'exponential',
      defaultValue: 10
    },
    amplitudeX: {
      unit: 'ratio',
      range: [0, 1],
      curve: 'linear',
      defaultValue: 0.5
    },
    amplitudeY: {
      unit: 'ratio',
      range: [0, 1],
      curve: 'linear',
      defaultValue: 0.5
    },
    mode: {
      type: 'enum',
      values: ['yt', 'xy'],
      defaultValue: 'yt'
    }
  }
};

/**
 * Estructura de un patch vacío/inicial.
 * Útil para crear nuevos patches o como fallback.
 */
export function createEmptyPatch(name = 'Init') {
  return {
    formatVersion: FORMAT_VERSION,
    appVersion: window.__synthBuildVersion || 'dev',
    savedAt: new Date().toISOString(),
    name,
    
    modules: {},
    
    matrix: {
      audio: [],
      control: []
    },
    
    routing: {
      outputs: {},
      inputs: {}
    }
  };
}

/**
 * Valida la estructura básica de un patch.
 * @param {Object} patch - Patch a validar
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validatePatch(patch) {
  const errors = [];
  
  if (!patch || typeof patch !== 'object') {
    return { valid: false, errors: ['Patch is not an object'] };
  }
  
  if (typeof patch.formatVersion !== 'number') {
    errors.push('Missing or invalid formatVersion');
  }
  
  if (patch.formatVersion > FORMAT_VERSION) {
    errors.push(`Patch version (${patch.formatVersion}) is newer than supported (${FORMAT_VERSION})`);
  }
  
  if (typeof patch.name !== 'string' || !patch.name.trim()) {
    errors.push('Missing or invalid patch name');
  }
  
  if (!patch.modules || typeof patch.modules !== 'object') {
    errors.push('Missing or invalid modules object');
  }
  
  if (!patch.matrix || typeof patch.matrix !== 'object') {
    errors.push('Missing or invalid matrix object');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Obtiene el descriptor de parámetro para un módulo y parámetro dados.
 * @param {string} moduleType - Tipo de módulo (oscillator, noise, etc.)
 * @param {string} paramName - Nombre del parámetro
 * @returns {Object|null} Descriptor o null si no existe
 */
export function getParamDescriptor(moduleType, paramName) {
  return PARAM_DESCRIPTORS[moduleType]?.[paramName] || null;
}
