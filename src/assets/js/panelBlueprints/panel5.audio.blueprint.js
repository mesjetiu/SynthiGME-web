// ═════════════════════════════════════════════════════════════════════════════
// PANEL 5 (AUDIO) BLUEPRINT
// ═════════════════════════════════════════════════════════════════════════════
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
// NOTA SOBRE OSCILADORES
// ─────────────────────────────────────────────────────────────────────────────
//
// - Cada oscilador tiene 2 canales de salida:
//   - sineSaw: suma de Sine + Sawtooth (fila impar)
//   - triPulse: suma de Triangle + Pulse (fila par siguiente)
// - Cada oscilador ocupa 2 filas físicas consecutivas.
// - Entre grupos de osciladores hay huecos (filas ocultas) que NO cuentan.
//
// ═════════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,
  panelId: 'panel-5',
  matrixId: 'audio',

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

    // Pines que no existen / huecos del panel (NO cuentan en numeración Synth).
    // Para evitar ambigüedades, aquí se definen en índices físicos 0-based
    // (los que usa internamente LargeMatrix para deshabilitar botones).
    hiddenCols0: [33, 65, 66],
    hiddenRows0: [30, 31, 32, 62]
  },

  // Fuentes (entradas al router): fila -> salida de módulo
  // Para Panel 5: 
  // - 8 amplificadores de entrada (filas 67-74)
  // - 2 generadores de ruido (filas 89-90)
  // - 9 osciladores (del panel 3), cada uno con 2 canales (filas 91-108)
  //
  // Filas impares de osciladores: sineSaw (sine + sawtooth)
  // Filas pares de osciladores: triPulse (triangle + pulse)
  sources: [
    // ─────────────────────────────────────────────────────────────────────────
    // INPUT AMPLIFIERS (filas 67-74) - 8 canales de entrada del Synthi 100
    // ─────────────────────────────────────────────────────────────────────────
    { rowSynth: 67, source: { kind: 'inputAmp', channel: 0 } },
    { rowSynth: 68, source: { kind: 'inputAmp', channel: 1 } },
    { rowSynth: 69, source: { kind: 'inputAmp', channel: 2 } },
    { rowSynth: 70, source: { kind: 'inputAmp', channel: 3 } },
    { rowSynth: 71, source: { kind: 'inputAmp', channel: 4 } },
    { rowSynth: 72, source: { kind: 'inputAmp', channel: 5 } },
    { rowSynth: 73, source: { kind: 'inputAmp', channel: 6 } },
    { rowSynth: 74, source: { kind: 'inputAmp', channel: 7 } },
    
    // ─────────────────────────────────────────────────────────────────────────
    // OUTPUT BUSES (filas 75-82) - 8 salidas de audio del Synthi 100
    // ─────────────────────────────────────────────────────────────────────────
    // Señales de audio de los buses de salida (post-fader) que pueden usarse
    // como fuentes para re-ruteo (feedback, procesamiento paralelo, etc.)
    //
    { rowSynth: 75, source: { kind: 'outputBus', bus: 1 } },
    { rowSynth: 76, source: { kind: 'outputBus', bus: 2 } },
    { rowSynth: 77, source: { kind: 'outputBus', bus: 3 } },
    { rowSynth: 78, source: { kind: 'outputBus', bus: 4 } },
    { rowSynth: 79, source: { kind: 'outputBus', bus: 5 } },
    { rowSynth: 80, source: { kind: 'outputBus', bus: 6 } },
    { rowSynth: 81, source: { kind: 'outputBus', bus: 7 } },
    { rowSynth: 82, source: { kind: 'outputBus', bus: 8 } },
    
    // ─────────────────────────────────────────────────────────────────────────
    // NOISE GENERATORS (filas 89-90)
    // ─────────────────────────────────────────────────────────────────────────
    { rowSynth: 89, source: { kind: 'noiseGen', index: 0 } },
    { rowSynth: 90, source: { kind: 'noiseGen', index: 1 } },
    
    // ─────────────────────────────────────────────────────────────────────────
    // OSCILLATORS (filas 91-108)
    // ─────────────────────────────────────────────────────────────────────────
    // Osc 1
    { rowSynth: 91, source: { kind: 'panel3Osc', oscIndex: 0, channelId: 'sineSaw' } },
    { rowSynth: 92, source: { kind: 'panel3Osc', oscIndex: 0, channelId: 'triPulse' } },
    // Osc 2
    { rowSynth: 93, source: { kind: 'panel3Osc', oscIndex: 1, channelId: 'sineSaw' } },
    { rowSynth: 94, source: { kind: 'panel3Osc', oscIndex: 1, channelId: 'triPulse' } },
    // Osc 3
    { rowSynth: 95, source: { kind: 'panel3Osc', oscIndex: 2, channelId: 'sineSaw' } },
    { rowSynth: 96, source: { kind: 'panel3Osc', oscIndex: 2, channelId: 'triPulse' } },
    // Osc 4
    { rowSynth: 97, source: { kind: 'panel3Osc', oscIndex: 3, channelId: 'sineSaw' } },
    { rowSynth: 98, source: { kind: 'panel3Osc', oscIndex: 3, channelId: 'triPulse' } },
    // Osc 5
    { rowSynth: 99, source: { kind: 'panel3Osc', oscIndex: 4, channelId: 'sineSaw' } },
    { rowSynth: 100, source: { kind: 'panel3Osc', oscIndex: 4, channelId: 'triPulse' } },
    // Osc 6
    { rowSynth: 101, source: { kind: 'panel3Osc', oscIndex: 5, channelId: 'sineSaw' } },
    { rowSynth: 102, source: { kind: 'panel3Osc', oscIndex: 5, channelId: 'triPulse' } },
    // Osc 7
    { rowSynth: 103, source: { kind: 'panel3Osc', oscIndex: 6, channelId: 'sineSaw' } },
    { rowSynth: 104, source: { kind: 'panel3Osc', oscIndex: 6, channelId: 'triPulse' } },
    // Osc 8
    { rowSynth: 105, source: { kind: 'panel3Osc', oscIndex: 7, channelId: 'sineSaw' } },
    { rowSynth: 106, source: { kind: 'panel3Osc', oscIndex: 7, channelId: 'triPulse' } },
    // Osc 9
    { rowSynth: 107, source: { kind: 'panel3Osc', oscIndex: 8, channelId: 'sineSaw' } },
    { rowSynth: 108, source: { kind: 'panel3Osc', oscIndex: 8, channelId: 'triPulse' } }
  ],

  // Destinos (salidas del router): columna -> destino
  // Para Panel 5, columnas 37..44 corresponden a Out 1..8.
  // Columnas 58 y 59 corresponden a las entradas del osciloscopio.
  //
  // NOTA: colSynth usa numeración directa (colSynth - 1 = índice físico).
  // Los huecos (hiddenCols0) tienen número pero están deshabilitados en la UI.
  //
  destinations: [
    // ─────────────────────────────────────────────────────────────────────────
    // HARD SYNC INPUTS (columnas 24-35 → Osc 1-12 sync input)
    // ─────────────────────────────────────────────────────────────────────────
    // La señal conectada resetea la fase del oscilador en cada flanco positivo.
    // Esto permite sincronizar osciladores para crear timbres armónicos complejos.
    //
    // Conexión directa: la señal de audio pasa al input 0 del AudioWorkletNode
    // del oscilador. El worklet detecta flancos positivos y resetea this.phase = 0.
    // No se necesita GainNode intermedio porque no hay control de "sensibilidad".
    // Si en el futuro se quisiera añadir control de threshold, bastaría con
    // interponer un GainNode antes del input del worklet.
    //
    { colSynth: 24, dest: { kind: 'oscSync', oscIndex: 0 } },
    { colSynth: 25, dest: { kind: 'oscSync', oscIndex: 1 } },
    { colSynth: 26, dest: { kind: 'oscSync', oscIndex: 2 } },
    { colSynth: 27, dest: { kind: 'oscSync', oscIndex: 3 } },
    { colSynth: 28, dest: { kind: 'oscSync', oscIndex: 4 } },
    { colSynth: 29, dest: { kind: 'oscSync', oscIndex: 5 } },
    { colSynth: 30, dest: { kind: 'oscSync', oscIndex: 6 } },
    { colSynth: 31, dest: { kind: 'oscSync', oscIndex: 7 } },
    { colSynth: 32, dest: { kind: 'oscSync', oscIndex: 8 } },
    { colSynth: 33, dest: { kind: 'oscSync', oscIndex: 9 } },
    { colSynth: 34, dest: { kind: 'oscSync', oscIndex: 10 } },
    { colSynth: 35, dest: { kind: 'oscSync', oscIndex: 11 } },
    
    // ─────────────────────────────────────────────────────────────────────────
    // OUTPUT BUSES (columnas 36-43 → Out 1-8)
    // ─────────────────────────────────────────────────────────────────────────
    { colSynth: 36, dest: { kind: 'outputBus', bus: 1 } },
    { colSynth: 37, dest: { kind: 'outputBus', bus: 2 } },
    { colSynth: 38, dest: { kind: 'outputBus', bus: 3 } },
    { colSynth: 39, dest: { kind: 'outputBus', bus: 4 } },
    { colSynth: 40, dest: { kind: 'outputBus', bus: 5 } },
    { colSynth: 41, dest: { kind: 'outputBus', bus: 6 } },
    { colSynth: 42, dest: { kind: 'outputBus', bus: 7 } },
    { colSynth: 43, dest: { kind: 'outputBus', bus: 8 } },

    // ─────────────────────────────────────────────────────────────────────────
    // OSCILLOSCOPE (columnas 57-58)
    // ─────────────────────────────────────────────────────────────────────────
    // Y = vertical (forma de onda), X = horizontal (modo Lissajous)
    { colSynth: 57, dest: { kind: 'oscilloscope', channel: 'Y' } },
    { colSynth: 58, dest: { kind: 'oscilloscope', channel: 'X' } },

    // ─────────────────────────────────────────────────────────────────────────
    // PWM INPUTS (columnas 59-64 → Osc 1-6 pulse width modulation)
    // ─────────────────────────────────────────────────────────────────────────
    // Señal de audio conectada modula el ancho de pulso (duty cycle) del
    // oscilador destino via el AudioParam 'pulseWidth' del worklet CEM 3340.
    //
    // Basado en circuitería del Synthi 100 (Datanomics 1982):
    // - Chip CEM 3340: pin 5 controla PWM linealmente (0V→0%, 5V→100%)
    // - Nodo de suma (IC1, CA3140): Vpot × 1/12 + Vmatriz × 1
    //   · Knob Shape (0-12V) entra por R34=1.2M → ganancia 1/12
    //   · Entrada matriz entra por R2=100K → ganancia 1 (feedback R4=100K)
    // - Respuesta lineal: potenciómetro 10K LIN
    // - En extremos (0% / 100% duty cycle): señal colapsa a DC (silencio)
    // - "Thin buzz": justo antes del colapso, fundamental desaparece y solo
    //   quedan armónicos superiores (comportamiento emergente del PolyBLEP)
    //
    // Solo los 6 primeros osciladores tienen entrada PWM en la matriz de audio
    // del Synthi 100 de Cuenca (1982). La circuitería interna de los 12 es
    // idéntica (PC-02), pero solo estos 6 están cableados a la matriz.
    //
    { colSynth: 59, dest: { kind: 'oscPWM', oscIndex: 0 } },
    { colSynth: 60, dest: { kind: 'oscPWM', oscIndex: 1 } },
    { colSynth: 61, dest: { kind: 'oscPWM', oscIndex: 2 } },
    { colSynth: 62, dest: { kind: 'oscPWM', oscIndex: 3 } },
    { colSynth: 63, dest: { kind: 'oscPWM', oscIndex: 4 } },
    { colSynth: 64, dest: { kind: 'oscPWM', oscIndex: 5 } }
  ]
};
