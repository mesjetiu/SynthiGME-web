/**
 * OutputFilter AudioWorklet - Filtro RC pasivo del Output Channel (Synthi 100 Cuenca)
 * 
 * Emulación exacta del circuito de corrección tonal del VCA Dual
 * según plano D100-08 C1 (Cuenca/Datanomics 1982).
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * CIRCUITO REAL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Topología del circuito pasivo:
 * 
 *   Input ── C11 ── [end_A ─── Pot (10K LIN) ─── end_B] ── C12 ── GND
 *                              │ wiper
 *                              ↓
 *                         IC5 CA3140 (buffer ×2)
 *                              ↓
 *                           Output
 * 
 * Componentes:
 *   - RV1: Potenciómetro lineal 10 kΩ
 *   - C11: 0.047 µF (entrada → end_A del pot)
 *   - C12: 0.047 µF (end_B del pot → GND)
 *   - IC5: CA3140 como buffer con ganancia 2× (compensa pérdida de inserción)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * MODELO MATEMÁTICO
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * La señal recorre la cadena serie: C11 → R_a → R_b → C12 → GND
 * donde R_a + R_b = R (pot total), y el wiper toma voltaje entre R_a y R_b.
 * El buffer CA3140 (impedancia de entrada infinita) no extrae corriente.
 * 
 * Definiendo α = fracción del pot desde end_A (input) hasta end_B (GND):
 *   R_a = α·R  (wiper a end_A)
 *   R_b = (1-α)·R  (wiper a end_B)
 * 
 * Función de transferencia del divisor pasivo:
 *   H_pasivo(s) = ((1-α)·R + 1/(sC)) / (R + 2/(sC))
 *               = (1 + (1-α)·s·τ) / (2 + s·τ)        donde τ = R·C
 * 
 * Con compensación del buffer (ganancia 2×):
 *   H(s) = 2·H_pasivo(s) = (2 + (1+p)·s·τ) / (2 + s·τ)
 * 
 * donde p = posición bipolar del dial (-1 a +1), y α = (1-p)/2:
 *   p = -1 → LP:   H(s) = 2/(2 + s·τ) = 1/(1 + s·τ/2)
 *   p =  0 → Plano: H(s) = 1  (ganancia unitaria en todo el espectro)
 *   p = +1 → HP:   H(s) = 2·(1 + s·τ)/(2 + s·τ)
 * 
 * Frecuencias características (τ = 4.7×10⁻⁴ s):
 *   Polo fundamental: fp = 1/(2π·τ) ≈ 339 Hz
 *   LP fc(-3dB) = 1/(π·τ) ≈ 677 Hz (punto de -3 dB del lowpass)
 *   HP transición ≈ 339-677 Hz (shelving de +6 dB)
 *   Pendiente: 6 dB/octava (primer orden, un solo polo)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * COMPORTAMIENTO EN AUDIO
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Este filtro realiza una corrección tonal suave, no un corte brusco.
 * El carácter del primer orden (6 dB/oct) es mucho más sutil que un
 * Butterworth de segundo orden (12 dB/oct) o filtros resonantes.
 * 
 * Posición LP (dial -5, p=-1):
 *   - Lowpass clásico: atenúa frecuencias por encima de fc ≈ 677 Hz
 *   - Ganancia en DC = 0 dB (1.0), ganancia a 10 kHz ≈ -23 dB
 *   - Resultado perceptivo: sonido oscuro, graves preservados, brillo eliminado
 * 
 * Posición neutra (dial 0, p=0):
 *   - Respuesta plana: 0 dB en todo el espectro audible (20 Hz – 20 kHz)
 *   - Equivalente a bypass total
 * 
 * Posición HP (dial +5, p=+1):
 *   - Shelving de alta frecuencia: las HF ganan +6 dB respecto a LF
 *   - NO es un highpass puro (no atenúa DC), sino un filtro de estantería
 *   - Ganancia en DC = 0 dB, ganancia a 10 kHz ≈ +5.8 dB
 *   - Resultado perceptivo: sonido brillante, presencia en agudos, graves intactos
 * 
 * Zona de transición (339-677 Hz): corresponde a medios-bajos, región
 * fundamental de voz e instrumentos. La pendiente suave de 6 dB/oct hace
 * que el efecto sea gradual y musical, sin artefactos de resonancia.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPLEMENTACIÓN DIGITAL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Transformada bilineal s = (2·fs)·(1-z⁻¹)/(1+z⁻¹):
 * 
 *   Sea K = 2·fs·τ:
 *   H(z) = ((2+(1+p)·K) + (2-(1+p)·K)·z⁻¹) / ((2+K) + (2-K)·z⁻¹)
 * 
 *   Coeficientes normalizados:
 *     b0 = (2 + (1+p)·K) / (2 + K)
 *     b1 = (2 - (1+p)·K) / (2 + K)
 *     a1 = (2 - K) / (2 + K)
 * 
 *   Ecuación en diferencias:
 *     y[n] = b0·x[n] + b1·x[n-1] - a1·y[n-1]
 * 
 * Verificación (p=0, plano): b0=1, b1=a1 → H(z)=1 ✓
 * 
 * @module worklets/outputFilter
 * @version 1.0.0
 */

class OutputFilterProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [
      {
        name: 'filterPosition',
        defaultValue: 0,      // Centro = respuesta plana (0 dB en todo el espectro)
        minValue: -1,         // LP máximo: fc ≈ 677 Hz, atenúa HF a -6 dB/oct
        maxValue: 1,          // HP shelving: +6 dB en HF, LF intactas
        automationRate: 'k-rate'  // Control manual (sin modulación CV en el Synthi real)
      }
    ];
  }

  constructor(options) {
    super();
    
    const opts = options?.processorOptions || {};
    
    // ─────────────────────────────────────────────────────────────────────
    // Componentes del circuito (valores del Synthi 100 Cuenca)
    // ─────────────────────────────────────────────────────────────────────
    const resistance = opts.potResistance || 10000;     // 10 kΩ
    const capacitance = opts.capacitance || 47e-9;      // 0.047 µF
    
    // Constante de tiempo τ = R·C  (determina la frecuencia de corte del filtro)
    const tau = resistance * capacitance;               // 4.7×10⁻⁴ s → fc ≈ 677 Hz
    
    // K = 2·fs·τ (factor de prewarping bilineal, constante para todo el proceso)
    // A 44100 Hz: K ≈ 41.5  →  polo digital cercano al polo analógico
    /** @private */
    this._K = 2 * sampleRate * tau;
    
    // ─────────────────────────────────────────────────────────────────────
    // Estado del filtro por canal (hasta 2 para estéreo)
    // ─────────────────────────────────────────────────────────────────────
    /** @private */ this._x1 = new Float64Array(2);  // x[n-1]
    /** @private */ this._y1 = new Float64Array(2);  // y[n-1]
    
    // ─────────────────────────────────────────────────────────────────────
    // Coeficientes IIR de 1er orden (b0, b1 = numerador; a1 = denominador)
    // Inicializados para p=0 → respuesta plana (b0=1, b1=a1 → H(z)=1)
    // ─────────────────────────────────────────────────────────────────────
    /** @private */ this._b0 = 1;
    /** @private */ this._b1 = 0;
    /** @private */ this._a1 = 0;
    /** @private */ this._lastPosition = NaN;  // Forzar cálculo en primer bloque
  }

  /**
   * Recalcula coeficientes IIR via transformada bilineal.
   * Los coeficientes definen la respuesta en frecuencia del filtro:
   *   - b0, b1: ganancia directa y retardada de la entrada
   *   - a1: retroalimentación de la salida (define el polo / fc)
   * 
   * @param {number} p - Posición del filtro (-1=LP fc≈677Hz, 0=plano, +1=HP shelf +6dB)
   * @private
   */
  _updateCoefficients(p) {
    const K = this._K;
    const pK = (1 + p) * K;            // (1+p)·K
    const invDenom = 1 / (2 + K);      // 1/(2+K)
    
    this._b0 = (2 + pK) * invDenom;
    this._b1 = (2 - pK) * invDenom;
    this._a1 = (2 - K) * invDenom;
    this._lastPosition = p;
  }

  /**
   * Procesa un bloque de audio aplicando el filtro RC de 1er orden.
   * 
   * Ecuación en diferencias (IIR directa forma I):
   *   y[n] = b0·x[n] + b1·x[n-1] - a1·y[n-1]
   * 
   * El filtro es k-rate: los coeficientes se recalculan una vez por bloque
   * (128 samples), no por sample. Esto es suficiente para un control manual
   * (knob) y evita artefactos de modulación rápida de coeficientes.
   * 
   * @param {Float32Array[][]} inputs - Buffers de entrada (audio a filtrar)
   * @param {Float32Array[][]} outputs - Buffers de salida (audio filtrado)
   * @param {Object} parameters - AudioParams: filterPosition[-1..+1]
   * @returns {boolean} true para mantener el nodo activo
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || !input.length || !output || !output.length) return true;
    
    // Obtener posición del filtro (k-rate → un valor por bloque)
    const position = parameters.filterPosition[0];
    
    // Recalcular coeficientes solo si la posición cambió
    if (position !== this._lastPosition) {
      this._updateCoefficients(position);
    }
    
    const b0 = this._b0;
    const b1 = this._b1;
    const a1 = this._a1;
    const numChannels = Math.min(input.length, output.length);
    
    for (let ch = 0; ch < numChannels; ch++) {
      const inp = input[ch];
      const out = output[ch];
      if (!inp || !out) continue;
      
      let x1 = this._x1[ch];
      let y1 = this._y1[ch];
      
      for (let i = 0; i < inp.length; i++) {
        const x = inp[i];
        const y = b0 * x + b1 * x1 - a1 * y1;
        out[i] = y;
        x1 = x;
        y1 = y;
      }
      
      // Guardar estado con protección contra denormals
      this._x1[ch] = x1;
      this._y1[ch] = (Math.abs(y1) < 1e-30) ? 0 : y1;
    }
    
    return true;
  }
}

registerProcessor('output-filter', OutputFilterProcessor);
