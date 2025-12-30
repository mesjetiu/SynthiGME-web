// ═══════════════════════════════════════════════════════════════════════════
// Panel 2 Config
// ═══════════════════════════════════════════════════════════════════════════
//
// PARÁMETROS de audio y visuales del Panel 2.
// Para ESTRUCTURA, ver panel2.blueprint.js.
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // ─────────────────────────────────────────────────────────────────────────
  // OSCILOSCOPIO
  // ─────────────────────────────────────────────────────────────────────────
  
  oscilloscope: {
    // Parámetros del display
    display: {
      lineColor: '#00ff00',      // Verde clásico de osciloscopio
      bgColor: '#0a0a0a',        // Fondo casi negro
      gridColor: '#1a3a1a',      // Cuadrícula verde oscuro
      centerColor: '#2a5a2a',    // Líneas centrales
      lineWidth: 2,
      showGrid: true,
      showTriggerIndicator: true
    },
    
    // Parámetros de audio
    audio: {
      bufferSize: 1024,          // 512 | 1024 | 2048 | 4096
      triggerEnabled: true,
      triggerLevel: 0.0,         // -1.0 a 1.0
      mode: 'yt'                 // 'yt' | 'xy'
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // ESTILOS DEL PANELILLO
  // ─────────────────────────────────────────────────────────────────────────
  
  frame: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
    borderWidth: 1
  }
};
