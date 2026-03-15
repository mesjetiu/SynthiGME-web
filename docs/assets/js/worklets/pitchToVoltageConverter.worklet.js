/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PITCH TO VOLTAGE CONVERTER WORKLET — Synthi 100 (Placa PC-25)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AudioWorkletProcessor que convierte la frecuencia fundamental de una
 * señal de audio en un voltaje de control DC proporcional (1V/Octava).
 *
 * Método de conversión (basado en hardware original):
 *   1. Detección de cruces por cero → medición de periodo de medio ciclo
 *   2. Estimación de frecuencia instantánea
 *   3. Conversión logarítmica: freq → log2(freq/ref) * V/Oct
 *   4. Track & Hold: mantiene último voltaje válido si señal < umbral
 *
 * Entrada: 1 canal de audio (input 0)
 * Salida:  1 canal DC (output 0, canal 0) — voltaje de control
 *
 * Referencia: Plano D100-25 C1, Manual Datanomics 1982
 */

// ─────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────

const MIN_FREQ = 250;
const MAX_FREQ = 8000;
const AMPLITUDE_THRESHOLD = 0.02;
const VOLTS_PER_OCTAVE = 1.0;
const DIGITAL_TO_VOLTAGE = 4.0;
const REFERENCE_FREQ = 440;

class PitchToVoltageConverterProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Estado del procesador
    this._dormant = false;
    this._stopped = false;

    // Parámetro: factor de spread del dial Range
    this._spreadFactor = 1.0; // dial=7 → 1:1

    // Estado del detector de pitch
    this._lastSign = 0;           // signo de la muestra anterior (+1/-1)
    this._lastCrossingIndex = -1; // índice del último cruce por cero (global)
    this._sampleCounter = 0;     // contador global de muestras

    // Track & Hold
    this._heldVoltage = 0;       // último voltaje válido retenido
    this._detectedFreq = 0;      // última frecuencia detectada

    // Manejar mensajes del main thread
    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  process(inputs, outputs) {
    if (this._stopped) return false;

    const output = outputs[0];
    const outputChannel = output[0];
    if (!outputChannel) return true;

    // En dormancy: silenciar salida pero mantener estado
    if (this._dormant) {
      outputChannel.fill(0);
      return true;
    }

    const input = inputs[0];
    const inputChannel = input?.[0];

    // Sin entrada conectada → mantener held voltage
    if (!inputChannel || inputChannel.length === 0) {
      outputChannel.fill(this._heldVoltage);
      return true;
    }

    // Calcular RMS del bloque para track & hold
    let sumSq = 0;
    for (let i = 0; i < inputChannel.length; i++) {
      sumSq += inputChannel[i] * inputChannel[i];
    }
    const rms = Math.sqrt(sumSq / inputChannel.length);

    if (rms < AMPLITUDE_THRESHOLD) {
      // Señal bajo umbral → mantener último voltaje (track & hold)
      outputChannel.fill(this._heldVoltage);
      return true;
    }

    // Detectar frecuencia por cruces por cero (half-cycle period)
    let detectedFreq = this._detectedFreq;

    for (let i = 0; i < inputChannel.length; i++) {
      const sample = inputChannel[i];
      const sign = sample >= 0 ? 1 : -1;

      if (this._lastSign !== 0 && sign !== this._lastSign) {
        // Cruce por cero detectado
        const globalIndex = this._sampleCounter + i;
        if (this._lastCrossingIndex >= 0) {
          const halfPeriodSamples = globalIndex - this._lastCrossingIndex;
          if (halfPeriodSamples > 0) {
            const freq = sampleRate / (halfPeriodSamples * 2);
            // Filtrar frecuencias fuera de rango
            if (freq >= MIN_FREQ && freq <= MAX_FREQ) {
              detectedFreq = freq;
            }
          }
        }
        this._lastCrossingIndex = globalIndex;
      }
      this._lastSign = sign;
    }

    this._sampleCounter += inputChannel.length;
    this._detectedFreq = detectedFreq;

    // Convertir frecuencia a voltaje (logarítmico, 1V/Oct)
    if (detectedFreq > 0) {
      const octaves = Math.log2(detectedFreq / REFERENCE_FREQ);
      this._heldVoltage = (octaves * VOLTS_PER_OCTAVE * this._spreadFactor) / DIGITAL_TO_VOLTAGE;
    }

    // Escribir voltaje DC constante en el bloque
    outputChannel.fill(this._heldVoltage);

    return true;
  }

  _handleMessage(data) {
    switch (data.type) {
      case 'setRange':
        this._spreadFactor = this._rangeDialToSpread(data.value);
        break;
      case 'setDormant':
        this._dormant = !!data.dormant;
        break;
      case 'stop':
        this._stopped = true;
        break;
    }
  }

  /**
   * Convierte dial Range (0-10) a factor de spread.
   * 0→-2, 3.5→0, 7→1, 10→2
   */
  _rangeDialToSpread(dial) {
    if (dial <= 3.5) {
      return -2 * (1 - dial / 3.5);
    }
    if (dial <= 7) {
      return (dial - 3.5) / (7 - 3.5);
    }
    return 1 + (dial - 7) / (10 - 7);
  }
}

registerProcessor('pitch-to-voltage-converter', PitchToVoltageConverterProcessor);
