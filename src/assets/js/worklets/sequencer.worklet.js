/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIGITAL SEQUENCER 1000 — AudioWorklet Processor
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Emulación del secuenciador digital del Synthi 100 (modelo Cuenca 1982).
 *
 * Genera 13 canales de salida simultáneos:
 *   Canal 0-1:  Audio DAC 1 & 2 (Panel 5, filas 87-88)
 *   Canal 2-3:  Voltage A, Voltage B
 *   Canal 4:    Key 1
 *   Canal 5-6:  Voltage C, Voltage D
 *   Canal 7:    Key 2
 *   Canal 8-9:  Voltage E, Voltage F
 *   Canal 10:   Key 3
 *   Canal 11:   Key 4
 *   Canal 12:   Clock pulse (Panel 6, fila 110)
 *
 * Acepta 8 entradas:
 *   Input 0: Clock externo (Panel 5, col 51)
 *   Input 1: Reset externo (Panel 5, col 52)
 *   Input 2: Forward externo (Panel 5, col 53)
 *   Input 3: Reverse externo (Panel 5, col 54)
 *   Input 4: Stop externo (Panel 5, col 55)
 *   Input 5: A·C·E voltage in (Panel 6, col 60)
 *   Input 6: B·D·F voltage in (Panel 6, col 61)
 *   Input 7: Key digital in (Panel 6, col 62)
 *
 * Fase 2: Solo clock interno + estructura base.
 * Fases 3-4 añadirán FSM, grabación y reproducción.
 *
 * @see sequencer.config.js — Parámetros de configuración
 * @see modules/sequencerModule.js — Módulo de audio (main thread)
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

/** Frecuencia mínima del reloj interno (Hz) */
const CLOCK_MIN_FREQ = 0.1;

/** Frecuencia máxima del reloj interno (Hz) — compatible con Z80 */
const CLOCK_MAX_FREQ = 500;

/** Ratio entre max y min frecuencia */
const CLOCK_FREQ_RATIO = CLOCK_MAX_FREQ / CLOCK_MIN_FREQ; // 5000

/** Ancho del pulso clock en segundos */
const CLOCK_PULSE_WIDTH = 0.005; // 5 ms

/** Umbral de voltaje para detección de clock externo (Schmitt trigger) */
const EXT_CLOCK_THRESHOLD = 1.0;

/** Índice del canal de salida del clock */
const CH_CLOCK = 12;

/** Total de canales de salida */
const TOTAL_CHANNELS = 13;

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

class SequencerProcessor extends AudioWorkletProcessor {

  constructor() {
    super();

    // ─── Estado del reloj interno ──────────────────────────────────────
    this._clockFreq = this._clockRateDialToFreq(5); // dial inicial = 5
    this._clockSamplesUntilNext = 0;
    this._clockIntervalLength = 0;
    this._clockPulseSamples = 0;  // calculado al primer process()
    this._clockPulseRemaining = 0;
    this._runClock = true;        // switch initial = true

    // ─── Estado del clock externo (detección de flancos) ───────────────
    this._extClockPrev = 0;

    // ─── Control ──────────────────────────────────────────────────────
    this._dormant = false;
    this._stopped = false;

    // ─── Mensajes desde main thread ──────────────────────────────────
    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  /**
   * Procesa un bloque de audio (128 samples).
   */
  process(inputs, outputs, parameters) {
    if (this._stopped) return false;

    const output = outputs[0];
    if (!output || output.length < TOTAL_CHANNELS) return true;

    const blockSize = output[0].length;

    // Calcular ancho de pulso clock en samples (una sola vez)
    if (this._clockPulseSamples === 0) {
      this._clockPulseSamples = Math.round(CLOCK_PULSE_WIDTH * sampleRate);
    }

    // ─── Dormancy: silencio pero el clock sigue corriendo ─────────────
    if (this._dormant) {
      for (let i = 0; i < blockSize; i++) {
        this._advanceClock(i, inputs);
      }
      // Silenciar todas las salidas
      for (let ch = 0; ch < TOTAL_CHANNELS; ch++) {
        output[ch].fill(0);
      }
      return true;
    }

    // ─── Generación sample a sample ──────────────────────────────────
    const clockChannel = output[CH_CLOCK];

    for (let i = 0; i < blockSize; i++) {
      // Avanzar clock (interno + externo)
      this._advanceClock(i, inputs);

      // Clock pulse output
      if (this._clockPulseRemaining > 0) {
        clockChannel[i] = 1.0;
        this._clockPulseRemaining--;
      } else {
        clockChannel[i] = 0.0;
      }
    }

    // Canales 0-11 en silencio (stub para fases 3-4)
    for (let ch = 0; ch < CH_CLOCK; ch++) {
      output[ch].fill(0);
    }

    return true;
  }

  /**
   * Avanza el reloj un sample. Combina clock interno y externo.
   * @param {number} sampleIndex - Índice del sample en el bloque actual
   * @param {Float32Array[][]} inputs - Entradas del worklet
   * @private
   */
  _advanceClock(sampleIndex, inputs) {
    let tick = false;

    // ── Clock interno ────────────────────────────────────────────────
    if (this._runClock) {
      if (this._clockSamplesUntilNext <= 0) {
        tick = true;
        const interval = this._calculateClockInterval();
        this._clockSamplesUntilNext = interval;
        this._clockIntervalLength = interval;
      }
      this._clockSamplesUntilNext--;
    }

    // ── Clock externo (input 0): detección de flanco positivo ────────
    const extInput = inputs[0];
    if (extInput && extInput[0]) {
      const extSample = extInput[0][sampleIndex];
      if (extSample >= EXT_CLOCK_THRESHOLD && this._extClockPrev < EXT_CLOCK_THRESHOLD) {
        tick = true;
      }
      this._extClockPrev = extSample;
    }

    // ── Procesar tick ────────────────────────────────────────────────
    if (tick) {
      this._onTick();
    }
  }

  /**
   * Procesa un tick del clock (interno o externo).
   * @private
   */
  _onTick() {
    // Iniciar pulso clock
    this._clockPulseRemaining = this._clockPulseSamples;

    // Notificar al main thread
    this.port.postMessage({ type: 'tick' });
  }

  /**
   * Calcula el intervalo en samples hasta el próximo tick del clock interno.
   * @returns {number} Samples hasta el próximo tick
   * @private
   */
  _calculateClockInterval() {
    const period = 1 / this._clockFreq;
    return Math.max(1, Math.round(period * sampleRate));
  }

  /**
   * Convierte el valor del dial Clock Rate (0-10) a frecuencia del reloj.
   *
   * Mapeo exponencial: dial 0 → 0.1 Hz, dial 5 → ~7.07 Hz, dial 10 → 500 Hz
   *
   *   freq = CLOCK_MIN_FREQ × CLOCK_FREQ_RATIO^(dial / 10)
   *        = 0.1 × 5000^(dial / 10)
   *
   * @param {number} dialValue - Valor del dial Clock Rate (0-10)
   * @returns {number} Frecuencia en Hz
   * @private
   */
  _clockRateDialToFreq(dialValue) {
    const normalized = dialValue / 10; // 0..1
    return CLOCK_MIN_FREQ * Math.pow(CLOCK_FREQ_RATIO, normalized);
  }

  /**
   * Procesa mensajes desde el hilo principal.
   * @param {Object} data - Mensaje recibido
   * @private
   */
  _handleMessage(data) {
    switch (data.type) {
      case 'setClockRate': {
        const oldFreq = this._clockFreq;
        this._clockFreq = this._clockRateDialToFreq(data.value);

        // Recálculo proporcional mid-cycle
        if (this._clockIntervalLength > 0 && oldFreq > 0) {
          const elapsed = this._clockIntervalLength - this._clockSamplesUntilNext;
          const fraction = elapsed / this._clockIntervalLength;
          const newBasePeriod = Math.max(
            Math.round(sampleRate / this._clockFreq),
            1
          );
          const newRemaining = Math.round(newBasePeriod * (1 - fraction));
          this._clockSamplesUntilNext = Math.max(0, newRemaining);
          this._clockIntervalLength = elapsed + this._clockSamplesUntilNext;
        }
        break;
      }

      case 'setRunClock':
        this._runClock = !!data.value;
        if (!this._runClock) {
          // Al parar el clock, limpiar pulso residual
          this._clockPulseRemaining = 0;
        }
        break;

      case 'setDormant':
        this._dormant = !!data.dormant;
        if (!this._dormant) {
          // Limpiar pulso residual de eventos fantasma durante dormancy
          this._clockPulseRemaining = 0;
        }
        break;

      case 'stop':
        this._stopped = true;
        break;
    }
  }
}

registerProcessor('sequencer', SequencerProcessor);
