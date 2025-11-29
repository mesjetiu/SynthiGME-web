import { Module } from '../core/engine.js';
import { Knob } from '../ui/knob.js';

export class OscillatorModule extends Module {
  constructor(engine, id, baseFreq) {
    super(engine, id, 'Osc ' + id);
    this.baseFreq = baseFreq;
    this.osc = null;
    this.amp = null;
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.osc) return;
    this.osc = ctx.createOscillator();
    this.osc.type = 'sine';
    this.osc.frequency.value = this.baseFreq;
    this.amp = ctx.createGain();
    this.amp.gain.value = 0.4;
    this.osc.connect(this.amp);

    this.outputs.push({ id: 'audioOut', kind: 'audio', node: this.amp, label: this.name + ' OUT' });
    this.inputs.push({ id: 'freqCV', kind: 'cv', param: this.osc.frequency, label: this.name + ' FREQ' });
    this.inputs.push({ id: 'ampCV', kind: 'cv', param: this.amp.gain, label: this.name + ' AMP' });
  }

  start() {
    this._initAudioNodes();
    const t = this.getAudioCtx().currentTime + 0.05;
    try { this.osc.start(t); } catch (error) {
      // ignore multiple starts
    }
  }

  stop(time) {
    if (!this.osc) return;
    try { this.osc.stop(time); } catch (error) {
      // ignore multiple stops
    }
  }

  createPanel(container) {
    const block = document.createElement('div');
    block.className = 'voice-block';
    const title = document.createElement('div');
    title.className = 'voice-title';
    title.textContent = this.name + ' (sine)';
    block.appendChild(title);
    const row = document.createElement('div');
    row.className = 'knob-row';

    const freqWrap = document.createElement('div');
    freqWrap.className = 'knob-wrapper';
    const freqKnob = document.createElement('div');
    freqKnob.className = 'knob';
    const freqKnobInner = document.createElement('div');
    freqKnobInner.className = 'knob-inner';
    freqKnob.appendChild(freqKnobInner);
    const freqLabel = document.createElement('div');
    freqLabel.className = 'knob-label';
    freqLabel.textContent = 'Freq';
    const freqValue = document.createElement('div');
    freqValue.className = 'knob-value';
    freqWrap.appendChild(freqKnob);
    freqWrap.appendChild(freqLabel);
    freqWrap.appendChild(freqValue);
    row.appendChild(freqWrap);

    const volWrap = document.createElement('div');
    volWrap.className = 'knob-wrapper';
    const volKnob = document.createElement('div');
    volKnob.className = 'knob';
    const volKnobInner = document.createElement('div');
    volKnobInner.className = 'knob-inner';
    volKnob.appendChild(volKnobInner);
    const volLabel = document.createElement('div');
    volLabel.className = 'knob-label';
    volLabel.textContent = 'Level';
    const volValue = document.createElement('div');
    volValue.className = 'knob-value';
    volWrap.appendChild(volKnob);
    volWrap.appendChild(volLabel);
    volWrap.appendChild(volValue);
    row.appendChild(volWrap);

    block.appendChild(row);
    container.appendChild(block);

    new Knob(freqKnob, {
      min: 0,
      max: 10000,
      initial: this.baseFreq,
      pixelsForFullRange: 800,
      valueElement: freqValue,
      format: v => v.toFixed(1) + ' Hz',
      onChange: value => {
        if (this.osc && this.osc.frequency) {
          const ctx = this.getAudioCtx();
          const now = ctx.currentTime;
          this.osc.frequency.cancelScheduledValues(now);
          this.osc.frequency.setTargetAtTime(value, now, 0.03);
        }
      }
    });

    new Knob(volKnob, {
      min: 0,
      max: 1,
      initial: 0.4,
      valueElement: volValue,
      format: v => v.toFixed(2),
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
