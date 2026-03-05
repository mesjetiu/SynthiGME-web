/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KEYBOARD CONFIG — Synthi 100 Cuenca (Datanomics 1982)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Configuración de parámetros para los teclados duales del Synthi 100.
 * Cada teclado tiene 3 knobs (Pitch Spread, Velocity Level, Gate Level),
 * un Pitch Offset (vernier), un toggle de Inverting Buffer, y un selector
 * rotativo de Retrigger mode.
 *
 * Los knobs están en el Panel 4 (Keyboard Output Range, columnas 2 y 3).
 *
 * @module configs/modules/keyboard.config
 */

export default {
  schemaVersion: 1,

  id: 'keyboard',
  title: 'Keyboard',

  // ─────────────────────────────────────────────────────────────────────────
  // FILAS DE LA MATRIZ DE CONTROL (Panel 6)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Upper Keyboard: filas 111-113
  // Lower Keyboard: filas 114-116
  //
  matrixRow: {
    upper: {
      pitch: 111,
      velocity: 112,
      gate: 113
    },
    lower: {
      pitch: 114,
      velocity: 115,
      gate: 116
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PARÁMETROS DE AUDIO
  // ─────────────────────────────────────────────────────────────────────────
  audio: {
    /** Nota MIDI del pivote central (F#3) — 0V */
    pivotNote: 66,
    /** Valor de Pitch Spread que da 1V/Oct exacto */
    spreadUnity: 9,
    /** Duración del retrigger gap en ms */
    retriggerGapMs: 2
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TIEMPOS DE RAMPA
  // ─────────────────────────────────────────────────────────────────────────
  ramps: {
    level: 0.06
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DEFINICIÓN DE KNOBS (controles del Panel 4)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Cada teclado tiene los mismos controles, definidos una sola vez aquí.
  //
  knobs: {
    pitchSpread: {
      min: 0,
      max: 10,
      initial: 9,      // 1V/Oct
      curve: 'linear',
      label: 'Pitch'
    },
    pitchOffset: {
      min: -5,
      max: 5,
      initial: 0,
      curve: 'linear',
      label: 'Pitch Offset'
    },
    velocityLevel: {
      min: -5,
      max: 5,
      initial: 5,       // pleno efecto positivo
      curve: 'linear',
      label: 'Key Velocity'
    },
    gateLevel: {
      min: -5,
      max: 5,
      initial: 5,       // +5V gate
      curve: 'linear',
      label: 'Env. Control'
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SWITCHES
  // ─────────────────────────────────────────────────────────────────────────
  switches: {
    retrigger: {
      initial: 0,        // 0 = Retrigger Key Release (Kbd), 1 = Key Release or New Pitch (On)
      labelA: 'On',      // izquierda (← hardware panel)
      labelB: 'Kbd'      // derecha (← hardware panel)
    }
  }
};
