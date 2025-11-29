// Módulo NoiseModule: generador de ruido filtrado con control de color y nivel
import { Module } from '../core/engine.js';
import { Knob } from '../ui/knob.js';

export class NoiseModule extends Module {
  constructor(engine, id) {
    super(engine, id, 'Noise Gen');
    this.buffer = null;
    this.source = null;
    this.filter = null;
    this.amp = null;
    this.colour = 0.5;
  }

  _createNoiseBuffer() {
    const ctx = this.getAudioCtx();
    if (!ctx) return null;
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  _updateColourParam(value) {
    if (!this.filter) return;
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    const minF = 200;
    const maxF = 8000;
    const freq = minF * Math.pow(maxF / minF, value);
    const now = ctx.currentTime;
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setTargetAtTime(freq, now, 0.05);
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.source) return;
    this.buffer = this._createNoiseBuffer();
    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.amp = ctx.createGain();
    this.amp.gain.value = 0.0;

    this.source.connect(this.filter);
    this.filter.connect(this.amp);

    this.outputs.push({ id: 'audioOut', kind: 'audio', node: this.amp, label: 'Noise OUT' });

    this._updateColourParam(this.colour);
  }

  start() {
    this._initAudioNodes();
    const ctx = this.getAudioCtx();
    const t = ctx.currentTime + 0.05;
    try { this.source.start(t); } catch (error) {
      // ignore repeated starts
    }
  }

  stop(time) {
    if (!this.source) return;
    try { this.source.stop(time); } catch (error) {
      // ignore repeated stops
    }
  }

  createPanel(container) {
    const block = document.createElement('div');
    block.className = 'voice-block';
    const title = document.createElement('div');
    title.className = 'voice-title';
    title.textContent = 'Noise Gen';
    block.appendChild(title);

    const row = document.createElement('div');
    row.className = 'knob-row';

    const makeKnobElements = (label) => {
      const wrap = document.createElement('div');
      wrap.className = 'knob-wrapper';
      const knob = document.createElement('div');
      knob.className = 'knob';
      const inner = document.createElement('div');
      inner.className = 'knob-inner';
      knob.appendChild(inner);
      const lbl = document.createElement('div');
      lbl.className = 'knob-label';
      lbl.textContent = label;
      const val = document.createElement('div');
      val.className = 'knob-value';
      wrap.appendChild(knob);
      wrap.appendChild(lbl);
      wrap.appendChild(val);
      row.appendChild(wrap);
      return { knob, val };
    };

    const colour = makeKnobElements('Colour');
    const level = makeKnobElements('Level');

    block.appendChild(row);
    container.appendChild(block);

    const colourToLabel = (value) => {
      if (value < 0.33) return 'Low';
      if (value > 0.66) return 'High';
      return 'White';
    };

    new Knob(colour.knob, {
      min: 0,
      max: 1,
      initial: this.colour,
      valueElement: colour.val,
      format: colourToLabel,
      pixelsForFullRange: 200,
      onChange: value => {
        this.colour = value;
        this._updateColourParam(value);
      }
    });

    new Knob(level.knob, {
      min: 0,
      max: 1,
      initial: 0.0,
      valueElement: level.val,
      format: v => v.toFixed(2),
      pixelsForFullRange: 200,
      onChange: value => {
        if (this.amp && this.amp.gain) {
          const ctx = this.getAudioCtx();
          const now = ctx.currentTime;
          this.amp.gain.cancelScheduledValues(now);
          this.amp.gain.setTargetAtTime(value, now, 0.03);
        }
      }
    });
  }
}
