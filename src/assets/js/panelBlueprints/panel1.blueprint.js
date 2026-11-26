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
//   FLP 1-4 | FHP 1-4 (8 filtros, cada uno con 3 knobs verticales)
//   Envelope Shaper 1 (ancho completo, 8 knobs horizontales)
//   Envelope Shaper 2 (ancho completo, 8 knobs horizontales)
//   Envelope Shaper 3 (ancho completo, 8 knobs horizontales)
//   RM 1-3 | Reverb 1 | Echo A.D.L. (5 módulos con knobs)
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
  // Cada módulo se coloca con una caja absoluta { x, y, w, h } en px del
  // panel (760×760 = la imagen de fondo; ver utils/panelBox.js), por id de
  // módulo: layout.<tipo>.boxes.<id> (o layout.<tipo>.box si hay uno solo).
  // Mover uno no mueve los demás. Dentro de cada caja, los mandos siguen
  // repartidos por el CSS como antes (flex).
  //
  // Las cajas son las que daba la columna flex anterior (offset y 40,
  // padding 8/5, gap 2; filtros de 290 con gap 2, envolventes de 100 con
  // gap 2, fila inferior de 100 con anchos 107/143 y gap 1), medidas en la
  // web: el panel queda idéntico. Todavía NO están cuadradas con la foto
  // (hoja de ruta, 1.3).

  layout: {
    // ── Filtros FLP 1-4 + FHP 1-4 ───────────────────────────────────────
    filters: {
      boxes: {
        flp1: { x: 5,   y: 48, w: 92, h: 290 },
        flp2: { x: 99,  y: 48, w: 92, h: 290 },
        flp3: { x: 193, y: 48, w: 92, h: 290 },
        flp4: { x: 287, y: 48, w: 92, h: 290 },
        fhp1: { x: 381, y: 48, w: 92, h: 290 },
        fhp2: { x: 475, y: 48, w: 92, h: 290 },
        fhp3: { x: 569, y: 48, w: 92, h: 290 },
        fhp4: { x: 663, y: 48, w: 92, h: 290 }
      },
      // Cada filtro tiene 3 knobs en columna vertical:
      // Frequency, Response, Level
      knobs: ['Frequency', 'Response', 'Level'],
      knobColors: ['blue', 'yellow', 'white'],
      knobTypes: ['normal', 'normal', 'normal'],
      knobSize: 65,
      knobInnerPct: 78,
      knobGap: 2,
      knobsOffset: { x: 0, y: 0 }
    },

    // ── Envelope Shapers 1-3 ────────────────────────────────────────────
    envelopeShapers: {
      boxes: {
        envelopeShaper1: { x: 5, y: 340, w: 750, h: 100 },
        envelopeShaper2: { x: 5, y: 442, w: 750, h: 100 },
        envelopeShaper3: { x: 5, y: 544, w: 750, h: 100 }
      },
      // Cada envelope shaper tiene 8 knobs en fila horizontal:
      // Mode, Delay, Attack, Decay, Sustain, Release, Envelope Level, Signal Level
      knobs: ['Mode', 'Delay', 'Attack', 'Decay', 'Sustain', 'Release', 'Env Level', 'Sig Level'],
      knobColors: ['yellow', 'red', 'red', 'red', 'red', 'red', 'white', 'white'],
      knobTypes: ['selector', 'normal', 'normal', 'normal', 'normal', 'normal', 'bipolar', 'normal'],
      knobSize: 65,
      knobInnerPct: 78,
      knobGap: 2,
      knobsOffset: { x: 0, y: 0 },
      // Gate button: posición absoluta dentro del marco (abajo a la derecha del selector)
      gateOffset: { x: 52, y: 68 },
      gateSize: 16,
      // LED piloto: posición absoluta dentro del marco (arriba a la derecha de delay)
      ledOffset: { x: 130, y: 8 },
      ledSize: 10
    },

    // ── Ring Modulators 1-3 ─────────────────────────────────────────────
    ringModulators: {
      boxes: {
        ringModulator1: { x: 5,   y: 646, w: 107, h: 100 },
        ringModulator2: { x: 113, y: 646, w: 107, h: 100 },
        ringModulator3: { x: 221, y: 646, w: 107, h: 100 }
      },
      knobs: ['Level'],
      knobColors: ['white'],
      knobTypes: ['normal'],
      knobSize: 65,
      knobInnerPct: 78,
      knobGap: 6,
      knobsOffset: { x: 0, y: 0 }
    },

    // ── Reverberation 1 ─────────────────────────────────────────────────
    reverberation: {
      box: { x: 329, y: 646, w: 143, h: 100 },
      knobs: ['Mix', 'Level'],
      knobColors: ['blue', 'white'],
      knobTypes: ['normal', 'normal'],
      knobSize: 65,
      knobInnerPct: 78,
      knobGap: 6,
      knobsOffset: { x: 0, y: 0 }
    },

    // ── Echo A.D.L. ─────────────────────────────────────────────────────
    echo: {
      box: { x: 473, y: 646, w: 282, h: 100 },
      knobs: ['Delay', 'Mix', 'Feedback', 'Level'],
      knobColors: ['blue', 'blue', 'blue', 'white'],
      knobTypes: ['normal', 'normal', 'normal', 'normal'],
      knobSize: 65,
      knobInnerPct: 78,
      knobGap: 6,
      knobsOffset: { x: 0, y: 0 }
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
    flp1: { visible: true },
    flp2: { visible: true },
    flp3: { visible: true },
    flp4: { visible: true },

    // ── Filtros paso alto (High Pass) ───────────────────────────────────
    fhp1: { visible: true },
    fhp2: { visible: true },
    fhp3: { visible: true },
    fhp4: { visible: true },

    // ── Envelope Shapers ────────────────────────────────────────────────
    envelopeShaper1: { visible: true },
    envelopeShaper2: { visible: true },
    envelopeShaper3: { visible: true },

    // ── Ring Modulators ─────────────────────────────────────────────────
    ringModulator1: { visible: true },
    ringModulator2: { visible: true },
    ringModulator3: { visible: true },

    // ── Reverberación ───────────────────────────────────────────────────
    reverberation1: { visible: true },

    // ── Echo A.D.L. ─────────────────────────────────────────────────────
    echoADL: { visible: true }
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
