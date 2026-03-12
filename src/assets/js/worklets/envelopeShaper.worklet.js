/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENVELOPE SHAPER — AudioWorklet Processor
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Emulación del generador de envolvente ADSR+Delay del Synthi 100
 * (modelo Cuenca/Datanomics 1982, CEM 3310).
 *
 * Genera dos señales:
 *   Canal 0: Envelope CV — envolvente ADSR+Delay escalada por Envelope Level
 *   Canal 1: Audio VCA  — señal de entrada × envolvente × Signal Level
 *
 * Entradas:
 *   Canal 0: Señal de audio (para VCA)
 *   Canal 1: Trigger/Gate externo (umbral >1V = 0.25 normalizado)
 *
 * FSM de 6 estados: IDLE → DELAY → ATTACK → DECAY → SUSTAIN → RELEASE
 * 5 modos de operación: GATED_FR, FREE_RUN, GATED, TRIGGERED, HOLD
 *
 * Tiempos exponenciales: 1ms–20s (ratio 20000:1)
 * Envelope CV: ±5V (±1.25 digital, bipolar)
 * Audio: <3V p-p (ganancia LOG 10K)
 *
 * @see envelopeShaper.config.js — Parámetros de configuración
 * @see modules/envelopeShaper.js — Módulo de audio (main thread)
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

const MIN_TIME_MS = 1;
const MAX_TIME_MS = 20000;
const TIME_RATIO = MAX_TIME_MS / MIN_TIME_MS; // 20000

/** Umbral de gate/trigger: >1V → 0.25 normalizado (1V / 4V digital) */
const GATE_THRESHOLD = 0.25;

// Modos de operación
const MODE_GATED_FR  = 0;
const MODE_FREE_RUN  = 1;
const MODE_GATED     = 2;
const MODE_TRIGGERED = 3;
const MODE_HOLD      = 4;

// Fases de la envolvente
const PHASE_IDLE    = 0;
const PHASE_DELAY   = 1;
const PHASE_ATTACK  = 2;
const PHASE_DECAY   = 3;
const PHASE_SUSTAIN = 4;
const PHASE_RELEASE = 5;

/** Base logarítmica para curva de Signal Level (10K LOG pot) */
const LOG_BASE = 100;

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

class EnvelopeShaperProcessor extends AudioWorkletProcessor {

  constructor() {
    super();

    // ─── Estado de la envolvente ────────────────────────────────────────
    this._phase = PHASE_IDLE;
    this._mode = MODE_GATED;
    this._level = 0;           // Nivel actual [0, 1]
    this._counter = 0;         // Samples restantes en fase actual

    // ─── Parámetros de tiempo (en samples) ─────────────────────────────
    this._delaySamples = 0;
    this._attackSamples = 0;
    this._decaySamples = Math.round(this._timeDialToSamples(5));
    this._releaseSamples = Math.round(this._timeDialToSamples(3));

    // ─── Niveles ───────────────────────────────────────────────────────
    this._sustainLevel = 0.7;  // dial 7 → 0.7
    this._envelopeGain = 1.25; // dial +5 → +1.25
    this._signalGain = 0;      // dial 0 → VCA cerrado

    // ─── Gate/trigger ──────────────────────────────────────────────────
    this._prevGate = false;
    this._manualGate = false;

    // ─── Control ───────────────────────────────────────────────────────
    this._dormant = false;
    this._stopped = false;
    this._reportedActive = false; // Último estado de actividad reportado al hilo principal
    this._reportCounter = 0;     // Throttle: solo reportar cada N bloques

    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  /**
   * Procesa un bloque de 128 samples.
   *
   * inputs[0]:  [0] audio signal, [1] trigger/gate
   * outputs[0]: [0] envelope CV,  [1] audio VCA
   */
  process(inputs, outputs) {
    if (this._stopped) return false;

    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const envChannel = output[0];
    const audioChannel = output[1];
    const blockSize = envChannel.length;

    // Entrada de audio y gate externo
    const input = inputs[0];
    const audioIn = input && input[0] ? input[0] : null;
    const gateIn = input && input[1] ? input[1] : null;

    if (this._dormant) {
      // FSM sigue avanzando internamente
      for (let i = 0; i < blockSize; i++) {
        const gateActive = this._isGateActive(gateIn, i);
        this._tick(gateActive);
      }
      envChannel.fill(0);
      audioChannel.fill(0);
      this._reportActivity();
      return true;
    }

    for (let i = 0; i < blockSize; i++) {
      const gateActive = this._isGateActive(gateIn, i);
      this._tick(gateActive);

      // Salida de envolvente CV: nivel × envelopeGain (bipolar ±1.25)
      envChannel[i] = this._level * this._envelopeGain;

      // Salida de audio VCA: señal de entrada × nivel de envolvente × signalGain
      const audioSample = audioIn ? audioIn[i] : 0;
      audioChannel[i] = audioSample * this._level * this._signalGain;
    }

    this._reportActivity();

    return true;
  }

  /**
   * Reporta estado de actividad al hilo principal para el LED.
   * Según plano D100-17 C1 del CEM 3310:
   *   LED ON  durante ATTACK, DECAY, SUSTAIN, RELEASE
   *   LED OFF durante IDLE y DELAY
   * Throttle: cada 8 bloques (~23ms) para no saturar el MessagePort.
   */
  _reportActivity() {
    if (++this._reportCounter >= 8) {
      this._reportCounter = 0;
      const isActive = this._phase >= PHASE_ATTACK; // ATTACK=2, DECAY=3, SUSTAIN=4, RELEASE=5
      if (isActive !== this._reportedActive) {
        this._reportedActive = isActive;
        this.port.postMessage({ type: 'active', value: isActive });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FSM — Máquina de estados de la envolvente
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Avanza la envolvente un sample.
   * @param {boolean} gateActive - Si hay gate/trigger activo
   */
  _tick(gateActive) {
    const rising = gateActive && !this._prevGate;
    const falling = !gateActive && this._prevGate;
    this._prevGate = gateActive;

    switch (this._phase) {
      case PHASE_IDLE:
        this._level = 0;
        if (this._shouldStart(rising)) {
          if (this._delaySamples > 0) {
            this._phase = PHASE_DELAY;
            this._counter = this._delaySamples;
          } else {
            this._phase = PHASE_ATTACK;
            this._counter = this._attackSamples;
          }
        }
        break;

      case PHASE_DELAY:
        this._level = 0;
        this._counter--;
        if (this._counter <= 0) {
          this._phase = PHASE_ATTACK;
          this._counter = this._attackSamples;
        }
        break;

      case PHASE_ATTACK:
        if (this._mode === MODE_GATED && falling) {
          this._phase = PHASE_RELEASE;
          this._counter = this._releaseSamples;
          break;
        }
        this._counter--;
        if (this._attackSamples > 0) {
          const progress = 1 - (this._counter / this._attackSamples);
          this._level = Math.min(1, Math.max(0, progress));
        } else {
          this._level = 1;
        }
        if (this._counter <= 0) {
          this._level = 1;
          this._phase = PHASE_DECAY;
          this._counter = this._decaySamples;
        }
        break;

      case PHASE_DECAY:
        if (this._mode === MODE_GATED && falling) {
          this._phase = PHASE_RELEASE;
          this._counter = this._releaseSamples;
          break;
        }
        this._counter--;
        if (this._decaySamples > 0) {
          const progress = 1 - (this._counter / this._decaySamples);
          this._level = 1 - progress * (1 - this._sustainLevel);
        } else {
          this._level = this._sustainLevel;
        }
        if (this._counter <= 0) {
          this._level = this._sustainLevel;
          // Modes that skip sustain → go directly to release
          if (this._mode === MODE_TRIGGERED || this._mode === MODE_FREE_RUN || this._mode === MODE_GATED_FR) {
            this._phase = PHASE_RELEASE;
            this._counter = this._releaseSamples;
          } else {
            this._phase = PHASE_SUSTAIN;
          }
        }
        break;

      case PHASE_SUSTAIN:
        this._level = this._sustainLevel;
        // GATED: release on gate off. HOLD: stay indefinitely.
        if (this._mode === MODE_GATED && falling) {
          this._phase = PHASE_RELEASE;
          this._counter = this._releaseSamples;
        }
        break;

      case PHASE_RELEASE:
        this._counter--;
        if (this._releaseSamples > 0) {
          const progress = 1 - (this._counter / this._releaseSamples);
          this._level = this._sustainLevel * (1 - progress);
        }
        if (this._counter <= 0) {
          this._level = 0;
          this._phase = PHASE_IDLE;
          // Auto-retrigger for cycling modes
          if (this._mode === MODE_FREE_RUN ||
              (this._mode === MODE_GATED_FR && this._prevGate)) {
            if (this._delaySamples > 0) {
              this._phase = PHASE_DELAY;
              this._counter = this._delaySamples;
            } else {
              this._phase = PHASE_ATTACK;
              this._counter = this._attackSamples;
            }
          }
        }
        break;
    }
  }

  /**
   * Determina si la envolvente debe arrancar.
   * @param {boolean} rising - Flanco positivo del gate
   * @returns {boolean}
   */
  _shouldStart(rising) {
    if (this._mode === MODE_FREE_RUN) return true;
    if (this._mode === MODE_GATED_FR) return this._prevGate;
    return rising; // GATED, TRIGGERED, HOLD: need rising edge
  }

  /**
   * Determina si hay gate activo por trigger externo o manual.
   * @param {Float32Array|null} gateIn - Canal de trigger externo
   * @param {number} i - Índice del sample
   * @returns {boolean}
   */
  _isGateActive(gateIn, i) {
    if (this._manualGate) return true;
    if (gateIn && Math.abs(gateIn[i]) > GATE_THRESHOLD) return true;
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONVERSIONES DE PARÁMETROS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Convierte dial de tiempo (0-10) a samples.
   * Mapeo exponencial: 0 → 1ms, 10 → 20s
   */
  _timeDialToSamples(dialValue) {
    const d = dialValue <= 0 ? 0 : dialValue;
    const normalized = d / 10;
    const ms = MIN_TIME_MS * Math.pow(TIME_RATIO, normalized);
    return Math.round(ms * sampleRate / 1000);
  }

  /**
   * Convierte dial Envelope Level (-5 a +5) a ganancia bipolar.
   * ±5V / 4V = ±1.25
   */
  _envelopeLevelDialToGain(dialValue) {
    return dialValue * 5.0 / (5 * 4.0);
  }

  /**
   * Convierte dial Signal Level (0-10) a ganancia LOG.
   * Audio max 3V p-p → 0.75V peak → 0.1875 digital.
   */
  _signalLevelDialToGain(dialValue) {
    if (dialValue <= 0) return 0;
    const normalized = dialValue / 10;
    const logGain = (Math.pow(LOG_BASE, normalized) - 1) / (LOG_BASE - 1);
    return logGain * 0.75 / 4.0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MENSAJES
  // ─────────────────────────────────────────────────────────────────────────

  _handleMessage(data) {
    switch (data.type) {
      case 'setMode':
        this._mode = data.value;
        // If switching to FREE_RUN while idle, start immediately
        if (this._mode === MODE_FREE_RUN && this._phase === PHASE_IDLE) {
          this._startEnvelope();
        }
        break;

      case 'setDelay':
        this._delaySamples = this._timeDialToSamples(data.value);
        break;

      case 'setAttack':
        this._attackSamples = this._timeDialToSamples(data.value);
        break;

      case 'setDecay':
        this._decaySamples = this._timeDialToSamples(data.value);
        break;

      case 'setSustain':
        this._sustainLevel = Math.max(0, Math.min(1, data.value / 10));
        break;

      case 'setRelease':
        this._releaseSamples = this._timeDialToSamples(data.value);
        break;

      case 'setEnvelopeLevel':
        this._envelopeGain = this._envelopeLevelDialToGain(data.value);
        break;

      case 'setSignalLevel':
        this._signalGain = this._signalLevelDialToGain(data.value);
        break;

      case 'gate':
        this._manualGate = !!data.value;
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
   * Inicia la envolvente desde idle.
   */
  _startEnvelope() {
    if (this._delaySamples > 0) {
      this._phase = PHASE_DELAY;
      this._counter = this._delaySamples;
    } else {
      this._phase = PHASE_ATTACK;
      this._counter = this._attackSamples;
    }
  }
}

registerProcessor('envelope-shaper', EnvelopeShaperProcessor);
