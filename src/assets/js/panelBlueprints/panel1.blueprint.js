// ═══════════════════════════════════════════════════════════════════════════
// Panel 1 (Filters, Envelope Shapers, Ring Modulators, Reverb & Echo) Blueprint
// ═══════════════════════════════════════════════════════════════════════════
//
// Este archivo define la ESTRUCTURA VISUAL del Panel 1 del Synthi 100.
// Todos los módulos son placeholders con knobs pero sin funcionalidad de audio.
//
// ─────────────────────────────────────────────────────────────────────────────
// SEPARACIÓN BLUEPRINT vs CONFIG
// ─────────────────────────────────────────────────────────────────────────────
//
// Los archivos de panelBlueprints siguen una convención de dos archivos:
//
// 1. *.blueprint.js — ESTRUCTURA (este archivo)
//    - Layout visual (posiciones, tamaños, filas)
//    - Distribución de módulos y placeholders
//    - Definición de knobs por módulo (nombre y disposición)
//    - NO contiene valores numéricos de parámetros de audio
//    - NO contiene mapeo a filas/columnas de matriz (eso va en panel5/panel6 blueprints)
//
// 2. configs/modules/*.config.js — PARÁMETROS (uno por tipo de módulo)
//    - Rangos de frecuencia, ganancia, etc.
//    - Curvas de respuesta (linear, exponential)
//    - Valores iniciales de knobs
//    - Calibración por módulo
//
// ─────────────────────────────────────────────────────────────────────────────
// CONTENIDO DEL PANEL 1 (Synthi 100)
// ─────────────────────────────────────────────────────────────────────────────
//
// De arriba a abajo:
//   Fila 1: FLP 1-4 | FHP 1-4 (8 filtros, cada uno con 3 knobs verticales)
//   Fila 2: Envelope Shaper 1 (ancho completo, 8 knobs horizontales)
//   Fila 3: Envelope Shaper 2 (ancho completo, 8 knobs horizontales)
//   Fila 4: Envelope Shaper 3 (ancho completo, 8 knobs horizontales)
//   Fila 5: RM 1-3 | Reverb 1 | Echo A.D.L. (5 módulos con knobs)
//
// Para conexiones a matrices de audio (Panel 5) y control (Panel 6),
// ver la referencia cruzada al final de este archivo.
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 2,
  panelId: 'panel-1',

  // Mostrar/ocultar marcos de todos los módulos del panel.
  showFrames: true,

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DEL LAYOUT VISUAL
  // ─────────────────────────────────────────────────────────────────────────
  //
  // El panel se divide en 5 filas de arriba a abajo.
  // Fila 1: 8 filtros (4 FLP + 4 FHP) ocupando todo el ancho.
  // Filas 2-4: 3 Envelope Shapers, cada uno a ancho completo.
  // Fila 5: 5 módulos (3 RM + Reverb + Echo).
  //

  layout: {
    // Offset general del panel (px) — desplaza todos los módulos
    // respecto a la imagen de fondo. Útil para ajustes finos.
    offset: { x: 0, y: 0 },

    // Padding general del panel
    padding: { top: 8, right: 10, bottom: 8, left: 10 },

    // Gap vertical entre filas
    gap: 4,

    // ── Fila 1: Filtros FLP 1-4 + FHP 1-4 ──────────────────────────────
    filtersRow: {
      height: 120,
      gap: 3,               // Gap horizontal entre filtros
      offset: { x: 0, y: 0 },
      // Cada filtro tiene 3 knobs en columna vertical:
      // Frequency, Response, Level
      knobs: ['Frequency', 'Response', 'Level'],
      knobSize: 'sm',
      knobInnerPct: 78,
      knobGap: 2,
      knobsOffset: { x: 0, y: 0 },
      knobDirection: 'vertical'
    },

    // ── Filas 2-4: Envelope Shapers ─────────────────────────────────────
    envelopeShapers: {
      height: 65,
      gap: 4,               // Gap vertical entre envelopes
      offset: { x: 0, y: 0 },
      // Cada envelope shaper tiene 8 knobs en fila horizontal:
      // Mode, Delay, Attack, Decay, Sustain, Release, Envelope Level, Signal Level
      knobs: ['Mode', 'Delay', 'Attack', 'Decay', 'Sustain', 'Release', 'Env Level', 'Sig Level'],
      knobSize: 'sm',
      knobInnerPct: 78,
      knobGap: 2,
      knobsOffset: { x: 0, y: 0 },
      knobDirection: 'horizontal',
      count: 3
    },

    // ── Fila 5: Ring Modulators + Reverb + Echo ─────────────────────────
    bottomRow: {
      height: 80,
      gap: 3,               // Gap horizontal entre módulos
      offset: { x: 0, y: 0 },

      // Definición individual de cada módulo de la fila inferior
      ringModulator: {
        count: 3,
        knobs: ['Level'],
        knobSize: 'sm',
        knobInnerPct: 78,
        knobGap: 6,
        knobsOffset: { x: 0, y: 0 }
      },

      reverberation: {
        count: 1,
        knobs: ['Mix', 'Level'],
        knobSize: 'sm',
        knobInnerPct: 78,
        knobGap: 6,
        knobsOffset: { x: 0, y: 0 }
      },

      echo: {
        count: 1,
        knobs: ['Delay', 'Mix', 'Feedback', 'Level'],
        knobSize: 'sm',
        knobInnerPct: 78,
        knobGap: 6,
        knobsOffset: { x: 0, y: 0 }
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MÓDULOS DECLARADOS
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Todos son placeholders sin funcionalidad de audio.
  // Los knobs existen para indicar la interfaz futura del módulo.
  //
  modules: {
    // ── Filtros paso bajo (Low Pass) ────────────────────────────────────
    // visible: false → módulo oculto (ocupa espacio pero invisible y no interactivo)
    flp1: { visible: false },
    flp2: { visible: false },
    flp3: { visible: false },
    flp4: { visible: false },

    // ── Filtros paso alto (High Pass) ───────────────────────────────────
    fhp1: { visible: false },
    fhp2: { visible: false },
    fhp3: { visible: false },
    fhp4: { visible: false },

    // ── Envelope Shapers ────────────────────────────────────────────────
    envelopeShaper1: { visible: false },
    envelopeShaper2: { visible: false },
    envelopeShaper3: { visible: false },

    // ── Ring Modulators ─────────────────────────────────────────────────
    ringModulator1: { visible: false },
    ringModulator2: { visible: false },
    ringModulator3: { visible: false },

    // ── Reverberación ───────────────────────────────────────────────────
    reverberation1: { visible: false },

    // ── Echo A.D.L. ─────────────────────────────────────────────────────
    echoADL: { visible: false }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONEXIONES A MATRICES (Panel 5 y Panel 6)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Las conexiones de los módulos del Panel 1 a las matrices de audio y
  // control se declararán en los blueprints de cada matriz cuando se
  // implementen los módulos funcionales:
  //
  //   - panel5.audio.blueprint.js
  //   - panel6.control.blueprint.js
  //
};
