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
    
    // ─────────────────────────────────────────────────────────────────────
    // PARÁMETROS DE AUDIO Y TRIGGER
    // ─────────────────────────────────────────────────────────────────────
    audio: {
      bufferSize: 4096,          // 512 | 1024 | 2048 | 4096 (más = más ciclos visibles)
      triggerEnabled: true,
      triggerLevel: 0.0,         // -1.0 a 1.0
      mode: 'yt',                // 'yt' | 'xy'
      
      // ───────────────────────────────────────────────────────────────────
      // HISTÉRESIS DEL TRIGGER
      // ───────────────────────────────────────────────────────────────────
      // Número mínimo de samples a ignorar después de detectar un trigger
      // antes de aceptar otro. Evita triggers falsos por:
      // - Armónicos de la señal (cruces adicionales por ciclo)
      // - Ruido cerca del punto de cruce
      // - Señales complejas con múltiples cruces
      //
      // Valores recomendados:
      // - 50-100: señales limpias (seno, cuadrada)
      // - 100-200: señales con armónicos (diente de sierra, PWM)
      // - 200-400: señales ruidosas o complejas
      //
      // A 44.1kHz: 100 samples ≈ 2.3ms → ignora frecuencias > 440 Hz entre triggers
      // Para frecuencias graves (1-10 Hz), el período es 4410-44100 samples,
      // así que 100-200 es seguro sin perder triggers reales.
      // ───────────────────────────────────────────────────────────────────
      triggerHysteresis: 150,    // Samples de holdoff entre triggers (default: 150)
      
      // ───────────────────────────────────────────────────────────────────
      // SCHMITT TRIGGER (histéresis de nivel)
      // ───────────────────────────────────────────────────────────────────
      // A diferencia de triggerHysteresis (temporal), esto añade histéresis
      // de NIVEL: dos umbrales diferentes para subida y bajada.
      //
      // Funcionamiento:
      // 1. El trigger se "arma" cuando la señal cae por debajo de:
      //    triggerLevel - schmittHysteresis
      // 2. El trigger solo dispara cuando la señal sube por encima de:
      //    triggerLevel + schmittHysteresis
      //
      // Esto evita disparos múltiples cuando la señal "rebota" cerca del
      // nivel de trigger (oscilación, ruido, armónicos de alta frecuencia).
      //
      // Valores recomendados:
      // - 0.02-0.05: señales limpias con buena amplitud
      // - 0.05-0.10: señales con algo de ruido
      // - 0.10-0.20: señales muy ruidosas
      //
      // Nota: Valores muy altos pueden hacer que señales de baja amplitud
      // no disparen el trigger correctamente.
      // ───────────────────────────────────────────────────────────────────
      schmittHysteresis: 0.05    // 5% del rango (-1 a 1) = 0.1 de banda muerta total
    },
    
    // ─────────────────────────────────────────────────────────────────────────
    // KNOBS DE CONTROL
    // ─────────────────────────────────────────────────────────────────────────
    
    knobs: {
      // ───────────────────────────────────────────────────────────────────
      // Knob TIME: escala horizontal (cuántos samples se muestran)
      // ───────────────────────────────────────────────────────────────────
      // Controla el "zoom temporal" del osciloscopio.
      // - Valor 1.0 = muestra todo el buffer (vista completa)
      // - Valor 0.01 = muestra solo 1% del buffer (zoom 100×)
      //
      // El rango 0.01-1.0 permite visualizar desde ondas muy graves (~1 Hz)
      // hasta señales rápidas. Curva cuadrática para mayor control en la
      // zona de graves (valores bajos = más resolución).
      //
      // pixelsForFullRange: 600 = knob 4× más lento que el default (150),
      // equiparable al knob de frecuencia de osciladores para precisión.
      // ───────────────────────────────────────────────────────────────────
      timeScale: {
        min: 0.01,               // 1% del buffer (zoom 100× para ondas graves)
        max: 1.0,                // 100% del buffer (vista completa)
        initial: 1.0,            // Sin zoom inicial
        curve: 'quadratic',      // Curva cuadrática: más control en valores bajos
        curveExponent: 2,        // Exponente x² (igual que knob freq de osc)
        pixelsForFullRange: 600  // 4× más lento que default para precisión
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
      },
      
      // ───────────────────────────────────────────────────────────────────
      // Knob LEVEL: nivel de trigger para sincronización
      // ───────────────────────────────────────────────────────────────────
      // Ajusta el umbral de cruce para la detección del trigger.
      // - Valor 0.0 = trigger en cruce por cero (default)
      // - Valores positivos = trigger en la parte alta de la onda
      // - Valores negativos = trigger en la parte baja de la onda
      //
      // Útil para:
      // - Estabilizar ondas asimétricas
      // - Sincronizar en un punto específico del ciclo
      // - Capturar señales con DC offset
      // ───────────────────────────────────────────────────────────────────
      triggerLevel: {
        min: -1.0,               // Mínimo: fondo de la onda
        max: 1.0,                // Máximo: pico de la onda
        initial: 0.0,            // Default: cruce por cero
        curve: 'linear',         // Lineal para control directo
        pixelsForFullRange: 200  // Un poco más lento para precisión
      }
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // INPUT AMPLIFIER LEVEL (8 canales de entrada)
  // ─────────────────────────────────────────────────────────────────────────
  
  inputAmplifiers: {
    // Configuración de knobs de nivel
    knobs: {
      level: {
        min: 0,
        max: 1,
        initial: 0,       // Empiezan en silencio
        pixelsForFullRange: 450  // Alta resolución (3× para mayor precisión)
      }
    },
    
    // Parámetros de audio
    audio: {
      levelSmoothingTime: 0.03   // Tiempo de suavizado para evitar clicks
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
