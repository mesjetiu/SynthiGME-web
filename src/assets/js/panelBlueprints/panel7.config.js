// ═══════════════════════════════════════════════════════════════════════════
// Panel 7 Config
// ═══════════════════════════════════════════════════════════════════════════
//
// Este archivo define los PARÁMETROS de audio y visuales del Panel 7.
// Para ESTRUCTURA, ver panel7.blueprint.js.
//
// Panel 7 contiene los 8 Output Channels del Synthi 100.
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,
  panelId: 'panel-7',
  
  // ─────────────────────────────────────────────────────────────────────────
  // OUTPUT CHANNELS (8 canales de salida)
  // ─────────────────────────────────────────────────────────────────────────
  
  outputChannels: {
    // Número de canales
    count: 8,
    
    // ·······································································
    // CONFIGURACIÓN DE KNOBS
    // ·······································································
    
    knobs: {
      // ───────────────────────────────────────────────────────────────────
      // Knob FILTER - Control bipolar de filtro LP/HP
      // ───────────────────────────────────────────────────────────────────
      // Rango bipolar -1 a +1:
      //   -1: Lowpass activo (solo graves)
      //    0: Sin filtrado (bypass, centro)
      //   +1: Highpass activo (solo agudos)
      //
      // La frecuencia de corte se calcula exponencialmente para un control
      // más musical del espectro.
      // ───────────────────────────────────────────────────────────────────
      filter: {
        min: -1,
        max: 1,
        initial: 0,           // Sin filtro por defecto
        curve: 'linear',
        pixelsForFullRange: 900  // Alta resolución (6× default)
      },
      
      // ───────────────────────────────────────────────────────────────────
      // Knob PAN - Control de paneo estéreo
      // ───────────────────────────────────────────────────────────────────
      // Rango bipolar -1 a +1:
      //   -1: Full izquierda
      //    0: Centro
      //   +1: Full derecha
      //
      // Afecta tanto al routing legacy como a los stereo buses.
      // ───────────────────────────────────────────────────────────────────
      pan: {
        min: -1,
        max: 1,
        initial: 0,           // Centro por defecto
        curve: 'linear',
        pixelsForFullRange: 900  // Alta resolución (6× default)
      }
    },
    
    // ·······································································
    // CONFIGURACIÓN DE FADERS
    // ·······································································
    
    faders: {
      // ───────────────────────────────────────────────────────────────────
      // Fader LEVEL - Control de nivel de salida
      // ───────────────────────────────────────────────────────────────────
      level: {
        min: 0,
        max: 1,
        initial: 0,           // Silencio por defecto
        step: 0.001,          // 1000 pasos para alta resolución
        curve: 'linear'
      }
    },
    
    // ·······································································
    // CONFIGURACIÓN DE SWITCHES
    // ·······································································
    
    switches: {
      // ───────────────────────────────────────────────────────────────────
      // Switch POWER - On/Off (mute)
      // ───────────────────────────────────────────────────────────────────
      power: {
        initial: true         // Encendido por defecto
      }
    },
    
    // ·······································································
    // PARÁMETROS DE AUDIO
    // ·······································································
    
    audio: {
      // Tiempo de suavizado para cambios de nivel (evita clicks)
      levelSmoothingTime: 0.06,
      
      // Tiempo de suavizado para cambios de pan
      panSmoothingTime: 0.03,
      
      // Tiempo de suavizado para cambios de filtro
      filterSmoothingTime: 0.03,
      
      // ───────────────────────────────────────────────────────────────────
      // CONFIGURACIÓN DEL FILTRO
      // ───────────────────────────────────────────────────────────────────
      filter: {
        // Frecuencias de corte (Hz)
        lowpassFreq: {
          min: 200,           // Frecuencia mínima del LP (knob en -1)
          max: 20000          // Frecuencia máxima del LP (knob cerca de 0)
        },
        highpassFreq: {
          min: 20,            // Frecuencia mínima del HP (knob cerca de 0)
          max: 5000           // Frecuencia máxima del HP (knob en +1)
        },
        // Factor Q del filtro
        Q: 0.707              // Butterworth (respuesta plana)
      }
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // ESTILOS VISUALES
  // ─────────────────────────────────────────────────────────────────────────
  
  frame: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
    borderWidth: 1
  }
};
