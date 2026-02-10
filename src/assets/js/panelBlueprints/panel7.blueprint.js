// ═══════════════════════════════════════════════════════════════════════════
// Panel 7 (Output Channels) Blueprint
// ═══════════════════════════════════════════════════════════════════════════
//
// Este archivo define la ESTRUCTURA VISUAL del Panel 7 del Synthi 100.
// Para PARÁMETROS de audio (rangos, curvas, calibración), ver los configs por módulo:
//   - configs/modules/outputChannel.config.js
//
// ─────────────────────────────────────────────────────────────────────────────
// SEPARACIÓN BLUEPRINT vs CONFIG
// ─────────────────────────────────────────────────────────────────────────────
//
// Los archivos de panelBlueprints siguen una convención de dos archivos:
//
// 1. *.blueprint.js — ESTRUCTURA (este archivo)
//    - Layout visual (posiciones, tamaños, grid)
//    - Slots y distribución de módulos
//    - NO contiene valores numéricos de parámetros de audio
//    - NO contiene channelCount (eso va en outputChannel.config.js)
//    - NO contiene listas de controles (eso va en el config de cada módulo)
//    - NO contiene mapeo a filas/columnas de matriz (eso va en panel5/panel6 blueprints)
//    - NO contiene routing (eso va en los configs de cada módulo)
//
// 2. configs/modules/*.config.js — PARÁMETROS (uno por tipo de módulo)
//    - Rangos de frecuencia, ganancia, etc.
//    - Curvas de respuesta (linear, exponential)
//    - Valores iniciales de knobs/faders
//    - Número de instancias (count)
//    - Calibración por módulo
//
// ─────────────────────────────────────────────────────────────────────────────
// CONTENIDO DEL PANEL 7 (Synthi 100)
// ─────────────────────────────────────────────────────────────────────────────
//
// Fila superior (placeholders, sin audio aún):
//   - Joystick Left
//   - Sequencer Operational Control
//   - Joystick Right
//
// Fila inferior:
//   - 8 Output Channels (cada uno con Filter, Pan, Switch y Level Fader)
//
// Para conexiones a matrices de audio (Panel 5) y control (Panel 6),
// ver la referencia cruzada al final de este archivo.
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 2,
  panelId: 'panel-7',

  // Mostrar/ocultar marcos de todos los módulos del panel.
  // true  → marcos visibles (útil para posicionar contra imagen de fondo)
  // false → marcos invisibles (aspecto final limpio)
  showFrames: true,

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DEL LAYOUT VISUAL
  // ─────────────────────────────────────────────────────────────────────────

  layout: {
    // Padding general del panel
    padding: { top: 10, right: 10, bottom: 10, left: 10 },

    // Fila superior: Joystick Left | Sequencer | Joystick Right
    upperRow: {
      gap: 8,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },

      // Tamaño fijo del MARCO de cada tipo de módulo (px).
      // El contenido se ajusta dentro sin afectar al marco.
      joystickSize:  { width: 160, height: 180 },
      sequencerSize: { width: 420, height: 180 }
    },

    // Fila inferior: 8 Output Channels
    lowerRow: {
      gap: 8,
      padding: { top: 8, right: 8, bottom: 12, left: 8 },

      // Tamaño fijo del MARCO de cada canal (px)
      channelSize: { width: 80, height: 350 },

      // Configuración del slider de nivel (dentro de cada canal)
      slider: {
        shellHeight: 270,
        height: 250,
        width: 24
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN VISUAL INTERIOR DE CADA OUTPUT CHANNEL (defaults)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Valores generales que aplican a todos los output channels.
  // Cada canal puede sobrescribir cualquier propiedad en su módulo
  // (ver modules.oc1.ui, etc.). Se hace merge shallow: lo que el módulo
  // defina gana sobre estos defaults.
  //
  outputChannelUI: {
    // Knobs (filter, pan)
    knobSize: 30,            // px — diámetro del knob
    knobInnerPct: 76,        // % — círculo interior respecto al exterior
    knobGap: [8],            // px — gap entre cada par de knobs
    knobRowOffsetX: 0,       // px — desplazamiento horizontal de la fila de knobs
    knobRowOffsetY: 0,       // px — desplazamiento vertical de la fila de knobs

    // Padding interno del contenido (espacio entre borde del marco y controles)
    contentPadding: { top: 6, right: 4, bottom: 8, left: 4 }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // OVERRIDES VISUALES POR MÓDULO
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Permite ajustar la apariencia visual de cada módulo individual respecto
  // a los defaults de su tipo (outputChannelUI).
  //
  // Los datos de identidad (id, title), parámetros de audio (knobs, rangos,
  // curvas) y ruteo están en configs/modules/outputChannel.config.js.
  //
  modules: {
    // ── Fila superior (placeholders sin funcionalidad) ──────────────────
    joystickLeft: {
      // ui: { }  — overrides visuales cuando se implemente
    },

    sequencer: {
      // ui: { }  — overrides visuales cuando se implemente
    },

    joystickRight: {
      // ui: { }  — overrides visuales cuando se implemente
    },

    // ── Fila inferior: Output Channels 1-8 ──────────────────────────────
    oc1: { /* ui: { } */ },
    oc2: { /* ui: { } */ },
    oc3: { /* ui: { } */ },
    oc4: { /* ui: { } */ },
    oc5: { /* ui: { } */ },
    oc6: { /* ui: { } */ },
    oc7: { /* ui: { } */ },
    oc8: { /* ui: { } */ }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONEXIONES A MATRICES (Panel 5 y Panel 6)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Las conexiones de los módulos del Panel 7 a las matrices de audio y
  // control se declaran en los blueprints de cada matriz (fuente única de verdad):
  //
  //   - panel5.audio.blueprint.js
  //     · destinations: output channels 1-8 (columnas 42-49)
  //
  //   - configs/modules/outputChannel.config.js — parámetros de audio por canal
  //
  // Routing: Los Output Channels reciben señal de los Output Buses (1-8)
  // de la matriz y la envían a las salidas físicas del sistema de audio.
  //
};
