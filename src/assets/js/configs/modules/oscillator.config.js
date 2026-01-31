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
// MODELO DE FRECUENCIA (Synthi 100 versión 1982 - CEM 3340)
// ─────────────────────────────────────────────────────────────────────────────
//
// El sistema de frecuencia implementa el modelo del VCO del Synthi 100 según
// el manual técnico Datanomics 1982 y el circuito D100-02 C1:
//
// 1. ESCALA DEL DIAL:
//    - El dial va de 0 a 10 (números arbitrarios)
//    - 0.95 unidades de dial = 1 octava (factor DIAL_UNITS_PER_OCTAVE)
//    - El dial cubre ~10.5 octavas en total
//
// 2. PUNTO DE REFERENCIA:
//    - Posición 5 = 261 Hz (Do central, C4)
//    - Calibrado según el Manual Técnico (VR3)
//
// 3. FÓRMULA DE FRECUENCIA:
//    V_dial = dialPosition / 0.95
//    V_total = V_dial + V_cv  (suma de voltajes)
//    V_distorsionado = applyTracking(V_total)
//    f = 261 × 2^(V_distorsionado - 5)
//
// 4. DISTORSIÓN DE TRACKING:
//    - Zona lineal: ±2.5V desde el centro (4-5 octavas de precisión 1V/Oct)
//    - Fuera de la zona: el oscilador se queda "flat" (más grave que lo ideal)
//    - Coeficiente α configurable (tracking.alpha)
//
// 5. SWITCH HI/LO:
//    - HI: capacitor C9 (1nF) → rango de audio
//    - LO: capacitor C10 (10nF) → frecuencia ÷10 (rango sub-audio/control)
//
// 6. LÍMITES FÍSICOS:
//    - HI: 5 Hz - 20,000 Hz
//    - LO: 0.5 Hz - 2,000 Hz
//
// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE CURVA DISPONIBLES (para otros parámetros)
// ─────────────────────────────────────────────────────────────────────────────
//
// Las curvas controlan cómo el valor del knob (posición física) se mapea al
// valor del parámetro (ganancia, pulse width, etc.). 
// 
// NOTA: La frecuencia usa el modelo Synthi 100 (dialToFrequency), no estas curvas.
//
// | Curva         | Fórmula                      | Uso típico                    |
// |---------------|------------------------------|-------------------------------|
// | 'linear'      | y = x                        | Ganancia, pulse width, simetría|
// | 'quadratic'   | y = x^n (n configurable)     | Parámetros con más control bajo|
// | 'exponential' | y = (e^(k*x) - 1) / (e^k - 1)| Parámetros estilo V/Oct       |
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
// | 6      | frequency     | Posición del dial de frecuencia (0-10)           |
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
      // Controla la posición del dial de frecuencia del oscilador (0-10).
      // 
      // IMPORTANTE: Este knob NO usa las curvas estándar (linear, quadratic, etc.).
      // En su lugar, el valor se interpreta como posición de dial y se convierte
      // a frecuencia usando el modelo Synthi 100 (dialToFrequency en conversions.js).
      //
      // La conversión dial → frecuencia sigue la fórmula del VCO CEM 3340:
      // - 0.95 unidades de dial = 1 octava (1V/Oct internamente)
      // - Posición 5 = 261 Hz (Do central, C4)
      // - Distorsión de tracking fuera de la zona lineal (±2.5V del centro)
      // - Switch HI/LO divide la frecuencia por 10
      //
      // | Posición | Rango HI (Audio) | Rango LO (Sub-audio) |
      // |----------|------------------|----------------------|
      // |    0     | ~10 Hz           | ~1 Hz                |
      // |    2     | ~29 Hz           | ~2.9 Hz              |
      // |    5     | 261 Hz           | 26.1 Hz              |
      // |    8     | ~2,320 Hz        | ~232 Hz              |
      // |   10     | ~12,000 Hz       | ~1,200 Hz            |
      //
      frequency: {
        min: 0,                    // Posición mínima del dial
        max: 10,                   // Posición máxima del dial
        initial: 5,                // Posición inicial (261 Hz en HI)
        curve: 'synthi100',        // Marca para usar dialToFrequency (no curva estándar)
        pixelsForFullRange: 10000, // 10000 px = 0.001 unidades por píxel (milésimas de dial)
        scaleDecimals: 3           // Mostrar 3 decimales en tooltip (ej: 5.123)
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

      // Tiempo de suavizado para cambios de parámetros del oscilador (en segundos).
      // Usado para: pulseWidth, symmetry, sineLevel, sawLevel, triLevel, pulseLevel.
      // Evita clics al cambiar valores abruptamente.
      // Rango recomendado: 0.005-0.05
      smoothingTime: 0.01,
      
      // ─────────────────────────────────────────────────────────────────────
      // RAMPA DE FRECUENCIA PARA KNOB MANUAL
      // ─────────────────────────────────────────────────────────────────────
      //
      // Tiempo de rampa (en segundos) aplicado a cambios de frecuencia desde
      // el knob manual. Evita saltos audibles ("zipper noise") al girar el knob.
      //
      // Usa setTargetAtTime de Web Audio API con τ = frequencyRampTime/3 para
      // alcanzar ~95% del valor objetivo en el tiempo especificado.
      //
      // IMPORTANTE: Esta rampa NO se aplica a:
      // - Control de voltaje (CV) desde la matriz → instantáneo para modulación precisa
      // - Mensajes OSC externos → instantáneo para sincronización remota
      //
      // | Valor    | Comportamiento                                           |
      // |----------|----------------------------------------------------------|
      // |   0      | Cambio instantáneo (sin rampa)                           |
      // |   0.05   | Rampa muy rápida (~50ms), apenas perceptible             |
      // |   0.1    | Rampa rápida (~100ms), suave pero responsivo             |
      // |   0.2    | DEFAULT - Rampa moderada (~200ms), buen balance          |
      // |   0.5    | Rampa lenta (~500ms), efecto "glide" notable             |
      //
      frequencyRampTime: 0.2
    },

    // ·······································································
    // SUAVIZADO INHERENTE DEL MÓDULO (Module Slew)
    // ·······································································
    //
    // Emula el slew rate finito del op-amp CA3140 en la salida de los VCO.
    // Los circuitos analógicos no pueden producir transiciones instantáneas;
    // el CA3140 tiene un slew rate típico de ~9 V/µs que limita la pendiente
    // de las formas de onda en alta frecuencia.
    //
    // Este suavizado se aplica SOLO a las formas con discontinuidades teóricas:
    // - Pulse (flancos verticales)
    // - Sawtooth (retroceso vertical)
    //
    // Sine y Triangle son inherentemente suaves y no necesitan este filtro.
    //
    // IMPLEMENTACIÓN:
    // Se usa un filtro one-pole (RC digital) en el AudioWorklet:
    //   y[n] = α × x[n] + (1 - α) × y[n-1]
    //   donde α = 1 - e^(-2π × fc / fs)
    //
    // REFERENCIA:
    // - CA3140 datasheet: Slew Rate = 9 V/µs típico
    // - Calculado como fc ≈ slew_rate / (2π × Vpp) ≈ 20 kHz para 8V p-p
    //
    moduleSlew: {
      // ─────────────────────────────────────────────────────────────────────
      // FRECUENCIA DE CORTE (cutoffHz)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Frecuencia de corte del filtro one-pole que emula el slew rate.
      // Valores más bajos = más suavizado, bordes más redondeados.
      //
      // | cutoffHz | Comportamiento                                          |
      // |----------|--------------------------------------------------------|
      // |   5000   | Muy suave, pérdida notable de agudos                    |
      // |  10000   | Suavizado pronunciado, carácter "cálido"                |
      // |  20000   | DEFAULT - Emula CA3140 a 8V p-p                         |
      // |  40000   | Suavizado sutil, conserva más armónicos                 |
      // |  48000   | Mínimo efecto (cercano a Nyquist/2)                     |
      //
      cutoffHz: 20000,

      // ─────────────────────────────────────────────────────────────────────
      // HABILITACIÓN (enabled)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Permite desactivar el suavizado para A/B testing o debugging.
      // En producción siempre debe estar true para emulación fiel.
      //
      enabled: true
    },

    // ·······································································
    // DISTORSIÓN DE TRACKING (Tracking Error del VCO)
    // ·······································································
    //
    // El circuito VCO CEM 3340 del Synthi 100 tiene una zona de tracking lineal
    // (precisión 1V/Octava) limitada a ~4-5 octavas centradas en el punto de
    // referencia. Fuera de esta zona, la constante de sensibilidad k deja de
    // ser constante, causando que el oscilador se quede "flat" (más grave de
    // lo que correspondería matemáticamente).
    //
    // Este comportamiento se modela con una función de distorsión cuadrática
    // que actúa solo fuera del rango lineal:
    //
    // V_distorsionado = V_ref + (V - V_ref) × (1 - α × (|V - V_ref| - linearHalfRange)²)
    //
    // Donde:
    // - V_ref = 5 (voltaje de referencia central)
    // - linearHalfRange = 2.5 (zona lineal de ±2.5V)
    // - α = coeficiente de distorsión (ajustable)
    //
    tracking: {
      // ─────────────────────────────────────────────────────────────────────
      // COEFICIENTE DE DISTORSIÓN (alpha)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Controla la intensidad de la distorsión fuera del rango lineal.
      // Valores mayores = más distorsión (oscilador más "flat" en extremos).
      //
      // | alpha | Comportamiento                                             |
      // |-------|------------------------------------------------------------| 
      // |  0.0  | Sin distorsión (tracking ideal 1V/Oct en todo el rango)    |
      // | 0.005 | Distorsión muy sutil (apenas perceptible)                  |
      // | 0.01  | DEFAULT - Emula el comportamiento típico del CEM 3340      |
      // | 0.02  | Distorsión pronunciada (unidad con más desgaste)           |
      // | 0.05  | Distorsión severa (para efectos especiales)                |
      //
      // Ajusta este valor para emular diferentes estados de calibración
      // o desgaste de los componentes del VCO.
      //
      alpha: 0.01,

      // ─────────────────────────────────────────────────────────────────────
      // RANGO LINEAL (linearHalfRange)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Mitad del rango de voltaje donde el tracking es preciso (1V/Oct).
      // El rango total lineal es ±linearHalfRange desde el centro (V=5).
      //
      // El manual técnico especifica:
      // - 4 octavas con ajuste básico (trimmer VR1)
      // - 5 octavas con ajuste fino (trimmer VR2)
      //
      // | linearHalfRange | Octavas lineales | Notas                         |
      // |-----------------|------------------|-------------------------------|
      // |      2.0        | 4 octavas        | Ajuste básico del manual      |
      // |      2.5        | 5 octavas        | DEFAULT - Ajuste fino del manual |
      // |      3.0        | 6 octavas        | Calibración excepcional       |
      // |      5.0        | 10 octavas       | Sin zona de distorsión (ideal)|
      //
      linearHalfRange: 2.5
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
      // Basado en el esquema electrónico D100-02 C1 y Manual Técnico Datanomics (1982).
      // 
      // El estándar de salida del sistema es 8V p-p (±4V) para "amplitud total".
      // Sin embargo, cada forma de onda tiene un voltaje real diferente tras pasar
      // por los amplificadores de suma con ganancias diferenciadas:
      //
      // CIRCUITO DE SALIDA:
      // - I/C 6 (R28 = 100kΩ): Seno + Sierra → ganancia ×1.0 (unitaria)
      // - I/C 7 (R32 = 300kΩ): Pulso + Triángulo → ganancia ×3.0 (compensación)
      //
      // VOLTAJES REALES EN MATRIZ (después de compensación):
      //
      // | Forma de onda | Voltaje nativo | Ganancia | Voltaje final |
      // |---------------|----------------|----------|---------------|
      // | Seno          | 8V p-p         | ×1.0     | 8.0V p-p      |
      // | Sierra        | 5-7.4V p-p     | ×1.0     | 6.2V p-p (*)  |
      // | Triángulo     | ~2.7V p-p      | ×3.0     | ~8.1V p-p     |
      // | Pulso         | ~2.7V p-p      | ×3.0     | ~8.1V p-p     |
      //
      // (*) Sierra: Rango 5.0-7.4V p-p según grupo de osciladores. Se usa 6.2V promedio.
      //
      // NOTA: El seno tiene atenuación variable según "Sine Shape" (ver sineShape.attenuation).
      // En forma de cuspoide extrema cae a 0.5V p-p (ratio 8:1).
      //
      outputLevels: {
        sine: 8.0,        // 8V p-p (referencia de calibración del sistema)
        sawtooth: 6.2,    // 5.0-7.4V p-p (promedio 6.2V, ganancia ×1.0)
        triangle: 8.1,    // ~2.7V p-p nativo × 3.0 = 8.1V p-p
        pulse: 8.1,       // ~2.7V p-p nativo × 3.0 = 8.1V p-p
        cusp: 0.5         // 0.5V p-p (seno deformado a cuspoide, ratio 8:1)
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
    },

    // ·······································································
    // SLEW TÉRMICO (Thermal Slew) - Inercia térmica del transistor
    // ·······································································
    //
    // Según el Manual Técnico Datanomics 1982:
    // "Si se realiza un salto grande de frecuencia (por ejemplo, superior a
    // 2 kHz), se produce un ligero efecto de portamento. Esto ocurre porque
    // un cambio brusco en el voltaje de control positivo provoca un ligero
    // calentamiento de un transistor dentro del circuito del oscilador. El
    // transistor tarda unos pocos segundos en alcanzar el equilibrio térmico."
    //
    // CARACTERÍSTICAS:
    // - Bidireccional: afecta tanto subidas como bajadas de frecuencia
    // - Asimétrico: calentamiento (subida) es más rápido que enfriamiento (bajada)
    // - Umbral: solo se activa para saltos grandes de CV (equivalentes a >2kHz)
    //
    // IMPLEMENTACIÓN:
    // Filtro one-pole asimétrico en el AudioWorklet cvThermalSlew.worklet.js:
    //   y[n] = y[n-1] + rate × (x[n] - y[n-1])
    //   donde rate = riseRate si subiendo, fallRate si bajando
    //
    thermalSlew: {
      // ─────────────────────────────────────────────────────────────────────
      // CONSTANTE DE TIEMPO DE SUBIDA (calentamiento)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Tiempo para alcanzar ~63% del target cuando el CV sube.
      // El calentamiento es un proceso activo (transistor disipando potencia),
      // por lo que es más rápido que el enfriamiento.
      //
      // | riseTimeConstant | Comportamiento                                 |
      // |------------------|------------------------------------------------|
      // |     0.05         | Muy rápido (casi imperceptible)                |
      // |     0.15         | DEFAULT - Portamento sutil audible (~150ms)    |
      // |     0.30         | Portamento pronunciado                         |
      // |     0.50         | Efecto muy evidente (glissando lento)          |
      //
      riseTimeConstant: 0.005, //0.15,

      // ─────────────────────────────────────────────────────────────────────
      // CONSTANTE DE TIEMPO DE BAJADA (enfriamiento)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Tiempo para alcanzar ~63% del target cuando el CV baja.
      // El enfriamiento es un proceso pasivo (disipación térmica al ambiente),
      // por lo que es más lento que el calentamiento (~3-5× más lento).
      //
      // | fallTimeConstant | Comportamiento                                 |
      // |------------------|------------------------------------------------|
      // |     0.20         | Enfriamiento relativamente rápido              |
      // |     0.50         | DEFAULT - Emula comportamiento real (~500ms)   |
      // |     1.00         | Enfriamiento muy lento (1 segundo)             |
      // |     2.00         | Extremo: "pocos segundos" del manual           |
      //
      fallTimeConstant: 0.02, //0.5,

      // ─────────────────────────────────────────────────────────────────────
      // UMBRAL DE ACTIVACIÓN
      // ─────────────────────────────────────────────────────────────────────
      //
      // Delta mínimo de CV (en unidades digitales) para activar el slew.
      // Valores menores al umbral pasan instantáneamente (sin portamento).
      //
      // El manual menciona "saltos grandes (>2 kHz)". En el sistema V/Oct:
      // - 2 kHz desde 250 Hz = ~3 octavas
      // - 2 kHz desde 1 kHz = ~1 octava
      //
      // | threshold | Comportamiento                                        |
      // |-----------|-------------------------------------------------------|
      // |    0.0    | Cualquier cambio activa slew (muy dramático)          |
      // |    0.5    | DEFAULT - Cambios de ~0.5 octavas activan slew        |
      // |    1.0    | Solo cambios de ≥1 octava activan slew                |
      // |    1.5    | Solo cambios grandes activan slew (más fiel al manual)|
      //
      threshold: 0.5,

      // ─────────────────────────────────────────────────────────────────────
      // HABILITACIÓN
      // ─────────────────────────────────────────────────────────────────────
      //
      // Permite desactivar el efecto para A/B testing o preferencia personal.
      //
      enabled: true
    },

    // ·······································································
    // SOFT CLIPPING DE CV (Saturación de entrada)
    // ·······································································
    //
    // Emula la saturación suave de los amplificadores operacionales del
    // Synthi 100 cuando la señal CV supera los límites de entrada.
    //
    // COMPORTAMIENTO ANALÓGICO:
    // Los opamps saturan gradualmente cerca de los raíles de alimentación
    // (±12V en el Synthi 100). Esto limita los cambios extremos de frecuencia
    // y añade un carácter "orgánico" a las modulaciones fuertes.
    //
    // IMPLEMENTACIÓN:
    // Fórmula polinómica: y = x - coefficient × x³
    // - Para valores pequeños: salida ≈ entrada (zona lineal)
    // - Para valores grandes: la resta del término cúbico limita el crecimiento
    //
    // NOTA: Debido a limitaciones de Web Audio API, no podemos usar
    // condicionales en el AudioWorklet. La fórmula polinómica es una
    // aproximación que funciona con aritmética pura.
    //
    softClip: {
      // ─────────────────────────────────────────────────────────────────────
      // COEFICIENTE DE SATURACIÓN (término cúbico)
      // ─────────────────────────────────────────────────────────────────────
      //
      // Controla cuánto se "comprime" la señal en valores altos.
      // La fórmula es: y = x - coefficient × x³
      //
      // Para una señal de entrada x (en unidades digitales, típicamente ±1 a ±2):
      //   - coefficient = 0.0001: saturación muy suave, casi imperceptible
      //   - coefficient = 0.001:  saturación moderada
      //   - coefficient = 0.01:   saturación fuerte
      //   - coefficient = 0.1:    saturación extrema (distorsión audible)
      //
      // EJEMPLOS con coefficient = 0.0001:
      //   x = 1.0  → y = 1.0 - 0.0001 = 0.9999 (prácticamente lineal)
      //   x = 5.0  → y = 5.0 - 0.0125 = 4.9875 (ligera compresión)
      //   x = 10.0 → y = 10.0 - 0.1 = 9.9 (compresión notable)
      //   x = 20.0 → y = 20.0 - 0.8 = 19.2 (compresión significativa)
      //
      // EJEMPLOS con coefficient = 0.001:
      //   x = 1.0  → y = 1.0 - 0.001 = 0.999
      //   x = 5.0  → y = 5.0 - 0.125 = 4.875
      //   x = 10.0 → y = 10.0 - 1.0 = 9.0
      //
      coefficient: 0.0001,

      // ─────────────────────────────────────────────────────────────────────
      // HABILITACIÓN
      // ─────────────────────────────────────────────────────────────────────
      //
      // Permite desactivar el efecto para A/B testing o preferencia personal.
      // Cuando está deshabilitado, la señal pasa sin modificar.
      //
      enabled: true
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
