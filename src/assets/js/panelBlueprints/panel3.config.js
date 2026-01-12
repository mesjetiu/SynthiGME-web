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
        curve: 'linear',           // Curva lineal para control de ganancia
        pixelsForFullRange: 900    // Alta resolución (6× default para mayor precisión)
      },

      // Knob 1: Pulse Width
      // Controla el ancho de pulso (duty cycle) de la onda de pulso.
      // 0.5 = onda cuadrada perfecta, <0.5 = pulsos estrechos, >0.5 = pulsos anchos
      pulseWidth: {
        min: 0.01,                 // Mínimo (evitar 0 que causa silencio)
        max: 0.99,                 // Máximo (evitar 1 que causa silencio)
        initial: 0.5,              // Onda cuadrada (50% duty cycle)
        curve: 'linear',           // Curva lineal
        pixelsForFullRange: 900    // Alta resolución (6× default para mayor precisión)
      },

      // Knob 2: Sine Level
      // Controla el nivel de ganancia de la onda senoidal.
      sineLevel: {
        min: 0,                    // Ganancia mínima (silencio)
        max: 1,                    // Ganancia máxima
        initial: 0,                // Valor inicial (silencio)
        curve: 'linear',           // Curva lineal para control de ganancia
        pixelsForFullRange: 900    // Alta resolución (6× default para mayor precisión)
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
        curve: 'linear',           // Curva lineal
        pixelsForFullRange: 900    // Alta resolución (6× default para mayor precisión)
      },

      // Knob 4: Triangle Level
      // Controla el nivel de ganancia de la onda triangular.
      triangleLevel: {
        min: 0,                    // Ganancia mínima (silencio)
        max: 1,                    // Ganancia máxima
        initial: 0,                // Valor inicial (silencio)
        curve: 'linear',           // Curva lineal para control de ganancia
        pixelsForFullRange: 900    // Alta resolución (6× default para mayor precisión)
      },

      // Knob 5: Sawtooth Level
      // Controla el nivel de ganancia de la onda diente de sierra.
      sawtoothLevel: {
        min: 0,                    // Ganancia mínima (silencio)
        max: 1,                    // Ganancia máxima
        initial: 0,                // Valor inicial (silencio)
        curve: 'linear',           // Curva lineal para control de ganancia
        pixelsForFullRange: 900    // Alta resolución (6× default para mayor precisión)
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
        pixelsForFullRange: 1500   // Máximo recorrido para control muy preciso
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
    },

    // ·······································································
    // MODULACIÓN DE FRECUENCIA POR CV (desde Panel 6)
    // ·······································································
    //
    // Estos parámetros controlan cómo las señales CV del Panel 6 modulan
    // la frecuencia del oscilador. El sistema usa el estándar de sintetizadores
    // modulares: VOLTIOS POR OCTAVA (V/Oct), implementado de forma exponencial.
    //
    // SISTEMA EXPONENCIAL (V/Oct):
    // ─────────────────────────────
    // La modulación es EXPONENCIAL, no lineal. Esto significa que la misma
    // cantidad de CV siempre produce el mismo intervalo musical, independiente-
    // mente de la frecuencia base.
    //
    // Fórmula: freq_final = freq_base × 2^(CV × cvScale × octavesPerUnit)
    //
    // Con los valores por defecto (cvScale=2, octavesPerUnit=0.5):
    //
    // | Valor CV | Cálculo                  | Intervalo      |
    // |----------|--------------------------|----------------|
    // |   +1.0   | 2^(1 × 2 × 0.5) = 2^1    | +1 octava      |
    // |   +0.5   | 2^(0.5 × 2 × 0.5) = 2^0.5| +tritono       |
    // |    0.0   | 2^0 = 1                  | sin cambio     |
    // |   -0.5   | 2^(-0.5)                 | -tritono       |
    // |   -1.0   | 2^(-1)                   | -1 octava      |
    //
    // IMPLEMENTACIÓN WEB AUDIO:
    // ─────────────────────────
    // Usamos el AudioParam `detune` de los osciladores (en cents).
    // 1 octava = 1200 cents, así que la ganancia del nodo CV es:
    //
    //   ganancia = cvScale × octavesPerUnit × 1200
    //
    // Con valores por defecto: 2 × 0.5 × 1200 = 1200 cents (±1 octava)
    //
    freqCV: {
      // Factor de escala aplicado a la señal CV de entrada.
      // Convierte el rango -1..+1 a un rango más amplio.
      //
      // | cvScale | Rango CV efectivo |
      // |---------|-------------------|
      // |    1    | -1 a +1           |
      // |    2    | -2 a +2 (default) |
      // |    4    | -4 a +4           |
      //
      cvScale: 2,

      // Octavas de cambio por cada unidad de CV escalada.
      // Define la "sensibilidad" de la modulación.
      //
      // | octavesPerUnit | Efecto con cvScale=2                     |
      // |----------------|------------------------------------------|
      // |      0.25      | ±0.5 octavas (rango total 1 octava)      |
      // |      0.5       | ±1 octava (rango total 2 octavas) default|
      // |      1.0       | ±2 octavas (rango total 4 octavas)       |
      // |      2.0       | ±4 octavas (rango total 8 octavas)       |
      //
      octavesPerUnit: 0.5,

      // Rango permitido para validación de parámetros.
      ranges: {
        cvScale: { min: 0.1, max: 10 },
        octavesPerUnit: { min: 0.1, max: 4 }
      }
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
  // NOISE GENERATOR - CONTEXTO HISTÓRICO
  // ─────────────────────────────────────────────────────────────────────────
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
  // ─────────────────────────────────────────────────────────────────────────

  modules: {
    
    // ·······································································
    // CONFIGURACIÓN DE LAYOUT
    // ·······································································
    layout: {
      // Altura de la fila en píxeles
      rowHeight: 80,
      
      // Proporción de cada módulo respecto al ancho total (debe sumar 1)
      // 2 + 2 + 5 = 9 partes totales
      proportions: {
        noise1: 2 / 9,
        noise2: 2 / 9,
        randomCV: 5 / 9
      }
    },

    // ·······································································
    // CONFIGURACIÓN DE AUDIO COMPARTIDA PARA NOISE GENERATORS
    // ·······································································
    //
    // Estos parámetros afectan al comportamiento del AudioWorklet.
    //
    noiseDefaults: {
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

    // ·······································································
    // NOISE GENERATOR 1
    // ·······································································
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
      
      // Configuración del módulo de audio (override de noiseDefaults)
      audio: {
        // initialColour: 0,           // Valor inicial de colour
        // initialLevel: 0,            // Valor inicial de level
        // levelSmoothingTime: 0.03,   // Override del default
        // colourSmoothingTime: 0.01   // Override del default
      }
    },

    // ·······································································
    // NOISE GENERATOR 2
    // ·······································································
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
    },

    // ·······································································
    // RANDOM CONTROL VOLTAGE GENERATOR
    // ·······································································
    //
    // Nota: Este módulo aún no tiene implementación de audio.
    // La UI está lista, pero la lógica de generación de CV aleatorio
    // se implementará en una fase posterior.
    //
    // @see TODO.md - "Random Voltage: definir filas de matriz"
    randomCV: {
      id: 'panel3-random-cv',
      title: 'Random Voltage',
      // matrixRow pendiente: { voltage1: ??, voltage2: ?? },
      
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
