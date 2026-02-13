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
// | 'outputBus'   | Salida de bus de audio (post-fader)       | bus (1-8)            |
// | 'panel3Osc'   | Salida de oscilador del Panel 3           | oscIndex, channelId  |
// | 'joystick'    | Eje de joystick (voltaje DC bipolar)      | side, axis           |
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
// | 'outputLevelCV'| Control CV del nivel de salida           | busIndex (0-7)       |
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
    // OUTPUT BUSES (filas 75-82) - 8 salidas de audio del Synthi 100
    // ─────────────────────────────────────────────────────────────────────────
    // Señales de audio de los buses de salida (post-fader) que pueden usarse
    // como fuentes de modulación CV. Útil para: feedback controlado,
    // auto-modulación, modulación cruzada entre canales, etc.
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
    { rowSynth: 88, source: { kind: 'panel3Osc', oscIndex: 11, channelId: 'triPulse' } },

    // ─────────────────────────────────────────────────────────────────────────
    // JOYSTICKS (filas 117-120) — Fuentes de voltaje DC bipolar
    // ─────────────────────────────────────────────────────────────────────────
    // Cada joystick tiene 2 ejes (Y, X), cada eje produce ±8V DC
    // escalado por el pot de rango correspondiente.
    //
    // Joystick Left (LH):
    //   Fila 117: eje Y (vertical)
    //   Fila 118: eje X (horizontal)
    //
    // Joystick Right (RH):
    //   Fila 119: eje Y (vertical)
    //   Fila 120: eje X (horizontal)
    //
    // Referencia: Manual Datanomics 1982, PC-12 Joystick Buffer
    // ─────────────────────────────────────────────────────────────────────────
    { rowSynth: 117, source: { kind: 'joystick', side: 'left', axis: 'y' } },
    { rowSynth: 118, source: { kind: 'joystick', side: 'left', axis: 'x' } },
    { rowSynth: 119, source: { kind: 'joystick', side: 'right', axis: 'y' } },
    { rowSynth: 120, source: { kind: 'joystick', side: 'right', axis: 'x' } }
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // DESTINOS DE MODULACIÓN (columnas → parámetros de módulos)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Los números colSynth son los de la SERIGRAFÍA del Synthi 100.
  // La numeración Synthi NO cuenta los huecos (columnas ocultas).
  // El mapper convierte automáticamente: Synthi # → índice físico.
  //
  // Cada columna de la matriz puede conectarse a un parámetro modulable.
  // La señal CV se suma al valor base establecido por el knob del módulo.
  //
  // ─────────────────────────────────────────────────────────────────────────
  // OSCILLATORS FREQUENCY CONTROL (columnas 30-41)
  // ─────────────────────────────────────────────────────────────────────────
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
    { colSynth: 34, dest: { kind: 'oscFreqCV', oscIndex: 4 } },  // Osc 5 Frequency
    { colSynth: 35, dest: { kind: 'oscFreqCV', oscIndex: 5 } },  // Osc 6 Frequency
    { colSynth: 36, dest: { kind: 'oscFreqCV', oscIndex: 6 } },  // Osc 7 Frequency
    { colSynth: 37, dest: { kind: 'oscFreqCV', oscIndex: 7 } },  // Osc 8 Frequency
    { colSynth: 38, dest: { kind: 'oscFreqCV', oscIndex: 8 } },  // Osc 9 Frequency
    { colSynth: 39, dest: { kind: 'oscFreqCV', oscIndex: 9 } },  // Osc 10 Frequency
    { colSynth: 40, dest: { kind: 'oscFreqCV', oscIndex: 10 } }, // Osc 11 Frequency
    { colSynth: 41, dest: { kind: 'oscFreqCV', oscIndex: 11 } }, // Osc 12 Frequency

    // ─────────────────────────────────────────────────────────────────────────
    // VOLTAGE INPUT - CANALES DE SALIDA 1-4 (columnas 42-45)
    // ─────────────────────────────────────────────────────────────────────────
    // Estas son entradas de VOLTAJE (señal de control) que van al mismo punto
    // que las entradas de audio del Panel 5: el input del bus ANTES del VCA.
    //
    // ARQUITECTURA:
    //   Panel 5 (audio) ────────┬───→ [busInput] → [VCA] → [filtros] → salida
    //   Panel 6 (voltage) ──────┘
    //
    // CASO DE USO PRINCIPAL:
    // Permite usar el Output Channel como "slew limiter" o filtro de control:
    // 1. Conectar señal de control rápida (LFO, envelope) a esta entrada
    // 2. La señal pasa por el VCA con su filtro anti-click τ=5ms
    // 3. Usar la re-entrada POST-fader del canal (filas 75-78) como fuente suavizada
    //
    // DIFERENCIA CON outputLevelCV (columnas 46-53):
    // - Voltage Input: la señal PASA POR el canal y sale post-fader
    // - outputLevelCV: la señal MODULA la ganancia del VCA
    //
    { colSynth: 42, dest: { kind: 'outputBus', bus: 1 } }, // Voltage Input Ch 1
    { colSynth: 43, dest: { kind: 'outputBus', bus: 2 } }, // Voltage Input Ch 2
    { colSynth: 44, dest: { kind: 'outputBus', bus: 3 } }, // Voltage Input Ch 3
    { colSynth: 45, dest: { kind: 'outputBus', bus: 4 } }, // Voltage Input Ch 4

    // ─────────────────────────────────────────────────────────────────────────
    // OUTPUT LEVEL CONTROL (columnas 46-53) - Control CV del nivel de salida
    // ─────────────────────────────────────────────────────────────────────────
    // Permiten modular el nivel (gain) del VCA de los 8 canales de salida.
    // La señal CV se SUMA al voltaje del fader y controla la ganancia.
    // Útil para: tremolo, ducking, mezcla dinámica, envelope following, etc.
    //
    { colSynth: 46, dest: { kind: 'outputLevelCV', busIndex: 0 } }, // Out 1 Level
    { colSynth: 47, dest: { kind: 'outputLevelCV', busIndex: 1 } }, // Out 2 Level
    { colSynth: 48, dest: { kind: 'outputLevelCV', busIndex: 2 } }, // Out 3 Level
    { colSynth: 49, dest: { kind: 'outputLevelCV', busIndex: 3 } }, // Out 4 Level
    { colSynth: 50, dest: { kind: 'outputLevelCV', busIndex: 4 } }, // Out 5 Level
    { colSynth: 51, dest: { kind: 'outputLevelCV', busIndex: 5 } }, // Out 6 Level
    { colSynth: 52, dest: { kind: 'outputLevelCV', busIndex: 6 } }, // Out 7 Level
    { colSynth: 53, dest: { kind: 'outputLevelCV', busIndex: 7 } }, // Out 8 Level

    // ─────────────────────────────────────────────────────────────────────────
    // OSCILLOSCOPE (columnas 63-64) - Visualización de señales de control
    // ─────────────────────────────────────────────────────────────────────────
    // Permite visualizar señales CV en el osciloscopio compartido.
    // Columna 63: entrada Y (vertical / forma de onda)
    // Columna 64: entrada X (horizontal / modo Lissajous)
    //
    { colSynth: 63, dest: { kind: 'oscilloscope', channel: 'Y' } },
    { colSynth: 64, dest: { kind: 'oscilloscope', channel: 'X' } }
  ]
};
