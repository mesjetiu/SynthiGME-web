// ═══════════════════════════════════════════════════════════════════════════
// Panel 3 (Oscillators) Blueprint
// ═══════════════════════════════════════════════════════════════════════════
//
// Este archivo define la ESTRUCTURA VISUAL del Panel 3 del Synthi 100.
// Para PARÁMETROS de audio (rangos, curvas, calibración), ver los configs por módulo:
//   - configs/modules/oscillator.config.js
//   - configs/modules/noise.config.js
//   - configs/modules/randomVoltage.config.js
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
//    - Pines ocultos y huecos
//    - NO contiene valores numéricos de parámetros de audio
//    - NO contiene mapeo a filas/columnas de matriz (eso va en panel5/panel6 blueprints)
//
// 2. configs/modules/*.config.js — PARÁMETROS (uno por tipo de módulo)
//    - Rangos de frecuencia, ganancia, etc.
//    - Curvas de respuesta (linear, exponential)
//    - Valores iniciales de knobs
//    - Calibración por módulo
//    - Tiempos de suavizado
//
// Esta separación permite:
// - Editar el layout sin afectar el comportamiento de audio
// - Calibrar parámetros sin romper la estructura visual
// - Reutilizar blueprints con diferentes configuraciones
//
// ─────────────────────────────────────────────────────────────────────────────
// CONTENIDO DEL PANEL 3 (Synthi 100)
// ─────────────────────────────────────────────────────────────────────────────
//
// - 12 Osciladores (agrupados en paneles visuales 1-4, con 3 osciladores c/u)
// - 2 Noise Generators
// - 1 Random Control Voltage Generator
//
// Para conexiones a matrices de audio (Panel 5) y control (Panel 6),
// ver la referencia cruzada al final de este archivo.
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 2,
  panelId: 'panel-3',
  
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
  // Las cajas de los osciladores están en oscillatorSlots (más abajo); aquí,
  // las de la fila inferior.
  //
  layout: {
    noise1:   { box: { x: 5,     y: 638.1, w: 169.5, h: 110 } },
    noise2:   { box: { x: 174.5, y: 638.1, w: 169.5, h: 110 } },
    randomCV: { box: { x: 344,   y: 638.1, w: 411,   h: 110 } }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN VISUAL INTERIOR DE CADA OSCILADOR (defaults)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Valores generales que aplican a todos los osciladores.
  // Cada oscilador puede sobrescribir cualquier propiedad en su slot
  // (ver oscillatorSlots[].ui). Se hace merge shallow: lo que el slot
  // defina gana sobre estos defaults.
  //
  oscillatorUI: {
    // Knobs
    knobSize: 45,          // px — diámetro del knob
    knobInnerPct: 76,      // % — círculo interior respecto al exterior
    knobGap: [9.3, 9.3, 9.3, 9.3, 9.3, 0.5],  // px — gap entre cada par de knobs (6 huecos para 7 knobs)
    knobRowOffsetX: -2,     // px — desplazamiento horizontal de toda la fila de knobs
    knobRowOffsetY: -17,   // px — desplazamiento vertical de toda la fila de knobs
    knobOffsets: [6, 6, 6, 6, 6, 6, -18],  // px — offset Y individual por knob (7 knobs)
    
    // Colores del centro de cada knob (7 knobs, Synthi 100 original)
    // null = vernier (sin centro de color)
    knobColors: [
      'blue',    // 0: Pulse level
      'green',   // 1: Pulse shape
      'white',   // 2: Sine level
      'green',   // 3: Sine symmetry
      'blue',    // 4: Triangle level
      'white',   // 5: Sawtooth level
      'black'    // 6: Frequency (no visible, se usa vernier)
    ],

    // Tipos de knob: 'normal' (rango 1-10), 'bipolar' (rango -5 a +5), 'vernier' (multivuelta)
    knobTypes: [
      'normal',  // 0: Pulse level
      'bipolar', // 1: Pulse shape
      'normal',  // 2: Sine level
      'bipolar', // 3: Sine symmetry
      'normal',  // 4: Triangle level
      'normal',  // 5: Sawtooth level
      'vernier'  // 6: Frequency
    ],
    
    // Switch HI/LO — toggle SVG metálico
    buttonSize: { width: 18, height: 30, indicator: 8 },
    buttonScale: 0.85,        // factor de escala uniforme del toggle (ej: 1.5 = 50% más grande)
    switchOffset: { leftPercent: 26.5, topPx: -4 }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN VISUAL DE MÓDULOS DE RUIDO (defaults)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Igual que oscillatorUI pero para Noise Generators.
  // Cada módulo puede sobrescribir en modules.noise1.ui / modules.noise2.ui.
  //
  noiseUI: {
    knobSize: 65,          // px — diámetro del knob
    knobInnerPct: 76,      // % — círculo interior respecto al exterior
    knobGap: [15],          // px — gap entre cada par de knobs (1 hueco para 2 knobs)
    knobRowOffsetX: 3,     // px — desplazamiento horizontal de toda la fila de knobs
    knobRowOffsetY: 28,     // px — desplazamiento vertical de toda la fila de knobs
    knobOffsets: [0, 0],   // px — offset Y individual por knob (2 knobs)
    padding: { top: 0, right: 4, bottom: 0, left: 4 },  // px — relleno interior del marco
    
    // Colores del centro de cada knob (2 knobs, Synthi 100 original)
    knobColors: [
      'blue',    // 0: Colour
      'white'    // 1: Level
    ],

    // Tipos de knob para Noise Generator
    knobTypes: [
      'normal',  // 0: Colour (0 a 10)
      'normal'   // 1: Level
    ],
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN VISUAL DEL RANDOM CONTROL VOLTAGE GENERATOR (defaults)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Igual que noiseUI pero para el Random Voltage Generator (5 knobs).
  // Sobrescribible en modules.randomCV.ui.
  //
  randomCVUI: {
    knobSize: 65,          // px — diámetro del knob
    knobInnerPct: 76,      // % — círculo interior respecto al exterior
    knobGap: [12.9, 12.9, 12.9, 12.9], // px — gap entre cada par de knobs (4 huecos para 5 knobs)
    knobRowOffsetX: 1,     // px — desplazamiento horizontal de toda la fila de knobs
    knobRowOffsetY: 28,     // px — desplazamiento vertical de toda la fila de knobs
    knobOffsets: [0, 0, 0, 0, 0],  // px — offset Y individual por knob (5 knobs)
    padding: { top: 0, right: 4, bottom: 0, left: 4 },  // px — relleno interior del marco
    
    // Colores del centro de cada knob (5 knobs, Synthi 100 original)
    knobColors: [
      'red',     // 0: Mean
      'red',     // 1: Variance
      'white',   // 2: Voltage 1
      'white',   // 3: Voltage 2
      'white'    // 4: Key
    ],

    // Tipos de knob para Random Control Voltage Generator
    knobTypes: [
      'bipolar', // 0: Mean (-5 a +5)
      'bipolar', // 1: Variance (-5 a +5)
      'normal',  // 2: Voltage 1 (0 a 10)
      'normal',  // 3: Voltage 2 (0 a 10)
      'bipolar'  // 4: Key (-5 a +5)
    ],
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // SLOTS DE OSCILADORES
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Caja de cada oscilador en px del panel. oscIndex: índice 0-based (0-11).
  // Dos columnas (x 5 y x 380) de seis filas, a 103,3 px de paso: así
  // cuadran con la imagen de fondo.
  //
  // Cada slot puede incluir una clave `ui` con overrides parciales
  // de oscillatorUI. Ejemplo:
  //   { oscIndex: 0, box: { … }, ui: { knobRowOffsetY: -15 } }
  //
  oscillatorSlots: [
    // Columna izquierda (osciladores 1–6)
    { oscIndex: 0,  box: { x: 5,   y: 18.3,  w: 375, h: 103 } },   // Osc 1
    { oscIndex: 1,  box: { x: 5,   y: 121.6, w: 375, h: 103 } },   // Osc 2
    { oscIndex: 2,  box: { x: 5,   y: 224.9, w: 375, h: 103 } },   // Osc 3
    { oscIndex: 3,  box: { x: 5,   y: 328.2, w: 375, h: 103 } },   // Osc 4
    { oscIndex: 4,  box: { x: 5,   y: 431.5, w: 375, h: 103 } },   // Osc 5
    { oscIndex: 5,  box: { x: 5,   y: 534.8, w: 375, h: 103 } },   // Osc 6
    
    // Columna derecha (osciladores 7–12)
    { oscIndex: 6,  box: { x: 380, y: 18.3,  w: 375, h: 103 } },   // Osc 7
    { oscIndex: 7,  box: { x: 380, y: 121.6, w: 375, h: 103 } },   // Osc 8
    { oscIndex: 8,  box: { x: 380, y: 224.9, w: 375, h: 103 } },   // Osc 9
    { oscIndex: 9,  box: { x: 380, y: 328.2, w: 375, h: 103 } },   // Osc 10
    { oscIndex: 10, box: { x: 380, y: 431.5, w: 375, h: 103 } },   // Osc 11
    { oscIndex: 11, box: { x: 380, y: 534.8, w: 375, h: 103 } }    // Osc 12
  ],
  
  // ─────────────────────────────────────────────────────────────────────────
  // OVERRIDES VISUALES POR MÓDULO
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Permite ajustar la apariencia visual de cada módulo individual respecto
  // a los defaults de su tipo (noiseUI, randomCVUI).
  //
  // Los datos de identidad (id, title), parámetros de audio (knobs, rangos,
  // curvas) y ruteo (matrixRow) están en los configs de cada módulo:
  //   - configs/modules/noise.config.js
  //   - configs/modules/randomVoltage.config.js
  //
  modules: {
    noise1: {
      visible: true,
      // ui: { }  — overrides de noiseUI para este módulo
    },
    
    noise2: {
      visible: true,
      // ui: { }  — overrides de noiseUI para este módulo
    },
    
    // visible: false → módulo oculto (ocupa espacio pero invisible y no interactivo)
    randomCV: {
      visible: true,
      // ui: { }  — overrides de randomCVUI para este módulo
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONEXIONES A MATRICES (Panel 5 y Panel 6)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Las conexiones de los módulos del Panel 3 a las matrices de audio y
  // control se declaran en los blueprints de cada matriz (fuente única de verdad):
  //
  //   - panel5.audio.blueprint.js
  //     · sources: noise (filas 89-90), osc 1-9 (filas 91-108)
  //     · destinations: hard sync osc 1-12 (columnas 24-35)
  //
  //   - panel6.control.blueprint.js
  //     · sources: osc 10-12 (filas 83-88)
  //     · destinations: freqCV osc 1-12 (columnas 30-41)
  //
  //   - configs/modules/noise.config.js — matrixRow por instancia
  //   - configs/modules/randomVoltage.config.js — matrixRow pendiente
  //
};
