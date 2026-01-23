// ═══════════════════════════════════════════════════════════════════════════
// AUDIO MATRIX CONFIG
// ═══════════════════════════════════════════════════════════════════════════
//
// Configuración de la matriz de audio (Panel 5) del Synthi 100.
// Controla ganancias, niveles y calibración de las conexiones de audio.
//
// NOTA: Este archivo es INDEPENDIENTE del blueprint (panel5.audio.blueprint.js).
// - Blueprint: define UI, pines ocultos, mapeo de fuentes/destinos
// - Config: define comportamiento de audio, ganancias, calibración
//
// ─────────────────────────────────────────────────────────────────────────────
// JERARQUÍA DE GANANCIAS
// ─────────────────────────────────────────────────────────────────────────────
//
// La señal que pasa por la matriz se multiplica por varias ganancias:
//
//   [Salida módulo] × [Ganancia fila] × [Ganancia columna] → [Bus destino]
//
// Si existe una ganancia de pin específica, SOBRESCRIBE a fila × columna:
//
//   [Salida módulo] × [Ganancia pin] → [Bus destino]
//
// La ganancia global de matriz (matrixGain) se aplica siempre al final:
//
//   [Resultado] × [Ganancia matriz] → [Bus destino final]
//
// ─────────────────────────────────────────────────────────────────────────────
// SISTEMA DE COORDENADAS
// ─────────────────────────────────────────────────────────────────────────────
//
// Todas las coordenadas usan la numeración del Synthi (serigrafía del panel),
// NO los índices internos del array de pines.
//
// Filas (rowSynth):
// - Osciladores: 91-108 (ver blueprint para mapeo exacto)
// - Otros módulos: según serigrafía del Synthi
//
// Columnas (colSynth):
// - Out 1-8: columnas 37-44
// - Otros destinos: según serigrafía del Synthi
//
// ─────────────────────────────────────────────────────────────────────────────
// MODOS DE SUMA
// ─────────────────────────────────────────────────────────────────────────────
//
// Cuando múltiples fuentes se conectan al mismo destino (columna), sus señales
// se suman. El modo de suma controla cómo se maneja esta situación:
//
// | Modo       | Descripción                                              |
// |------------|----------------------------------------------------------|
// | 'direct'   | Suma directa sin limitación (puede clipear)              |
// | 'clip'     | Suma con clipping duro en maxSumGain                     |
// | 'softClip' | Suma con saturación suave (más "analógico")              |
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,
  configType: 'audio',

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN GLOBAL DE AUDIO
  // ─────────────────────────────────────────────────────────────────────────
  audio: {
    // Ganancia global de la matriz.
    // Multiplica TODAS las señales que pasan por la matriz.
    // Valor 1.0 = sin cambio, <1 = atenuación, >1 = amplificación
    matrixGain: 1.0,

    // Rango de ganancias permitido para filas, columnas y pines.
    // Limita los valores que se pueden configurar más abajo.
    gainRange: {
      min: 0,      // Mínimo: silencio total
      max: 2.0     // Máximo: doble de ganancia (6 dB)
    },

    // Modo de suma cuando múltiples fuentes → mismo destino.
    // Ver tabla de modos arriba.
    sumMode: 'direct',

    // Ganancia máxima de suma por columna.
    // Solo aplica en modos 'clip' y 'softClip'.
    // Evita distorsión cuando muchas fuentes suman en un bus.
    maxSumGain: 4.0

    // ·······································································
    // PARÁMETROS OPCIONALES (comentados, pueden activarse si se necesitan)
    // ·······································································
    
    // gainCurve: 'linear',
    // Curva para controles de ganancia.
    // Valores: 'linear' | 'logarithmic'
    // 'logarithmic' da percepción de volumen más natural.
    
    // gainSmoothing: 0.01,
    // Tiempo de suavizado para cambios de ganancia (segundos).
    // Evita clics al activar/desactivar pines o cambiar niveles.
    // Rango recomendado: 0.005-0.05
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GANANCIAS POR FILA (fuentes)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Define la ganancia de cada fila de la matriz.
  // La clave es el número de fila según la serigrafía del Synthi (rowSynth).
  //
  // EJEMPLO:
  // Si el oscilador 1 sale por la fila 91 y quieres que tenga menos nivel:
  //
  // rowGains: {
  //   91: 0.8    // Fila 91 (Osc1 sine+saw) atenuada al 80%
  // }
  //
  // Si no se define una fila, se usa ganancia 1.0 (sin cambio).
  // ─────────────────────────────────────────────────────────────────────────
  rowGains: {
    // Por defecto todas las filas tienen ganancia 1.0
    // Añadir entradas aquí para calibrar fuentes individuales.
    //
    // Ejemplo - Osciladores con niveles ajustados:
    // 91: 1.0,   // Osc 1 sine+saw
    // 92: 1.0,   // Osc 1 tri+pulse
    // 93: 1.0,   // Osc 2 sine+saw
    // 94: 1.0,   // Osc 2 tri+pulse
    // ...
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GANANCIAS POR COLUMNA (destinos)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Define la ganancia de cada columna de la matriz.
  // La clave es el número de columna según la serigrafía del Synthi (colSynth).
  //
  // EJEMPLO:
  // Si Out 1 está en columna 37 y quieres que tenga más nivel:
  //
  // colGains: {
  //   37: 1.2    // Columna 37 (Out 1) amplificada al 120%
  // }
  //
  // Si no se define una columna, se usa ganancia 1.0 (sin cambio).
  // ─────────────────────────────────────────────────────────────────────────
  colGains: {
    // Por defecto todas las columnas tienen ganancia 1.0
    // Añadir entradas aquí para calibrar destinos individuales.
    //
    // Ejemplo - Salidas con niveles ajustados:
    // 37: 1.0,   // Out 1
    // 38: 1.0,   // Out 2
    // 39: 1.0,   // Out 3
    // 40: 1.0,   // Out 4
    // 41: 1.0,   // Out 5
    // 42: 1.0,   // Out 6
    // 43: 1.0,   // Out 7
    // 44: 1.0,   // Out 8
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GANANCIAS POR PIN (sobrescribe fila × columna)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Define ganancia para pines específicos de la matriz.
  // La clave es "rowSynth:colSynth" usando numeración del Synthi.
  //
  // IMPORTANTE: Si se define un pin, su ganancia SOBRESCRIBE completamente
  // el cálculo de rowGain × colGain para esa conexión.
  //
  // EJEMPLO:
  // Si quieres que Osc1 (fila 91) → Out1 (columna 37) tenga ganancia 0.5:
  //
  // pinGains: {
  //   "91:37": 0.5    // Osc1 sine+saw → Out1 atenuado al 50%
  // }
  //
  // CASO DE USO:
  // - Calibrar conexiones específicas que suenan demasiado alto/bajo
  // - Crear "presets" de mezcla fijos para ciertos routings
  // - Compensar diferencias entre módulos del Synthi original
  // ─────────────────────────────────────────────────────────────────────────
  pinGains: {
    // Por defecto no hay sobrescrituras de pin.
    // Añadir entradas aquí para calibrar conexiones específicas.
    //
    // Ejemplo:
    // "91:37": 0.8,   // Osc1 sine+saw → Out1
    // "92:38": 1.2,   // Osc1 tri+pulse → Out2
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FILTRADO RC DE PINES (Pin RC Filtering)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Emula el comportamiento RC del bus de la matriz cuando se insertan pines.
  // Según el Manual Técnico Datanomics 1982:
  //
  //   "Con pines de 100kΩ (blancos) se produce integración de transitorios
  //    rápidos debido a la capacitancia del bus (~100pF)."
  //
  // Cada tipo de pin tiene una resistencia diferente, creando un filtro
  // pasabajos RC con el bus:
  //
  //   fc = 1 / (2π × Rpin × Cbus)
  //
  // donde Cbus ≈ 100 pF (capacitancia típica del bus de la matriz).
  //
  // FRECUENCIAS DE CORTE POR TIPO DE PIN:
  // ───────────────────────────────────────────────────────────────────────
  // | Pin Color | Resistencia | fc con 100pF | Efecto                     |
  // |-----------|-------------|--------------|----------------------------|
  // | WHITE     | 100 kΩ      | 15.9 kHz     | Suavizado audible          |
  // | GREY      | 100 kΩ      | 15.9 kHz     | Igual que WHITE            |
  // | GREEN     | 68 kΩ       | 23.4 kHz     | Suavizado leve             |
  // | RED       | 2.7 kΩ      | 589 kHz      | Transparente (bypass)      |
  // | CYAN      | 250 kΩ      | 6.4 kHz      | Filtro notable             |
  // | PURPLE    | 1 MΩ        | 1.6 kHz      | Filtro pronunciado         |
  //
  // IMPLEMENTACIÓN:
  // Se usa un BiquadFilterNode tipo lowpass con Q bajo para aproximar
  // la respuesta de un filtro RC pasivo de primer orden.
  //
  // NOTA: Los pines RED/BLUE/YELLOW tienen fc > Nyquist, por lo que
  // el filtro es efectivamente transparente (candidatos a bypass).
  //
  pinFiltering: {
    // ─────────────────────────────────────────────────────────────────────
    // CAPACITANCIA DEL BUS (busCapacitance)
    // ─────────────────────────────────────────────────────────────────────
    //
    // Capacitancia equivalente del bus de la matriz en Faradios.
    // Afecta las frecuencias de corte de todos los tipos de pin.
    //
    // | busCapacitance | Efecto                                           |
    // |----------------|--------------------------------------------------|
    // |    50e-12      | Bus corto/limpio: menos filtrado                 |
    // |   100e-12      | DEFAULT - Valor típico según manual              |
    // |   200e-12      | Bus largo/sucio: más filtrado                    |
    //
    busCapacitance: 100e-12,

    // ─────────────────────────────────────────────────────────────────────
    // FACTOR Q DEL FILTRO (filterQ)
    // ─────────────────────────────────────────────────────────────────────
    //
    // Factor de calidad del BiquadFilter usado para emular el RC.
    // BiquadFilter es de segundo orden (-12dB/oct), pero con Q bajo
    // la curva se aproxima más a un RC pasivo (-6dB/oct).
    //
    // | filterQ | Comportamiento                                         |
    // |---------|--------------------------------------------------------|
    // |   0.25  | Muy suave, respuesta más parecida a RC pasivo          |
    // |   0.5   | DEFAULT - Buen balance entre precisión y estabilidad   |
    // |   0.707 | Butterworth, respuesta más plana pero menos "analógica"|
    // |   1.0   | Ligera resonancia en fc (no recomendado)               |
    //
    filterQ: 0.5
  }
};
