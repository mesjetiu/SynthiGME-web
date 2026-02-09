// ═══════════════════════════════════════════════════════════════════════════
// Panel 3 (Oscillators) Blueprint
// ═══════════════════════════════════════════════════════════════════════════
//
// Este archivo define la ESTRUCTURA visual y de ruteo del Panel 3 del Synthi 100.
// Para PARÁMETROS de audio (rangos, curvas, calibración), ver panel3.oscillators.config.js.
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
//    - Mapeo a filas/columnas de matriz
//    - Pines ocultos y huecos
//    - NO contiene valores numéricos de parámetros de audio
//
// 2. *.config.js — PARÁMETROS (panel3.oscillators.config.js)
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
// Los Noise Generators ocupan las filas 89-90 de la matriz de audio (Panel 5).
// Los Osciladores ocupan las filas 91-108 (2 filas por oscilador).
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
  // SLOTS DE OSCILADORES
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Define la posición visual de cada oscilador en el grid.
  // oscIndex: índice 0-based del oscilador (0-11)
  // col: columna (0=izquierda, 1=derecha)
  // row: fila (0-5)
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
  // MÓDULOS ADICIONALES (ESTRUCTURA)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Define la estructura de los módulos. Los parámetros de audio
  // están en panel3.oscillators.config.js.
  //
  modules: {
    noise1: {
      id: 'noise-1',
      type: 'noiseGenerator',
      title: 'Noise 1',
      matrixRow: 89,
      knobs: ['colour', 'level']
    },
    
    noise2: {
      id: 'noise-2',
      type: 'noiseGenerator',
      title: 'Noise 2',
      matrixRow: 90,
      knobs: ['colour', 'level']
    },
    
    // @see TODO.md - "Random Voltage: definir filas de matriz"
    randomCV: {
      id: 'random-cv',
      type: 'randomVoltage',
      title: 'Random Voltage',
      // matrixRows pendiente: { voltage1: ??, voltage2: ?? }
      knobs: ['mean', 'variance', 'voltage1', 'voltage2', 'key']
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // MAPEO A MATRIZ DE AUDIO (Panel 5)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Referencia cruzada con panel5.audio.blueprint.js.
  // Las filas de la matriz de audio que corresponden a cada módulo.
  //
  matrixMapping: {
    oscillators: {
      firstRow: 91,     // Osc 1 sineSaw
      lastRow: 108,     // Osc 9 triPulse (solo 9 implementados)
      rowsPerOsc: 2     // Cada oscilador usa 2 filas (sineSaw, triPulse)
    },
    noiseGenerators: {
      noise1: 89,
      noise2: 90
    }
  }
};
