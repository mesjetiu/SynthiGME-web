// ═══════════════════════════════════════════════════════════════════════════
// INPUT AMPLIFIER CONFIG
// ═══════════════════════════════════════════════════════════════════════════
//
// Configuración de los 8 amplificadores de entrada del Synthi 100.
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,
  
  // Número de canales de entrada
  count: 8,
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DE KNOBS
  // ─────────────────────────────────────────────────────────────────────────
  
  knobs: {
    level: {
      min: 0,
      max: 1,
      initial: 0,           // Empiezan en silencio
      pixelsForFullRange: 900  // Alta resolución (6× para mayor precisión)
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // PARÁMETROS DE AUDIO
  // ─────────────────────────────────────────────────────────────────────────
  
  audio: {
    levelSmoothingTime: 0.03   // Tiempo de suavizado para evitar clicks
  }
};
