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
  schemaVersion: 1,
  panelId: 'panel-3',
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DEL LAYOUT VISUAL
  // ─────────────────────────────────────────────────────────────────────────
  
  layout: {
    // Grid de osciladores: 2 columnas x 6 filas
    oscillators: {
      columns: 2,
      rowsPerColumn: 6,
      
      // Tamaño base de cada oscilador (px)
      oscSize: { width: 375, height: 103 }, // Tamaños encontrados para cuadrar con la imagen de fondo.
      
      // Espaciado entre osciladores
      gap: { x: 0, y: 0.3 }, // y: 0.3 encontrado para cuadrar con la imagen de fondo.
      
      // Margen externo
      airOuter: 0,
      airOuterY: 0,
      
      // Offset vertical desde el top
      topOffset: 3.2, // Offset encontrado para cuadrar con la imagen de fondo. Parece que ya no tiene efecto, quizás porque no puede bajar más.
      
      // Altura de la fila de módulos adicionales
      reservedHeight: 110
    },
    
    // Fila de módulos adicionales (Noise, Random CV)
    modulesRow: {
      height: 110,
      gap: 4,            // px — separación entre marcos de módulos
      
      // Proporción de cada módulo (debe sumar 1)
      // 2/9 + 2/9 + 5/9 = 9/9 = 1
      proportions: {
        noise1: 2 / 9,    // 2 knobs
        noise2: 2 / 9,    // 2 knobs
        randomCV: 5 / 9   // 5 knobs
      }
    }
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
    knobRowOffsetX: 0,     // px — desplazamiento horizontal de toda la fila de knobs
    knobRowOffsetY: -15,   // px — desplazamiento vertical de toda la fila de knobs
    knobOffsets: [6, 6, 6, 6, 6, 6, -16],  // px — offset Y individual por knob (7 knobs)
    
    // Switch HI/LO
    switchOffset: { leftPercent: 36, topPx: 6 },
    
    // Offset del slot completo (permite desplazar un oscilador
    // respecto a su posición calculada en el grid)
    slotOffset: { x: 0, y: 0 }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN VISUAL DE MÓDULOS DE RUIDO (defaults)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Igual que oscillatorUI pero para Noise Generators.
  // Cada módulo puede sobrescribir en modules.noise1.ui / modules.noise2.ui.
  //
  noiseUI: {
    knobSize: 40,          // px — diámetro del knob
    knobInnerPct: 76,      // % — círculo interior respecto al exterior
    knobGap: [8],          // px — gap entre cada par de knobs (1 hueco para 2 knobs)
    knobRowOffsetX: 0,     // px — desplazamiento horizontal de toda la fila de knobs
    knobRowOffsetY: 0,     // px — desplazamiento vertical de toda la fila de knobs
    knobOffsets: [0, 0],   // px — offset Y individual por knob (2 knobs)
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN VISUAL DEL RANDOM CONTROL VOLTAGE GENERATOR (defaults)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Igual que noiseUI pero para el Random Voltage Generator (5 knobs).
  // Sobrescribible en modules.randomCV.ui.
  //
  randomCVUI: {
    knobSize: 40,          // px — diámetro del knob
    knobInnerPct: 76,      // % — círculo interior respecto al exterior
    knobGap: [8, 8, 8, 8], // px — gap entre cada par de knobs (4 huecos para 5 knobs)
    knobRowOffsetX: 0,     // px — desplazamiento horizontal de toda la fila de knobs
    knobRowOffsetY: 0,     // px — desplazamiento vertical de toda la fila de knobs
    knobOffsets: [0, 0, 0, 0, 0],  // px — offset Y individual por knob (5 knobs)
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // SLOTS DE OSCILADORES
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Define la posición visual de cada oscilador en el grid.
  // oscIndex: índice 0-based del oscilador (0-11)
  // col: columna (0=izquierda, 1=derecha)
  // row: fila (0-5)
  //
  // Cada slot puede incluir una clave `ui` con overrides parciales
  // de oscillatorUI. Ejemplo:
  //   { oscIndex: 0, col: 0, row: 0, ui: { slotOffset: { x: 2, y: -1 } } }
  //
  oscillatorSlots: [
    // Columna izquierda (osciladores 1, 3, 5, 7, 9, 11)
    { oscIndex: 0, col: 0, row: 0 },   // Osc 1
    { oscIndex: 2, col: 0, row: 1 },   // Osc 3
    { oscIndex: 4, col: 0, row: 2 },   // Osc 5
    { oscIndex: 6, col: 0, row: 3 },   // Osc 7
    { oscIndex: 8, col: 0, row: 4 },   // Osc 9
    { oscIndex: 10, col: 0, row: 5 },  // Osc 11
    
    // Columna derecha (osciladores 2, 4, 6, 8, 10, 12)
    { oscIndex: 1, col: 1, row: 0 },   // Osc 2
    { oscIndex: 3, col: 1, row: 1 },   // Osc 4
    { oscIndex: 5, col: 1, row: 2 },   // Osc 6
    { oscIndex: 7, col: 1, row: 3 },   // Osc 8
    { oscIndex: 9, col: 1, row: 4 },   // Osc 10
    { oscIndex: 11, col: 1, row: 5 }   // Osc 12
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
      // ui: { }  — overrides de noiseUI para este módulo
    },
    
    noise2: {
      // ui: { }  — overrides de noiseUI para este módulo
    },
    
    randomCV: {
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
