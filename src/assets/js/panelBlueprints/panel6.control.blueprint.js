// ═══════════════════════════════════════════════════════════════════════════
// PANEL 6 (CONTROL) BLUEPRINT
// ═══════════════════════════════════════════════════════════════════════════
//
// Este archivo pretende ser:
// - Humano-legible (numeración Synthi: filas/columnas según serigrafía)
// - Editable sin tocar lógica de ruteo
// - Fuente única de verdad para: frame UI, pines ocultos (huecos),
//   entradas (sources) y salidas (destinations)
//
// ─────────────────────────────────────────────────────────────────────────────
// SISTEMA DE NUMERACIÓN DE LA MATRIZ SYNTHI 100
// ─────────────────────────────────────────────────────────────────────────────
//
// El Synthi 100 original tiene matrices de pines muy grandes (60+ filas/columnas).
// Para facilitar la orientación visual del usuario, la matriz física incluye
// HUECOS (espacios vacíos sin pines) que actúan como separadores visuales.
//
// IMPORTANTE: Los huecos NO tienen pines físicos ni números en la serigrafía.
// La numeración Synthi SALTA estos espacios porque simplemente no existen.
//
// Ejemplo visual (simplificado):
//
//   Matriz física:        Numeración Synthi:
//   ┌─┬─┬─┐ ┌─┬─┬─┐        1  2  3  4  5  6
//   │●│●│●│ │●│●│●│        (los huecos no
//   └─┴─┴─┘ └─┴─┴─┘         cuentan)
//      hueco
//
// En este archivo:
// - rowSynth/colSynth: usan la numeración de la serigrafía (sin contar huecos)
// - hiddenRows0/hiddenCols0: índices físicos 0-based de los huecos
//
// Los huecos se definen en índices físicos (0-based) porque es lo que usa
// internamente LargeMatrix para deshabilitar botones en la UI.
//
// ─────────────────────────────────────────────────────────────────────────────
// CONVENCIÓN DE COORDENADAS
// ─────────────────────────────────────────────────────────────────────────────
//
// - rowSynth: número de fila en la serigrafía Synthi (comienza en 67 para la gran matriz)
// - colSynth: número de columna en la serigrafía (1..67)
//
// ─────────────────────────────────────────────────────────────────────────────
// SOURCES (FUENTES DE CV)
// ─────────────────────────────────────────────────────────────────────────────
//
// Las fuentes son señales de control (CV) que pueden modular parámetros de módulos.
// Se definen por fila de la matriz. El sistema es BIPOLAR:
//
// - Rango de señal: -1 a +1 (donde 0 es el punto central, sin modulación)
// - Valores positivos (+): incrementan el parámetro destino
// - Valores negativos (-): decrementan el parámetro destino
//
// Tipos de fuentes disponibles:
// | kind          | Descripción                               | Parámetros           |
// |---------------|-------------------------------------------|----------------------|
// | 'inputAmp'    | Canal de entrada de audio del sistema     | channel (0-7)        |
// | 'panel3Osc'   | Salida de oscilador del Panel 3           | oscIndex, channelId  |
//
// ─────────────────────────────────────────────────────────────────────────────
// DESTINATIONS (DESTINOS DE MODULACIÓN)
// ─────────────────────────────────────────────────────────────────────────────
//
// Los destinos son parámetros de módulos que pueden ser modulados por señales CV.
// Se definen por columna de la matriz.
//
// Tipos de destinos disponibles:
// | kind          | Descripción                               | Parámetros           |
// |---------------|-------------------------------------------|----------------------|
// | 'oscFreqCV'   | Entrada CV de frecuencia de oscilador     | oscIndex (0-11)      |
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,
  panelId: 'panel-6',
  matrixId: 'control',

  grid: {
    rows: 63,
    cols: 67,
    coordSystem: {
      rowBase: 67,
      colBase: 1
    }
  },

  ui: {
    // Copia del frame que hoy se ajusta a ojo en app.js.
    // Si necesitas retocar alineación, edita aquí.
    frame: {
      squarePercent: 90,
      translateSteps: { x: 5.1, y: 0 },
      marginsSteps: { left: -7.47, right: -3, top: 4.7, bottom: 2.7 },
      clip: true,
      overflowPercent: { left: 25, top: 25, right: 200, bottom: 80 },
      maxSizePercent: 300
    },

    // Pines que no existen / huecos del panel.
    // Índices físicos 0-based (columna 34 absoluta = índice 33).
    // Las filas útiles en numeración Synthi van de 67 a 126.
    hiddenCols0: [33],
    // Filas 31, 32 y 33 absolutas (índices 30, 31, 32).
    hiddenRows0: [30, 31, 32]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FUENTES DE CV (filas → señales de control)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Cada fila de la matriz puede conectarse a una fuente de señal de control.
  // Las señales son BIPOLARES (-1 a +1): valores negativos modulan hacia abajo.
  //
  // Estructura de cada entrada:
  // - rowSynth: número de fila según serigrafía del Synthi
  // - source: objeto que describe el módulo/salida origen
  //   - kind: tipo de fuente ('panel3Osc', etc.)
  //   - oscIndex: índice del oscilador (0-based)
  //   - channelId: canal de salida del oscilador ('sineSaw' o 'triPulse')
  //
  // OSCILADORES 10-12 (filas 83-88)
  // ─────────────────────────────────────────────────────────────────────────
  // Cada oscilador tiene 2 filas de salida (igual que en Panel 5):
  // - Fila impar: sineSaw (suma de Sine + Sawtooth)
  // - Fila par:   triPulse (suma de Triangle + Pulse)
  //
  sources: [
    // ─────────────────────────────────────────────────────────────────────────
    // INPUT AMPLIFIERS (filas 67-74) - 8 canales de entrada del Synthi 100
    // ─────────────────────────────────────────────────────────────────────────
    // Señales de audio externas que pueden usarse como fuentes de modulación CV.
    // Útil para: control por audio externo, modulación por micrófono, etc.
    //
    { rowSynth: 67, source: { kind: 'inputAmp', channel: 0 } },
    { rowSynth: 68, source: { kind: 'inputAmp', channel: 1 } },
    { rowSynth: 69, source: { kind: 'inputAmp', channel: 2 } },
    { rowSynth: 70, source: { kind: 'inputAmp', channel: 3 } },
    { rowSynth: 71, source: { kind: 'inputAmp', channel: 4 } },
    { rowSynth: 72, source: { kind: 'inputAmp', channel: 5 } },
    { rowSynth: 73, source: { kind: 'inputAmp', channel: 6 } },
    { rowSynth: 74, source: { kind: 'inputAmp', channel: 7 } },

    // ─────────────────────────────────────────────────────────────────────────
    // OSCILLATORS 10-12 (filas 83-88)
    // ─────────────────────────────────────────────────────────────────────────
    // Osc 10 (oscIndex: 9)
    { rowSynth: 83, source: { kind: 'panel3Osc', oscIndex: 9, channelId: 'sineSaw' } },
    { rowSynth: 84, source: { kind: 'panel3Osc', oscIndex: 9, channelId: 'triPulse' } },
    // Osc 11 (oscIndex: 10)
    { rowSynth: 85, source: { kind: 'panel3Osc', oscIndex: 10, channelId: 'sineSaw' } },
    { rowSynth: 86, source: { kind: 'panel3Osc', oscIndex: 10, channelId: 'triPulse' } },
    // Osc 12 (oscIndex: 11)
    { rowSynth: 87, source: { kind: 'panel3Osc', oscIndex: 11, channelId: 'sineSaw' } },
    { rowSynth: 88, source: { kind: 'panel3Osc', oscIndex: 11, channelId: 'triPulse' } }
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // DESTINOS DE MODULACIÓN (columnas → parámetros de módulos)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Cada columna de la matriz puede conectarse a un parámetro modulable.
  // La señal CV se suma al valor base establecido por el knob del módulo.
  //
  // Estructura de cada entrada:
  // - colSynth: número de columna según serigrafía del Synthi
  // - dest: objeto que describe el parámetro destino
  //   - kind: tipo de destino ('oscFreqCV', etc.)
  //   - oscIndex: índice del oscilador (0-based)
  //
  // OSCILLATORS FREQUENCY CONTROL (columnas 30-33, 35-42)
  // ─────────────────────────────────────────────────────────────────────────
  // Columnas 30-33 y 35-42 controlan la frecuencia de los osciladores 1-12.
  // NOTA: La columna 34 está oculta (hueco físico en el panel).
  // La señal CV modula la frecuencia en Hz (bipolar):
  // - CV = +1 → frecuencia sube según freqCVScale (ej: +1000 Hz)
  // - CV =  0 → sin modulación (frecuencia = valor del knob)
  // - CV = -1 → frecuencia baja según freqCVScale (ej: -1000 Hz)
  //
  // El factor freqCVScale se define en panel3.config.js y puede ser distinto
  // para cada oscilador.
  //
  destinations: [
    // ─────────────────────────────────────────────────────────────────────────
    // OSCILLATORS FREQUENCY CONTROL (columnas 30-41) - Synthi 100 nomenclature
    // ─────────────────────────────────────────────────────────────────────────
    { colSynth: 30, dest: { kind: 'oscFreqCV', oscIndex: 0 } },  // Osc 1 Frequency
    { colSynth: 31, dest: { kind: 'oscFreqCV', oscIndex: 1 } },  // Osc 2 Frequency
    { colSynth: 32, dest: { kind: 'oscFreqCV', oscIndex: 2 } },  // Osc 3 Frequency
    { colSynth: 33, dest: { kind: 'oscFreqCV', oscIndex: 3 } },  // Osc 4 Frequency
    // NOTA: colSynth 34 está oculta (hiddenCols0: [33]), pero las columnas
    // de frecuencia no usan la 34, así que no hay conflicto.
    { colSynth: 35, dest: { kind: 'oscFreqCV', oscIndex: 4 } },  // Osc 5 Frequency
    { colSynth: 36, dest: { kind: 'oscFreqCV', oscIndex: 5 } },  // Osc 6 Frequency
    { colSynth: 37, dest: { kind: 'oscFreqCV', oscIndex: 6 } },  // Osc 7 Frequency
    { colSynth: 38, dest: { kind: 'oscFreqCV', oscIndex: 7 } },  // Osc 8 Frequency
    { colSynth: 39, dest: { kind: 'oscFreqCV', oscIndex: 8 } },  // Osc 9 Frequency
    { colSynth: 40, dest: { kind: 'oscFreqCV', oscIndex: 9 } },  // Osc 10 Frequency
    { colSynth: 41, dest: { kind: 'oscFreqCV', oscIndex: 10 } }, // Osc 11 Frequency
    { colSynth: 42, dest: { kind: 'oscFreqCV', oscIndex: 11 } }  // Osc 12 Frequency
  ]
};
