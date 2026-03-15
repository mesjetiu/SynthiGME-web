// ═══════════════════════════════════════════════════════════════════════════
// ENVELOPE SHAPER CONFIG
// ═══════════════════════════════════════════════════════════════════════════
//
// Configuración de los Envelope Shapers del Synthi 100
// (modelo Cuenca/Datanomics 1982, CEM 3310).
//
// Cada instancia (ES1, ES2, ES3) genera:
//   - Envolvente ADSR con Delay y 5 modos de operación
//   - Salida de control (CV envolvente, ±5V bipolar)
//   - VCA para audio (señal × envolvente)
//
// Modos de operación:
//   0: GATED F/R  — ciclo continuo mientras gate presente
//   1: FREE RUN   — ciclo continuo autónomo
//   2: GATED      — sustain mientras gate, release al soltar
//   3: TRIGGERED  — ciclo completo one-shot
//   4: HOLD       — sustain indefinido una vez disparado
//
// Referencia: Manual Datanomics 1982, CEM 3310 datasheet, planos D100
//
// ═══════════════════════════════════════════════════════════════════════════

/** Modos del selector (índices coinciden con posiciones del knob selector) */
export const ENV_MODES = {
  GATED_FR:  0,
  FREE_RUN:  1,
  GATED:     2,
  TRIGGERED: 3,
  HOLD:      4
};

/** Nombres legibles de los modos */
export const ENV_MODE_NAMES = [
  'Gated F/R',
  'Free Run',
  'Gated',
  'Triggered',
  'Hold'
];

export default {
  schemaVersion: 1,

  id: 'envelopeShaper',
  title: 'Envelope Shaper',

  /** Número de instancias (ES1, ES2, ES3) */
  instances: 3,

  // ─────────────────────────────────────────────────────────────────────────
  // FILAS DE LA MATRIZ DE CONTROL (Panel 6) — SOURCES
  // ─────────────────────────────────────────────────────────────────────────
  // Salidas de envolvente CV (voltaje puro, sin audio)
  matrixRow: {
    envelope1: 97,
    envelope2: 98,
    envelope3: 99
  },

  // ─────────────────────────────────────────────────────────────────────────
  // COLUMNAS DE LA MATRIZ DE CONTROL (Panel 6) — DESTINATIONS
  // ─────────────────────────────────────────────────────────────────────────
  // Entradas de modulación CV para cada parámetro de cada ES
  // 6 parámetros × 3 instancias = 18 columnas
  // Cols 4-9: ES1 (KEY, DELAY, ATTACK, DECAY, SUSTAIN, RELEASE)
  // Cols 10-15: ES2
  // Cols 16-21: ES3
  matrixCol: {
    es1: { key: 4, delay: 5, attack: 6, decay: 7, sustain: 8, release: 9 },
    es2: { key: 10, delay: 11, attack: 12, decay: 13, sustain: 14, release: 15 },
    es3: { key: 16, delay: 17, attack: 18, decay: 19, sustain: 20, release: 21 }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FILAS/COLUMNAS AUDIO (Panel 5)
  // ─────────────────────────────────────────────────────────────────────────
  audio: {
    // Entradas de señal de audio (pasan por VCA interno)
    signalInputs: [9, 10, 11],
    // Entradas de trigger/gate (disparan la envolvente)
    signalTriggers: [12, 13, 14],
    // Salidas de audio procesado (señal × envolvente)
    shaperOutputs: [118, 119, 120],

    // ─── Tiempos (CEM 3310 specs) ─────────────────────────────────────
    // Mínimo ~1ms por sección (4ms ciclo completo = 250Hz máx como LFO)
    minTimeMs: 1,
    // Máximo ~20s manual, hasta 50s+ con CV externo
    maxTimeMs: 20000,
    // Ratio de tiempos (20000:1)
    timeRatio: 20000,

    // ─── Voltajes ─────────────────────────────────────────────────────
    // Envolvente CV output: ±5V (controlado por Envelope Level)
    envelopeMaxVoltage: 5.0,
    // Audio output: <3V p-p para evitar clipping
    audioMaxVpp: 3.0,
    // Rango dinámico del VCA
    dynamicRangeDb: 80,

    // ─── Trigger/Gate ─────────────────────────────────────────────────
    // Umbral de detección de gate/trigger: >1V
    triggerThresholdV: 1.0,
    // Umbral ALTO normalizado: 1V / 4V = 0.25 digital
    gateThreshold: 0.25,
    // Umbral BAJO Schmitt trigger (histéresis): 0.5V → 0.125 digital
    gateLowThreshold: 0.125,
    // Blanking de Schmitt trigger (s): protección contra ringing
    gateBlankingTime: 0.0005,
    // Base logarítmica para curva de Signal Level (10K LOG pot)
    logBase: 100,
    // Duración mínima recomendada de trigger: 20ms
    triggerMinPulseMs: 20,

    // ─── Sustain ──────────────────────────────────────────────────────
    // Rango: 0% a 100% del pico
    sustainMin: 0,
    sustainMax: 1
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CURVAS DE POTENCIÓMETRO
  // ─────────────────────────────────────────────────────────────────────────
  // Signal Level: 10K LOG (igual que los niveles del RVG)
  signalLevelCurve: {
    type: 'log',
    logBase: 100
  },

  // Tiempos de rampa para suavizado de parámetros
  ramps: {
    level: 0.06,      // Rampa de Signal Level (60ms)
    envelope: 0.01    // Rampa de Envelope Level (10ms)
  },

  // ─────────────────────────────────────────────────────────────────────────
  // KNOBS (rangos del dial, mapeados desde la escala del panel)
  // ─────────────────────────────────────────────────────────────────────────
  knobs: {
    mode: {
      min: 0,
      max: 4,
      initial: 2,       // GATED por defecto
      steps: 5,
      labels: ENV_MODE_NAMES
    },
    delay: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'exponential'
    },
    attack: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'exponential'
    },
    decay: {
      min: 0,
      max: 10,
      initial: 5,
      curve: 'exponential'
    },
    sustain: {
      min: 0,
      max: 10,
      initial: 7,
      curve: 'linear'
    },
    release: {
      min: 0,
      max: 10,
      initial: 3,
      curve: 'exponential'
    },
    envelopeLevel: {
      min: -5,
      max: 5,
      initial: 5,
      curve: 'linear',
      scaleMin: -5,
      scaleMax: 5
    },
    signalLevel: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'log'
    }
  }
};
