// ═══════════════════════════════════════════════════════════════════════════
// OSCILLATOR CONFIG
// ═══════════════════════════════════════════════════════════════════════════
//
// Configuración de los 12 osciladores del Synthi 100.
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
    },

    // ·······································································
    // CALIBRACIÓN DEL CONFORMADOR DE SENO (Sine Shape)
    // ·······································································
    //
    // El Synthi 100 utiliza un circuito de waveshaping basado en tanh para
    // deformar la onda senoidal según el control "Shape". Estos parámetros
    // permiten afinar el comportamiento del modelado digital para que se
    // aproxime al hardware original.
    //
    // El algoritmo híbrido mezcla:
    // - Componente DIGITAL: Math.cos() puro (sin armónicos)
    // - Componente ANALÓGICA: tanh(k * triangular + offset)
    //
    // La mezcla varía según la posición del control de simetría.
    //
    sineShape: {
      // ─────────────────────────────────────────────────────────────────────
      // ATENUACIÓN DE AMPLITUD (sineShapeAttenuation)
      // ─────────────────────────────────────────────────────────────────────
      //
      // El circuito original del Synthi 100 no compensa la pérdida de amplitud
      // inherente al waveshaping. Según el manual:
      // - Centro (seno puro): 4V p-p
      // - Extremos (cuspoide): 0.5V p-p → ratio 8:1
      //
      // | Valor | Comportamiento                                           |
      // |-------|----------------------------------------------------------|
      // |  0.0  | Sin atenuación (amplitud constante, moderno)             |
      // |  0.5  | Atenuación parcial (compromiso)                          |
      // |  1.0  | Atenuación completa según hardware (8:1 en extremos)     |
      //
      attenuation: 1.0,

      // ─────────────────────────────────────────────────────────────────────
      // PUREZA DEL SENO EN EL CENTRO (sinePurity)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Controla cuánto seno digital puro se mezcla en el centro (Symmetry=0.5).
      //
      // | Valor | Comportamiento                                           |
      // |-------|----------------------------------------------------------|
      // |  0.0  | 100% analógico incluso en centro - máximo vintage        |
      // |  0.7  | 70% puro + 30% analógico - DEFAULT (carácter sutil)      |
      // |  1.0  | 100% digital puro en centro - sin armónicos, "limpio"    |
      //
      purity: 0.7,

      // ─────────────────────────────────────────────────────────────────────
      // COEFICIENTE DE SATURACIÓN (k)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Controla la "dureza" de la saturación tanh.
      //
      // | Valor | Comportamiento                                           |
      // |-------|----------------------------------------------------------|
      // |  1.0  | Saturación muy suave                                     |
      // |  1.55 | DEFAULT - Calibrado al 1/4 de recorrido del control      |
      // |  2.0  | Saturación más pronunciada                               |
      //
      saturationK: 1.55,

      // ─────────────────────────────────────────────────────────────────────
      // OFFSET MÁXIMO DE ASIMETRÍA
      // ─────────────────────────────────────────────────────────────────────
      //
      // Define cuánto offset DC se aplica a la triangular antes del tanh.
      //
      // | Valor | Comportamiento                                           |
      // |-------|----------------------------------------------------------|
      // |  0.5  | Deformación moderada                                     |
      // |  0.85 | DEFAULT - Buena deformación sin saturar completamente    |
      // |  1.0  | Máxima deformación                                       |
      //
      maxOffset: 0.85
    },

    // ·······································································
    // EMULACIÓN DE VOLTAJES (Synthi 100 Cuenca/Datanomics 1982)
    // ·······································································
    //
    // Estos parámetros emulan el comportamiento eléctrico real del Synthi 100.
    // Referencias: Manual Técnico Datanomics 1982 (D100-02 C1), Manual Belgrado.
    //
    // El circuito del VCO utiliza el chip CEM 3340 con amplificadores de suma
    // en la etapa de salida. Las ondas se mezclan antes de ir a la matriz
    // mediante I/C 6 (seno/sierra) e I/C 7 (pulso/triángulo).
    //
    voltage: {
      // ─────────────────────────────────────────────────────────────────────
      // NIVELES DE SALIDA POR FORMA DE ONDA (V p-p a amplitud total)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Según el manual Datanomics, todas las ondas alcanzan 8V p-p a
      // "amplitud total" después de la compensación interna.
      //
      // El circuito aplica internamente:
      // - Seno/Sierra: Rf = 100k (ganancia unitaria)
      // - Pulso/Triángulo: Rf = 300k (ganancia ×3 para compensar amplitud nativa menor)
      //
      outputLevels: {
        sine: 8.0,        // 8V p-p (referencia de amplitud total)
        sawtooth: 8.0,    // 8V p-p
        pulse: 8.0,       // 8V p-p (después de compensación ×3)
        triangle: 8.0,    // 8V p-p (después de compensación ×3)
        cusp: 0.5         // 0.5V p-p (deformación extrema del seno, ratio 8:1)
      },

      // ─────────────────────────────────────────────────────────────────────
      // RESISTENCIAS DE REALIMENTACIÓN INTERNAS (Rf)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Según esquema D100-02 C1:
      // - R28 (seno/sierra, I/C 6): 100k Ω
      // - R32 (pulso/triángulo, I/C 7): 300k Ω
      //
      feedbackResistance: {
        sineSawtooth: 100000,     // 100k Ω (R28)
        pulseTriangle: 300000     // 300k Ω (R32) - compensa amplitud nativa
      },

      // ─────────────────────────────────────────────────────────────────────
      // LÍMITE DE ENTRADA DE CV (Soft Clipping)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Las entradas de control del oscilador son nodos de suma de tierra
      // virtual con Rf = 100k. La saturación comienza alrededor de 8V.
      //
      inputLimit: 8.0,  // V p-p

      // ─────────────────────────────────────────────────────────────────────
      // DERIVA TÉRMICA (Thermal Drift)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Los osciladores CEM 3340 de la versión Cuenca son estables, pero
      // presentan una deriva natural de ±0.1% durante una sesión de trabajo.
      // Esto añade un carácter orgánico sutil a los intervalos.
      //
      // La deriva se implementa como una oscilación muy lenta (período ~2min)
      // que modifica ligeramente la frecuencia de cada oscilador.
      //
      thermalDrift: {
        maxDeviation: 0.001,    // ±0.1% de la frecuencia
        periodSeconds: 120,     // Período de 2 minutos (muy lento)
        enabledByDefault: true  // Habilitado por defecto (configurable en ajustes)
      },

      // ─────────────────────────────────────────────────────────────────────
      // VALORES HISTÓRICOS (Manual de Belgrado - Paul Pignon)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Referencia para emular versiones anteriores del Synthi 100.
      // Estos valores corresponden a la versión de Radio Belgrado.
      //
      legacyBelgrado: {
        sine: 4.0,        // 4V p-p
        sawtooth: 5.0,    // 5V p-p
        sawtoothHi: 7.4,  // 7.4V p-p (Osc 7-9 en versión antigua)
        pulse: 3.2,       // 3.2V p-p
        noise: 3.0        // 3V p-p (referencia para noiseGenerator)
      }
    }
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
  // Para calibrar el sineShape de un oscilador específico
  // (útil si un oscilador tiene componentes con tolerancias diferentes):
  //
  // oscillators: {
  //   7: {
  //     sineShape: {
  //       attenuation: 0.8,      // Atenuación más suave para este oscilador
  //       purity: 0.5            // Más carácter analógico en el centro
  //     }
  //   }
  // }
  //
  // ─────────────────────────────────────────────────────────────────────────
  
  oscillators: {
    // Por ahora todos los osciladores usan la configuración por defecto.
    // Añadir entradas aquí según sea necesario para calibrar el Synthi.
  }
};
