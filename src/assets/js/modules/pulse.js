// Módulo PulseModule: oscilador de pulso con control de PW y nivel
import { Module, setParamSmooth } from '../core/engine.js';
import { Knob } from '../ui/knob.js';

export class PulseModule extends Module {
  constructor(engine, id, baseFreq) {
    super(engine, id, 'Pulso ' + id);
    this.baseFreq = baseFreq;
    this.osc = null;
    this.amp = null;
    this.pw = 0;
  }

  _createPulseWave(duty, harmonics = 32) {
    const ctx = this.getAudioCtx();
    const d = Math.min(0.99, Math.max(0.01, duty));
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let n = 1; n <= harmonics; n++) {
      imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
    }
    return ctx.createPeriodicWave(real, imag);
  }

  _updatePulseWave(duty) {
    if (!this.osc) return;
    const wave = this._createPulseWave(duty);
    this.osc.setPeriodicWave(wave);
    this.pw = duty;
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.osc) return;
    this.osc = ctx.createOscillator();
    this.osc.frequency.value = 0;
    this.amp = ctx.createGain();
    this.amp.gain.value = 0;
    this.osc.connect(this.amp);
    this._updatePulseWave(this.pw);

    this.outputs.push({ id: 'audioOut', kind: 'audio', node: this.amp, label: this.name + ' OUT' });
    this.inputs.push({ id: 'freqCV', kind: 'cv', param: this.osc.frequency, label: this.name + ' FREQ' });
    this.inputs.push({ id: 'ampCV', kind: 'cv', param: this.amp.gain, label: this.name + ' AMP' });
  }

  start() {
    this._initAudioNodes();
    const t = this.getAudioCtx().currentTime + 0.05;
    try { this.osc.start(t); } catch (error) {
      // ignore repeated starts
    }
  }

  stop(time) {
    if (!this.osc) return;
    try { this.osc.stop(time); } catch (error) {
      // ignore repeated stops
    }
  }

  createPanel(container) {
    const block = document.createElement('div');
    block.className = 'voice-block';
    const title = document.createElement('div');
    title.className = 'voice-title';
    title.textContent = this.name + ' (pulse)';
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

    const freq = makeKnobElements('Freq');
    const level = makeKnobElements('Level');
    const pw = makeKnobElements('PW');

    block.appendChild(row);
    container.appendChild(block);

    new Knob(freq.knob, {
      min: 0,
      max: 10000,
      initial: 0,
      pixelsForFullRange: 800,
      valueElement: freq.val,
      format: v => v.toFixed(1) + ' Hz',
      onChange: value => {
        if (this.osc?.frequency) {
          setParamSmooth(this.osc.frequency, value, this.getAudioCtx());
        }
      }
    });

    new Knob(level.knob, {
      min: 0,
      max: 1,
      initial: 0,
      valueElement: level.val,
      format: v => v.toFixed(2),
      onChange: value => {
        if (this.amp?.gain) {
          setParamSmooth(this.amp.gain, value, this.getAudioCtx());
        }
      }
    });

    new Knob(pw.knob, {
      min: 0,
      max: 1,
      initial: 0,
      valueElement: pw.val,
      format: v => Math.round(v * 100) + '%',
      onChange: value => {
        this.pw = value;
        this._updatePulseWave(value);
      }
    });
  }
}
