/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RANDOM CONTROL VOLTAGE GENERATOR — AudioWorklet Processor
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Emulación del generador de voltaje de control aleatorio del Synthi 100
 * (modelo Cuenca/Datanomics 1982, placa PC-21, plano D100-21 C1).
 *
 * Genera tres señales simultáneas y sincronizadas:
 *   Canal 0: Voltage 1 — DC aleatorio, distribución uniforme [-1, +1]
 *   Canal 1: Voltage 2 — DC aleatorio, distribución uniforme [-1, +1]
 *   Canal 2: Key Pulse  — pulso de ~5ms (amplitud 1.0) en cada evento
 *
 * El reloj interno varía entre 0.2 Hz y 20 Hz (exponencial).
 * La varianza aplica jitter temporal al período del reloj.
 *
 * Las amplitudes de salida se controlan externamente con GainNodes:
 *   - Voltage 1/2: curva LOG (10K pot), ±2.5V pico
 *   - Key: lineal bipolar, ±5V pico
 *
 * Fuente de aleatoriedad: Math.random() (distribución rectangular/uniforme),
 * equivalente funcional de la unión N-P del transistor Q1 en polarización inversa.
 *
 * @see randomVoltage.config.js — Parámetros de configuración
 * @see modules/randomCV.js — Módulo de audio (main thread)
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

/** Frecuencia mínima del reloj (Hz) — un evento cada 5 segundos */
const MIN_FREQ = 0.2;

/** Frecuencia máxima del reloj (Hz) — 50ms por evento */
const MAX_FREQ = 20;

/** Ratio entre max y min frecuencia (100x = ~6.6 octavas) */
const FREQ_RATIO = MAX_FREQ / MIN_FREQ; // 100

/** Ancho del pulso key en segundos */
const KEY_PULSE_WIDTH = 0.005; // 5 ms

/** Período mínimo absoluto (protección contra períodos negativos/cero) */
const MIN_PERIOD = 1 / MAX_FREQ; // 0.05s

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

class RandomCVProcessor extends AudioWorkletProcessor {
  
  constructor() {
    super();
    
    // ─── Estado del reloj ──────────────────────────────────────────────
    
    /** Frecuencia actual del reloj en Hz */
    this._meanFreq = 2.0; // ~dial 0 → centro del rango exponencial
    
    /** Varianza normalizada (0 = constante, 1 = máxima irregularidad) */
    this._variance = 0.5;
    
    /** Samples restantes hasta el próximo evento */
    this._samplesUntilNext = 0;
    
    // ─── Estado de las salidas ─────────────────────────────────────────
    
    /** Valor DC actual de Voltage 1 (normalizado ±1) */
    this._currentV1 = 0;
    
    /** Valor DC actual de Voltage 2 (normalizado ±1) */
    this._currentV2 = 0;
    
    /** Samples restantes del pulso key activo */
    this._keySamplesRemaining = 0;
    
    /** Ancho del pulso key en samples (calculado al primer process()) */
    this._keyPulseSamples = 0;
    
    // ─── Control ──────────────────────────────────────────────────────
    
    /** Si true, el procesador está dormido (output = 0) */
    this._dormant = false;
    
    /** Si true, el procesador debe detenerse */
    this._stopped = false;
    
    // ─── Mensajes desde main thread ──────────────────────────────────
    this.port.onmessage = (e) => this._handleMessage(e.data);
  }
  
  /**
   * Procesa un bloque de audio (128 samples).
   * 
   * Genera 3 canales de salida:
   *   [0] Voltage 1: DC constante entre eventos, valor aleatorio uniforme ±1
   *   [1] Voltage 2: DC constante entre eventos, valor aleatorio uniforme ±1
   *   [2] Key Pulse: 1.0 durante 5ms tras cada evento, 0.0 el resto
   */
  process(inputs, outputs, parameters) {
    if (this._stopped) return false;
    
    const output = outputs[0];
    if (!output || output.length < 3) return true;
    
    const v1Channel = output[0];
    const v2Channel = output[1];
    const keyChannel = output[2];
    const blockSize = v1Channel.length;
    
    // ─── Dormancy: silencio pero el reloj sigue corriendo ─────────
    // El reloj interno no se detiene durante dormancy para preservar
    // la fase del ritmo. Solo se silencia la salida. Así, al despertar,
    // el RVG continúa exactamente donde estaba en el ciclo.
    if (this._dormant) {
      // Calcular ancho de pulso key en samples (una sola vez)
      if (this._keyPulseSamples === 0) {
        this._keyPulseSamples = Math.round(KEY_PULSE_WIDTH * sampleRate);
      }
      
      // El reloj avanza internamente, generando eventos "fantasma"
      for (let i = 0; i < blockSize; i++) {
        if (this._samplesUntilNext <= 0) {
          this._fireEvent();
        }
        this._samplesUntilNext--;
      }
      
      // Pero la salida es silencio
      v1Channel.fill(0);
      v2Channel.fill(0);
      keyChannel.fill(0);
      return true;
    }
    
    // Calcular ancho de pulso key en samples (una sola vez)
    if (this._keyPulseSamples === 0) {
      this._keyPulseSamples = Math.round(KEY_PULSE_WIDTH * sampleRate);
    }
    
    // ─── Generación sample a sample ─────────────────────────────────
    for (let i = 0; i < blockSize; i++) {
      
      // ¿Toca nuevo evento?
      if (this._samplesUntilNext <= 0) {
        this._fireEvent();
      }
      
      // Escribir valores DC actuales
      v1Channel[i] = this._currentV1;
      v2Channel[i] = this._currentV2;
      
      // Pulso key: 1.0 mientras dure, 0.0 después
      if (this._keySamplesRemaining > 0) {
        keyChannel[i] = 1.0;
        this._keySamplesRemaining--;
      } else {
        keyChannel[i] = 0.0;
      }
      
      this._samplesUntilNext--;
    }
    
    return true;
  }
  
  /**
   * Genera un nuevo evento aleatorio:
   * - Nuevos valores para V1 y V2 (distribución uniforme ±1)
   * - Inicia el pulso key
   * - Calcula el período hasta el próximo evento (con jitter)
   * @private
   */
  _fireEvent() {
    // Nuevos voltajes aleatorios independientes (distribución rectangular ±1)
    this._currentV1 = Math.random() * 2 - 1;
    this._currentV2 = Math.random() * 2 - 1;
    
    // Iniciar pulso key
    this._keySamplesRemaining = this._keyPulseSamples;
    
    // Calcular próximo intervalo
    this._samplesUntilNext = this._calculateNextInterval();
  }
  
  /**
   * Calcula el intervalo en samples hasta el próximo evento.
   * 
   * El período base es 1/meanFreq. La varianza aplica un jitter
   * multiplicativo: el período se multiplica por un factor aleatorio
   * entre (1 - variance) y (1 + variance), lo que produce ráfagas
   * y silencios mientras mantiene el ritmo promedio constante.
   * 
   * Con variance = 0: período exacto (metronómico)
   * Con variance = 1: período entre 0× y 2× del base (máxima irregularidad)
   * 
   * @returns {number} Samples hasta el próximo evento (mínimo MIN_PERIOD)
   * @private
   */
  _calculateNextInterval() {
    const basePeriod = 1 / this._meanFreq;
    
    let jitteredPeriod;
    if (this._variance <= 0) {
      // Sin varianza: período exacto
      jitteredPeriod = basePeriod;
    } else {
      // Jitter multiplicativo: factor entre (1 - v) y (1 + v)
      const jitterFactor = 1 + this._variance * (Math.random() * 2 - 1);
      jitteredPeriod = basePeriod * jitterFactor;
    }
    
    // Clamp a período mínimo (protección contra períodos negativos)
    if (jitteredPeriod < MIN_PERIOD) {
      jitteredPeriod = MIN_PERIOD;
    }
    
    return Math.round(jitteredPeriod * sampleRate);
  }
  
  /**
   * Convierte el valor del dial Mean (-5 a +5) a frecuencia del reloj.
   * 
   * Mapeo exponencial: dial -5 → 0.2 Hz, dial 0 → ~2 Hz, dial +5 → 20 Hz
   * 
   *   freq = MIN_FREQ × FREQ_RATIO^((dial + 5) / 10)
   *        = 0.2 × 100^((dial + 5) / 10)
   * 
   * Esto da ~6.6 octavas de rango, coherente con el control CV
   * de 0.55V/octava del circuito original.
   * 
   * @param {number} dialValue - Valor del dial Mean (-5 a +5)
   * @returns {number} Frecuencia en Hz
   * @private
   */
  _meanDialToFreq(dialValue) {
    const normalized = (dialValue + 5) / 10; // 0..1
    return MIN_FREQ * Math.pow(FREQ_RATIO, normalized);
  }
  
  /**
   * Convierte el valor del dial Variance (-5 a +5) a varianza normalizada.
   * 
   * Mapeo lineal: dial -5 → 0 (constante), dial +5 → 1 (máxima irregularidad)
   * 
   * @param {number} dialValue - Valor del dial Variance (-5 a +5)
   * @returns {number} Varianza normalizada [0, 1]
   * @private
   */
  _varianceDialToNorm(dialValue) {
    return Math.max(0, Math.min(1, (dialValue + 5) / 10));
  }
  
  /**
   * Procesa mensajes desde el hilo principal.
   * @param {Object} data - Mensaje recibido
   * @private
   */
  _handleMessage(data) {
    switch (data.type) {
      case 'setMean':
        this._meanFreq = this._meanDialToFreq(data.value);
        break;
        
      case 'setVariance':
        this._variance = this._varianceDialToNorm(data.value);
        break;
        
      case 'setDormant':
        this._dormant = !!data.dormant;
        // No reseteamos _samplesUntilNext: el reloj siguió contando
        // durante dormancy, así que la fase se preserva al despertar.
        if (!this._dormant) {
          // Limpiar pulso key residual de eventos fantasma durante dormancy.
          // Sin esto, al despertar habría un pulso key parcial sin evento
          // asociado visible para el exterior.
          this._keySamplesRemaining = 0;
        }
        break;
        
      case 'stop':
        this._stopped = true;
        break;
    }
  }
}

registerProcessor('random-cv', RandomCVProcessor);
