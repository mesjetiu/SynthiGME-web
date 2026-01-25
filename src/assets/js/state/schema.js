/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STATE SCHEMA - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Define la estructura y validación de los patches/estados guardados.
 * 
 * ARQUITECTURA v2 (FORMAT_VERSION = 2)
 * ─────────────────────────────────────
 * Los patches almacenan VALORES DE UI (posiciones de knobs 0-1, estados de
 * switches, conexiones de matriz). NO almacenan valores de audio (Hz, ms).
 * 
 * Beneficios:
 * - Patches más simples y compactos
 * - Cambiar fórmulas de conversión no rompe patches
 * - Menor complejidad en serialización/deserialización
 * 
 * PARAM_DESCRIPTORS se mantiene solo como DOCUMENTACIÓN de rangos físicos
 * para displays, tooltips y validación - NO se usa en la persistencia.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS SERIALIZABLES - Contratos para módulos con serialize/deserialize
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Contrato base para módulos serializables.
 * Cualquier clase que implemente serialize/deserialize debe seguir este patrón.
 * 
 * @typedef {Object} Serializable
 * @property {function(): SerializedState} serialize - Retorna el estado actual
 * @property {function(SerializedState): void} deserialize - Restaura estado desde datos
 */

/**
 * Estado base serializado. Todos los estados extienden de este.
 * @typedef {Object} SerializedState
 */

/**
 * Estado serializado de un oscilador SGME.
 * Usa array de knobs por razones históricas (orden fijo de parámetros).
 * 
 * @typedef {Object} OscillatorState
 * @property {number[]} knobs - Array de 7 valores [pulseLevel, pulseWidth, sineLevel, sineSymmetry, triangleLevel, sawtoothLevel, frequency]
 * @property {'hi'|'lo'} rangeState - Rango de frecuencia activo
 * 
 * @example
 * { knobs: [0, 0.5, 0, 0.5, 0, 0, 0], rangeState: 'hi' }
 */

/**
 * Estado serializado de módulos basados en ModuleUI.
 * Usa objeto con claves dinámicas según definición de knobs.
 * Aplica a: NoiseGenerator, RandomVoltage, y futuros módulos.
 * 
 * @typedef {Object.<string, number>} KnobModuleState
 * 
 * @example
 * // NoiseGenerator
 * { colour: 0.5, level: 0.3 }
 * 
 * @example
 * // RandomVoltage
 * { mean: 0.5, variance: 0.5, voltage1: 0, voltage2: 0, key: 0.5 }
 */

/**
 * Estado serializado de módulos con array de niveles.
 * Aplica a: InputAmplifierUI, OutputFaderModule.
 * 
 * @typedef {Object} LevelsState
 * @property {number[]} levels - Array de valores 0-1, uno por canal
 * 
 * @example
 * { levels: [0, 0.5, 0.3, 0, 0, 0, 0, 0] }
 */

/**
 * Estado serializado de matrices de conexión.
 * Aplica a: LargeMatrix (audio y control).
 * 
 * @typedef {Object} MatrixState
 * @property {Array<[number, number]>} connections - Array de pares [row, col]
 * 
 * @example
 * { connections: [[0, 5], [3, 12], [7, 45]] }
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Versión actual del formato de patches.
 * 
 * HISTORIAL:
 * - v1: Formato original (valores de audio). OBSOLETO.
 * - v2: Valores de UI (knob positions 0-1, switch states). ACTUAL.
 * 
 * Los patches v1 no son compatibles y no se migran.
 */
export const FORMAT_VERSION = 2;

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
 * 
 * NOTA: Estos descriptores son solo para DOCUMENTACIÓN y displays.
 * NO se usan en la serialización de patches (que guardan valores UI 0-1).
 * 
 * Útiles para:
 * - Mostrar valores físicos en tooltips (e.g., "440 Hz")
 * - Validación de rangos
 * - Documentación de la API
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

/**
 * Crea un patch con todos los módulos en sus valores por defecto.
 * Útil para resetear el sintetizador sin recargar la página.
 * @param {string} [name='Init'] - Nombre del patch
 * @returns {Object} Patch con estado inicial
 */
export function createDefaultPatch(name = 'Init') {
  // Valores por defecto para osciladores:
  // knobs: [pulseLevel, pulseWidth, sineLevel, sineSymmetry, triangleLevel, sawtoothLevel, frequency]
  // Los valores 0..1 son normalizados, frequency 0 corresponde al mínimo del rango
  const defaultOscillator = {
    knobs: [0, 0.5, 0, 0.5, 0, 0, 0],
    rangeState: 'hi'
  };
  
  // Valores por defecto para noise (ModuleUI): { colour: 0, level: 0 }
  const defaultNoise = { colour: 0, level: 0 };
  
  // Valores por defecto para random voltage (ModuleUI):
  // { mean: 0.5, variance: 0.5, voltage1: 0, voltage2: 0, key: 0.5 }
  const defaultRandomVoltage = { mean: 0.5, variance: 0.5, voltage1: 0, voltage2: 0, key: 0.5 };
  
  // Valores por defecto para input amplifiers: { levels: [8 valores a 0] }
  // Se guarda con ID 'input-amplifiers' como clave
  const defaultInputAmplifiers = {
    levels: Array(8).fill(0)
  };
  
  // Valores por defecto para output faders: { levels: [valores a 0] }
  // Número de sliders = 8 (4 canales x 2: left y right)
  const defaultOutputFaders = {
    levels: Array(8).fill(0)
  };
  
  return {
    formatVersion: FORMAT_VERSION,
    appVersion: window.__synthBuildVersion || 'dev',
    savedAt: new Date().toISOString(),
    name,
    
    modules: {
      oscillators: Object.fromEntries(
        MODULE_IDS.oscillators.map(id => [id, { ...defaultOscillator }])
      ),
      noise: Object.fromEntries(
        MODULE_IDS.noise.map(id => [id, { ...defaultNoise }])
      ),
      randomVoltage: Object.fromEntries(
        MODULE_IDS.randomVoltage.map(id => [id, { ...defaultRandomVoltage }])
      ),
      // Input amplifiers: objeto con ID como clave
      inputAmplifiers: {
        'input-amplifiers': defaultInputAmplifiers
      },
      outputFaders: defaultOutputFaders,
      matrixAudio: { connections: [] },
      matrixControl: { connections: [] }
    },
    
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

// ═══════════════════════════════════════════════════════════════════════════
// VALIDACIÓN DE DATOS SERIALIZADOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Valida datos serializados contra un esquema de propiedades.
 * Útil para debugging y validación opcional en deserialize().
 * 
 * @param {Object} data - Datos a validar
 * @param {Object} schema - Esquema de validación
 * @param {string} schema[].type - Tipo esperado: 'number', 'string', 'array', 'enum'
 * @param {boolean} [schema[].required=false] - Si la propiedad es obligatoria
 * @param {[number, number]} [schema[].range] - Rango válido para números [min, max]
 * @param {*[]} [schema[].values] - Valores válidos para enums
 * @param {number} [schema[].length] - Longitud exacta para arrays
 * @returns {{valid: boolean, errors: string[]}}
 * 
 * @example
 * const schema = {
 *   colour: { type: 'number', range: [0, 1] },
 *   level: { type: 'number', range: [0, 1], required: true }
 * };
 * const result = validateSerializedData({ colour: 0.5 }, schema);
 * // { valid: false, errors: ['Missing required key: level'] }
 */
export function validateSerializedData(data, schema) {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Data is not an object'] };
  }
  
  for (const [key, descriptor] of Object.entries(schema)) {
    const value = data[key];
    
    // Verificar requerido
    if (value === undefined) {
      if (descriptor.required) {
        errors.push(`Missing required key: ${key}`);
      }
      continue;
    }
    
    // Validar tipo
    switch (descriptor.type) {
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          errors.push(`${key} must be a valid number`);
        } else if (descriptor.range) {
          const [min, max] = descriptor.range;
          if (value < min || value > max) {
            errors.push(`${key} (${value}) out of range [${min}, ${max}]`);
          }
        }
        break;
        
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${key} must be a string`);
        }
        break;
        
      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${key} must be an array`);
        } else if (descriptor.length !== undefined && value.length !== descriptor.length) {
          errors.push(`${key} must have exactly ${descriptor.length} elements`);
        }
        break;
        
      case 'enum':
        if (!descriptor.values?.includes(value)) {
          errors.push(`${key} must be one of: ${descriptor.values?.join(', ')}`);
        }
        break;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Esquemas predefinidos para validación de estados serializados.
 * Uso opcional en métodos deserialize() para debugging.
 */
export const SERIALIZATION_SCHEMAS = {
  /** Esquema para OscillatorState */
  oscillator: {
    knobs: { type: 'array', length: 7, required: true },
    rangeState: { type: 'enum', values: ['hi', 'lo'], required: true }
  },
  
  /** Esquema para LevelsState (InputAmplifier, OutputFader) */
  levels: {
    levels: { type: 'array', required: true }
  },
  
  /** Esquema para MatrixState */
  matrix: {
    connections: { type: 'array', required: true }
  }
};
