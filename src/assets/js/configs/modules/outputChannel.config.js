// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT CHANNEL CONFIG
// ═══════════════════════════════════════════════════════════════════════════
//
// Configuración de los 8 canales de salida del Synthi 100.
//
// El Synthi 100 versión Cuenca/Datanomics 1982 utiliza el chip VCA CEM 3330
// para control de ganancia por voltaje en los canales de salida.
//
// Características del hardware:
// - Fader: potenciómetro lineal 10kΩ, genera 0V (posición 10) a -12V (posición 0)
// - VCA: respuesta logarítmica de 10 dB por voltio aplicado
// - CV externo: se suma algebraicamente (entrada desde matriz columnas 42-49)
// - Corte mecánico: en posición 0, el fader desconecta (ignora CV externo)
//
// Referencias: Manual Técnico Datanomics 1982, plano D100-08W1
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 2,  // Incrementado por cambio de escala del fader (0-1 → 0-10)
  
  // Número de canales
  count: 8,
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DE KNOBS
  // ─────────────────────────────────────────────────────────────────────────
  
  knobs: {
    // ───────────────────────────────────────────────────────────────────
    // Knob FILTER - Control de filtro LP/HP (escala dial -5 a 5)
    // ───────────────────────────────────────────────────────────────────
    // Escala dial Synthi 100 (-5 a 5):
    //   -5: Lowpass activo (solo graves)
    //    0: Sin filtrado (bypass, centro)
    //   +5: Highpass activo (solo agudos)
    //
    // La frecuencia de corte se calcula exponencialmente para un control
    // más musical del espectro.
    // ───────────────────────────────────────────────────────────────────
    filter: {
      min: -5,
      max: 5,
      initial: 0,           // Sin filtro por defecto (centro)
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
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DE FADERS
  // ─────────────────────────────────────────────────────────────────────────
  
  faders: {
    // ───────────────────────────────────────────────────────────────────
    // Fader LEVEL - Control de nivel de salida (escala 0-10)
    // ───────────────────────────────────────────────────────────────────
    // El fader usa escala 0-10 como el dial físico del Synthi 100:
    //   0: Silencio total (corte mecánico, ignora CV externo)
    //  10: Ganancia unidad (0 dB)
    //
    // El valor del fader se convierte internamente a voltaje de control
    // mediante vcaDialToVoltage(), y luego a ganancia vía vcaVoltageToGain().
    // ───────────────────────────────────────────────────────────────────
    level: {
      min: 0,
      max: 10,              // Escala 0-10 como dial físico
      initial: 0,           // Silencio por defecto
      step: 0.01,           // 1000 pasos para mayor suavidad
      curve: 'linear'       // El fader es lineal; la curva log la aplica el VCA
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DE SWITCHES
  // ─────────────────────────────────────────────────────────────────────────
  
  switches: {
    // ───────────────────────────────────────────────────────────────────
    // Switch POWER - On/Off (mute)
    // ───────────────────────────────────────────────────────────────────
    power: {
      initial: false        // Apagado por defecto
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // PARÁMETROS DE AUDIO
  // ─────────────────────────────────────────────────────────────────────────
  
  audio: {
    // Tiempo de suavizado para cambios de nivel (evita clicks)
    levelSmoothingTime: 0.06,
    
    // Tiempo de suavizado para cambios de pan
    panSmoothingTime: 0.03,
    
    // Tiempo de suavizado para cambios de filtro
    filterSmoothingTime: 0.03,
    
    // ─────────────────────────────────────────────────────────────────────
    // RAMPAS PARA CONTROLES MANUALES (knobs/faders)
    // ─────────────────────────────────────────────────────────────────────
    //
    // Tiempos de rampa aplicados cuando el usuario manipula los controles
    // directamente. Evita saltos audibles ("zipper noise").
    //
    // Usa setTargetAtTime de Web Audio API con τ = rampTime/3 para alcanzar
    // ~95% del valor objetivo en el tiempo especificado.
    //
    // IMPORTANTE: Estas rampas NO se aplican a:
    // - Control de voltaje (CV) desde la matriz → instantáneo
    // - Automatización programática → usa sus propios tiempos
    //
    ramps: {
      // Rampa para el fader de nivel
      level: 0.06,
      
      // Rampa para el knob de filtro
      filter: 0.2,
      
      // Rampa para el knob de pan
      pan: 0.2
    },
    
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
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DEL VCA CEM 3330 (Cuenca/Datanomics 1982)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // El VCA (Voltage Controlled Amplifier) del output channel convierte el
  // voltaje de control (suma del fader + CV externo) a ganancia de audio.
  //
  // Cadena de señal:
  //   Fader (0-10) → Voltaje (-12V a 0V) → + CV externo → VCA → Ganancia
  //
  // El fader NO procesa audio directamente. Genera un voltaje de control
  // que alimenta el VCA junto con CV externos de la matriz.
  //
  // ─────────────────────────────────────────────────────────────────────────
  
  vca: {
    // ───────────────────────────────────────────────────────────────────
    // Sensibilidad del VCA
    // ───────────────────────────────────────────────────────────────────
    // El CEM 3330 tiene una pendiente de 10 dB por cada voltio aplicado.
    // Esto significa que:
    //   0V → 0 dB (ganancia 1.0)
    //  -6V → -60 dB (ganancia 0.001)
    // -12V → -120 dB (silencio absoluto)
    // ───────────────────────────────────────────────────────────────────
    dbPerVolt: 10,
    
    // ───────────────────────────────────────────────────────────────────
    // Rango de voltaje del slider
    // ───────────────────────────────────────────────────────────────────
    // El fader es un potenciómetro lineal de 10kΩ conectado entre 0V y -12V.
    // La relación dial→voltaje es estrictamente lineal.
    // ───────────────────────────────────────────────────────────────────
    sliderVoltage: {
      atMax: 0,             // Voltaje en posición 10 del dial (0V = 0 dB)
      atMin: -12            // Voltaje en posición 0 del dial (-12V = -120 dB)
    },
    
    // ───────────────────────────────────────────────────────────────────
    // Umbral de corte total
    // ───────────────────────────────────────────────────────────────────
    // Por debajo de este voltaje, el VCA produce silencio absoluto.
    // En el hardware, esto corresponde al punto donde el fader desconecta
    // mecánicamente el circuito.
    // ───────────────────────────────────────────────────────────────────
    cutoffVoltage: -12,     // -12V → ganancia = 0
    
    // ───────────────────────────────────────────────────────────────────
    // Saturación para CV positivo
    // ───────────────────────────────────────────────────────────────────
    // Cuando el CV sumado (fader + externo) supera 0V, el VCA entra en
    // zona de saturación. Los raíles de alimentación ±12V limitan el
    // voltaje de control, produciendo compresión progresiva.
    //
    // El manual técnico advierte: "a niveles altos de control positivo,
    // la intermodulación se vuelve notable y generalmente indeseable"
    //
    // Modelo de saturación:
    //   compressed = softZoneWidth × ratio / (1 + ratio × softness)
    // donde ratio = excessVoltage / softZoneWidth
    //
    // Propiedades:
    // - linearThreshold: voltaje donde empieza la saturación (típicamente 0V)
    // - hardLimit: voltaje máximo efectivo (raíl de alimentación)
    // - softness: controla qué tan agresiva es la compresión
    //   - softness = 1: compresión suave, curva gradual
    //   - softness = 2: compresión moderada (default)
    //   - softness = 3+: compresión agresiva, satura rápido
    // ───────────────────────────────────────────────────────────────────
    saturation: {
      linearThreshold: 0,   // Voltaje donde empieza la saturación
      hardLimit: 3,         // Voltaje máximo (≈ +30 dB teórico, ~3.16× ganancia)
      softness: 2           // Factor de suavidad de la compresión
    },
    
    // ───────────────────────────────────────────────────────────────────
    // FILTRO ANTI-CLICK (Slew Limiter)
    // ───────────────────────────────────────────────────────────────────
    // El circuito de control del VCA incluye un filtro paso-bajo de 1 polo
    // para prevenir clicks audibles causados por cambios bruscos de voltaje.
    //
    // UBICACIÓN EN EL CIRCUITO (Manual Técnico Datanomics 1982):
    //   El filtro está DESPUÉS de la suma de Fader + CV externo:
    //
    //   Fader (voltaje) ─┬─→ [SUMA] ─→ [LPF τ=5ms] ─→ VCA (ganancia)
    //                    │
    //   CV externo ──────┘
    //
    //   Por tanto, el filtro afecta TANTO al fader COMO al CV externo.
    //   Cambios rápidos de cualquiera de los dos se suavizan igual.
    //
    // ESPECIFICACIONES DEL HARDWARE:
    //   - Constante de tiempo: τ = 5 ms (R × C del filtro RC)
    //   - Frecuencia de corte: fc = 1/(2πτ) ≈ 31.8 Hz
    //   - Pendiente: -6 dB/octava (filtro de 1 polo)
    //
    // CONSECUENCIAS:
    //   - Señales de control > 32 Hz se atenúan significativamente
    //   - AM (modulación de amplitud) a frecuencias de audio NO es posible
    //   - Solo responde a: envolventes suaves, LFOs lentos (<30 Hz), faders
    //   - Movimientos rápidos del fader (incluso via OSC) se suavizan
    //   - Este comportamiento es FIEL al hardware real de Cuenca
    //
    // NOTA HISTÓRICA:
    //   Versiones anteriores del Synthi 100 tenían un selector "Fast Response"
    //   (τ = 150 μs, fc ≈ 1060 Hz) en canales 5, 6 y 7. El modelo de Cuenca
    //   de 1982 NO incluye esta opción - todos los canales usan 5 ms.
    //
    // PARÁMETROS:
    //   - slewTime: Constante de tiempo τ en segundos (default: 0.005 = 5ms)
    //   - Fórmula del filtro IIR: y[n] = y[n-1] + α × (x[n] - y[n-1])
    //     donde α = 1 - e^(-1/(fs × τ))
    // ───────────────────────────────────────────────────────────────────
    antiClickFilter: {
      slewTime: 0.005,      // 5 ms - constante de tiempo del hardware Cuenca
      // Referencia: fc = 1/(2π × 0.005) ≈ 31.83 Hz
      // Valores alternativos para experimentación:
      // - 0.00015: Fast Response (150 μs, fc ≈ 1060 Hz) - NO disponible en Cuenca
      // - 0.010:   Doble τ (10 ms, fc ≈ 16 Hz) - más suave aún
      // - 0.001:   Más rápido (1 ms, fc ≈ 159 Hz) - para efectos AM suaves
    }
  }
};
