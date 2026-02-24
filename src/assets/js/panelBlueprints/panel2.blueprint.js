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
//   - Frequency Meter (placeholder, sin audio aún)
//   - Octave Filter Bank (placeholder, sin audio aún)
//   - Input Amplifier Level (funcional, 8 canales de entrada)
//   - External Treatment Devices (última fila, dos módulos lado a lado):
//       · Send Level (placeholder, sin audio aún)
//       · Return Level (placeholder, sin audio aún)
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
  showFrames: true,

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DEL LAYOUT VISUAL
  // ─────────────────────────────────────────────────────────────────────────
  //
  // El panel (760×760 px) se divide en 5 filas de arriba a abajo.
  // Cada fila contiene uno o más módulos con tamaño fijo (width × height) en px.
  // offset: desplazamiento fino del módulo respecto a su posición en la fila.
  // gap: separación vertical fija entre filas.
  //

  layout: {
    // Offset general del panel (px) — desplaza todos los módulos
    // respecto a la imagen de fondo. Útil para ajustes finos.
    offset: { x: 0, y: 0 },

    // Padding general del panel
    padding: { top: 10, right: 15, bottom: 10, left: 15 },

    // Gap vertical entre secciones de módulos
    gap: 6,

    // ── Sección del osciloscopio (módulo funcional, el más grande) ──────
    oscilloscope: {
      size: { width: 527, height: 225 },

      // Ajuste fino del bloque completo del osciloscopio
      offset: { x: 105, y: 22 },

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
      display: {
        size: { width: 200, height: 150 },
        offset: { x: 0, y: 0 },
        transparent: true
      }
    },

    // ── Frequency Meter (placeholder) ───────────────────────────────────
    frequencyMeter: {
      size: { width: 744, height: 143 },
      offset: { x: -7, y: 81 }
    },

    // ── Octave Filter Bank (placeholder) ────────────────────────────────
    octaveFilterBank: {
      size: { width: 744, height: 93 },
      offset: { x: -7, y: 76 }
    },

    // ── Input Amplifier Level (módulo funcional, 8 knobs de ganancia) ───
    inputAmplifierLevel: {
      size: { width: 744, height: 93 },

      // Ajuste fino del bloque completo
      offset: { x: -7, y: 70 },

      // Ajuste fino interno de la fila de knobs
      knobGap: 28.5,
      knobSize: 65,
      knobInnerPct: 78,
      knobsRowOffset: { x: 0, y: 18 },

      // Offsets individuales por canal (1..8)
      knobOffsets: [
        { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
        { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }
      ]
    },

    // ── External Treatment Devices (última fila, dos módulos lado a lado) ──
    externalTreatmentRow: {
      gap: 2,  // px — separación horizontal entre Send y Return

      extTreatmentSend: {
        size: { width: 371, height: 94 },
        offset: { x: -7.5, y: 65 }
      },

      extTreatmentReturn: {
        size: { width: 371, height: 94 },
        offset: { x: -7.5, y: 65 }
      }
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

    // ── Placeholders (sin funcionalidad aún) ────────────────────────────
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
      // Soporta: offset, knobGap, knobSize, knobInnerPct, knobsRowOffset, knobOffsets
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
