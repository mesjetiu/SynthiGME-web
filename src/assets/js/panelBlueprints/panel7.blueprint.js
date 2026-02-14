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
// Fila superior (placeholders con controles visuales, sin audio aún):
//   - Joystick Left  (knobs: Range Horizontal, Range Vertical + pad joystick)
//   - Sequencer Operational Control (8 switches + 8 botones + knob Clock Rate)
//   - Joystick Right (knobs: Range Horizontal, Range Vertical + pad joystick)
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
    // Offset general del panel (px) — desplaza todos los módulos
    // respecto a la imagen de fondo. Útil para ajustes finos.
    offset: { x: 0, y: 27 },

    // Padding general del panel
    padding: { top: 0, right: 10, bottom: 10, left: 10 },

    // Fila superior: Joystick Left | Sequencer | Joystick Right
    upperRow: {
      gap: 2,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },

      // Offset de toda la fila superior (joysticks + sequencer)
      offset: { x: 0, y: 0 },

      // Tamaño fijo del MARCO de cada tipo de módulo (px).
      // El contenido se ajusta dentro sin afectar al marco.
      joystickSize:  { width: 215, height: 240 },
      sequencerSize: { width: 252, height: 240 },

      // Joystick Left: layout de 2 columnas (knobs izq | joystick pad der)
      // Totalmente independiente de joystickRight.
      joystickLeft: {
        knobs: ['Range Horizontal', 'Range Vertical'],
        knobSize: 65,

        // Ajuste fino interno del joystick izquierdo
        layoutGap: 6,                 // gap entre columna de knobs y joystick pad
        knobsGap: 15,                  // gap vertical entre knobs
        knobsOffset: { x: 15, y: 35 }, // offset de la columna de knobs
        padOffset: { x: 0, y: 0 },    // offset del pad
        knobOffsets: [                // offsets por knob [RangeY, RangeX]
          { x: 0, y: 0 },
          { x: 0, y: 0 }
        ]
      },

      // Joystick Right: layout de 2 columnas (knobs | pad en columnas invertidas por CSS)
      // Totalmente independiente de joystickLeft.
      joystickRight: {
        knobs: ['Range Horizontal', 'Range Vertical'],
        knobSize: 65,

        // Ajuste fino interno del joystick derecho
        layoutGap: 6,
        knobsGap: 15,
        knobsOffset: { x: -15, y: 35 },
        padOffset: { x: 0, y: 0 },
        knobOffsets: [
          { x: 0, y: 0 },
          { x: 0, y: 0 }
        ]
      },

      // Sequencer Operational Control
      sequencer: {
        switches: [
          'A/B+ Dey 1', 'B', 'C+ Key 2', 'D',
          'E+ Key 3', 'F', 'Key 4', 'Stop Clock'
        ],
        buttons: [
          'Master Reset', 'Run Forward', 'Run Reverse', 'Stop',
          'Reset Sequence', 'Step Forward', 'Step Reverse', 'Test O/P'
        ],

        // Ajuste fino del bloque de sequencer
        contentPadding: { top: 4, right: 4, bottom: 4, left: 4 },
        rowsGap: 8,                       // separación vertical entre filas internas del sequencer
        switchesGap: 4,                   // gap horizontal entre switches
        buttonsGap: 4,                    // gap horizontal entre botones
        switchesOffset: { x: 0, y: 0 },   // offset de la fila de switches
        buttonsOffset: { x: 0, y: 0 },    // offset de la fila de botones
        clockRateOffset: { x: 0, y: 0 },  // offset de la fila del knob Clock Rate
        clockRateKnobOffset: { x: 0, y: 0 }, // offset del knob Clock Rate

        // Offsets individuales por control (8 + 8)
        switchOffsets: [
          { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
          { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }
        ],
        buttonOffsets: [
          { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
          { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }
        ],

        // Fila adicional bajo botones: knob central "Clock Rate"
        clockRate: {
          label: 'Clock Rate',
          knobSize: 'sm'
        }
      }
    },

    // Fila inferior: 8 Output Channels
    lowerRow: {
      gap: 8,
      padding: { top: 8, right: 8, bottom: 12, left: 8 },
      // Offset de toda la fila inferior (Output Channels)
      offset: { x: 0, y: 0 },

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
      visible: true,
      // ui: { }  — overrides visuales del joystick izquierdo.
      // Soporta: offset, knobSize, layoutGap, knobsGap, knobsOffset, padOffset, knobOffsets
    },

    // visible: false → módulo oculto (ocupa espacio pero invisible y no interactivo)
    sequencer: {
      visible: true,
      // ui: { }  — overrides visuales del sequencer.
      // Soporta: offset, contentPadding, rowsGap, switchesGap, buttonsGap,
      //          switchesOffset, buttonsOffset, switchOffsets, buttonOffsets,
      //          clockRateOffset, clockRateKnobOffset,
      //          clockRate { label, knobSize }
    },

    joystickRight: {
      visible: true,
      // ui: { }  — overrides visuales del joystick derecho.
      // Soporta: offset, knobSize, layoutGap, knobsGap, knobsOffset, padOffset, knobOffsets
    },

    // ── Fila inferior: Output Channels 1-8 ──────────────────────────────
    oc1: { visible: true },
    oc2: { visible: true },
    oc3: { visible: true },
    oc4: { visible: true },
    oc5: { visible: true },
    oc6: { visible: true },
    oc7: { visible: true },
    oc8: { visible: true }
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
