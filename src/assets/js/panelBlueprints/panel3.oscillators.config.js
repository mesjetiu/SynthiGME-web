// ═══════════════════════════════════════════════════════════════════════════
// PANEL 3 - CONFIGURACIÓN DE OSCILADORES
// ═══════════════════════════════════════════════════════════════════════════
//
// Este archivo define los parámetros sonoros de los 12 osciladores del Panel 3.
// Es la fuente única de verdad para la calibración y comportamiento de los
// osciladores, permitiendo ajustar el sintetizador sin modificar el código.
//
// ─────────────────────────────────────────────────────────────────────────────
// ESTRUCTURA DEL ARCHIVO
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. defaults: Configuración que aplica a TODOS los osciladores (1-12)
// 2. oscillators: Configuración INDIVIDUAL por oscilador (sobrescribe defaults)
//
// La jerarquía es: oscillators[n] > defaults
// Solo se definen en oscillators[n] los campos que difieren del default.
//
// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE CURVA DISPONIBLES
// ─────────────────────────────────────────────────────────────────────────────
//
// Las curvas controlan cómo el valor del knob (posición física) se mapea al
// valor del parámetro (frecuencia, ganancia, etc.).
//
// | Curva         | Fórmula                      | Uso típico                    |
// |---------------|------------------------------|-------------------------------|
// | 'linear'      | y = x                        | Ganancia, pulse width, simetría|
// | 'quadratic'   | y = x^n (n configurable)     | Frecuencia (más control graves)|
// | 'exponential' | y = (e^(k*x) - 1) / (e^k - 1)| Frecuencia estilo V/Oct       |
// | 'logarithmic' | y = log(x+1) / log(2)        | Percepción de volumen         |
//
// Para curvas 'quadratic' y 'exponential', el parámetro 'curveExponent' o
// 'curveK' permite ajustar la intensidad de la curva.
//
// ─────────────────────────────────────────────────────────────────────────────
// PARÁMETROS DE KNOB
// ─────────────────────────────────────────────────────────────────────────────
//
// Cada knob acepta los siguientes parámetros:
//
// | Parámetro       | Tipo    | Descripción                                    |
// |-----------------|---------|------------------------------------------------|
// | min             | number  | Valor mínimo del parámetro                     |
// | max             | number  | Valor máximo del parámetro                     |
// | initial         | number  | Valor inicial al cargar                        |
// | curve           | string  | Tipo de curva (ver tabla arriba)               |
// | curveExponent   | number  | Exponente para curva 'quadratic' (default: 2)  |
// | curveK          | number  | Factor K para curva 'exponential' (default: 3) |
// | pixelsForFullRange | number | Píxeles de arrastre para recorrer todo el rango|
//
// ─────────────────────────────────────────────────────────────────────────────
// MAPEO DE KNOBS
// ─────────────────────────────────────────────────────────────────────────────
//
// | Índice | Nombre        | Descripción                                      |
// |--------|---------------|--------------------------------------------------|
// | 0      | pulseLevel    | Nivel de ganancia de la onda de pulso (0-1)      |
// | 1      | pulseWidth    | Ancho de pulso / duty cycle (0.01-0.99)          |
// | 2      | sineLevel     | Nivel de ganancia de la onda senoidal (0-1)      |
// | 3      | sineSymmetry  | Simetría del sine (0=abajo, 0.5=puro, 1=arriba)  |
// | 4      | triangleLevel | Nivel de ganancia de la onda triangular (0-1)    |
// | 5      | sawtoothLevel | Nivel de ganancia de la onda diente de sierra    |
// | 6      | frequency     | Frecuencia del oscilador en Hz                   |
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN GLOBAL (aplica a todos los osciladores 1-12)
  // ─────────────────────────────────────────────────────────────────────────
  defaults: {
    
    // ·······································································
    // CONFIGURACIÓN DE KNOBS
    // ·······································································
    knobs: {
      
      // Knob 0: Pulse Level
      // Controla el nivel de ganancia de la onda de pulso.
      // Rango típico: 0 (silencio) a 1 (máximo)
      pulseLevel: {
        min: 0,                    // Ganancia mínima (silencio)
        max: 1,                    // Ganancia máxima
        initial: 0,                // Valor inicial (silencio)
        curve: 'linear'            // Curva lineal para control de ganancia
        // pixelsForFullRange: 300 // Opcional: píxeles para recorrer el rango
      },

      // Knob 1: Pulse Width
      // Controla el ancho de pulso (duty cycle) de la onda de pulso.
      // 0.5 = onda cuadrada perfecta, <0.5 = pulsos estrechos, >0.5 = pulsos anchos
      pulseWidth: {
        min: 0.01,                 // Mínimo (evitar 0 que causa silencio)
        max: 0.99,                 // Máximo (evitar 1 que causa silencio)
        initial: 0.5,              // Onda cuadrada (50% duty cycle)
        curve: 'linear'            // Curva lineal
      },

      // Knob 2: Sine Level
      // Controla el nivel de ganancia de la onda senoidal.
      sineLevel: {
        min: 0,                    // Ganancia mínima (silencio)
        max: 1,                    // Ganancia máxima
        initial: 0,                // Valor inicial (silencio)
        curve: 'linear'            // Curva lineal para control de ganancia
      },

      // Knob 3: Sine Symmetry
      // Controla la simetría vertical de la onda senoidal.
      // Simula el efecto de "rectificación variable" del Synthi 100.
      // 0 = vientres abajo (semicírculos negativos, picos arriba)
      // 0.5 = sine puro (onda senoidal perfecta)
      // 1 = vientres arriba (semicírculos positivos, picos abajo)
      sineSymmetry: {
        min: 0,                    // Máxima asimetría hacia abajo
        max: 1,                    // Máxima asimetría hacia arriba
        initial: 0.5,              // Sine puro (sin asimetría)
        curve: 'linear'            // Curva lineal
      },

      // Knob 4: Triangle Level
      // Controla el nivel de ganancia de la onda triangular.
      triangleLevel: {
        min: 0,                    // Ganancia mínima (silencio)
        max: 1,                    // Ganancia máxima
        initial: 0,                // Valor inicial (silencio)
        curve: 'linear'            // Curva lineal para control de ganancia
      },

      // Knob 5: Sawtooth Level
      // Controla el nivel de ganancia de la onda diente de sierra.
      sawtoothLevel: {
        min: 0,                    // Ganancia mínima (silencio)
        max: 1,                    // Ganancia máxima
        initial: 0,                // Valor inicial (silencio)
        curve: 'linear'            // Curva lineal para control de ganancia
      },

      // Knob 6: Frequency
      // Controla la frecuencia del oscilador en Hz.
      // Usa curva cuadrática para mejor resolución en frecuencias bajas.
      frequency: {
        min: 1,                    // Frecuencia mínima (1 Hz, casi LFO)
        max: 10000,                // Frecuencia máxima (10 kHz)
        initial: 10,               // Frecuencia inicial (10 Hz)
        curve: 'quadratic',        // Curva cuadrática (más control en graves)
        curveExponent: 2,          // Exponente de la curva (x^2)
        pixelsForFullRange: 900    // Más recorrido para control preciso
      }
    },

    // ·······································································
    // PARÁMETROS DE AUDIO (no controlados por knob)
    // ·······································································
    audio: {
      // Número de armónicos para generar el PeriodicWave del pulso.
      // Más armónicos = forma de onda más precisa, pero más CPU.
      // Rango recomendado: 16-64
      pulseHarmonics: 32,

      // Número de armónicos para generar el PeriodicWave del sine asimétrico.
      // Menos armónicos que el pulso porque la deformación es más suave.
      // Rango recomendado: 8-32
      sineHarmonics: 16,

      // Tiempo de suavizado para cambios de ganancia (en segundos).
      // Evita clics al cambiar niveles abruptamente.
      // Rango recomendado: 0.01-0.1
      gainSmoothing: 0.03,

      // Tiempo de suavizado para cambios de frecuencia (en segundos).
      // Evita glissandos al cambiar frecuencia.
      // Rango recomendado: 0.01-0.1
      freqSmoothing: 0.03
    }

    // ·······································································
    // PARÁMETROS ADICIONALES (reservados para futuras expansiones)
    // ·······································································
    // 
    // Los siguientes parámetros pueden añadirse en el futuro:
    //
    // tuning: {
    //   detuneCents: 0,          // Desafinación en cents (-100 a +100)
    //   detuneCoarse: 0,         // Desafinación en semitonos (-12 a +12)
    //   a4Reference: 440         // Frecuencia de referencia para A4 (Hz)
    // },
    //
    // phase: {
    //   initialPhase: 0,         // Fase inicial en radianes (0 a 2π)
    //   phaseSync: false         // Sincronizar fase al iniciar
    // },
    //
    // limits: {
    //   maxGainPerWaveform: 1,   // Ganancia máxima por forma de onda
    //   maxTotalGain: 2          // Ganancia total máxima (suma de todas)
    // }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN POR OSCILADOR (sobrescribe defaults)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Aquí se definen configuraciones individuales para cada oscilador.
  // Solo es necesario definir los campos que difieren del default.
  // Los campos no definidos heredan el valor de defaults.
  //
  // EJEMPLO DE USO:
  // ───────────────
  //
  // Para configurar el oscilador 1 como un LFO (baja frecuencia):
  //
  // oscillators: {
  //   1: {
  //     knobs: {
  //       frequency: {
  //         min: 0.01,           // Puede bajar a casi DC
  //         max: 100,            // Límite superior bajo para LFO
  //         initial: 1           // Empieza en 1 Hz
  //       }
  //     }
  //   }
  // }
  //
  // Para configurar el oscilador 3 con rango de audio completo:
  //
  // oscillators: {
  //   3: {
  //     knobs: {
  //       frequency: {
  //         min: 20,             // Límite inferior audible
  //         max: 20000,          // Límite superior audible
  //         initial: 440,        // La4 (afinación estándar)
  //         curve: 'exponential',// Curva exponencial (estilo V/Oct)
  //         curveK: 3            // Factor de curvatura
  //       }
  //     },
  //     audio: {
  //       pulseHarmonics: 48     // Más armónicos para alta fidelidad
  //     }
  //   }
  // }
  //
  // Para afinar un oscilador específico:
  //
  // oscillators: {
  //   5: {
  //     tuning: {
  //       detuneCents: -3        // Ligeramente desafinado (carácter analógico)
  //     }
  //   }
  // }
  //
  // ─────────────────────────────────────────────────────────────────────────
  
  oscillators: {
    // Por ahora todos los osciladores usan la configuración por defecto.
    // Añadir entradas aquí según sea necesario para calibrar el Synthi.
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MÓDULOS ADICIONALES DE PANEL 3
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Configuración de los módulos de ruido y voltaje aleatorio que aparecen
  // en la fila inferior del Panel 3.
  //
  // ─────────────────────────────────────────────────────────────────────────

  modules: {
    
    // Configuración de layout de la fila de módulos
    layout: {
      // Altura de la fila en píxeles (o 'auto')
      rowHeight: 80,
      // Proporción de cada módulo respecto al ancho total (debe sumar 1)
      // noise1: 2/9, noise2: 2/9, randomCV: 5/9
      proportions: {
        noise1: 2 / 9,
        noise2: 2 / 9,
        randomCV: 5 / 9
      }
    },

    // ·······································································
    // NOISE GENERATOR 1
    // ·······································································
    noise1: {
      id: 'panel3-noise-1',
      title: 'Noise 1',
      knobs: {
        colour: {
          min: 0,
          max: 1,
          initial: 0.5,
          curve: 'linear'
        },
        level: {
          min: 0,
          max: 1,
          initial: 0,
          curve: 'linear'
        }
      }
    },

    // ·······································································
    // NOISE GENERATOR 2
    // ·······································································
    noise2: {
      id: 'panel3-noise-2',
      title: 'Noise 2',
      knobs: {
        colour: {
          min: 0,
          max: 1,
          initial: 0.5,
          curve: 'linear'
        },
        level: {
          min: 0,
          max: 1,
          initial: 0,
          curve: 'linear'
        }
      }
    },

    // ·······································································
    // RANDOM CONTROL VOLTAGE GENERATOR
    // ·······································································
    randomCV: {
      id: 'panel3-random-cv',
      title: 'Random Voltage',
      knobs: {
        mean: {
          min: -1,
          max: 1,
          initial: 0,
          curve: 'linear'
        },
        variance: {
          min: 0,
          max: 1,
          initial: 0.5,
          curve: 'linear'
        },
        voltage1: {
          min: 0,
          max: 1,
          initial: 0,
          curve: 'linear'
        },
        voltage2: {
          min: 0,
          max: 1,
          initial: 0,
          curve: 'linear'
        },
        key: {
          min: 0,
          max: 1,
          initial: 0,
          curve: 'linear'
        }
      }
    }
  }
};
