// ═══════════════════════════════════════════════════════════════════════════
// RING MODULATOR CONFIG — Synthi 100 Cuenca / Datanomics 1982
// ═══════════════════════════════════════════════════════════════════════════
//
// Modulador de anillo de precisión (sin transformador).
// Placa PC-05, plano D100-05 C1.
//
// El Synthi 100 original tiene 3 unidades idénticas en Panel 1.
//
// Arquitectura del hardware:
//   - Tecnología: multiplicador activo sin transformador (transformerless)
//   - Chip núcleo: 4214AP (multiplicador de propósito general)
//   - Buffers de entrada: LF 355 N (bajo ruido, baja impedancia)
//   - Buffer de salida: CA3140
//   - Naturaleza matemática: multiplicador virtualmente perfecto
//   - Salida = (Va × Vb) / k
//
// Comportamiento:
//   - Entrada máxima sin distorsión: 8V p-p por nodo (A y B)
//   - Breakthrough (fuga): 5mV p-p con 8V p-p en una entrada → -64dB
//   - Respuesta en frecuencia: DC a audio (acoplamiento directo)
//   - Con dos senoidales puras: salida = suma y diferencia (fa+fb, fa-fb)
//   - Transparencia total: sin distorsión de diodos ni coloración
//
// Modos especiales:
//   - Doblador de frecuencia: misma señal en A y B → 2f (octava superior)
//   - Puerta de voltaje: si una entrada es 0V → salida es 0V
//
// Control:
//   - Un único potenciómetro de nivel de salida (10K LOG)
//   - Situado después del multiplicador y antes del buffer de salida
//
// Matrices:
//   Panel 5 (audio)
//     Inputs RM1:  columnas 3 (A), 4 (B)
//     Inputs RM2:  columnas 5 (A), 6 (B)
//     Inputs RM3:  columnas 7 (A), 8 (B)
//     Output RM1:  fila 121
//     Output RM2:  fila 122
//     Output RM3:  fila 123
//
//   Panel 6 (control): sin conexiones
//
// Referencia: Manual Datanomics 1982, PC-05 Ring Modulator, D100-05 C1

export default {
  schemaVersion: 1,
  id: 'ringModulator',
  title: 'Ring Modulator',

  // Número de instancias
  count: 3,
  ids: ['ringModulator1', 'ringModulator2', 'ringModulator3'],

  // Posiciones en matrices del Synthi 100
  matrix: {
    panel5: {
      // Entradas A y B por instancia (colSynth)
      inputsA: [3, 5, 7],
      inputsB: [4, 6, 8],
      // Salida por instancia (rowSynth)
      outputs: [121, 122, 123]
    }
    // Panel 6: sin conexiones
  },

  // Kinds para blueprints y routing
  sourceKind: 'ringModulator',
  inputAKind: 'ringModInputA',
  inputBKind: 'ringModInputB',

  // Parámetros del DSP
  audio: {
    maxInputVpp: 8,               // Voltaje máximo de entrada sin distorsión (V p-p)
    breakthroughDb: -64,          // Rechazo de fuga (dB)
    softClipThreshold: 0.8,       // Umbral de soft-clip normalizado (8V p-p / 10V p-p)
    levelLogBase: 100             // Base logarítmica para curva de Level
  },

  // Curva del potenciómetro de Level (10K LOG del hardware)
  levelCurve: {
    type: 'log',
    logBase: 100
  },

  // Tiempos de rampa (suavizado de parámetros)
  ramps: {
    level: 0.06
  },

  // Knobs (rango del dial)
  knobs: {
    level: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'linear',
      pixelsForFullRange: 900
    }
  }
};
