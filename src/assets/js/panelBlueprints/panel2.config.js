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
      // ─────────────────────────────────────────────────────────────────────
      // RESOLUCIÓN INTERNA
      // Valores bajos (150-200px) dan aspecto analógico/retro pixelado.
      // Valores altos (400-600px) dan aspecto digital/nítido.
      // El canvas se escala con CSS al tamaño del contenedor.
      // ─────────────────────────────────────────────────────────────────────
      internalWidth: 400,
      internalHeight: 300,
      useDevicePixelRatio: false, // false = mantiene pixelado, true = escala a Retina
      
      // ─────────────────────────────────────────────────────────────────────
      // COLORES
      // ─────────────────────────────────────────────────────────────────────
      lineColor: '#00ff00',      // Verde clásico de osciloscopio CRT
      bgColor: '#0a0a0a',        // Fondo casi negro (simula tubo apagado)
      gridColor: '#1a3a1a',      // Cuadrícula verde muy oscuro
      centerColor: '#2a5a2a',    // Líneas centrales (ejes)
      
      // ─────────────────────────────────────────────────────────────────────
      // TRAZO DE LA SEÑAL
      // ─────────────────────────────────────────────────────────────────────
      lineWidth: 3,              // Grosor de línea (1-5, más grueso = más analógico)
      
      // ─────────────────────────────────────────────────────────────────────
      // EFECTO GLOW (fosforescencia CRT)
      // Simula el halo luminoso de los tubos de rayos catódicos.
      // glowBlur: intensidad del blur en píxeles (0 = desactivado, 5-15 = sutil, 20+ = intenso)
      // glowColor: color del halo (null = usa lineColor)
      // NOTA: Puede afectar rendimiento en dispositivos de gama baja.
      // ─────────────────────────────────────────────────────────────────────
      glowBlur: 8,
      glowColor: '#00ff00',
      
      // ─────────────────────────────────────────────────────────────────────
      // ELEMENTOS DE UI
      // ─────────────────────────────────────────────────────────────────────
      showGrid: true,            // Mostrar cuadrícula de referencia
      showTriggerIndicator: true // LED indicador de trigger (esquina superior derecha)
    },
    
    // Parámetros de audio
    audio: {
      bufferSize: 4096,          // 512 | 1024 | 2048 | 4096 (más = más ciclos visibles)
      triggerEnabled: true,
      triggerLevel: 0.0,         // -1.0 a 1.0
      mode: 'yt'                 // 'yt' | 'xy'
    },
    
    // ─────────────────────────────────────────────────────────────────────────
    // KNOBS DE CONTROL
    // ─────────────────────────────────────────────────────────────────────────
    
    knobs: {
      // Knob TIME: escala horizontal (cuántos samples se muestran)
      // Valor 1.0 = muestra todo el buffer, 0.1 = muestra 10% (zoom in)
      timeScale: {
        min: 0.1,                // Mínimo 10% del buffer (máximo zoom)
        max: 1.0,                // 100% del buffer (sin zoom)
        initial: 1.0,            // Valor inicial: sin zoom
        curve: 'linear',
        pixelsForFullRange: 150
      },
      
      // Knob AMP: escala vertical (ganancia de visualización)
      // Valor 1.0 = escala normal, 0.5 = mitad, 4.0 = cuádruple
      ampScale: {
        min: 0.25,               // Mínimo 25% (reduce señales grandes)
        max: 4.0,                // Máximo 400% (amplifica señales pequeñas)
        initial: 1.0,            // Valor inicial: escala normal
        curve: 'exponential',    // Exponencial para control intuitivo
        curveK: 2,
        pixelsForFullRange: 150
      }
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
