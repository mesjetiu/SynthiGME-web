/**
 * OSC Address Mapping - Mapeo de direcciones OSC a controles UI
 * 
 * Define la correspondencia entre las direcciones OSC del protocolo
 * y los identificadores internos de controles en SynthiGME-web.
 * 
 * Las direcciones siguen el formato de la versión SuperCollider:
 * /SynthiGME/{módulo}/{instancia?}/{parámetro}
 * 
 * @module osc/oscAddressMap
 * @see /OSC.md - Documentación completa del protocolo
 */

/**
 * Convierte una dirección OSC a identificador de control interno
 * 
 * @param {string} oscAddress - Dirección OSC completa
 * @param {string} [prefix='/SynthiGME/'] - Prefijo a eliminar
 * @returns {Object|null} { moduleType, moduleIndex, parameter } o null si no válida
 * 
 * @example
 * parseOSCAddress('/SynthiGME/osc/1/frequency')
 * // => { moduleType: 'osc', moduleIndex: 0, parameter: 'frequency' }
 * 
 * parseOSCAddress('/SynthiGME/reverb/mix')
 * // => { moduleType: 'reverb', moduleIndex: null, parameter: 'mix' }
 */
export function parseOSCAddress(oscAddress, prefix = '/SynthiGME/') {
  // Eliminar prefijo
  let path = oscAddress;
  if (path.startsWith(prefix)) {
    path = path.slice(prefix.length);
  } else if (path.startsWith('/')) {
    path = path.slice(1);
  }

  const parts = path.split('/');
  
  if (parts.length < 2) {
    return null;
  }

  const moduleType = parts[0];
  
  // Módulos con índice: osc/1/frequency, filter/2/response, etc.
  if (parts.length >= 3 && !isNaN(parseInt(parts[1]))) {
    return {
      moduleType,
      moduleIndex: parseInt(parts[1]) - 1, // OSC usa 1-based, internamente 0-based
      parameter: parts.slice(2).join('') // Concatenar resto (ej: pulselevel)
    };
  }
  
  // Módulos sin índice: reverb/mix, random/mean, etc.
  return {
    moduleType,
    moduleIndex: null,
    parameter: parts.slice(1).join('')
  };
}

/**
 * Construye una dirección OSC desde identificadores internos
 * 
 * @param {string} moduleType - Tipo de módulo (osc, filter, reverb, etc.)
 * @param {number|null} moduleIndex - Índice del módulo (0-based) o null
 * @param {string} parameter - Nombre del parámetro
 * @param {string} [prefix='/SynthiGME/'] - Prefijo OSC
 * @returns {string} Dirección OSC completa
 * 
 * @example
 * buildOSCAddress('osc', 0, 'frequency')
 * // => '/SynthiGME/osc/1/frequency'
 * 
 * buildOSCAddress('reverb', null, 'mix')
 * // => '/SynthiGME/reverb/mix'
 */
export function buildOSCAddress(moduleType, moduleIndex, parameter, prefix = '/SynthiGME/') {
  if (moduleIndex !== null && moduleIndex !== undefined) {
    // Convertir de 0-based a 1-based para OSC
    return `${prefix}${moduleType}/${moduleIndex + 1}/${parameter}`;
  }
  return `${prefix}${moduleType}/${parameter}`;
}

/**
 * Mapeo de tipos de módulo a sus parámetros válidos
 * Incluye información de rango para conversión de valores
 * 
 * @constant {Object}
 */
export const MODULE_PARAMETERS = {
  // Osciladores (12 instancias)
  osc: {
    indexed: true,
    count: 12,
    parameters: {
      range: { type: 'enum', values: ['lo', 'hi'] },
      frequency: { type: 'float', min: 0, max: 10 },
      pulselevel: { type: 'float', min: 0, max: 10 },
      pulseshape: { type: 'float', min: -5, max: 5 },
      sinelevel: { type: 'float', min: 0, max: 10 },
      sinesymmetry: { type: 'float', min: -5, max: 5 },
      trianglelevel: { type: 'float', min: 0, max: 10 },
      sawtoothlevel: { type: 'float', min: 0, max: 10 }
    }
  },

  // Matriz de audio (Panel 5) — direcciones semánticas
  // Formato: /audio/{source}/{Dest} {pinColor|0}
  // Ej: /audio/osc/1/sinSaw/Out/1 WHITE
  audio: {
    indexed: false,
    parameters: {
      _dynamic: { type: 'matrix', valueType: 'string', values: ['WHITE', 'GREY', 'GREEN', 'RED', 'BLUE', 'YELLOW', 'CYAN', 'PURPLE', 0] }
    }
  },

  // Matriz de control (Panel 6) — direcciones semánticas
  // Formato: /cv/{source}/{Dest} {pinColor|0}
  // Ej: /cv/osc/10/sinSaw/Freq/3 GREY
  cv: {
    indexed: false,
    parameters: {
      _dynamic: { type: 'matrix', valueType: 'string', values: ['WHITE', 'GREY', 'GREEN', 'RED', 'BLUE', 'YELLOW', 'CYAN', 'PURPLE', 0] }
    }
  },

  // Canales de salida (8 instancias)
  out: {
    indexed: true,
    count: 8,
    parameters: {
      level: { type: 'float', min: 0, max: 10 },
      filter: { type: 'float', min: -5, max: 5 },
      on: { type: 'int', values: [0, 1] },
      pan: { type: 'float', min: 0, max: 10 }
    }
  },

  // Amplificadores de entrada (8 instancias)
  in: {
    indexed: true,
    count: 8,
    parameters: {
      level: { type: 'float', min: 0, max: 10 }
    }
  },

  // Retornos de tratamiento externo (2 instancias)
  return: {
    indexed: true,
    count: 2,
    parameters: {
      level: { type: 'float', min: 0, max: 10 }
    }
  },

  // Generadores de envolvente (3 instancias)
  env: {
    indexed: true,
    count: 3,
    parameters: {
      delay: { type: 'float', min: 0, max: 10 },
      attack: { type: 'float', min: 0, max: 10 },
      decay: { type: 'float', min: 0, max: 10 },
      sustain: { type: 'float', min: 0, max: 10 },
      release: { type: 'float', min: 0, max: 10 },
      envelopeLevel: { type: 'float', min: -5, max: 5 },
      signalLevel: { type: 'float', min: -5, max: 5 },
      gate: { type: 'trigger' },
      selector: { type: 'enum' }
    }
  },

  // Moduladores de anillo (3 instancias)
  ring: {
    indexed: true,
    count: 3,
    parameters: {
      level: { type: 'float', min: 0, max: 10 }
    }
  },

  // Generadores de ruido (2 instancias)
  noise: {
    indexed: true,
    count: 2,
    parameters: {
      colour: { type: 'float', min: 0, max: 10 },
      level: { type: 'float', min: 0, max: 10 }
    }
  },

  // Generador aleatorio (único)
  random: {
    indexed: false,
    parameters: {
      mean: { type: 'float', min: -5, max: 5 },
      variance: { type: 'float', min: -5, max: 5 },
      voltage1: { type: 'float', min: 0, max: 10 },
      voltage2: { type: 'float', min: 0, max: 10 },
      key: { type: 'float', min: -5, max: 5 }
    }
  },

  // Limitadores de slew (3 instancias)
  slew: {
    indexed: true,
    count: 3,
    parameters: {
      rate: { type: 'float', min: 0, max: 10 }
    }
  },

  // Filtros (3 instancias)
  filter: {
    indexed: true,
    count: 3,
    parameters: {
      frequency: { type: 'float', min: 0, max: 10 },
      response: { type: 'float', min: 0, max: 10 },
      level: { type: 'float', min: 0, max: 10 }
    }
  },

  // Banco de filtros de octava (único)
  filterBank: {
    indexed: false,
    parameters: {
      '63': { type: 'float', min: 0, max: 10 },
      '125': { type: 'float', min: 0, max: 10 },
      '250': { type: 'float', min: 0, max: 10 },
      '500': { type: 'float', min: 0, max: 10 },
      '1000': { type: 'float', min: 0, max: 10 },
      '2000': { type: 'float', min: 0, max: 10 },
      '4000': { type: 'float', min: 0, max: 10 },
      '8000': { type: 'float', min: 0, max: 10 }
    }
  },

  // Reverberación (único)
  reverb: {
    indexed: false,
    parameters: {
      mix: { type: 'float', min: 0, max: 10 },
      level: { type: 'float', min: 0, max: 10 }
    }
  },

  // Echo/Delay (único)
  echo: {
    indexed: false,
    parameters: {
      delay: { type: 'float', min: 0, max: 10 },
      mix: { type: 'float', min: 0, max: 10 },
      feedback: { type: 'float', min: 0, max: 10 },
      level: { type: 'float', min: 0, max: 10 }
    }
  },

  // Osciloscopio (único)
  oscilloscope: {
    indexed: false,
    parameters: {
      sensCH1: { type: 'float', min: 0, max: 10 },
      sensCH2: { type: 'float', min: 0, max: 10 },
      mode: { type: 'float', min: 0, max: 10 }
    }
  },

  // Teclados (2 instancias)
  keyboard: {
    indexed: true,
    count: 2,
    parameters: {
      midiEvent: { type: 'array' }, // [midinote, velocity, on/off]
      pitch: { type: 'float', min: 0, max: 10 },
      velocity: { type: 'float', min: -5, max: 5 },
      gate: { type: 'float', min: -5, max: 5 },
      retrigger: { type: 'int' }
    }
  },

  // Inversor (único)
  invertor: {
    indexed: false,
    parameters: {
      gain: { type: 'float', min: -5, max: 5 },
      offset: { type: 'float', min: -5, max: 5 }
    }
  },

  // Joysticks (2 instancias)
  joy: {
    indexed: true,
    count: 2,
    parameters: {
      positionX: { type: 'float', min: -1, max: 1 },
      positionY: { type: 'float', min: -1, max: 1 },
      rangeX: { type: 'float', min: 0, max: 10 },
      rangeY: { type: 'float', min: 0, max: 10 }
    }
  }
};

/**
 * Convierte un valor de UI (0-1) a valor real OSC
 * 
 * @param {number} uiValue - Valor normalizado 0-1
 * @param {string} moduleType - Tipo de módulo
 * @param {string} parameter - Nombre del parámetro
 * @returns {number} Valor en escala real
 */
export function uiToOSCValue(uiValue, moduleType, parameter) {
  const module = MODULE_PARAMETERS[moduleType];
  if (!module) return uiValue;
  
  const param = module.parameters[parameter];
  if (!param || param.type !== 'float') return uiValue;
  
  // Mapear 0-1 a min-max
  return param.min + (uiValue * (param.max - param.min));
}

/**
 * Convierte un valor real OSC a valor UI (0-1)
 * 
 * @param {number} oscValue - Valor en escala real
 * @param {string} moduleType - Tipo de módulo
 * @param {string} parameter - Nombre del parámetro
 * @returns {number} Valor normalizado 0-1
 */
export function oscToUIValue(oscValue, moduleType, parameter) {
  const module = MODULE_PARAMETERS[moduleType];
  if (!module) return oscValue;
  
  const param = module.parameters[parameter];
  if (!param || param.type !== 'float') return oscValue;
  
  // Mapear min-max a 0-1
  return (oscValue - param.min) / (param.max - param.min);
}

/**
 * Obtiene información de un parámetro
 * 
 * @param {string} moduleType 
 * @param {string} parameter 
 * @returns {Object|null}
 */
export function getParameterInfo(moduleType, parameter) {
  const module = MODULE_PARAMETERS[moduleType];
  if (!module) return null;
  return module.parameters[parameter] || null;
}
