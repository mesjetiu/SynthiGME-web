// Panel 6 (Control) blueprint
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
// Nota sobre huecos:
// - Para evitar offsets accidentales, los huecos se expresan en índices físicos 0-based
//   (los que usa internamente LargeMatrix para deshabilitar botones).
//
// Nota de estado:
// - Panel 6 aún no implementa ruteo. Cuando se implemente, debería bastar con editar
//   `sources` y `destinations` en este blueprint (sin tocar app.js).

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

  // Fuentes (entradas al router): fila -> salida de módulo
  sources: [],

  // Destinos (salidas del router): columna -> destino
  destinations: []
};
