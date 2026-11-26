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
  showFrames: false,

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DEL LAYOUT VISUAL
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Cada módulo se coloca con una caja absoluta box: { x, y, w, h } en px
  // del panel (760×760 = la imagen de fondo; ver utils/panelBox.js), y cada
  // mando con su centro { x, y } en px relativos a esa caja (centers, por
  // la clave del mando). Mover uno no mueve nada más.
  //
  // Medido sobre panel_1.jpg (hoja de ruta, 1.3, paso 2):
  // - Cajas: los marcos serigrafiados, por el centro de sus líneas
  //   (tests/visual/lineas.py y perfiles de oscuridad), a 0,25 px. La foto
  //   está girada ~0,4° (las líneas bajan ~5 px de izquierda a derecha): en
  //   las fronteras largas (filtros/envolventes, envolventes/fila inferior)
  //   la caja va por la media de la línea, para que no se solapen.
  // - Mandos: x en el eje del mando, y en el centro de su escala
  //   transparente, las dos en el plano del panel. Se toman de la flecha ▼
  //   serigrafiada encima de cada mando: centro = base de la flecha + 38,9
  //   (calibrado a vista en cuatro mandos de zonas distintas). El capuchón
  //   sobresale y en la foto sale corrido por la paralaje.
  // - Selector de modo, botón de gate y LED de las envolventes: a vista
  //   (el LED, por el centro de su rojo).

  layout: {
    // ── Filtros FLP 1-4 + FHP 1-4 ───────────────────────────────────────
    filters: {
      modules: {
        flp1: {
          box: { x: 6.25, y: 50, w: 93, h: 287.25 },
          centers: {
            frequency: { x: 46.75, y: 72.25 },
            response: { x: 46.25, y: 158 },
            level: { x: 46, y: 243.5 }
          }
        },
        flp2: {
          box: { x: 99.25, y: 50.75, w: 93.25, h: 287.25 },
          centers: {
            frequency: { x: 46.75, y: 71.75 },
            response: { x: 46.5, y: 157.75 },
            level: { x: 46.5, y: 243.5 }
          }
        },
        flp3: {
          box: { x: 192.5, y: 51.5, w: 94, h: 287 },
          centers: {
            frequency: { x: 47, y: 71.25 },
            response: { x: 46.75, y: 157 },
            level: { x: 46.75, y: 243 }
          }
        },
        flp4: {
          box: { x: 286.5, y: 52, w: 93.5, h: 287 },
          centers: {
            frequency: { x: 47, y: 70.75 },
            response: { x: 46.75, y: 157 },
            level: { x: 46.75, y: 243 }
          }
        },
        fhp1: {
          box: { x: 380, y: 52.75, w: 93, h: 286.25 },
          centers: {
            frequency: { x: 47, y: 70.5 },
            response: { x: 46.75, y: 157.25 },
            level: { x: 46.5, y: 243 }
          }
        },
        fhp2: {
          box: { x: 473, y: 53.5, w: 93.5, h: 285.5 },
          centers: {
            frequency: { x: 48, y: 70 },
            response: { x: 47.5, y: 156.5 },
            level: { x: 47.25, y: 242.5 }
          }
        },
        fhp3: {
          box: { x: 566.5, y: 54, w: 93.5, h: 285 },
          centers: {
            frequency: { x: 47, y: 70.25 },
            response: { x: 46.75, y: 156.75 },
            level: { x: 47, y: 242 }
          }
        },
        fhp4: {
          box: { x: 660, y: 54.75, w: 94.25, h: 284.25 },
          centers: {
            frequency: { x: 47.25, y: 70.5 },
            response: { x: 47, y: 156.75 },
            level: { x: 47.25, y: 242 }
          }
        }
      },
      // Cada filtro tiene 3 knobs en columna vertical:
      // Frequency, Response, Level
      knobs: ['Frequency', 'Response', 'Level'],
      knobColors: ['blue', 'yellow', 'white'],
      knobTypes: ['normal', 'normal', 'normal'],
      knobSize: 65,
      knobInnerPct: 78
    },

    // ── Envelope Shapers 1-3 ────────────────────────────────────────────
    envelopeShapers: {
      modules: {
        envelopeShaper1: {
          box: { x: 5, y: 339, w: 749.5, h: 102.5 },
          centers: {
            mode: { x: 47.25, y: 58.5 },
            delay: { x: 140.25, y: 57.5 },
            attack: { x: 234.75, y: 58.25 },
            decay: { x: 328, y: 58.75 },
            sustain: { x: 420.75, y: 59 },
            release: { x: 514.25, y: 59.5 },
            envelopeLevel: { x: 608, y: 60 },
            signalLevel: { x: 701.5, y: 60 },
            gate: { x: 90, y: 88 },
            led: { x: 187, y: 26.5 }
          }
        },
        envelopeShaper2: {
          box: { x: 5, y: 441.5, w: 749.5, h: 102.5 },
          centers: {
            mode: { x: 46.75, y: 58.75 },
            delay: { x: 139.5, y: 57.5 },
            attack: { x: 234, y: 58 },
            decay: { x: 327.5, y: 58 },
            sustain: { x: 420.5, y: 58.25 },
            release: { x: 513.75, y: 59.25 },
            envelopeLevel: { x: 607.75, y: 59.75 },
            signalLevel: { x: 701, y: 59.75 },
            gate: { x: 89.5, y: 88.25 },
            led: { x: 186, y: 26.75 }
          }
        },
        envelopeShaper3: {
          box: { x: 5, y: 544, w: 749.5, h: 102 },
          centers: {
            mode: { x: 46.25, y: 59.25 },
            delay: { x: 139.25, y: 57.75 },
            attack: { x: 233.25, y: 58.75 },
            decay: { x: 326.75, y: 59 },
            sustain: { x: 420.5, y: 59.5 },
            release: { x: 514, y: 60.5 },
            envelopeLevel: { x: 607.75, y: 61 },
            signalLevel: { x: 700.75, y: 60.75 },
            gate: { x: 89, y: 88.5 },
            led: { x: 185.5, y: 28 }
          }
        }
      },
      // Cada envelope shaper tiene 8 knobs en fila horizontal:
      // Mode, Delay, Attack, Decay, Sustain, Release, Envelope Level, Signal Level
      knobs: ['Mode', 'Delay', 'Attack', 'Decay', 'Sustain', 'Release', 'Env Level', 'Sig Level'],
      knobColors: ['yellow', 'red', 'red', 'red', 'red', 'red', 'white', 'white'],
      knobTypes: ['selector', 'normal', 'normal', 'normal', 'normal', 'normal', 'bipolar', 'normal'],
      knobSize: 65,
      knobInnerPct: 78,
      // Botón de gate y LED piloto (diámetro en px; centro en centers). El
      // gate es el pulsador negro de la foto: cara de 16 y aro de metal,
      // 19 en total (medido a 3,4×; «GATE» va serigrafiado al lado).
      gateSize: 19,
      ledSize: 10
    },

    // ── Ring Modulators 1-3 ─────────────────────────────────────────────
    ringModulators: {
      modules: {
        ringModulator1: {
          box: { x: 4, y: 646, w: 108, h: 101.75 },
          centers: {
            level: { x: 55.25, y: 59.25 }
          }
        },
        ringModulator2: {
          box: { x: 112, y: 646, w: 107.5, h: 102 },
          centers: {
            level: { x: 53.75, y: 59.75 }
          }
        },
        ringModulator3: {
          box: { x: 219.5, y: 646.5, w: 108, h: 102 },
          centers: {
            level: { x: 54.5, y: 60 }
          }
        }
      },
      knobs: ['Level'],
      knobColors: ['white'],
      knobTypes: ['normal'],
      knobSize: 65,
      knobInnerPct: 78
    },

    // ── Reverberation 1 ─────────────────────────────────────────────────
    reverberation: {
      box: { x: 327.5, y: 646.75, w: 146.5, h: 102.25 },
      centers: {
        mix: { x: 39.75, y: 59.75 },
        level: { x: 107.75, y: 59.75 }
      },
      knobs: ['Mix', 'Level'],
      knobColors: ['blue', 'white'],
      knobTypes: ['normal', 'normal'],
      knobSize: 65,
      knobInnerPct: 78
    },

    // ── Echo A.D.L. ─────────────────────────────────────────────────────
    echo: {
      box: { x: 474, y: 647, w: 280.5, h: 102.25 },
      centers: {
        delay: { x: 38.5, y: 59.5 },
        mix: { x: 106.75, y: 60.25 },
        feedback: { x: 174.5, y: 59.75 },
        level: { x: 242.5, y: 59.75 }
      },
      knobs: ['Delay', 'Mix', 'Feedback', 'Level'],
      knobColors: ['blue', 'blue', 'blue', 'white'],
      knobTypes: ['normal', 'normal', 'normal', 'normal'],
      knobSize: 65,
      knobInnerPct: 78
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
