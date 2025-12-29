// Panel 5 (Audio) blueprint
//
// Este archivo pretende ser:
// - Humano-legible (numeración Synth: filas/columnas 1..N)
// - Editable sin tocar lógica de ruteo
// - Fuente única de verdad para: frame UI, pines ocultos (huecos), entradas (sources) y salidas (destinations)
//
// Convención de coordenadas:
// - rowSynth: número de fila en la serigrafía Synthi (comienza en 67 para la gran matriz)
// - colSynth: número de columna en la serigrafía (1..67)
//
// Nota sobre osciladores:
// - Cada oscilador tiene 2 canales de salida:
//   - sineSaw: suma de Sine + Sawtooth (fila impar)
//   - triPulse: suma de Triangle + Pulse (fila par siguiente) - pulse pendiente de implementar
// - Cada oscilador ocupa 2 filas físicas consecutivas.
// - Entre osc 3 y osc 4 hay un hueco (filas ocultas) que NO cuenta.

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
  // Para Panel 5: 9 osciladores (del panel 3), cada uno con 2 canales.
  // Filas impares: sineSaw (sine + sawtooth)
  // Filas pares (siguiente): triPulse (triangle + pulse)
  sources: [
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
  destinations: [
    { colSynth: 37, dest: { kind: 'outputBus', bus: 1 } },
    { colSynth: 38, dest: { kind: 'outputBus', bus: 2 } },
    { colSynth: 39, dest: { kind: 'outputBus', bus: 3 } },
    { colSynth: 40, dest: { kind: 'outputBus', bus: 4 } },
    { colSynth: 41, dest: { kind: 'outputBus', bus: 5 } },
    { colSynth: 42, dest: { kind: 'outputBus', bus: 6 } },
    { colSynth: 43, dest: { kind: 'outputBus', bus: 7 } },
    { colSynth: 44, dest: { kind: 'outputBus', bus: 8 } }
  ]
};
