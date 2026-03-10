// ═══════════════════════════════════════════════════════════════════════════
// REVERBERATION CONFIG — Synthi 100 Cuenca / Datanomics 1982
// ═══════════════════════════════════════════════════════════════════════════
//
// Unidad de reverberación de muelle (Voltage Controlled Reverberation Unit).
// Placa PC-16, plano D100-16 C1.
//
// El Synthi 100 original tiene 2 unidades idénticas, pero esta implementación
// incluye solo 1 unidad (reverberation1).
//
// Arquitectura del hardware:
//   - Tecnología: línea de retardo de muelles (Spring Delay Line)
//   - 2 muelles por unidad con tiempos de retardo de 35 ms y 40 ms
//   - Tiempo de caída (decay): constante de tiempo ~35 ms
//   - Tiempo máximo de reverberación: 2.4 s
//   - Driver del muelle: IC 1 (CA3140) + TR 1, TR 2
//   - VCA mezcla: IC 3 (dry) / IC 5 (wet) — crossfader inverso
//   - Salida: IC 7 (mezcla) → IC 8 (buffer)
//
// Comportamiento:
//   - Entrada máxima: 2 V p-p (distorsión "clank" metálico si se excede)
//   - Control de mezcla: ±2V cubre rango completo (pin azul 10k)
//   - Impedancia de control (Rin): 8 kΩ
//   - Funciona mejor con sonidos de decaimiento largo
//
// Matrices:
//   Panel 5 (audio)
//     Input:  columna 1
//     Output: fila 124
//
//   Panel 6 (control)
//     Mix CV: columna 1
//
// Referencia: Manual Datanomics 1982, PC-16 Spring Reverb

export default {
  schemaVersion: 1,
  id: 'panel1-reverberation1',
  title: 'Reverberation',

  // Posiciones en matrices del Synthi 100
  matrix: {
    panel5: {
      input: { colSynth: 1 },    // Entrada audio
      output: { rowSynth: 124 }  // Salida audio
    },
    panel6: {
      mixCV: { colSynth: 1 }     // Control voltage para Mix
    }
  },

  // Kinds para blueprints y routing
  sourceKind: 'reverberation',
  inputKind: 'reverbInput',
  mixCVKind: 'reverbMixCV',

  // Parámetros del DSP
  audio: {
    spring1DelayMs: 35,           // Retardo del primer muelle
    spring2DelayMs: 40,           // Retardo del segundo muelle
    maxReverbTimeS: 2.4,          // RT60 máximo
    dampingFreqHz: 4500,          // Frecuencia de corte del LPF de damping
    allpassCoeff: 0.65,           // Coeficiente de los filtros allpass
    inputClipDrive: 1.5,          // Factor de saturación tanh en entrada
    maxInputVpp: 2.0,             // Voltaje máximo de entrada sin distorsión
    levelLogBase: 100             // Base logarítmica para curva de Level
  },

  // Curva del potenciómetro de Level
  levelCurve: {
    type: 'log',
    logBase: 100
  },

  // Tiempos de rampa (suavizado de parámetros)
  ramps: {
    level: 0.06,
    mix: 0.05
  },

  // Knobs (rango del dial)
  knobs: {
    mix: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'linear',
      pixelsForFullRange: 900
    },
    level: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'linear',
      pixelsForFullRange: 900
    }
  }
};
