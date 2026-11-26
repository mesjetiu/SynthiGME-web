// ═══════════════════════════════════════════════════════════════════════════
// Panel 2 (Oscilloscope, Input Amplifier Level & Placeholders) Blueprint
// ═══════════════════════════════════════════════════════════════════════════
//
// Este archivo define la ESTRUCTURA VISUAL del Panel 2 del Synthi 100.
// Para PARÁMETROS de audio (rangos, curvas, calibración), ver los configs por módulo:
//   - configs/modules/oscilloscope.config.js
//   - configs/modules/inputAmplifier.config.js
//
// ─────────────────────────────────────────────────────────────────────────────
// SEPARACIÓN BLUEPRINT vs CONFIG
// ─────────────────────────────────────────────────────────────────────────────
//
// Los archivos de panelBlueprints siguen una convención de dos archivos:
//
// 1. *.blueprint.js — ESTRUCTURA (este archivo)
//    - Layout visual (posiciones, tamaños, secciones)
//    - Distribución de módulos y placeholders
//    - NO contiene valores numéricos de parámetros de audio
//    - NO contiene channelCount (eso va en inputAmplifier.config.js)
//    - NO contiene listas de controles (eso va en el config de cada módulo)
//    - NO contiene mapeo a filas/columnas de matriz (eso va en panel5/panel6 blueprints)
//    - NO contiene routing (eso va en los configs de cada módulo)
//
// 2. configs/modules/*.config.js — PARÁMETROS (uno por tipo de módulo)
//    - Rangos de frecuencia, ganancia, etc.
//    - Curvas de respuesta (linear, exponential)
//    - Valores iniciales de knobs
//    - Número de instancias (count)
//    - Calibración por módulo
//
// ─────────────────────────────────────────────────────────────────────────────
// CONTENIDO DEL PANEL 2 (Synthi 100)
// ─────────────────────────────────────────────────────────────────────────────
//
// De arriba a abajo:
//   - Oscilloscope (módulo más grande, funcional)
//   - Frequency Meter (placeholder: FUNCTION y RANGE sin audio aún)
//   - Octave Filter Bank (placeholder, sin audio aún)
//   - Input Amplifier Level (funcional, 8 canales de entrada)
//   - External Treatment Devices (última fila, dos módulos lado a lado):
//       · Send Level (placeholder: 4 mandos sin audio aún)
//       · Return Level (placeholder: 4 mandos sin audio aún)
//
// Para conexiones a matrices de audio (Panel 5) y control (Panel 6),
// ver la referencia cruzada al final de este archivo.
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 2,
  panelId: 'panel-2',

  // Mostrar/ocultar marcos de todos los módulos del panel.
  // true  → marcos visibles (útil para posicionar contra imagen de fondo)
  // false → marcos invisibles (aspecto final limpio)
  showFrames: false,

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DEL LAYOUT VISUAL
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Cada módulo se coloca con una caja absoluta box: { x, y, w, h } en px
  // del panel (760×760, la imagen de fondo estirada al 100 %): 1 px = 1/760
  // de la imagen. Mover o redimensionar un módulo no mueve ningún otro.
  // Ver utils/panelBox.js y REVISION-VISUAL-2026-09.md.
  //

  layout: {
    // ── Sección del osciloscopio (módulo funcional, el más grande) ──────
    oscilloscope: {
      box: { x: 120, y: 32, w: 527, h: 225 },

      // Configuración visual del marco
      // frame.padding: espacio INTERNO entre el borde del marco y su contenido
      frame: {
        borderRadius: 6,
        padding: { top: 8, right: 10, bottom: 8, left: 10 }
      },

      // Configuración visual del display
      // size: tamaño real del display en px (ajustar a imagen de fondo)
      // offset: posición del display dentro del frame
      // transparent: true → fondo transparente, sin cuadrícula (solo beams)
      // beamOffsets: ajuste fino en Y de cada beam (px, relativo a su centro natural en 1/4 y 3/4)
      // centerOffset: desplazamiento del centro del Lissajous (modo X-Y)
      display: {
        size: { width: 178, height: 142 },
        offset: { x: 19, y: 10 },
        transparent: true,
        beamOffsets: { beam1Y: 4, beam2Y: -4 },
        centerOffset: { x: 4, y: 0 }
      }
    },

    // ── Frequency Meter (placeholder: mandos sin audio aún) ─────────────
    // Los dos selectores verdes, centrados en la falda transparente de la
    // foto (FUNCTION en 197,4 / 434,5 y RANGE en 376,3 / 434,2 px del panel).
    // Sus posiciones apuntan a las guías serigrafiadas: FUNCTION, seis a
    // ~29,5° (±74°); RANGE, cuatro a ~29° (±43°). Ver
    // module_research/panel2/fondo_vectorial.md.
    frequencyMeter: {
      box: { x: 8, y: 322, w: 744, h: 143 },
      // 36 px: el halo del selector (124 % del mando) mide 44,5 px, como la
      // falda de la foto; el centro verde, 18 px, como su capuchón.
      knobSize: 36,
      knobColor: 'green',
      selectors: {
        function: {
          x: 189.4, y: 112.5, minAngle: 286, maxAngle: 434, initial: 0,
          labels: ['Frequency', 'Period', 'Frequency ratio', 'Time interval', 'Unit counter', 'Osc frequency']
        },
        range: {
          x: 368.3, y: 112.2, minAngle: 317, maxAngle: 403, initial: 1,
          labels: ['1 Hz · 0.01 s', '10 Hz · 0.1 s', '100 Hz · 1 s', '1 kHz · 10 s']
        }
      }
    },

    // ── Octave Filter Bank (8 knobs de frecuencia central) ──────────────
    octaveFilterBank: {
      box: { x: 8, y: 466, w: 744, h: 93 },

      // Distribución idéntica a Input Amplifier Level (misma fila de 8 knobs)
      knobGap: 28.5,
      knobSize: 65,
      knobInnerPct: 78,
      knobsRowOffset: { x: 0, y: 18 },

      // Knobs azules, tipo normal (0-10)
      knobColor: 'blue',
      knobType: 'normal',

      // Frecuencias centrales de cada banda (Hz)
      // Etiquetas: 63, 125, 250, 500, 1k, 2k, 4k, 8k
      knobLabels: [63, 125, 250, 500, 1000, 2000, 4000, 8000],

      // Offsets individuales por banda (1..8)
      knobOffsets: [
        { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
        { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }
      ]
    },

    // ── Input Amplifier Level (módulo funcional, 8 knobs de ganancia) ───
    inputAmplifierLevel: {
      box: { x: 8, y: 559, w: 744, h: 93 },

      // Ajuste fino interno de la fila de knobs
      knobGap: 28.5,
      knobSize: 65,
      knobInnerPct: 78,
      knobsRowOffset: { x: 0, y: 18 },
      
      // Color del centro de los knobs (Synthi 100 original)
      // Los 8 knobs de input amplifier son blancos
      knobColor: 'white',
      knobType: 'normal',

      // Offsets individuales por canal (1..8)
      knobOffsets: [
        { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
        { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }
      ]
    },

    // ── External Treatment Devices (última fila, dos módulos lado a lado) ──
    // Cuatro mandos blancos por módulo (placeholders sin audio aún), en las
    // mismas columnas que los de Input Amplifier Level (paso 93,5 px) y con
    // el centro a 711,5 px del panel, medido en la foto.
    extTreatmentSend: {
      box: { x: 7.5, y: 653, w: 371, h: 94 },
      knobSize: 65,
      knobColor: 'white',
      knobs: [
        { x: 45.25, y: 58.5 }, { x: 138.75, y: 58.5 }, { x: 232.25, y: 58.5 }, { x: 325.75, y: 58.5 }
      ]
    },

    extTreatmentReturn: {
      box: { x: 380.5, y: 653, w: 371, h: 94 },
      knobSize: 65,
      knobColor: 'white',
      knobs: [
        { x: 46.25, y: 58.5 }, { x: 139.75, y: 58.5 }, { x: 233.25, y: 58.5 }, { x: 326.75, y: 58.5 }
      ]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // OVERRIDES VISUALES POR MÓDULO
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Permite ajustar la apariencia visual de cada módulo individual.
  //
  // Los datos de identidad (id, title), parámetros de audio (knobs, rangos,
  // curvas) y ruteo están en los configs de cada módulo:
  //   - configs/modules/oscilloscope.config.js
  //   - configs/modules/inputAmplifier.config.js
  //
  modules: {
    // ── Módulo funcional: Oscilloscope ──────────────────────────────────
    oscilloscope: {
      visible: true,
      // ui: { }  — overrides visuales del osciloscopio
    },

    // ── Placeholders (mandos sin funcionalidad aún) ─────────────────────
    // visible: false → módulo oculto (ocupa espacio pero invisible y no interactivo)
    frequencyMeter: {
      visible: true
    },

    octaveFilterBank: {
      visible: true
    },

    // ── Módulo funcional: Input Amplifier Level ─────────────────────────
    inputAmplifierLevel: {
      visible: true,
      // ui: { }  — overrides visuales del input amplifier
      // Soporta: knobGap, knobSize, knobInnerPct, knobsRowOffset, knobOffsets
    },

    // ── External Treatment Devices (dos módulos en la misma fila) ───────
    extTreatmentSend: {
      visible: true
    },

    extTreatmentReturn: {
      visible: true
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONEXIONES A MATRICES (Panel 5 y Panel 6)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Las conexiones de los módulos del Panel 2 a las matrices de audio y
  // control se declaran en los blueprints de cada matriz (fuente única de verdad):
  //
  //   - panel5.audio.blueprint.js
  //     · destinations: oscilloscope inputY (col 57), inputX (col 58)
  //     · sources: input amplifiers 1-8 (filas 67-74)
  //
  //   - panel6.control.blueprint.js
  //     · sources: input amplifiers 1-8 (filas 67-74)
  //
  //   - configs/modules/oscilloscope.config.js — parámetros de audio
  //   - configs/modules/inputAmplifier.config.js — parámetros de audio por canal
  //
};
