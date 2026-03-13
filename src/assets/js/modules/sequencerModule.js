/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIGITAL SEQUENCER 1000 MODULE — Synthi 100 Cuenca (Datanomics 1982)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Módulo de audio main-thread para el secuenciador digital.
 * Envuelve el AudioWorkletProcessor 'sequencer' y expone puntos de
 * conexión para la matriz de ruteo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CADENA DE AUDIO (Web Audio API)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   8 inputs (GainNodes) ──→ merger(8) ──→ SequencerProcessor ──→ splitter(13)
 *                                            (13 canales out)        │
 *                                                                    ├── [0] dac1
 *                                                                    ├── [1] dac2
 *                                                                    ├── [2] voltageA
 *                                                                    ├── [3] voltageB
 *                                                                    ├── [4] key1
 *                                                                    ├── [5] voltageC
 *                                                                    ├── [6] voltageD
 *                                                                    ├── [7] key2
 *                                                                    ├── [8] voltageE
 *                                                                    ├── [9] voltageF
 *                                                                    ├── [10] key3
 *                                                                    ├── [11] key4
 *                                                                    └── [12] clock
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ENTRADAS (8 canales vía merger)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   [0] Clock externo    (Panel 5, col 51)
 *   [1] Reset externo    (Panel 5, col 52)
 *   [2] Forward externo  (Panel 5, col 53)
 *   [3] Reverse externo  (Panel 5, col 54)
 *   [4] Stop externo     (Panel 5, col 55)
 *   [5] Voltage A·C·E    (Panel 6, col 60)
 *   [6] Voltage B·D·F    (Panel 6, col 61)
 *   [7] Key digital      (Panel 6, col 62)
 *
 * @module modules/sequencerModule
 */

import { Module } from '../core/engine.js';
import { createLogger } from '../utils/logger.js';
import { attachProcessorErrorHandler } from '../utils/audio.js';

const log = createLogger('SequencerModule');

const TOTAL_OUTPUT_CHANNELS = 13;
const TOTAL_INPUT_CHANNELS  = 8;

const OUTPUT_IDS = [
  'dac1', 'dac2',
  'voltageA', 'voltageB', 'key1',
  'voltageC', 'voltageD', 'key2',
  'voltageE', 'voltageF', 'key3',
  'key4', 'clock'
];

const INPUT_IDS = [
  'clock', 'reset', 'forward', 'reverse', 'stop',
  'voltageACE', 'voltageBDF', 'key'
];

export class SequencerModule extends Module {

  constructor(engine, id) {
    super(engine, id, 'Digital Sequencer 1000');

    this.workletNode = null;
    this.splitter = null;
    this.merger = null;
    this._keepaliveGain = null;

    this._outputGains = [];
    this._inputGains = [];

    // Callbacks para mensajes del worklet → UI
    this.onCounterChange = null;
    this.onOverflow = null;
    this.onReset = null;
    this.onTestMode = null;

    // Valores actuales de controles
    this.values = {
      clockRate: 5,
      voltageA: 5, voltageB: 5, voltageC: 5,
      voltageD: 5, voltageE: 5, voltageF: 5,
      key1: 0, key2: 0, key3: 0, key4: 0
    };

    this.switches = {
      abKey1: false, b: false, cdKey2: false, d: false,
      efKey3: false, f: false, key4: false, runClock: true
    };

    this.isStarted = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INICIALIZACIÓN DE AUDIO
  // ─────────────────────────────────────────────────────────────────────────

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) return;

    try {
      this.workletNode = new AudioWorkletNode(ctx, 'sequencer', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [TOTAL_OUTPUT_CHANNELS],
        channelCount: TOTAL_INPUT_CHANNELS,
        channelCountMode: 'explicit'
      });
      attachProcessorErrorHandler(this.workletNode, 'sequencer');

      this.workletNode.port.onmessage = (e) => {
        this._handleWorkletMessage(e.data);
      };

      // Merger: 8 mono inputs → 1 output con 8 canales
      this.merger = ctx.createChannelMerger(TOTAL_INPUT_CHANNELS);
      this.merger.connect(this.workletNode);

      // 8 input GainNodes → merger
      for (let i = 0; i < TOTAL_INPUT_CHANNELS; i++) {
        const gain = ctx.createGain();
        gain.gain.value = 1;
        gain.connect(this.merger, 0, i);
        this._inputGains.push(gain);
      }

      // Splitter: worklet output → 13 canales separados
      this.splitter = ctx.createChannelSplitter(TOTAL_OUTPUT_CHANNELS);
      this.workletNode.connect(this.splitter);

      // 13 output GainNodes ← splitter
      for (let i = 0; i < TOTAL_OUTPUT_CHANNELS; i++) {
        const gain = ctx.createGain();
        gain.gain.value = 1;
        this.splitter.connect(gain, i);
        this._outputGains.push(gain);
      }

      // Registrar salidas para el sistema de ruteo
      for (let i = 0; i < TOTAL_OUTPUT_CHANNELS; i++) {
        this.outputs.push({
          id: OUTPUT_IDS[i],
          kind: 'sequencer',
          node: this._outputGains[i],
          label: OUTPUT_IDS[i]
        });
      }

      // Registrar entradas
      for (let i = 0; i < TOTAL_INPUT_CHANNELS; i++) {
        this.inputs.push({
          id: INPUT_IDS[i],
          kind: 'sequencer',
          node: this._inputGains[i],
          label: INPUT_IDS[i]
        });
      }

      // Keepalive: ganancia 0 al destination (mantiene process() vivo)
      this._keepaliveGain = ctx.createGain();
      this._keepaliveGain.gain.value = 0;
      this.workletNode.connect(this._keepaliveGain);
      this._keepaliveGain.connect(ctx.destination);

      // Enviar estado inicial al worklet
      this._sendToWorklet('setClockRate', this.values.clockRate);
      for (const [sw, val] of Object.entries(this.switches)) {
        if (sw === 'runClock') {
          this._sendToWorklet('setRunClock', val);
        } else {
          this._sendToWorklet('setSwitch', val, sw);
        }
      }

      log.info(`${this.id}] Audio nodes initialized (${TOTAL_INPUT_CHANNELS} inputs, ${TOTAL_OUTPUT_CHANNELS} outputs)`);

    } catch (error) {
      log.error(`${this.id}] Error inicializando nodos:`, error);
    }
  }

  _handleWorkletMessage(msg) {
    if (!msg) return;
    switch (msg.type) {
      case 'counter':
        if (this.onCounterChange) this.onCounterChange(msg.value, msg.text);
        break;
      case 'overflow':
        if (this.onOverflow) this.onOverflow(msg.value);
        break;
      case 'reset':
        if (this.onReset) this.onReset(msg.value, msg.text);
        break;
      case 'testMode':
        if (this.onTestMode) this.onTestMode(msg.value);
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONTROL DE PARÁMETROS
  // ─────────────────────────────────────────────────────────────────────────

  setClockRate(value) {
    this.values.clockRate = Math.max(0, Math.min(10, value));
    this._sendToWorklet('setClockRate', this.values.clockRate);
  }

  setKnob(knob, value) {
    if (knob in this.values) {
      this.values[knob] = value;
      this._sendToWorklet('setKnob', value, knob);
    }
  }

  setSwitch(name, value) {
    if (name in this.switches) {
      this.switches[name] = !!value;
      if (name === 'runClock') {
        this._sendToWorklet('setRunClock', !!value);
      } else {
        this._sendToWorklet('setSwitch', !!value, name);
      }
    }
  }

  pressButton(button) {
    this._sendToWorklet('button', button);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NODE ACCESS
  // ─────────────────────────────────────────────────────────────────────────

  getOutputNode(outputId) {
    const idx = OUTPUT_IDS.indexOf(outputId);
    if (idx < 0) return null;
    if (!this._outputGains[idx]) this._initAudioNodes();
    return this._outputGains[idx] || null;
  }

  getInputNode(inputId) {
    const idx = INPUT_IDS.indexOf(inputId);
    if (idx < 0) return null;
    if (!this._inputGains[idx]) this._initAudioNodes();
    return this._inputGains[idx] || null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CICLO DE VIDA
  // ─────────────────────────────────────────────────────────────────────────

  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    if (!this.workletNode) return;
    this.isStarted = true;
    log.info(`${this.id}] Started`);
  }

  stop() {
    if (!this.isStarted || !this.workletNode) return;
    try {
      this.workletNode.port.postMessage({ type: 'stop' });
      this.workletNode.disconnect();
      if (this.merger) this.merger.disconnect();
      if (this.splitter) this.splitter.disconnect();
      for (const g of this._outputGains) g.disconnect();
      for (const g of this._inputGains) g.disconnect();
      if (this._keepaliveGain) this._keepaliveGain.disconnect();

      this.workletNode = null;
      this.merger = null;
      this.splitter = null;
      this._outputGains = [];
      this._inputGains = [];
      this._keepaliveGain = null;
      this.outputs.length = 0;
      this.inputs.length = 0;
      this.isStarted = false;

      log.info(`${this.id}] Stopped`);
    } catch (error) {
      log.error(`${this.id}] Error deteniendo:`, error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DORMANCY
  // ─────────────────────────────────────────────────────────────────────────

  _onDormancyChange(dormant) {
    this._sendToWorklet('setDormant', dormant);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  _sendToWorklet(type, value, extra) {
    if (!this.workletNode) return;
    try {
      const msg = { type, value };
      if (extra !== undefined) {
        if (type === 'setSwitch') msg.switch = extra;
        else if (type === 'setKnob') msg.knob = extra;
      }
      this.workletNode.port.postMessage(msg);
    } catch (e) { /* ignore */ }
  }
}
