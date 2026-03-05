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
// De arriba a abajo (3 filas):
//
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
//     Col 4-7: pendientes de definición
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

    // ── Fila 1: 8 Voltímetros ──────────────────────────────────────────
    voltmetersRow: {
      height: 120,
      gap: 3,               // Gap horizontal entre voltímetros
      offset: { x: 0, y: 0 },
      count: 8
    },

    // ── Fila 2: Sequencer Event Time (display numérico centrado) ───────
    sequencerEventTime: {
      height: 80,
      offset: { x: 0, y: 0 }
    },

    // ── Fila 3: Keyboard Output Range (7 columnas) ─────────────────────
    keyboardOutputRange: {
      height: 0,            // 0 = ocupar espacio restante (flex: 1)
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
              { name: 'Range', type: 'standard', color: 'white' }
            ]
          },
          {
            id: 'envelopeFollower2',
            flex: 1,
            knobs: [
              { name: 'Range', type: 'standard', color: 'white' }
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
          { name: 'Key Velocity', type: 'standard', color: 'yellow', bipolar: true },
          { name: 'Env. Control', type: 'standard', color: 'white', bipolar: true }
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
          { name: 'Key Velocity', type: 'standard', color: 'yellow', bipolar: true },
          { name: 'Env. Control', type: 'standard', color: 'white', bipolar: true }
        ],
        switches: [
          { name: 'Retrigger Key Release', type: 'rotarySwitch', labelA: 'On', labelB: 'Kbd' }
        ],
        knobGap: 4,
        switchGap: 4
      }

      // Columnas 4-7: pendientes de definición
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
    lowerKeyboard: { visible: true }

    // Columnas 4-7: se añadirán cuando se definan
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
