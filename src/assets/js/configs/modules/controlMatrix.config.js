// ═══════════════════════════════════════════════════════════════════════════
// CONTROL MATRIX CONFIG
// ═══════════════════════════════════════════════════════════════════════════
//
// Configuración de la matriz de control (Panel 6) del Synthi 100.
// Controla ganancias y atenuación de señales de control (CV).
//
// NOTA: Este archivo es INDEPENDIENTE del blueprint (panel6.control.blueprint.js).
// - Blueprint: define UI, pines ocultos, mapeo de fuentes/destinos
// - Config: define comportamiento, ganancias, calibración
//
// ─────────────────────────────────────────────────────────────────────────────
// DIFERENCIAS CON LA MATRIZ DE AUDIO
// ─────────────────────────────────────────────────────────────────────────────
//
// Matriz de Audio:
// - Señales de audio (osciladores, filtros, etc.)
// - Destinos: buses de salida (Out 1-8)
// - Ganancias afectan volumen
//
// Matriz de Control:
// - Señales de control (CVs, envolventes, LFOs, etc.)
// - Destinos: parámetros de módulos (frecuencia, filtro, etc.)
// - Ganancias afectan profundidad de modulación
//
// ─────────────────────────────────────────────────────────────────────────────
// SISTEMA DE SEÑALES CV BIPOLAR Y MODULACIÓN V/Oct
// ─────────────────────────────────────────────────────────────────────────────
//
// Las señales CV son BIPOLARES (rango -1 a +1):
//
// | Valor CV | Efecto en el parámetro destino                           |
// |----------|----------------------------------------------------------|
// |   +1.0   | Máxima modulación positiva (incremento máximo)           |
// |    0.0   | Sin modulación (el parámetro mantiene su valor de knob)  |
// |   -1.0   | Máxima modulación negativa (decremento máximo)           |
//
// MODULACIÓN DE FRECUENCIA - SISTEMA V/Oct (Voltios por Octava):
// ───────────────────────────────────────────────────────────────
// La modulación de frecuencia usa el estándar de sintetizadores modulares:
// modulación EXPONENCIAL por intervalos musicales, no lineal por Hz.
//
// Ejemplo con valores por defecto (cvScale=2, octavesPerUnit=0.5):
// - Frecuencia base (knob): 440 Hz (La4)
// - CV = +1.0 → +1 octava → 880 Hz (La5)
// - CV =  0.0 → sin cambio → 440 Hz (La4)
// - CV = -1.0 → -1 octava → 220 Hz (La3)
//
// Ver oscillator.config.js para configurar cvScale y octavesPerUnit.
//
// ─────────────────────────────────────────────────────────────────────────────
// JERARQUÍA DE GANANCIAS
// ─────────────────────────────────────────────────────────────────────────────
//
// Igual que en la matriz de audio, la señal se multiplica por ganancias:
//
//   [Señal CV] × [Ganancia fila] × [Ganancia columna] → [Parámetro destino]
//
// Si existe una ganancia de pin específica, SOBRESCRIBE a fila × columna:
//
//   [Señal CV] × [Ganancia pin] → [Parámetro destino]
//
// La ganancia global de matriz se aplica siempre al final.
//
// ─────────────────────────────────────────────────────────────────────────────
// SISTEMA DE COORDENADAS
// ─────────────────────────────────────────────────────────────────────────────
//
// Todas las coordenadas usan la numeración del Synthi (serigrafía del panel),
// NO los índices internos del array de pines.
//
// Las filas y columnas específicas dependen del layout del Panel 6.
// Consultar el blueprint (panel6.control.blueprint.js) para el mapeo exacto.
//
// ─────────────────────────────────────────────────────────────────────────────
// COLUMNAS DE MODULACIÓN DE FRECUENCIA (OSCILLATORS FREQUENCY CONTROL)
// ─────────────────────────────────────────────────────────────────────────────
//
// Las columnas 30-33 y 35-42 (numeración Synthi) corresponden a las entradas de
// modulación de frecuencia de los 12 osciladores.
// NOTA: La columna 34 está oculta (hueco físico en el panel).
//
// | Columna | Oscilador | Descripción                                      |
// |---------|-----------|--------------------------------------------------|
// |   30    |  Osc 1    | CV → frecuencia del oscilador 1                  |
// |   31    |  Osc 2    | CV → frecuencia del oscilador 2                  |
// |   32    |  Osc 3    | CV → frecuencia del oscilador 3                  |
// |   33    |  Osc 4    | CV → frecuencia del oscilador 4                  |
// |   35    |  Osc 5    | CV → frecuencia del oscilador 5 (34 está oculta) |
// |   36    |  Osc 6    | CV → frecuencia del oscilador 6                  |
// |   37    |  Osc 7    | CV → frecuencia del oscilador 7                  |
// |   38    |  Osc 8    | CV → frecuencia del oscilador 8                  |
// |   39    |  Osc 9    | CV → frecuencia del oscilador 9                  |
// |   40    |  Osc 10   | CV → frecuencia del oscilador 10                 |
// |   41    |  Osc 11   | CV → frecuencia del oscilador 11                 |
// |   42    |  Osc 12   | CV → frecuencia del oscilador 12                 |
//
// La profundidad de modulación se controla mediante:
// 1. cvScale y octavesPerUnit en oscillator.config.js (octavas por unidad de CV)
// 2. colGains en este archivo (factor multiplicador por columna)
// 3. pinGains en este archivo (sobrescritura específica por conexión)
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,
  configType: 'control',

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN GLOBAL DE CONTROL
  // ─────────────────────────────────────────────────────────────────────────
  control: {
    // Ganancia global de la matriz de control.
    // Multiplica TODAS las señales CV que pasan por la matriz.
    // Valor 1.0 = sin cambio, <1 = atenuación, >1 = amplificación
    matrixGain: 1.0,

    // Rango de ganancias permitido para filas, columnas y pines.
    gainRange: {
      min: 0,      // Mínimo: sin modulación
      max: 2.0     // Máximo: doble de profundidad
    },

    // Modo de suma cuando múltiples CVs → mismo destino.
    // 'direct': suma directa (comportamiento estándar en modulares)
    // 'clip': limita la suma al rango válido del parámetro
    sumMode: 'direct',

    // Ganancia máxima de suma por columna (destino).
    maxSumGain: 4.0
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GANANCIAS POR FILA (fuentes de CV)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Define la ganancia de cada fila de la matriz de control.
  // La clave es el número de fila según la serigrafía del Synthi (rowSynth).
  //
  // EJEMPLO:
  // Si un LFO sale por fila 10 y quieres que module con menos profundidad:
  //
  // rowGains: {
  //   10: 0.5    // LFO atenuado al 50%
  // }
  //
  // Si no se define una fila, se usa ganancia 1.0 (sin cambio).
  // ─────────────────────────────────────────────────────────────────────────
  rowGains: {
    // Por defecto todas las filas tienen ganancia 1.0
    // Añadir entradas aquí para calibrar fuentes de CV individuales.
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GANANCIAS POR COLUMNA (destinos de modulación)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Define la ganancia de cada columna de la matriz de control.
  // La clave es el número de columna según la serigrafía del Synthi (colSynth).
  //
  // EJEMPLO:
  // Si la entrada de frecuencia de un oscilador está en columna 5:
  //
  // colGains: {
  //   5: 0.8    // Modulación de frecuencia atenuada al 80%
  // }
  //
  // Si no se define una columna, se usa ganancia 1.0 (sin cambio).
  // ─────────────────────────────────────────────────────────────────────────
  colGains: {
    // Por defecto todas las columnas tienen ganancia 1.0
    // Añadir entradas aquí para calibrar destinos de modulación.
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GANANCIAS POR PIN (sobrescribe fila × columna)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Define ganancia para pines específicos de la matriz de control.
  // La clave es "rowSynth:colSynth" usando numeración del Synthi.
  //
  // IMPORTANTE: Si se define un pin, su ganancia SOBRESCRIBE completamente
  // el cálculo de rowGain × colGain para esa conexión.
  //
  // EJEMPLO:
  // Si quieres que LFO1 (fila 10) → Osc1 Freq (columna 5) tenga menos efecto:
  //
  // pinGains: {
  //   "10:5": 0.3    // LFO1 → Osc1 Freq atenuado al 30%
  // }
  //
  // CASO DE USO:
  // - Calibrar profundidad de modulaciones específicas
  // - Compensar diferencias de rango entre CVs y parámetros
  // - Crear "presets" de modulación para patches específicos
  // ─────────────────────────────────────────────────────────────────────────
  pinGains: {
    // Por defecto no hay sobrescrituras de pin.
    // Añadir entradas aquí para calibrar modulaciones específicas.
  }
};
