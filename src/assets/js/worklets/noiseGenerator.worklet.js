/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NOISE GENERATOR WORKLET - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * AudioWorklet para generación de ruido con algoritmo Voss-McCartney.
 * Emula el comportamiento del Noise Generator del EMS Synthi 100 (1971).
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * CARACTERÍSTICAS
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * - Ruido blanco (white): distribución uniforme, energía plana en frecuencia
 * - Ruido rosa (pink): algoritmo Voss-McCartney, -3dB/octava
 * - Control continuo de "colour" para transición suave white↔pink
 * - Generación sample-accurate sin artefactos
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * ALGORITMO VOSS-McCARTNEY
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * El algoritmo genera pink noise mediante la suma de múltiples generadores
 * de ruido blanco que se actualizan a diferentes tasas (octavas).
 * 
 * - Generador 0: se actualiza cada sample
 * - Generador 1: se actualiza cada 2 samples
 * - Generador 2: se actualiza cada 4 samples
 * - ...
 * - Generador N: se actualiza cada 2^N samples
 * 
 * La suma de estos generadores produce una pendiente espectral de -3dB/octava,
 * que es la característica definitoria del pink noise.
 * 
 * Referencia: Voss, R.F. & Clarke, J. (1978). "1/f noise in music and speech"
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * PARÁMETROS AudioParam
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * | Parámetro | Rango   | Default | Descripción                              |
 * |-----------|---------|---------|------------------------------------------|
 * | colour    | 0 - 1   | 0       | 0 = white noise, 1 = pink noise          |
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * USO
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * ```javascript
 * await audioContext.audioWorklet.addModule('noiseGenerator.worklet.js');
 * const noise = new AudioWorkletNode(audioContext, 'noise-generator');
 * noise.parameters.get('colour').value = 0.5; // 50% white, 50% pink
 * noise.connect(destination);
 * ```
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * @version 1.0.0
 * @author SynthiGME Team
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Número de octavas para el algoritmo Voss-McCartney.
 * Más octavas = mejor aproximación a -3dB/octava, pero más CPU.
 * 8 octavas es un buen balance para audio de 44.1-48kHz.
 */
const VOSS_OCTAVES = 8;

/**
 * Factor de normalización para la suma de generadores Voss-McCartney.
 * Evita clipping al sumar múltiples fuentes de ruido.
 */
const VOSS_NORMALIZATION = 1 / (VOSS_OCTAVES + 1);

class NoiseGeneratorProcessor extends AudioWorkletProcessor {
  
  /**
   * Definición de parámetros AudioParam.
   */
  static get parameterDescriptors() {
    return [
      {
        name: 'colour',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate' // Modulación sample-accurate
      }
    ];
  }

  constructor(options) {
    super();
    
    /**
     * Valores actuales de los generadores Voss-McCartney.
     * Cada generador mantiene su último valor hasta que le toca actualizarse.
     * @type {Float32Array}
     */
    this.vossValues = new Float32Array(VOSS_OCTAVES);
    
    /**
     * Contador de samples para determinar qué generadores actualizar.
     * Se usa con operaciones bit a bit para eficiencia.
     * @type {number}
     */
    this.sampleCounter = 0;
    
    /**
     * Suma acumulada de los generadores Voss (para pink noise).
     * Se actualiza incrementalmente para eficiencia.
     * @type {number}
     */
    this.pinkSum = 0;
    
    // Inicializar generadores con valores aleatorios
    this._initializeVossGenerators();
    
    /**
     * Flag para indicar si el procesador debe detenerse.
     * @type {boolean}
     */
    this.isRunning = true;
    
    /**
     * Flag de dormancy: cuando true, el worklet hace early exit sin procesar.
     * @type {boolean}
     */
    this.dormant = false;
    
    // Escuchar mensajes del hilo principal
    this.port.onmessage = (event) => {
      if (event.data.type === 'stop') {
        this.isRunning = false;
      } else if (event.data.type === 'setDormant') {
        this.dormant = event.data.dormant;
        console.log(`[Worklet] NoiseGenerator dormant: ${this.dormant}`);
      }
    };
  }

  /**
   * Inicializa los generadores Voss-McCartney con valores aleatorios.
   * Esto evita un transitorio inicial en el audio.
   * @private
   */
  _initializeVossGenerators() {
    for (let i = 0; i < VOSS_OCTAVES; i++) {
      const value = Math.random() * 2 - 1;
      this.vossValues[i] = value;
      this.pinkSum += value;
    }
  }

  /**
   * Genera un sample de ruido blanco.
   * Distribución uniforme en [-1, 1].
   * @returns {number}
   * @private
   */
  _whiteNoise() {
    return Math.random() * 2 - 1;
  }

  /**
   * Genera un sample de ruido rosa usando Voss-McCartney.
   * 
   * El algoritmo actualiza cada generador según su octava:
   * - Generador 0: cada sample (bit 0 cambia)
   * - Generador 1: cada 2 samples (bit 1 cambia)
   * - Generador N: cada 2^N samples (bit N cambia)
   * 
   * Solo se actualizan los generadores cuyo bit correspondiente
   * cambia entre el contador anterior y el actual, lo que hace
   * el algoritmo O(1) en promedio.
   * 
   * @returns {number} Sample de pink noise normalizado
   * @private
   */
  _pinkNoise() {
    const prevCounter = this.sampleCounter;
    this.sampleCounter++;
    
    // XOR para encontrar qué bits cambiaron
    const changed = prevCounter ^ this.sampleCounter;
    
    // Actualizar solo los generadores cuyos bits cambiaron
    for (let octave = 0; octave < VOSS_OCTAVES; octave++) {
      if (changed & (1 << octave)) {
        // Restar el valor antiguo de la suma
        this.pinkSum -= this.vossValues[octave];
        // Generar nuevo valor
        this.vossValues[octave] = this._whiteNoise();
        // Sumar el nuevo valor
        this.pinkSum += this.vossValues[octave];
      }
    }
    
    // Añadir un generador de ruido blanco para las frecuencias más altas
    // (el algoritmo Voss puro tiene un roll-off en altas frecuencias)
    const whiteComponent = this._whiteNoise();
    
    // Normalizar la suma
    return (this.pinkSum + whiteComponent) * VOSS_NORMALIZATION;
  }

  /**
   * Procesa un bloque de audio.
   * 
   * @param {Float32Array[][]} inputs - No usado (generador)
   * @param {Float32Array[][]} outputs - Buffer de salida
   * @param {Object} parameters - Parámetros AudioParam
   * @returns {boolean} true para mantener el procesador activo
   */
  process(inputs, outputs, parameters) {
    if (!this.isRunning) {
      return false;
    }

    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DORMANCY: Early exit - no generar ruido, solo silencio
    // ─────────────────────────────────────────────────────────────────────────
    if (this.dormant) {
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
      return true;
    }

    const channel = output[0];
    const colourParam = parameters.colour;
    
    // Determinar si colour es constante o varía sample a sample
    const isColourConstant = colourParam.length === 1;
    
    for (let i = 0; i < channel.length; i++) {
      // Obtener valor de colour para este sample
      const colour = isColourConstant ? colourParam[0] : colourParam[i];
      
      // Generar ambos tipos de ruido
      const white = this._whiteNoise();
      const pink = this._pinkNoise();
      
      // Interpolar entre white y pink según colour
      // colour = 0 → white, colour = 1 → pink
      channel[i] = white * (1 - colour) + pink * colour;
    }

    // Copiar a todos los canales de salida (mono → stereo si es necesario)
    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(channel);
    }

    return true;
  }
}

registerProcessor('noise-generator', NoiseGeneratorProcessor);
