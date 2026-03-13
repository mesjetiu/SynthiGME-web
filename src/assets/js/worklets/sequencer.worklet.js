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
 * Fase 2: Clock interno + estructura base.
 * Fase 3: FSM de transporte (counter, botones, entradas externas).
 * Fase 4: Grabación y reproducción (memoria 8K, switches, knobs, 8-bit DAC).
 * Siguiente: Fase 5 (Módulo de audio main thread).
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

// ─── Canales de salida individuales ───────────────────────────────────────
const CH_DAC1 = 0;
const CH_DAC2 = 1;
const CH_VOLTAGE_A = 2;
const CH_VOLTAGE_B = 3;
const CH_KEY1 = 4;
const CH_VOLTAGE_C = 5;
const CH_VOLTAGE_D = 6;
const CH_KEY2 = 7;
const CH_VOLTAGE_E = 8;
const CH_VOLTAGE_F = 9;
const CH_KEY3 = 10;
const CH_KEY4 = 11;

// ─── Parámetros de conversión analógica ───────────────────────────────────
const ANALOG_VOLTAGE_RANGE = 7;     // 0-7V DC
const ANALOG_RESOLUTION = 256;      // 8-bit → 0-255
const KEY_ON_VOLTAGE = 5;           // +5V active state
const KEY_THRESHOLD = 0.6;          // Schmitt trigger (V)

// ─── Índices de entradas de conversión ────────────────────────────────────
const INPUT_VOLTAGE_ACE = 5;
const INPUT_VOLTAGE_BDF = 6;
const INPUT_KEY = 7;

// ─── Índices de bytes en un evento (8 bytes por evento) ──────────────────
const BYTE_VOLTAGE_A = 0;
const BYTE_VOLTAGE_B = 1;
const BYTE_VOLTAGE_C = 2;
const BYTE_VOLTAGE_D = 3;
const BYTE_VOLTAGE_E = 4;
const BYTE_VOLTAGE_F = 5;
const BYTE_KEYS = 6;
// Byte 7 = padding (Z80 alignment)

// ─── Estados de transporte ────────────────────────────────────────────────
const STATE_STOPPED = 0;
const STATE_RUNNING_FORWARD = 1;
const STATE_RUNNING_REVERSE = 2;
const STATE_TEST_MODE = 3;

/** Número máximo de eventos (posiciones 0-1023) */
const MAX_EVENTS = 1024;

// ─── Índices de entradas de transporte externo ────────────────────────────
const INPUT_RESET = 1;
const INPUT_FORWARD = 2;
const INPUT_REVERSE = 3;
const INPUT_STOP = 4;

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

    // ─── FSM de transporte ─────────────────────────────────────────────
    this._transportState = STATE_STOPPED;
    this._counter = 0;
    this._overflow = false;

    // ─── Detección de flancos para entradas externas de transporte ─────
    this._extTransportPrev = [0, 0, 0, 0, 0]; // inputs 0-4

    // ─── Memoria de eventos (1024 × 8 bytes) ─────────────────────────
    this._eventMemory = new Uint8Array(MAX_EVENTS * 8);

    // ─── Switches de grabación ───────────────────────────────────────
    // Cada switch tiene { analog: ['A','B',...], digital: ['key1',...] }
    this._recordSwitches = {
      abKey1: false, b: false,
      cdKey2: false, d: false,
      efKey3: false, f: false,
      key4: false
    };

    // ─── Knobs de salida (Panel 4) ───────────────────────────────────
    this._knobVoltageA = 10;  // 0-10 linear, initial = 10 (full)
    this._knobVoltageB = 10;
    this._knobVoltageC = 10;
    this._knobVoltageD = 10;
    this._knobVoltageE = 10;
    this._knobVoltageF = 10;
    this._knobKey1 = 0;       // -5 to +5 bipolar, initial = 0
    this._knobKey2 = 0;
    this._knobKey3 = 0;
    this._knobKey4 = 0;

    // ─── Valores DC actuales de playback (sample & hold) ─────────────
    this._currentOutputs = new Float32Array(CH_CLOCK); // 12 canales

    // ─── Últimos valores muestreados de inputs analógicos ────────────
    this._lastInputACE = 0;
    this._lastInputBDF = 0;
    this._lastInputKey = 0;

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
        this._checkExternalTransport(i, inputs);
      }
      // Silenciar todas las salidas
      for (let ch = 0; ch < TOTAL_CHANNELS; ch++) {
        output[ch].fill(0);
      }
      return true;
    }

    // ─── Generación sample a sample ──────────────────────────────────
    const clockChannel = output[CH_CLOCK];

    // Muestrear inputs analógicos antes del loop (disponible para grabación)
    const lastSample = blockSize - 1;
    if (inputs[INPUT_VOLTAGE_ACE] && inputs[INPUT_VOLTAGE_ACE][0]) {
      this._lastInputACE = inputs[INPUT_VOLTAGE_ACE][0][lastSample];
    }
    if (inputs[INPUT_VOLTAGE_BDF] && inputs[INPUT_VOLTAGE_BDF][0]) {
      this._lastInputBDF = inputs[INPUT_VOLTAGE_BDF][0][lastSample];
    }
    if (inputs[INPUT_KEY] && inputs[INPUT_KEY][0]) {
      this._lastInputKey = inputs[INPUT_KEY][0][lastSample];
    }

    for (let i = 0; i < blockSize; i++) {
      // Avanzar clock (interno + externo)
      this._advanceClock(i, inputs);

      // Detectar entradas externas de transporte (inputs 1-4)
      this._checkExternalTransport(i, inputs);

      // Clock pulse output
      if (this._clockPulseRemaining > 0) {
        clockChannel[i] = 1.0;
        this._clockPulseRemaining--;
      } else {
        clockChannel[i] = 0.0;
      }
    }

    // ─── Canales 0-11: playback DC (sample & hold) ───────────────────
    for (let ch = 0; ch < CH_CLOCK; ch++) {
      output[ch].fill(this._currentOutputs[ch]);
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
   * Avanza el counter según el estado de transporte.
   * Graba inputs si hay switches activos. Actualiza playback.
   * @private
   */
  _onTick() {
    // Iniciar pulso clock
    this._clockPulseRemaining = this._clockPulseSamples;

    // Notificar tick al main thread
    this.port.postMessage({ type: 'tick' });

    // Avanzar counter según FSM
    switch (this._transportState) {
      case STATE_RUNNING_FORWARD:
        this._recordCurrentInputs();
        this._stepCounter(1);
        break;
      case STATE_RUNNING_REVERSE:
        this._recordCurrentInputs();
        this._stepCounter(-1);
        break;
      // STOPPED y TEST_MODE: no avanza
    }
  }

  /**
   * Avanza o retrocede el counter un paso y notifica al main thread.
   * @param {number} direction +1 para avanzar, -1 para retroceder
   * @private
   */
  _stepCounter(direction) {
    if (direction > 0) {
      if (this._overflow) {
        this.port.postMessage({ type: 'overflow', text: 'ofof' });
        return;
      }
      if (this._counter >= MAX_EVENTS - 1) {
        // Counter ya está en 1023, siguiente step → overflow
        this._overflow = true;
        this.port.postMessage({ type: 'overflow', text: 'ofof' });
        return;
      }
      this._counter++;
    } else {
      if (this._counter <= 0) {
        this._counter = 0;
      } else {
        this._counter--;
      }
    }

    // Actualizar salidas DC con el evento en la posición actual
    this._updateOutputsFromEvent(this._counter);

    this.port.postMessage({
      type: 'counter',
      value: this._counter,
      text: this._counterToHex(this._counter)
    });
  }

  /**
   * Convierte un valor de counter a hex de 4 dígitos.
   * @param {number} value
   * @returns {string} hex con 4 dígitos (e.g. "0000", "03ff")
   * @private
   */
  _counterToHex(value) {
    return value.toString(16).padStart(4, '0');
  }

  /**
   * Detecta flancos positivos en las entradas externas de transporte.
   * @param {number} sampleIndex
   * @param {Float32Array[][]} inputs
   * @private
   */
  _checkExternalTransport(sampleIndex, inputs) {
    for (let inp = INPUT_RESET; inp <= INPUT_STOP; inp++) {
      const inputData = inputs[inp];
      if (!inputData || !inputData[0]) continue;

      const sample = inputData[0][sampleIndex];
      const prev = this._extTransportPrev[inp];

      if (sample >= EXT_CLOCK_THRESHOLD && prev < EXT_CLOCK_THRESHOLD) {
        // Flanco positivo detectado
        this._handleExternalTransport(inp);
      }

      this._extTransportPrev[inp] = sample;
    }
  }

  /**
   * Procesa un flanco externo de transporte.
   * @param {number} inputIndex - Índice de la entrada (1-4)
   * @private
   */
  _handleExternalTransport(inputIndex) {
    switch (inputIndex) {
      case INPUT_RESET:
        this._doResetSequence();
        break;
      case INPUT_FORWARD:
        this._transportState = STATE_RUNNING_FORWARD;
        break;
      case INPUT_REVERSE:
        this._transportState = STATE_RUNNING_REVERSE;
        break;
      case INPUT_STOP:
        this._transportState = STATE_STOPPED;
        break;
    }
  }

  /**
   * Resetea el counter a 0 sin cambiar el estado de transporte.
   * @private
   */
  _doResetSequence() {
    this._counter = 0;
    this._overflow = false;
    this._updateOutputsFromEvent(0);
    this.port.postMessage({ type: 'reset', value: 0, text: '0000' });
  }

  /**
   * Master reset: counter a 0, estado a STOPPED, limpia overflow y outputs.
   * @private
   */
  _doMasterReset() {
    this._counter = 0;
    this._overflow = false;
    this._transportState = STATE_STOPPED;
    this._currentOutputs.fill(0);
    this.port.postMessage({ type: 'reset', value: 0, text: '0000' });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GRABACIÓN Y REPRODUCCIÓN
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Graba los inputs actuales en la posición del counter, según switches activos.
   * Se almacena el último sample muestreado del bloque anterior.
   * @private
   */
  _recordCurrentInputs() {
    const pos = this._counter;
    const offset = pos * 8;

    // Muestrear inputs (último valor conocido)
    const aceV = this._lastInputACE;
    const bdfV = this._lastInputBDF;
    const keyV = this._lastInputKey;

    // Cuantizar voltajes a 8-bit
    const aceByte = this._voltageToByte(aceV);
    const bdfByte = this._voltageToByte(bdfV);
    const keyBits = (keyV > KEY_THRESHOLD) ? 0x0F : 0x00; // 4 keys simultáneos

    // Grabar según switches activos
    const sw = this._recordSwitches;

    // abKey1: graba A (ACE), B (BDF), Key1
    if (sw.abKey1) {
      this._eventMemory[offset + BYTE_VOLTAGE_A] = aceByte;
      this._eventMemory[offset + BYTE_VOLTAGE_B] = bdfByte;
      this._eventMemory[offset + BYTE_KEYS] =
        (this._eventMemory[offset + BYTE_KEYS] & 0x0E) | (keyBits & 0x01);
    }

    // b: graba solo B (BDF)
    if (sw.b) {
      this._eventMemory[offset + BYTE_VOLTAGE_B] = bdfByte;
    }

    // cdKey2: graba C (ACE), D (BDF), Key2
    if (sw.cdKey2) {
      this._eventMemory[offset + BYTE_VOLTAGE_C] = aceByte;
      this._eventMemory[offset + BYTE_VOLTAGE_D] = bdfByte;
      this._eventMemory[offset + BYTE_KEYS] =
        (this._eventMemory[offset + BYTE_KEYS] & 0x0D) | (keyBits & 0x02);
    }

    // d: graba solo D (BDF)
    if (sw.d) {
      this._eventMemory[offset + BYTE_VOLTAGE_D] = bdfByte;
    }

    // efKey3: graba E (ACE), F (BDF), Key3
    if (sw.efKey3) {
      this._eventMemory[offset + BYTE_VOLTAGE_E] = aceByte;
      this._eventMemory[offset + BYTE_VOLTAGE_F] = bdfByte;
      this._eventMemory[offset + BYTE_KEYS] =
        (this._eventMemory[offset + BYTE_KEYS] & 0x0B) | (keyBits & 0x04);
    }

    // f: graba solo F (BDF)
    if (sw.f) {
      this._eventMemory[offset + BYTE_VOLTAGE_F] = bdfByte;
    }

    // key4: graba solo Key4
    if (sw.key4) {
      this._eventMemory[offset + BYTE_KEYS] =
        (this._eventMemory[offset + BYTE_KEYS] & 0x07) | (keyBits & 0x08);
    }
  }

  /**
   * Convierte un voltaje analógico (0-7V) a byte (0-255) con clamp.
   * @param {number} voltage
   * @returns {number} Byte 0-255
   * @private
   */
  _voltageToByte(voltage) {
    if (voltage <= 0) return 0;
    if (voltage >= ANALOG_VOLTAGE_RANGE) return 255;
    return Math.round((voltage / ANALOG_VOLTAGE_RANGE) * 255);
  }

  /**
   * Convierte un byte (0-255) a voltaje analógico (0-7V).
   * @param {number} byte8
   * @returns {number} Voltaje
   * @private
   */
  _byteToVoltage(byte8) {
    return (byte8 / 255) * ANALOG_VOLTAGE_RANGE;
  }

  /**
   * Lee el evento en la posición dada y actualiza _currentOutputs.
   * Aplica knob scaling.
   * @param {number} pos - Posición del evento (0-1023)
   * @private
   */
  _updateOutputsFromEvent(pos) {
    const offset = pos * 8;

    // Voltajes A-F → canales 2-9 (con huecos para keys)
    this._currentOutputs[CH_VOLTAGE_A] =
      this._byteToVoltage(this._eventMemory[offset + BYTE_VOLTAGE_A]) *
      (this._knobVoltageA / 10);
    this._currentOutputs[CH_VOLTAGE_B] =
      this._byteToVoltage(this._eventMemory[offset + BYTE_VOLTAGE_B]) *
      (this._knobVoltageB / 10);
    this._currentOutputs[CH_VOLTAGE_C] =
      this._byteToVoltage(this._eventMemory[offset + BYTE_VOLTAGE_C]) *
      (this._knobVoltageC / 10);
    this._currentOutputs[CH_VOLTAGE_D] =
      this._byteToVoltage(this._eventMemory[offset + BYTE_VOLTAGE_D]) *
      (this._knobVoltageD / 10);
    this._currentOutputs[CH_VOLTAGE_E] =
      this._byteToVoltage(this._eventMemory[offset + BYTE_VOLTAGE_E]) *
      (this._knobVoltageE / 10);
    this._currentOutputs[CH_VOLTAGE_F] =
      this._byteToVoltage(this._eventMemory[offset + BYTE_VOLTAGE_F]) *
      (this._knobVoltageF / 10);

    // Keys 1-4 → canales 4, 7, 10, 11
    const keys = this._eventMemory[offset + BYTE_KEYS];
    this._currentOutputs[CH_KEY1] = (keys & 0x01) ? this._knobKey1 : 0;
    this._currentOutputs[CH_KEY2] = (keys & 0x02) ? this._knobKey2 : 0;
    this._currentOutputs[CH_KEY3] = (keys & 0x04) ? this._knobKey3 : 0;
    this._currentOutputs[CH_KEY4] = (keys & 0x08) ? this._knobKey4 : 0;

    // DAC channels (stub — sin audio recording por ahora)
    this._currentOutputs[CH_DAC1] = 0;
    this._currentOutputs[CH_DAC2] = 0;
  }

  /**
   * Activa las salidas de test: todos los canales al máximo.
   * @private
   */
  _setTestOutputs() {
    // Voltajes A-F al máximo (7V)
    this._currentOutputs[CH_VOLTAGE_A] = ANALOG_VOLTAGE_RANGE;
    this._currentOutputs[CH_VOLTAGE_B] = ANALOG_VOLTAGE_RANGE;
    this._currentOutputs[CH_VOLTAGE_C] = ANALOG_VOLTAGE_RANGE;
    this._currentOutputs[CH_VOLTAGE_D] = ANALOG_VOLTAGE_RANGE;
    this._currentOutputs[CH_VOLTAGE_E] = ANALOG_VOLTAGE_RANGE;
    this._currentOutputs[CH_VOLTAGE_F] = ANALOG_VOLTAGE_RANGE;
    // Keys activos (5V)
    this._currentOutputs[CH_KEY1] = KEY_ON_VOLTAGE;
    this._currentOutputs[CH_KEY2] = KEY_ON_VOLTAGE;
    this._currentOutputs[CH_KEY3] = KEY_ON_VOLTAGE;
    this._currentOutputs[CH_KEY4] = KEY_ON_VOLTAGE;
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

      case 'button':
        this._handleButton(data.button);
        break;

      case 'setSwitch':
        if (data.switch in this._recordSwitches) {
          this._recordSwitches[data.switch] = !!data.value;
        }
        break;

      case 'setKnob':
        this._handleKnob(data.knob, data.value);
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

  /**
   * Procesa cambios de knobs de salida del Panel 4.
   * @param {string} knob - Nombre del knob
   * @param {number} value - Valor del knob
   * @private
   */
  _handleKnob(knob, value) {
    switch (knob) {
      case 'voltageA': this._knobVoltageA = value; break;
      case 'voltageB': this._knobVoltageB = value; break;
      case 'voltageC': this._knobVoltageC = value; break;
      case 'voltageD': this._knobVoltageD = value; break;
      case 'voltageE': this._knobVoltageE = value; break;
      case 'voltageF': this._knobVoltageF = value; break;
      case 'key1': this._knobKey1 = value; break;
      case 'key2': this._knobKey2 = value; break;
      case 'key3': this._knobKey3 = value; break;
      case 'key4': this._knobKey4 = value; break;
    }
    // Re-calcular outputs con nuevos knob values
    this._updateOutputsFromEvent(this._counter);
  }

  /**
   * Procesa un botón de transporte.
   * @param {string} button - Nombre del botón
   * @private
   */
  _handleButton(button) {
    switch (button) {
      case 'masterReset':
        this._doMasterReset();
        break;

      case 'runForward':
        this._transportState = STATE_RUNNING_FORWARD;
        break;

      case 'runReverse':
        this._transportState = STATE_RUNNING_REVERSE;
        break;

      case 'stop':
        this._transportState = STATE_STOPPED;
        break;

      case 'resetSequence':
        this._doResetSequence();
        break;

      case 'stepForward':
        this._stepCounter(1);
        break;

      case 'stepReverse':
        this._stepCounter(-1);
        break;

      case 'testOP':
        this._transportState = STATE_TEST_MODE;
        this._setTestOutputs();
        this.port.postMessage({ type: 'testMode', text: 'CAll' });
        break;
    }
  }
}

registerProcessor('sequencer', SequencerProcessor);
