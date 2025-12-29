// ═══════════════════════════════════════════════════════════════════════════
// PANEL 6 - CONFIGURACIÓN DE LA MATRIZ DE CONTROL
// ═══════════════════════════════════════════════════════════════════════════
//
// Este archivo define los parámetros de comportamiento de la matriz de control
// del Panel 6. Controla ganancias y atenuación de señales de control (CV).
//
// NOTA: Este archivo es INDEPENDIENTE del blueprint (panel6.control.blueprint.js).
// - Blueprint: define UI, pines ocultos, mapeo de fuentes/destinos
// - Config: define comportamiento, ganancias, calibración
//
// ─────────────────────────────────────────────────────────────────────────────
// DIFERENCIAS CON PANEL 5 (AUDIO)
// ─────────────────────────────────────────────────────────────────────────────
//
// Panel 5 (Audio):
// - Señales de audio (osciladores, filtros, etc.)
// - Destinos: buses de salida (Out 1-8)
// - Ganancias afectan volumen
//
// Panel 6 (Control):
// - Señales de control (CVs, envolventes, LFOs, etc.)
// - Destinos: parámetros de módulos (frecuencia, filtro, etc.)
// - Ganancias afectan profundidad de modulación
//
// ─────────────────────────────────────────────────────────────────────────────
// JERARQUÍA DE GANANCIAS
// ─────────────────────────────────────────────────────────────────────────────
//
// Igual que en Panel 5, la señal se multiplica por varias ganancias:
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
// PARÁMETROS FUTUROS (reservados)
// ─────────────────────────────────────────────────────────────────────────────
//
// Los siguientes parámetros pueden añadirse en el futuro para control avanzado:
//
// pinPolarity: {
//   "row:col": 'inverted'    // Invertir polaridad del CV en este pin
// }
//
// pinOffset: {
//   "row:col": 0.5           // Añadir offset DC al CV (0-1)
// }
//
// slewTime: {
//   "row:col": 0.01          // Tiempo de slew/portamento para el CV (segundos)
// }
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,
  configType: 'control',
  panelId: 'panel-6',

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
