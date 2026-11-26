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
// De arriba a abajo (cada módulo en su caja, ver layout):
//
//   Arriba: logo Synthi 100 / EMS (está en la imagen de fondo; sin módulos)
//   Fila 1: 8 Voltímetros (Voltmeter 1-8, uno por output channel)
//   Fila 2: Sequencer Event Time (display numérico centrado)
//   Fila 3: Keyboard Output Range — 7 columnas:
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
  //
  // Cada módulo se coloca con una caja absoluta box: { x, y, w, h } en px
  // del panel (760×760 = la imagen de fondo; ver utils/panelBox.js). Mover
  // uno no mueve los demás. Dentro de cada caja, los mandos siguen apilados
  // y centrados como antes (flex).
  //
  // Las cajas son las que daba el árbol flex anterior (padding 8/10, gap 4,
  // fila de logo flex 1, voltímetros 120, Event Time 80, Keyboard Output
  // Range flex 4…), medidas en la web: el panel queda idéntico. Todavía NO
  // están cuadradas con la foto (hoja de ruta, 1.3).

  layout: {
    // ── Fila 1: 8 Voltímetros (uno por canal de salida) ────────────────
    voltmeters: {
      boxes: [
        { x: 10, y: 118.40625, w: 89.875, h: 120 },
        { x: 102.875, y: 118.40625, w: 89.875, h: 120 },
        { x: 195.75, y: 118.40625, w: 89.875, h: 120 },
        { x: 288.625, y: 118.40625, w: 89.875, h: 120 },
        { x: 381.5, y: 118.40625, w: 89.875, h: 120 },
        { x: 474.375, y: 118.40625, w: 89.875, h: 120 },
        { x: 567.25, y: 118.40625, w: 89.875, h: 120 },
        { x: 660.125, y: 118.40625, w: 89.875, h: 120 }
      ]
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
      // ── Ventana visible del medidor (px absolutos) ────────────────
      // Recorta y muestra la aguja. Posición absoluta dentro del
      // contenido del ModuleFrame. Todos los valores en píxeles.
      // Para mover el contenido (aguja, escala): ajustar viewBox.
      // Para redimensionar la ventana: ajustar width/height.
      window: {
        left: 2,
        top: 2,
        width: 90,
        height: 70,
        overflow: 'hidden',
        // Recuadro de depuración para ajustar la ventana contra la foto.
        // En la web publicada, siempre false.
        debugBorder: false,
        debugBorderColor: 'cyan',
        debugBorderWidth: 1
      },

      // ── ViewBox SVG — controla zoom y pan del contenido ────────────
      // Reducir width/height = zoom in; aumentar = zoom out.
      // Mover x/y = desplazar la vista (pan).
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
        visible: false,      // Por defecto transparente para ver el PNG del panel
        fill: 'transparent',
        stroke: 'transparent',
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

      // ── Toggle (interruptor de modo) ─────────────────────────────
      // Centrado horizontalmente automático. top en px.
      toggle: {
        top: 86,
        scale: 1
      }
    },

    // ── Fila 2: Sequencer Event Time (display numérico centrado) ───────
    sequencerEventTime: {
      box: { x: 10, y: 242.40625, w: 740, h: 80 }
    },

    // ── Fila 3, columna 1: PVC + Envelope Followers ────────────────────
    pitchVoltageConverter: {
      box: { x: 10, y: 326.40625, w: 103.859375, h: 140.53125 },
      knobs: [
        { name: 'Range', type: 'vernier' }
      ]
    },
    envelopeFollower1: {
      box: { x: 10, y: 468.9375, w: 103.859375, h: 140.53125 },
      knobs: [
        { name: 'Range', type: 'normal', color: 'white' }
      ]
    },
    envelopeFollower2: {
      box: { x: 10, y: 611.46875, w: 103.859375, h: 140.53125 },
      knobs: [
        { name: 'Range', type: 'normal', color: 'white' }
      ]
    },

    // ── Fila 3, columnas 2 y 3: Upper / Lower Keyboard ─────────────────
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
    // Los mandos se cablean por su índice (0 Pitch, 1 Key Velocity,
    // 2 Env. Control): no cambiar el orden.
    //
    upperKeyboard: {
      box: { x: 116.859375, y: 326.40625, w: 105.859375, h: 425.59375 },
      knobs: [
        { name: 'Pitch', type: 'vernier' },
        { name: 'Key Velocity', type: 'bipolar', color: 'yellow' },
        { name: 'Env. Control', type: 'bipolar', color: 'white' }
      ],
      switches: [
        { name: 'Retrigger Key Release', type: 'rotarySwitch', labelA: 'On', labelB: 'Kbd' }
      ],
      knobGap: 4,          // Gap vertical entre knobs
      switchGap: 4         // Gap entre último knob y selector rotativo
    },
    lowerKeyboard: {
      box: { x: 225.71875, y: 326.40625, w: 105.859375, h: 425.59375 },
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

    // ── Fila 3, columnas 4-7: Sequencer Section ────────────────────────
    //
    // Arriba, cuatro columnas: Sequencer Output Range × 3 e
    // Invertor/Buffer + Key 4 (2/3 y 1/3 del alto). Debajo, cuatro marcos
    // de un solo mando: Slew Limiter × 3 y Option 1.
    //
    // Los mandos del secuenciador se enlazan por su nombre ('Voltage A'…
    // 'Key 4'): no cambiarlo sin cambiar el montaje.
    //
    seqOutputRangeL1: {
      box: { x: 334.578125, y: 326.40625, w: 102.09375, h: 329.59375 },
      knobs: [
        { name: 'Voltage A', type: 'vernier', min: 0, max: 10, default: 0 },
        { name: 'Voltage B', type: 'normal', color: 'white', min: 0, max: 10, default: 0 },
        { name: 'Key 1', type: 'bipolar', color: 'white', min: -5, max: 5, default: 0 }
      ],
      knobGap: 4
    },
    seqOutputRangeL2: {
      box: { x: 439.671875, y: 326.40625, w: 102.109375, h: 329.59375 },
      knobs: [
        { name: 'Voltage C', type: 'vernier', min: 0, max: 10, default: 0 },
        { name: 'Voltage D', type: 'normal', color: 'white', min: 0, max: 10, default: 0 },
        { name: 'Key 2', type: 'bipolar', color: 'white', min: -5, max: 5, default: 0 }
      ],
      knobGap: 4
    },
    seqOutputRangeL3: {
      box: { x: 544.78125, y: 326.40625, w: 102.109375, h: 329.59375 },
      knobs: [
        { name: 'Voltage E', type: 'vernier', min: 0, max: 10, default: 0 },
        { name: 'Voltage F', type: 'normal', color: 'white', min: 0, max: 10, default: 0 },
        { name: 'Key 3', type: 'bipolar', color: 'white', min: -5, max: 5, default: 0 }
      ],
      knobGap: 4
    },
    invertorBuffer: {
      box: { x: 649.890625, y: 326.40625, w: 100.109375, h: 217.734375 },
      knobs: [
        { name: 'Gain', type: 'bipolar', color: 'blue', min: -5, max: 5, default: 0 },
        { name: 'Offset', type: 'bipolar', color: 'white', min: -5, max: 5, default: 0 }
      ],
      knobGap: 4
    },
    key4: {
      box: { x: 649.890625, y: 546.140625, w: 100.109375, h: 109.859375 },
      knobs: [
        { name: 'Key 4', type: 'bipolar', color: 'white', min: -5, max: 5, default: 0 }
      ]
    },

    slewLimiter1: {
      box: { x: 334.578125, y: 659, w: 101.59375, h: 93 },
      knobs: [
        { name: 'Slew Rate', type: 'normal', color: 'red', min: 0, max: 10, default: 0 }
      ]
    },
    slewLimiter2: {
      box: { x: 439.171875, y: 659, w: 101.609375, h: 93 },
      knobs: [
        { name: 'Slew Rate', type: 'normal', color: 'red', min: 0, max: 10, default: 0 }
      ]
    },
    slewLimiter3: {
      box: { x: 543.78125, y: 659, w: 101.609375, h: 93 },
      knobs: [
        { name: 'Slew Rate', type: 'normal', color: 'red', min: 0, max: 10, default: 0 }
      ]
    },
    option1: {
      box: { x: 648.390625, y: 659, w: 101.609375, h: 93 },
      knobs: [
        { type: 'normal', color: 'red', min: 0, max: 10, default: 0 }
      ]
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
