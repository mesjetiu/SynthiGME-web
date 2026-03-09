// ═══════════════════════════════════════════════════════════════════════════
// PANEL 1 FILTERS CONFIG — Synthi 100 Cuenca / Datanomics 1982
// ═══════════════════════════════════════════════════════════════════════════
//
// Los 8 filtros del sistema 1982 comparten la misma arquitectura basada en
// el Curtis CEM 3320:
//   - 4 filtros Low-Pass (FLP 1-4)
//   - 4 filtros High-Pass (FHP 1-4)
//   - 4 polos / 24 dB por octava
//   - Frecuencia de corte: LP ≈ 3 Hz – 20 kHz, HP ≈ 4 Hz – 20 kHz
//   - Dial de frecuencia 0-10 con punto medio ≈ 320 Hz en posición 5
//   - ~0.7 divisiones de dial por octava
//   - Sensibilidad de control: 0.55 V/octava
//   - Resonancia (Response) con auto-oscilación a partir de ~5.5
//
// Matrices:
//   Panel 5 (audio)
//     Inputs LP : 15-18
//     Inputs HP : 19-22
//     Outputs LP: 110-113
//     Outputs HP: 114-117
//
//   Panel 6 (control)
//     Cutoff CV LP: 22-25
//     Cutoff CV HP: 26-29
//
// Referencia técnica resumida: revisión 1982 con CEM 3320 y sumador CA3140
// para el control de frecuencia (Vfinal = Vmanual + Vmatriz).

const buildIds = (prefix) => Array.from({ length: 4 }, (_, index) => `${prefix}${index + 1}`);
const buildRange = (start) => Array.from({ length: 4 }, (_, index) => start + index);

export default {
  schemaVersion: 1,
  processor: 'synthi-filter',

  audio: {
    chip: 'CEM3320',
    topology: '4-pole',
    slopeDbPerOctave: 24,
    minCutoffHz: 3,
    maxCutoffHz: 20000,
    referenceCutoffHz: 320,
    referenceDial: 5,
    octaveDialSpan: 0.7,
    voltsPerOctave: 0.55,
    maxQ: 20,
    selfOscillationThresholdDial: 5.5,
    preciseTrackingOctaves: 4,
    acceptableTrackingOctaves: 5,
    nominalSelfOscillationVoltsPP: 2,
    maxSelfOscillationVoltsPP: 5,
    levelLogBase: 100,
    inputDriveBoost: 1.4,
    hpDirtyEvenHarmonics: 0.12,
    hpDirtyDrive: 1.55,
    lpDrive: 1.15
  },

  ramps: {
    frequency: 0.03,
    response: 0.04,
    level: 0.03
  },

  knobs: {
    frequency: {
      min: 0,
      max: 10,
      initial: 5,
      curve: 'linear',
      pixelsForFullRange: 900
    },
    response: {
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
  },

  lowPass: {
    title: 'Filter Low Pass',
    mode: 'lowpass',
    minCutoffHz: 3,
    count: 4,
    ids: buildIds('flp'),
    sourceKind: 'filterLP',
    inputKind: 'filterLPInput',
    cutoffDestKind: 'filterLPCutoffCV',
    matrix: {
      audioInputs: buildRange(15),
      audioOutputs: buildRange(110),
      controlInputs: buildRange(22)
    }
  },

  highPass: {
    title: 'Filter High Pass',
    mode: 'highpass',
    minCutoffHz: 4,
    count: 4,
    ids: buildIds('fhp'),
    sourceKind: 'filterHP',
    inputKind: 'filterHPInput',
    cutoffDestKind: 'filterHPCutoffCV',
    matrix: {
      audioInputs: buildRange(19),
      audioOutputs: buildRange(114),
      controlInputs: buildRange(26)
    }
  }
};
