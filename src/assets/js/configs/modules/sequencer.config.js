// ═══════════════════════════════════════════════════════════════════════════
// DIGITAL SEQUENCER 1000 + CLOCK CONFIG
// ═══════════════════════════════════════════════════════════════════════════
//
// Configuración del secuenciador digital del Synthi 100
// (modelo Cuenca/Datanomics 1982, Digital Sequencer 1000).
//
// Almacenamiento digital en RAM:
//   - 1024 eventos máximo (8K RAM = 8192 bytes, 8 bytes por evento)
//   - 6 pistas analógicas (A-F, 0-7V DC, resolución 8-bit = 256 niveles)
//   - 4 pistas digitales (Keys 1-4, on/off, empaquetadas en 1 byte)
//
// Clock interno: VCO IC17 (4046 PLL/VCO), rango sub-Hz a varios kHz.
// Clock externo: máximo 500 Hz, pulso >1V, detección Schmitt trigger (0.6V).
//
// Conversores A/D:
//   - Converter 1 (IC 6): canales A, C, E (comparten fuente)
//   - Converter 2 (IC 7): canales B, D, F (comparten fuente)
//   - 4 keys digitales: sin conversión A/D, lectura directa
//
// UI repartida en dos paneles:
//   - Panel 7: 8 toggle switches, 8 pushbuttons, Clock Rate knob (vernier)
//   - Panel 4: knobs de rango de salida (Voltage A-F, Keys 1-4), display hex
//
// Referencia: Planos CPU_RAM_board_circuit, sequencer_1000_analogue_input_buffer,
//             sequencer_1000_digital_interface
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,

  id: 'sequencer',
  title: 'Digital Sequencer 1000',

  // ─────────────────────────────────────────────────────────────────────────
  // FILAS/COLUMNAS DE MATRICES
  // ─────────────────────────────────────────────────────────────────────────

  // Filas de salida en Panel 5 (audio)
  audioMatrixRow: {
    dac1: 87,           // DAC 1 — audio output (shared, all channels)
    clock: 88           // Clock pulse output (~5ms, 1V)
  },

  // Columnas de entrada de control en Panel 5 (audio)
  audioMatrixCol: {
    clock: 51,          // Clock externo
    reset: 52,          // Reset sequence
    forward: 53,        // Run forward
    reverse: 54,        // Run reverse
    stop: 55            // Stop
  },

  // Filas de salida en Panel 6 (control voltage)
  controlMatrixRow: {
    voltageA: 100,
    voltageB: 101,
    key1: 102,
    voltageC: 103,
    voltageD: 104,
    key2: 105,
    voltageE: 106,
    voltageF: 107,
    key3: 108,
    key4: 109,
    clockRate: 110
  },

  // Columnas de entrada de voltaje en Panel 6 (control voltage)
  controlMatrixCol: {
    voltageACE: 60,     // A·C·E comparten converter 1
    voltageBDF: 61,     // B·D·F comparten converter 2
    key: 62             // Key digital input
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PARÁMETROS DE AUDIO (worklet)
  // ─────────────────────────────────────────────────────────────────────────
  audio: {
    maxEvents: 1024,             // Eventos máximo en RAM (8K / 8 bytes)
    bytesPerEvent: 8,            // 6 analógicos + 1 keys + 1 padding
    analogResolutionBits: 8,     // 256 niveles por canal analógico
    analogVoltageRange: 7,       // 0-7V DC por canal analógico
    keyOnVoltage: 5,             // +5V cuando key está activa
    keyThreshold: 0.6,           // Umbral Schmitt trigger para grabar key
    externalClockMaxHz: 500,     // Máxima frecuencia clock externo (Z80)
    externalClockThreshold: 1.0, // Umbral 1V (Schmitt trigger Z80, manual Synthi 100)
    clockPulseWidth: 0.005       // 5ms de ancho de pulso del clock
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TIEMPOS DE RAMPA
  // ─────────────────────────────────────────────────────────────────────────
  ramps: {
    outputLevel: 0.005  // 5ms — suavizado de salida (anti-click)
  },

  // ─────────────────────────────────────────────────────────────────────────
  // KNOBS (Panel 7 + Panel 4)
  // ─────────────────────────────────────────────────────────────────────────
  knobs: {
    // Panel 7: Clock Rate (vernier, potenciómetro 10K, 0-12V)
    clockRate: {
      min: 0,
      max: 10,
      initial: 5,
      curve: 'exponential',
      label: 'Clock Rate'
    },

    // Panel 4: Sequencer Output Range — Voltages (vernier / normal)
    voltageA: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'linear',
      label: 'Voltage A'
    },
    voltageB: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'linear',
      label: 'Voltage B'
    },
    voltageC: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'linear',
      label: 'Voltage C'
    },
    voltageD: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'linear',
      label: 'Voltage D'
    },
    voltageE: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'linear',
      label: 'Voltage E'
    },
    voltageF: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'linear',
      label: 'Voltage F'
    },

    // Panel 4: Keys (bipolar)
    key1: {
      min: -5,
      max: 5,
      initial: 0,
      curve: 'linear',
      label: 'Key 1'
    },
    key2: {
      min: -5,
      max: 5,
      initial: 0,
      curve: 'linear',
      label: 'Key 2'
    },
    key3: {
      min: -5,
      max: 5,
      initial: 0,
      curve: 'linear',
      label: 'Key 3'
    },
    key4: {
      min: -5,
      max: 5,
      initial: 0,
      curve: 'linear',
      label: 'Key 4'
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SWITCHES (Panel 7 — controles de grabación)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // 8 toggle switches fijan qué pistas se graban.
  // Los switches de pista analógica agrupan dos funciones por position:
  //   UP = Record pista(s) indicada(s)
  //   DOWN = Off / no grabar esa pista
  //
  switches: {
    abKey1: {
      initial: false,
      label: 'A/B + Key 1',
      records: { analog: ['A', 'B'], digital: ['key1'] }
    },
    b: {
      initial: false,
      label: 'B',
      records: { analog: ['B'], digital: [] }
    },
    cdKey2: {
      initial: false,
      label: 'C/D + Key 2',
      records: { analog: ['C', 'D'], digital: ['key2'] }
    },
    d: {
      initial: false,
      label: 'D',
      records: { analog: ['D'], digital: [] }
    },
    efKey3: {
      initial: false,
      label: 'E/F + Key 3',
      records: { analog: ['E', 'F'], digital: ['key3'] }
    },
    f: {
      initial: false,
      label: 'F',
      records: { analog: ['F'], digital: [] }
    },
    key4: {
      initial: false,
      label: 'Key 4',
      records: { analog: [], digital: ['key4'] }
    },
    runClock: {
      initial: true,
      label: 'Run Clock / Stop Clock'
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BUTTONS (Panel 7 — controles de transporte)
  // ─────────────────────────────────────────────────────────────────────────
  buttons: {
    masterReset: { label: 'Master Reset' },
    runForward: { label: 'Run Forward' },
    runReverse: { label: 'Run Reverse' },
    stop: { label: 'Stop' },
    resetSequence: { label: 'Reset Sequence' },
    stepForward: { label: 'Step Forward' },
    stepReverse: { label: 'Step Reverse' },
    testOP: { label: 'Test O/P' }
  }
};
