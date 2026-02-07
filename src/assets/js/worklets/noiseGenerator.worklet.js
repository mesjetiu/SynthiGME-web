/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NOISE GENERATOR WORKLET — Synthi 100 Cuenca (Datanomics 1982)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * AudioWorklet para generación de ruido con filtro COLOUR de 6 dB/oct.
 * Emula el circuito de los 2 generadores de ruido del EMS Synthi 100
 * versión Cuenca/GME.
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * CIRCUITO REAL
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Fuente de ruido:
 *   Transistor BC169C con unión NP polarizada en inversa genera ruido
 *   impulsivo de espectro plano (white noise). Amplificado y bufferizado.
 *   Espectro plano ±3 dB de 100 Hz a 10 kHz.
 * 
 * Filtro COLOUR (6 dB/oct):
 *   Topología idéntica al filtro RC del Output Channel (plano D100-08 C1):
 *   White noise → C → [Pot 10K LIN] → C → GND, wiper → buffer
 * 
 *   Función de transferencia con buffer (ganancia 2×):
 *     H(s) = 2·(2 + (1+p)·sτ) / (2 + sτ)     donde τ = R·C
 * 
 *   Posiciones del dial COLOUR (0-10):
 *     Dial 0  (p=-1): LP — ruido oscuro/rosa, atenúa HF a -6 dB/oct
 *     Dial 5  (p= 0): Plano — ruido blanco, 0 dB en todo el espectro
 *     Dial 10 (p=+1): HP — ruido brillante/azul, +6 dB shelf en HF
 * 
 * DC-coupled: la señal se extiende hasta ~2-3 Hz (fmin del circuito),
 * permitiendo uso como fuente de CV aleatorio para modulación lenta.
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPORTAMIENTO EN AUDIO
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * El filtro COLOUR moldea el espectro del ruido blanco de forma continua:
 * 
 * Posición LP (dial 0, p=-1):
 *   - Atenúa progresivamente por encima de fc ≈ 965 Hz
 *   - Resultado: ruido "oscuro" o "cálido", énfasis en graves
 *   - Uso musical: textura de fondo, "viento", padding atmosférico
 *   - Uso CV: voltaje aleatorio de baja frecuencia (vibrato lento)
 * 
 * Posición neutra (dial 5, p=0):
 *   - Espectro plano ±3 dB de 100 Hz a 10 kHz
 *   - Ruido blanco clásico: energía igual en todas las frecuencias
 *   - Uso musical: "soplido" o "siseo" puro, excitación de filtros
 * 
 * Posición HP (dial 10, p=+1):
 *   - Shelving: +6 dB en HF respecto a LF
 *   - Resultado: ruido "brillante" o "metálico", presencia en agudos
 *   - Uso musical: textura de lluvia, percusión sibilante, hi-hats
 *   - Uso CV: voltaje aleatorio de mayor variación instantánea
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENTACIÓN DIGITAL
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Transformada bilineal del filtro analógico (misma que outputFilter):
 *   K = 2·fs·τ
 *   a1 = (2 - K) / (2 + K)          — constante (polo del filtro)
 *   Kinv = K / (2 + K)               — constante (factor de modulación)
 * 
 * Para cada sample con posición p (a-rate):
 *   δ = p · Kinv
 *   b0 = 1 + δ
 *   b1 = a1 - δ
 *   y[n] = b0·x[n] + b1·x[n-1] - a1·y[n-1]
 * 
 * Optimización: a1 y Kinv no dependen de p, solo se calculan una vez.
 * Per-sample: 1 mul (δ), 2 sumas (b0,b1), 3 mul + 2 add (filtro).
 * 
 * Verificación (p=0): δ=0, b0=1, b1=a1 → H(z) = (1+a1·z⁻¹)/(1+a1·z⁻¹) = 1 ✓
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * PARÁMETROS AudioParam
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * | Parámetro       | Rango     | Default | Rate   | Descripción            |
 * |-----------------|-----------|---------|--------|------------------------|
 * | colourPosition  | -1 a +1   | 0       | a-rate | Posición del filtro    |
 * 
 *   -1 = LP (dark/pink), 0 = flat (white), +1 = HP (bright/blue)
 *   a-rate permite modulación CV desde la matriz de control (Panel 6)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * @module worklets/noiseGenerator
 * @version 2.0.0 — Reescrito con filtro COLOUR IIR (antes: Voss-McCartney)
 * ═══════════════════════════════════════════════════════════════════════════
 */

class NoiseGeneratorProcessor extends AudioWorkletProcessor {

  /**
   * Definición de parámetros AudioParam.
   * Un único parámetro controla la posición del filtro colour (-1..+1).
   */
  static get parameterDescriptors() {
    return [
      {
        name: 'colourPosition',
        defaultValue: 0,        // Centro = espectro plano (ruido blanco)
        minValue: -1,           // LP máximo: ruido oscuro/rosa
        maxValue: 1,            // HP shelving: ruido brillante/azul
        automationRate: 'a-rate'  // CV-modulable desde matriz de control
      }
    ];
  }

  constructor(options) {
    super();

    const opts = options?.processorOptions || {};

    // ─────────────────────────────────────────────────────────────────────
    // Componentes del circuito COLOUR (valores del Synthi 100 Cuenca)
    // ─────────────────────────────────────────────────────────────────────
    const resistance = opts.potResistance || 10000;     // 10 kΩ pot lineal
    const capacitance = opts.capacitance || 33e-9;      // 33 nF

    // Constante de tiempo τ = R·C  (determina la frecuencia de corte)
    const tau = resistance * capacitance;               // 3.3×10⁻⁴ s → fc ≈ 965 Hz

    // Factor bilineal K = 2·fs·τ (constante para todo el proceso)
    const K = 2 * sampleRate * tau;

    // ─────────────────────────────────────────────────────────────────────
    // Coeficientes constantes del filtro IIR de 1er orden
    // ─────────────────────────────────────────────────────────────────────
    // a1 y Kinv NO dependen de la posición p del colour:
    //   a1 = (2-K)/(2+K)  — define el polo (fc del filtro)
    //   Kinv = K/(2+K)    — factor que modula b0,b1 con p
    //
    // Per-sample, los coeficientes variables se calculan como:
    //   δ = p · Kinv
    //   b0 = 1 + δ
    //   b1 = a1 - δ
    // ─────────────────────────────────────────────────────────────────────
    /** @private */ this._a1 = (2 - K) / (2 + K);
    /** @private */ this._Kinv = K / (2 + K);

    // ─────────────────────────────────────────────────────────────────────
    // Estado del filtro (mono, un solo canal de generación)
    // ─────────────────────────────────────────────────────────────────────
    /** @private */ this._x1 = 0;   // x[n-1] — sample de ruido anterior
    /** @private */ this._y1 = 0;   // y[n-1] — salida filtrada anterior

    // ─────────────────────────────────────────────────────────────────────
    // Control de estado
    // ─────────────────────────────────────────────────────────────────────
    /** @private */ this.isRunning = true;
    /** @private */ this.dormant = false;
    /** @private */ this.filterBypassed = false;   // Fast path: skip IIR when flat

    // Umbral para considerar p ≈ 0 (filtro plano, white noise puro)
    // Mismo concepto que FILTER_BYPASS_THRESHOLD del Output Channel
    /** @private */ this._bypassThreshold = 0.02;

    // Escuchar mensajes del hilo principal
    this.port.onmessage = (event) => {
      if (event.data.type === 'stop') {
        this.isRunning = false;
      } else if (event.data.type === 'setDormant') {
        this.dormant = event.data.dormant;
      } else if (event.data.type === 'setFilterBypassed') {
        this.filterBypassed = event.data.bypassed;
      }
    };
  }

  /**
   * Procesa un bloque de audio: genera ruido blanco y aplica filtro COLOUR.
   * 
   * Cadena de señal por sample:
   *   1. Genera ruido blanco: x[n] = Math.random() * 2 - 1
   *   2. Calcula coeficientes b0, b1 según posición p del colour
   *   3. Aplica filtro IIR: y[n] = b0·x[n] + b1·x[n-1] - a1·y[n-1]
   *   4. Escribe resultado en buffer de salida
   * 
   * @param {Float32Array[][]} inputs - No usado (generador, sin entradas)
   * @param {Float32Array[][]} outputs - Buffer de salida mono
   * @param {Object} parameters - AudioParams: colourPosition [-1..+1]
   * @returns {boolean} true para mantener el procesador activo
   */
  process(inputs, outputs, parameters) {
    if (!this.isRunning) return false;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    // ─────────────────────────────────────────────────────────────────────
    // DORMANCY: silencio sin procesamiento (ahorra ~95% CPU)
    // ─────────────────────────────────────────────────────────────────────
    if (this.dormant) {
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
      return true;
    }

    const channel = output[0];
    const colourParam = parameters.colourPosition;
    const isConstant = colourParam.length === 1;
    const a1 = this._a1;
    const Kinv = this._Kinv;
    let x1 = this._x1;
    let y1 = this._y1;

    // ─────────────────────────────────────────────────────────────────────
    // FILTER BYPASS: cuando p ≈ 0 y bypass habilitado, generar white noise
    // directamente sin IIR (ahorra ~5 operaciones/sample)
    // ─────────────────────────────────────────────────────────────────────
    if (this.filterBypassed && isConstant &&
        Math.abs(colourParam[0]) < this._bypassThreshold) {
      for (let i = 0; i < channel.length; i++) {
        channel[i] = Math.random() * 2 - 1;
      }
      // Reset estado del filtro para reactivación limpia
      this._x1 = 0;
      this._y1 = 0;

      for (let ch = 1; ch < output.length; ch++) {
        output[ch].set(channel);
      }
      return true;
    }

    if (isConstant) {
      // ───────────────────────────────────────────────────────────────────
      // K-RATE: posición constante → coeficientes constantes en el bloque
      // Caso habitual cuando el colour no está siendo modulado por CV
      // ───────────────────────────────────────────────────────────────────
      const p = colourParam[0];
      const delta = p * Kinv;
      const b0 = 1 + delta;
      const b1 = a1 - delta;

      for (let i = 0; i < channel.length; i++) {
        const x = Math.random() * 2 - 1;   // White noise
        const y = b0 * x + b1 * x1 - a1 * y1;
        channel[i] = y;
        x1 = x;
        y1 = y;
      }
    } else {
      // ───────────────────────────────────────────────────────────────────
      // A-RATE: posición varía per-sample (modulación CV activa)
      // Solo 1 mul + 2 adds extra por sample respecto a k-rate
      // ───────────────────────────────────────────────────────────────────
      for (let i = 0; i < channel.length; i++) {
        const p = colourParam[i];
        const delta = p * Kinv;
        const b0 = 1 + delta;
        const b1 = a1 - delta;

        const x = Math.random() * 2 - 1;   // White noise
        const y = b0 * x + b1 * x1 - a1 * y1;
        channel[i] = y;
        x1 = x;
        y1 = y;
      }
    }

    // Guardar estado con protección contra denormals
    this._x1 = x1;
    this._y1 = (Math.abs(y1) < 1e-30) ? 0 : y1;

    // Copiar a canales adicionales si hay (mono → stereo)
    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(channel);
    }

    return true;
  }
}

registerProcessor('noise-generator', NoiseGeneratorProcessor);
