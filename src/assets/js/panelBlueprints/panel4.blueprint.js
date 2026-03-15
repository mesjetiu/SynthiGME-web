// ═══════════════════════════════════════════════════════════════════════════
// Panel 4 (Voltmeters, Sequencer Display, Keyboard Output Range) Blueprint
// ═══════════════════════════════════════════════════════════════════════════
//
// Este archivo define la ESTRUCTURA VISUAL del Panel 4 del Synthi 100.
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
// CONTENIDO DEL PANEL 4 (Synthi 100)
// ─────────────────────────────────────────────────────────────────────────────
//
// De arriba a abajo (4 filas):
//
//   Fila 0: Logo (espacio reservado para SVG con logo Synthi 100 / EMS)
//   Fila 1: 8 Voltímetros (Voltmeter 1-8, uno por output channel)
//   Fila 2: Sequencer Event Time (display numérico centrado)
//   Fila 3: Keyboard Output Range — 7 columnas iguales:
//     Col 1: Pitch Voltage Converter (vernier: Range)
//            Envelope Follower 1 (knob blanco: Range)
//            Envelope Follower 2 (knob blanco: Range)
//     Col 2: Upper Keyboard — Pitch (vernier), Key Velocity (amarillo),
//            Env. Control (blanco), Retrigger Key Release (selector rotativo ON/KBD)
//     Col 3: Lower Keyboard — Pitch (vernier), Key Velocity (amarillo),
//            Env. Control (blanco), Retrigger Key Release (selector rotativo ON/KBD)
//     Col 4: Sequencer Output Range Layer 1 (Voltage A vernier, Voltage B, Key 1)
//     Col 5: Sequencer Output Range Layer 2 (Voltage C vernier, Voltage D, Key 2)
//     Col 6: Sequencer Output Range Layer 3 (Voltage E vernier, Voltage F, Key 3)
//     Col 7: Invertor/Buffer (Gain, Offset) + Key 4
//   Fila 4 (bajo fila 3, cols 4-7): 4 frames de knob único:
//     Slew Limiter 1 (Slew Rate), Slew Limiter 2 (Slew Rate),
//     Slew Limiter 3 (Slew Rate), Option 1
//
// Para conexiones a matrices de audio (Panel 5) y control (Panel 6),
// ver la referencia cruzada al final de este archivo.
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 2,
  panelId: 'panel-4',

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
    offset: { x: 0, y: 0 },

    // Padding general del panel
    padding: { top: 8, right: 10, bottom: 8, left: 10 },

    // Gap vertical entre filas
    gap: 4,

    // ── Fila 0: Logo Synthi 100 / EMS ──────────────────────────────────
    // Espacio reservado para el SVG con el logo del sintetizador.
    // No contiene módulos; el SVG se insertará como imagen de fondo o
    // inline posteriormente. Ocupa ~1/5 del eje vertical del panel.
    logoArea: {
      flex: 1,              // proporción vertical (1 de 5 partes)
      offset: { x: 0, y: 0 }
    },

    // ── Fila 1: 8 Voltímetros ──────────────────────────────────────────
    voltmetersRow: {
      height: 120,
      gap: 3,               // Gap horizontal entre voltímetros
      offset: { x: 0, y: 0 },
      count: 8
    },

    // ── Configuración visual del voltímetro individual ─────────────────
    // Controla geometría SVG, posición de elementos y visibilidad.
    // La ventana del voltímetro recorta parte de la aguja, por lo que
    // estos parámetros permiten ajustar zoom, rango y posición del eje
    // para que la aguja encaje con la imagen de fondo del panel.
    //
    // Nota: la graduación (escala numérica, marcas) estará serigrafiada
    // en la imagen de fondo del panel, no en el SVG. Por eso los
    // elementos de escala y ticks se ocultan por defecto.
    voltmeter: {
      // ── ViewBox y zoom ─────────────────────────────────────────────
      // El viewBox define qué porción del SVG se ve en la ventana.
      // Reducir width/height = zoom in; aumentar = zoom out.
      // Mover x/y desplaza la vista (crop).
      viewBox: { x: 0, y: 0, width: 120, height: 75 },

      // ── Eje de la aguja (pivot) ────────────────────────────────────
      // Centro de rotación de la aguja en coordenadas SVG.
      pivot: { cx: 60, cy: 68 },

      // ── Aguja ──────────────────────────────────────────────────────
      needle: {
        length: 46,           // Longitud en unidades SVG (desde pivot hacia arriba)
        strokeWidth: 1,       // Grosor
        color: '#000000',     // Negro (sobre fondo del panel)
        lineCap: 'round'
      },

      // ── Pivote visual (círculo decorativo) ─────────────────────────
      pivotDot: {
        visible: false,       // Ocultar: no se ve en el panel real
        radius: 3,
        fill: '#444',
        stroke: '#666',
        strokeWidth: 0.5
      },

      // ── Fondo del medidor ──────────────────────────────────────────
      background: {
        visible: false,       // Ocultar: el fondo es la imagen del panel
        fill: '#0a0a0a',
        stroke: '#333',
        strokeWidth: 0.5,
        rx: 4
      },

      // ── Arco de fondo (banda detrás de la aguja) ───────────────────
      arc: {
        visible: false,       // Ocultar: serigrafiado en panel
        radius: 42,
        strokeWidth: 18,
        stroke: '#1a1a1a'
      },

      // ── Marcas de graduación (ticks) ───────────────────────────────
      ticks: {
        visible: false,       // Ocultar: serigrafiadas en panel
        count: 11,            // 0 a 10
        radius: 42,           // Radio del arco donde se colocan
        majorLength: 5,       // Longitud de marcas principales
        minorLength: 3,       // Longitud de marcas intermedias
        stroke: '#888',
        majorStrokeWidth: 1,
        minorStrokeWidth: 0.5
      },

      // ── Escalas numéricas ──────────────────────────────────────────
      scaleAC: {
        visible: false,       // Ocultar: serigrafiada en panel
        radius: 30,           // Radio del arco de texto
        fontSize: 6,
        fill: '#ccc'
      },
      scaleDC: {
        visible: false,       // Ocultar: serigrafiada en panel
        radius: 30,
        fontSize: 6,
        fill: '#8cf'
      },

      // ── Toggle (interruptor de modo) ───────────────────────────────
      toggle: {
        offset: { x: 0, y: 0 }   // Desplazamiento respecto a posición natural
      }
    },

    // ── Fila 2: Sequencer Event Time (display numérico centrado) ───────
    sequencerEventTime: {
      height: 80,
      offset: { x: 0, y: 0 }
    },

    // ── Fila 3: Keyboard Output Range (7 columnas) ─────────────────────
    keyboardOutputRange: {
      flex: 4,              // proporción vertical (4 de 5 partes, logo ocupa 1)
      gap: 3,               // Gap horizontal entre columnas
      offset: { x: 0, y: 0 },
      columns: 7,

      // ── Columna 1: PVC + Envelope Followers ─────────────────────────
      column1: {
        // Subdivisión vertical: 3 submódulos apilados
        subModules: [
          {
            id: 'pitchVoltageConverter',
            flex: 1,         // Proporción de altura
            knobs: [
              { name: 'Range', type: 'vernier' }
            ]
          },
          {
            id: 'envelopeFollower1',
            flex: 1,
            knobs: [
              { name: 'Range', type: 'normal', color: 'white' }
            ]
          },
          {
            id: 'envelopeFollower2',
            flex: 1,
            knobs: [
              { name: 'Range', type: 'normal', color: 'white' }
            ]
          }
        ],
        gap: 2               // Gap vertical entre submódulos
      },

      // ── Columna 2: Upper Keyboard ───────────────────────────────────
      //
      // Controles de arriba a abajo (tal y como aparecen en la serigrafía
      // del panel original del Synthi 100):
      //
      //   ┌─────────────────────────────────┐
      //   │  Pitch (vernier multivuelta)    │ Rango de afinación
      //   │  Key Velocity (knob amarillo)   │ Sensibilidad a velocidad
      //   │  Env. Control (knob blanco)     │ CV de envelope (−/+)
      //   │                                 │
      //   │  ▼ RETRIGGER KEY RELEASE        │ ← texto serigrafía
      //   │  ON ◉ KBD                       │ ← selector rotativo
      //   │  KEY RELEASE or NEW PITCH       │ ← texto serigrafía
      //   └─────────────────────────────────┘
      //
      // El selector rotativo "Retrigger Key Release" controla cuándo
      // el envelope se redispara al tocar notas:
      //
      //   ON  → Retrigger activo (Key Release or New Pitch):
      //         re-disparo automático al cambiar de pitch, aunque
      //         mantengas la tecla anterior.  Ejecución legato.
      //   KBD → Solo Key Release: debes soltar todas las teclas
      //         antes de que un nuevo ataque dispare la envolvente.
      //         Ejecución staccato clásica.
      //
      // En el hardware es un interruptor rotativo pequeño (no toggle
      // de palanca). Se implementa con el componente RotarySwitch.
      // Los textos "RETRIGGER KEY RELEASE" y "KEY RELEASE or NEW PITCH"
      // son parte de la imagen de fondo del panel (serigrafía), no DOM.
      //
      column2: {
        id: 'upperKeyboard',
        knobs: [
          { name: 'Pitch', type: 'vernier' },
          { name: 'Key Velocity', type: 'bipolar', color: 'yellow' },
          { name: 'Env. Control', type: 'bipolar', color: 'white' }
        ],
        switches: [
          { name: 'Retrigger Key Release', type: 'rotarySwitch', labelA: 'On', labelB: 'Kbd' }
        ],
        knobGap: 4,          // Gap vertical entre knobs
        switchGap: 4          // Gap entre último knob y selector rotativo
      },

      // ── Columna 3: Lower Keyboard ──────────────────────────────────
      // Misma disposición que Upper Keyboard (columna 2).
      // Ver comentarios de column2 para la descripción del selector
      // rotativo "Retrigger Key Release" (ON / KBD).
      column3: {
        id: 'lowerKeyboard',
        knobs: [
          { name: 'Pitch', type: 'vernier' },
          { name: 'Key Velocity', type: 'bipolar', color: 'yellow' },
          { name: 'Env. Control', type: 'bipolar', color: 'white' }
        ],
        switches: [
          { name: 'Retrigger Key Release', type: 'rotarySwitch', labelA: 'On', labelB: 'Kbd' }
        ],
        knobGap: 4,
        switchGap: 4
      },

      // ── Columnas 4-7: Sequencer Section ─────────────────────────────
      //
      // Ocupa el espacio restante a la derecha de los keyboards.
      // Se organiza internamente en 2 filas horizontales:
      //
      //   Fila 1: 4 módulos en columna (Seq Output Range × 3 + Invertor/Buffer + Key 4)
      //   Fila 2: 4 frames de un solo knob (Slew Limiters × 3 + Option 1)
      //
      // Todos los knobs por defecto a 0.
      //
      sequencerSection: {
        gap: 3,              // Gap entre fila 1 y fila 2

        // ── Fila 1: 4 módulos con forma de columna ────────────────────
        row1: {
          gap: 3,            // Gap horizontal entre columnas

          // ── Columna 4: Sequencer Output Range Layer 1 ───────────────
          column4: {
            id: 'seqOutputRangeL1',
            knobs: [
              { name: 'Voltage A', type: 'vernier', min: 0, max: 10, default: 0 },
              { name: 'Voltage B', type: 'normal', color: 'white', min: 0, max: 10, default: 0 },
              { name: 'Key 1', type: 'bipolar', color: 'white', min: -5, max: 5, default: 0 }
            ],
            knobGap: 4
          },

          // ── Columna 5: Sequencer Output Range Layer 2 ───────────────
          column5: {
            id: 'seqOutputRangeL2',
            knobs: [
              { name: 'Voltage C', type: 'vernier', min: 0, max: 10, default: 0 },
              { name: 'Voltage D', type: 'normal', color: 'white', min: 0, max: 10, default: 0 },
              { name: 'Key 2', type: 'bipolar', color: 'white', min: -5, max: 5, default: 0 }
            ],
            knobGap: 4
          },

          // ── Columna 6: Sequencer Output Range Layer 3 ───────────────
          column6: {
            id: 'seqOutputRangeL3',
            knobs: [
              { name: 'Voltage E', type: 'vernier', min: 0, max: 10, default: 0 },
              { name: 'Voltage F', type: 'normal', color: 'white', min: 0, max: 10, default: 0 },
              { name: 'Key 3', type: 'bipolar', color: 'white', min: -5, max: 5, default: 0 }
            ],
            knobGap: 4
          },

          // ── Columna 7: Invertor/Buffer + Key 4 ──────────────────────
          //
          // Subdivida verticalmente en dos submódulos:
          //   - Invertor/Buffer (2/3 del alto): Gain + Offset
          //   - Key 4 (1/3 del alto): un solo knob
          //
          column7: {
            subModules: [
              {
                id: 'invertorBuffer',
                flex: 2,
                knobs: [
                  { name: 'Gain', type: 'bipolar', color: 'blue', min: -5, max: 5, default: 0 },
                  { name: 'Offset', type: 'bipolar', color: 'white', min: -5, max: 5, default: 0 }
                ],
                knobGap: 4
              },
              {
                id: 'key4',
                flex: 1,
                knobs: [
                  { name: 'Key 4', type: 'bipolar', color: 'white', min: -5, max: 5, default: 0 }
                ]
              }
            ],
            gap: 2
          }
        },

        // ── Fila 2: 4 frames de un solo knob ──────────────────────────
        row2: {
          gap: 3,            // Gap horizontal entre frames

          slewLimiter1: {
            id: 'slewLimiter1',
            knobs: [
              { name: 'Slew Rate', type: 'normal', color: 'red', min: 0, max: 10, default: 0 }
            ]
          },

          slewLimiter2: {
            id: 'slewLimiter2',
            knobs: [
              { name: 'Slew Rate', type: 'normal', color: 'red', min: 0, max: 10, default: 0 }
            ]
          },

          slewLimiter3: {
            id: 'slewLimiter3',
            knobs: [
              { name: 'Slew Rate', type: 'normal', color: 'red', min: 0, max: 10, default: 0 }
            ]
          },

          option1: {
            id: 'option1',
            knobs: [
              { type: 'normal', color: 'red', min: 0, max: 10, default: 0 }
            ]
          }
        }
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN VISUAL POR DEFECTO PARA KNOBS DEL PANEL 4
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Valores generales que aplican a todos los knobs del panel 4.
  // Cada módulo puede sobrescribir en modules.<id>.ui.
  //
  panel4KnobUI: {
    standardKnobSize: 45,      // px — diámetro del knob estándar
    vernierKnobSize: 55,       // px — diámetro del knob vernier (multivuelta)
    knobInnerPct: 76,          // % — círculo interior respecto al exterior
    toggleScale: 0.7           // factor de escala del toggle switch
  },

  // ─────────────────────────────────────────────────────────────────────────
  // OVERRIDES VISUALES POR MÓDULO
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Permite ajustar la apariencia visual de cada módulo individual.
  //
  modules: {
    // ── Fila 1: Voltímetros (placeholders visibles, sin contenido) ──────
    voltmeter1: { visible: true },
    voltmeter2: { visible: true },
    voltmeter3: { visible: true },
    voltmeter4: { visible: true },
    voltmeter5: { visible: true },
    voltmeter6: { visible: true },
    voltmeter7: { visible: true },
    voltmeter8: { visible: true },

    // ── Fila 2: Sequencer Event Time (placeholder visible, sin contenido)
    sequencerEventTime: { visible: true },

    // ── Fila 3, Col 1: Pitch Voltage Converter + Envelope Followers ─────
    pitchVoltageConverter: { visible: true },
    envelopeFollower1: { visible: true },
    envelopeFollower2: { visible: true },

    // ── Fila 3, Col 2: Upper Keyboard ───────────────────────────────────
    upperKeyboard: { visible: true },

    // ── Fila 3, Col 3: Lower Keyboard ───────────────────────────────────
    lowerKeyboard: { visible: true },

    // ── Fila 3, Cols 4-7: Sequencer Section ─────────────────────────────
    seqOutputRangeL1: { visible: true },
    seqOutputRangeL2: { visible: true },
    seqOutputRangeL3: { visible: true },
    invertorBuffer: { visible: true },
    key4: { visible: true },
    slewLimiter1: { visible: true },
    slewLimiter2: { visible: true },
    slewLimiter3: { visible: true },
    option1: { visible: true }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONEXIONES A MATRICES (Panel 5 y Panel 6)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Las conexiones de los módulos del Panel 4 a las matrices de audio y
  // control se declararán en los blueprints de cada matriz cuando se
  // implementen los módulos funcionales:
  //
  //   - panel5.audio.blueprint.js
  //   - panel6.control.blueprint.js
  //
};
