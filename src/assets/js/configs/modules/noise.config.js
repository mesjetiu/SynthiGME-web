// ═══════════════════════════════════════════════════════════════════════════
// NOISE GENERATOR CONFIG
// ═══════════════════════════════════════════════════════════════════════════
//
// Configuración de los 2 generadores de ruido del Synthi 100.
//
// ─────────────────────────────────────────────────────────────────────────────
// CONTEXTO HISTÓRICO
// ─────────────────────────────────────────────────────────────────────────────
//
// El Synthi 100 (1971) incluía dos generadores de ruido idénticos con:
// - Control de "Colour": transición continua entre ruido blanco y rosa
// - Control de "Level": ganancia de salida
// - Salida enrutable a la matriz de pines (filas 89-90)
//
// El ruido blanco tiene energía igual en todas las frecuencias (densidad
// espectral plana), mientras que el ruido rosa tiene energía igual por
// octava (-3dB/octava).
//
// Esta implementación usa el algoritmo Voss-McCartney para pink noise
// auténtico, en lugar de un simple filtro lowpass.
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DE AUDIO COMPARTIDA
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Estos parámetros afectan al comportamiento del AudioWorklet.
  //
  defaults: {
    // Tiempo de suavizado para cambios de level (segundos)
    // Previene clicks al cambiar bruscamente el volumen
    levelSmoothingTime: 0.03,
    
    // Tiempo de suavizado para cambios de colour (segundos)
    // Más bajo que level para respuesta más rápida
    colourSmoothingTime: 0.01,
    
    // Número de octavas del algoritmo Voss-McCartney
    // Más octavas = mejor aproximación a -3dB/octava, pero más CPU
    // 8 es un buen balance para 44.1-48kHz
    vossOctaves: 8
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NOISE GENERATOR 1
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Fila de matriz: 89 (Panel 5)
  //
  noise1: {
    id: 'panel3-noise-1',
    title: 'Noise 1',
    
    // Fila en la matriz de audio (Panel 5)
    matrixRow: 89,
    
    // Configuración de knobs de la UI
    knobs: {
      // Colour: 0 = white noise, 1 = pink noise
      colour: {
        min: 0,
        max: 1,
        initial: 0,       // Empieza en white noise
        curve: 'linear',
        pixelsForFullRange: 900  // Alta resolución (6× default)
      },
      // Level: ganancia de salida
      level: {
        min: 0,
        max: 1,
        initial: 0,       // Empieza en silencio
        curve: 'linear',
        pixelsForFullRange: 900  // Alta resolución (6× default)
      }
    },
    
    // Configuración del módulo de audio (override de defaults)
    audio: {
      // initialColour: 0,           // Valor inicial de colour
      // initialLevel: 0,            // Valor inicial de level
      // levelSmoothingTime: 0.03,   // Override del default
      // colourSmoothingTime: 0.01   // Override del default
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NOISE GENERATOR 2
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Fila de matriz: 90 (Panel 5)
  //
  noise2: {
    id: 'panel3-noise-2',
    title: 'Noise 2',
    
    // Fila en la matriz de audio (Panel 5)
    matrixRow: 90,
    
    // Configuración de knobs de la UI
    knobs: {
      colour: {
        min: 0,
        max: 1,
        initial: 0,
        curve: 'linear',
        pixelsForFullRange: 900  // Alta resolución (6× default)
      },
      level: {
        min: 0,
        max: 1,
        initial: 0,
        curve: 'linear',
        pixelsForFullRange: 900  // Alta resolución (6× default)
      }
    },
    
    audio: {
      // Misma configuración que noise1 por defecto
    }
  }
};
