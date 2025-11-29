// ---------------- KNOB ----------------
class Knob {
  constructor(rootEl, options) {
    this.rootEl = rootEl;
    this.innerEl = rootEl.querySelector('.knob-inner');
    this.valueEl = options.valueElement || null;
    this.min = options.min;
    this.max = options.max;
    this.value = options.initial;
    this.onChange = options.onChange || null;
    this.format = options.format || (v => v);
    this.pixelsForFullRange = options.pixelsForFullRange || 150;

    this.dragging = false;
    this.startY = 0;
    this.startValue = this.value;

    this.minAngle = -135;
    this.maxAngle = 135;
    this._attach();
    this._updateVisual();
  }
  _attach() {
    this.rootEl.addEventListener('pointerdown', ev => {
      if (window._synthApp && window._synthApp.ensureAudio) {
        window._synthApp.ensureAudio();
      }
      this.dragging = true;
      this.startY = ev.clientY;
      this.startValue = this.value;
      this.rootEl.setPointerCapture(ev.pointerId);
    });
    this.rootEl.addEventListener('pointermove', ev => {
      if (!this.dragging) return;
      const dy = this.startY - ev.clientY;
      const sens = (this.max - this.min) / this.pixelsForFullRange;
      this.setValue(this.startValue + dy * sens);
    });
    const end = ev => {
      if (!this.dragging) return;
      this.dragging = false;
      try { this.rootEl.releasePointerCapture(ev.pointerId); } catch(e){}
    };
    this.rootEl.addEventListener('pointerup', end);
    this.rootEl.addEventListener('pointercancel', end);
    this.rootEl.addEventListener('pointerleave', end);
  }
  _updateVisual() {
    const t = (this.value - this.min) / (this.max - this.min);
    const angle = this.minAngle + t * (this.maxAngle - this.minAngle);
    this.innerEl.style.transform = 'rotate(' + angle + 'deg)';
    if (this.valueEl) this.valueEl.textContent = this.format(this.value);
  }
  setValue(v) {
    this.value = Math.min(this.max, Math.max(this.min, v));
    this._updateVisual();
    if (this.onChange) this.onChange(this.value);
  }
  getValue() { return this.value; }
}

// ---------------- ENGINE ----------------
class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.modules = [];
    this.isRunning = false;
    this.muted = false;
    this.masterBaseGain = 1.0;

    this.bus1 = null;
    this.bus2 = null;
    this.bus1Mod = null;
    this.bus2Mod = null;
    this.bus1L = null;
    this.bus1R = null;
    this.bus2L = null;
    this.bus2R = null;
    this.masterL = null;
    this.masterR = null;
    this.merger = null;

    this.bus1Level = 1.0;
    this.bus1Pan = 0.0;
    this.bus2Level = 1.0;
    this.bus2Pan = 0.0;
  }

  start() {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.audioCtx = ctx;

    // buses de mezcla internos
    this.bus1 = ctx.createGain();
    this.bus2 = ctx.createGain();
    this.bus1.gain.value = 1.0;
    this.bus2.gain.value = 1.0;

    // nodos de nivel modulable por bus
    this.bus1Mod = ctx.createGain();
    this.bus2Mod = ctx.createGain();
    this.bus1Mod.gain.value = this.bus1Level;
    this.bus2Mod.gain.value = this.bus2Level;

    this.bus1.connect(this.bus1Mod);
    this.bus2.connect(this.bus2Mod);

    this.bus1L = ctx.createGain();
    this.bus1R = ctx.createGain();
    this.bus2L = ctx.createGain();
    this.bus2R = ctx.createGain();

    this.bus1Mod.connect(this.bus1L);
    this.bus1Mod.connect(this.bus1R);
    this.bus2Mod.connect(this.bus2L);
    this.bus2Mod.connect(this.bus2R);

    this.masterL = ctx.createGain();
    this.masterR = ctx.createGain();
    this.masterL.gain.value = this.muted ? 0 : this.masterBaseGain;
    this.masterR.gain.value = this.muted ? 0 : this.masterBaseGain;

    this.bus1L.connect(this.masterL);
    this.bus2L.connect(this.masterL);
    this.bus1R.connect(this.masterR);
    this.bus2R.connect(this.masterR);

    this.merger = ctx.createChannelMerger(2);
    this.masterL.connect(this.merger, 0, 0);
    this.masterR.connect(this.merger, 0, 1);
    this.merger.connect(ctx.destination);

    // inicializar módulos
    for (const m of this.modules) {
      if (m.start) m.start();
    }
    this.updateBusMix(1);
    this.updateBusMix(2);
    this.isRunning = true;
  }

  updateBusMix(busIndex) {
    const ctx = this.audioCtx;
    if (!ctx) return;
    let pan, gL1, gR1;
    if (busIndex === 1) {
      pan = this.bus1Pan;
      gL1 = this.bus1L.gain;
      gR1 = this.bus1R.gain;
    } else {
      pan = this.bus2Pan;
      gL1 = this.bus2L.gain;
      gR1 = this.bus2R.gain;
    }
    const angle = (pan + 1) * 0.25 * Math.PI; // -1..1 -> 0..pi/2
    const left = Math.cos(angle);
    const right = Math.sin(angle);
    const now = ctx.currentTime;
    gL1.cancelScheduledValues(now);
    gR1.cancelScheduledValues(now);
    gL1.setTargetAtTime(left, now, 0.03);
    gR1.setTargetAtTime(right, now, 0.03);
  }

  setBusLevel(bus, value) {
    const ctx = this.audioCtx;
    if (bus === 1) {
      this.bus1Level = value;
      if (ctx && this.bus1Mod) {
        const now = ctx.currentTime;
        this.bus1Mod.gain.cancelScheduledValues(now);
        this.bus1Mod.gain.setTargetAtTime(value, now, 0.03);
      }
    } else {
      this.bus2Level = value;
      if (ctx && this.bus2Mod) {
        const now = ctx.currentTime;
        this.bus2Mod.gain.cancelScheduledValues(now);
        this.bus2Mod.gain.setTargetAtTime(value, now, 0.03);
      }
    }
  }
  setBusPan(bus, value) {
    if (bus === 1) this.bus1Pan = value;
    else this.bus2Pan = value;
    this.updateBusMix(bus);
  }

  addModule(m) { this.modules.push(m); }
  findModule(id) { return this.modules.find(m => m.id === id) || null; }

  setMute(flag) {
    this.muted = flag;
    if (!this.audioCtx || !this.masterL || !this.masterR) return;
    const now = this.audioCtx.currentTime;
    const v = this.muted ? 0 : this.masterBaseGain;
    this.masterL.gain.cancelScheduledValues(now);
    this.masterR.gain.cancelScheduledValues(now);
    this.masterL.gain.setTargetAtTime(v, now, 0.03);
    this.masterR.gain.setTargetAtTime(v, now, 0.03);
  }
  toggleMute() { this.setMute(!this.muted); }
}

// ---------------- MODULE BASE ----------------
class Module {
  constructor(engine, id, name) {
    this.engine = engine;
    this.id = id;
    this.name = name;
    this.inputs = [];
    this.outputs = [];
  }
  getAudioCtx() { return this.engine.audioCtx; }
}

// ---------------- OSC SINE ----------------
class OscillatorModule extends Module {
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
    try { this.osc.start(t); } catch(e) {}
  }
  stop(t) {
    if (!this.osc) return;
    try { this.osc.stop(t); } catch(e) {}
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
    const fk = document.createElement('div');
    fk.className = 'knob';
    const fki = document.createElement('div');
    fki.className = 'knob-inner';
    fk.appendChild(fki);
    const flab = document.createElement('div');
    flab.className = 'knob-label';
    flab.textContent = 'Freq';
    const fval = document.createElement('div');
    fval.className = 'knob-value';
    freqWrap.appendChild(fk); freqWrap.appendChild(flab); freqWrap.appendChild(fval);
    row.appendChild(freqWrap);

    const volWrap = document.createElement('div');
    volWrap.className = 'knob-wrapper';
    const vk = document.createElement('div');
    vk.className = 'knob';
    const vki = document.createElement('div');
    vki.className = 'knob-inner';
    vk.appendChild(vki);
    const vlab = document.createElement('div');
    vlab.className = 'knob-label';
    vlab.textContent = 'Level';
    const vval = document.createElement('div');
    vval.className = 'knob-value';
    volWrap.appendChild(vk); volWrap.appendChild(vlab); volWrap.appendChild(vval);
    row.appendChild(volWrap);

    block.appendChild(row);
    container.appendChild(block);

    new Knob(fk, {
      min: 0, max: 10000, initial: this.baseFreq,
      pixelsForFullRange: 800,
      valueElement: fval,
      format: v => v.toFixed(1) + ' Hz',
      onChange: v => {
        if (this.osc && this.osc.frequency) {
          const ctx = this.getAudioCtx();
          const now = ctx.currentTime;
          this.osc.frequency.cancelScheduledValues(now);
          this.osc.frequency.setTargetAtTime(v, now, 0.03);
        }
      }
    });
    new Knob(vk, {
      min: 0, max: 1, initial: 0.4,
      valueElement: vval,
      format: v => v.toFixed(2),
      onChange: v => {
        if (this.amp && this.amp.gain) {
          const ctx = this.getAudioCtx();
          const now = ctx.currentTime;
          this.amp.gain.cancelScheduledValues(now);
          this.amp.gain.setTargetAtTime(v, now, 0.03);
        }
      }
    });
  }
}

// ---------------- PULSE OSC ----------------
class PulseModule extends Module {
  constructor(engine, id, baseFreq) {
    super(engine, id, 'Pulso ' + id);
    this.baseFreq = baseFreq;
    this.osc = null;
    this.amp = null;
    this.pw = 0.5;
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
    this.osc.frequency.value = this.baseFreq;
    this.amp = ctx.createGain();
    this.amp.gain.value = 0.4;
    this.osc.connect(this.amp);
    this._updatePulseWave(this.pw);
    this.outputs.push({ id: 'audioOut', kind: 'audio', node: this.amp, label: this.name + ' OUT' });
    this.inputs.push({ id: 'freqCV', kind: 'cv', param: this.osc.frequency, label: this.name + ' FREQ' });
    this.inputs.push({ id: 'ampCV', kind: 'cv', param: this.amp.gain, label: this.name + ' AMP' });
  }
  start() {
    this._initAudioNodes();
    const t = this.getAudioCtx().currentTime + 0.05;
    try { this.osc.start(t); } catch(e) {}
  }
  stop(t) {
    if (!this.osc) return;
    try { this.osc.stop(t); } catch(e) {}
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

    const freqWrap = document.createElement('div');
    freqWrap.className = 'knob-wrapper';
    const fk = document.createElement('div');
    fk.className = 'knob';
    const fki = document.createElement('div');
    fki.className = 'knob-inner';
    fk.appendChild(fki);
    const flab = document.createElement('div');
    flab.className = 'knob-label';
    flab.textContent = 'Freq';
    const fval = document.createElement('div');
    fval.className = 'knob-value';
    freqWrap.appendChild(fk); freqWrap.appendChild(flab); freqWrap.appendChild(fval);
    row.appendChild(freqWrap);

    const volWrap = document.createElement('div');
    volWrap.className = 'knob-wrapper';
    const vk = document.createElement('div');
    vk.className = 'knob';
    const vki = document.createElement('div');
    vki.className = 'knob-inner';
    vk.appendChild(vki);
    const vlab = document.createElement('div');
    vlab.className = 'knob-label';
    vlab.textContent = 'Level';
    const vval = document.createElement('div');
    vval.className = 'knob-value';
    volWrap.appendChild(vk); volWrap.appendChild(vlab); volWrap.appendChild(vval);
    row.appendChild(volWrap);

    const pwWrap = document.createElement('div');
    pwWrap.className = 'knob-wrapper';
    const pk = document.createElement('div');
    pk.className = 'knob';
    const pki = document.createElement('div');
    pki.className = 'knob-inner';
    pk.appendChild(pki);
    const plab = document.createElement('div');
    plab.className = 'knob-label';
    plab.textContent = 'PW';
    const pval = document.createElement('div');
    pval.className = 'knob-value';
    pwWrap.appendChild(pk); pwWrap.appendChild(plab); pwWrap.appendChild(pval);
    row.appendChild(pwWrap);

    block.appendChild(row);
    container.appendChild(block);

    new Knob(fk, {
      min: 0, max: 10000, initial: this.baseFreq,
      pixelsForFullRange: 800,
      valueElement: fval,
      format: v => v.toFixed(1) + ' Hz',
      onChange: v => {
        if (this.osc && this.osc.frequency) {
          const ctx = this.getAudioCtx();
          const now = ctx.currentTime;
          this.osc.frequency.cancelScheduledValues(now);
          this.osc.frequency.setTargetAtTime(v, now, 0.03);
        }
      }
    });
    new Knob(vk, {
      min: 0, max: 1, initial: 0.4,
      valueElement: vval,
      format: v => v.toFixed(2),
      onChange: v => {
        if (this.amp && this.amp.gain) {
          const ctx = this.getAudioCtx();
          const now = ctx.currentTime;
          this.amp.gain.cancelScheduledValues(now);
          this.amp.gain.setTargetAtTime(v, now, 0.03);
        }
      }
    });
    new Knob(pk, {
      min: 0.05, max: 0.95, initial: this.pw,
      valueElement: pval,
      format: v => Math.round(v*100) + '%',
      onChange: v => {
        this.pw = v;
        this._updatePulseWave(v);
      }
    });
  }
}

// ---------------- NOISE GENERATOR ----------------
class NoiseModule extends Module {
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
  _updateColourParam(v) {
    if (!this.filter) return;
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    // Map 0..1 → 200..8000 Hz approx
    const minF = 200;
    const maxF = 8000;
    const freq = minF * Math.pow(maxF/minF, v);
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
    this.amp.gain.value = 0.0; // nivel inicial a 0 para que no moleste

    this.source.connect(this.filter);
    this.filter.connect(this.amp);

    this.outputs.push({ id: 'audioOut', kind: 'audio', node: this.amp, label: 'Noise OUT' });

    this._updateColourParam(this.colour);
  }
  start() {
    this._initAudioNodes();
    const ctx = this.getAudioCtx();
    const t = ctx.currentTime + 0.05;
    try { this.source.start(t); } catch(e) {}
  }
  stop(t) {
    if (!this.source) return;
    try { this.source.stop(t); } catch(e) {}
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

    // Colour knob
    const colWrap = document.createElement('div');
    colWrap.className = 'knob-wrapper';
    const ck = document.createElement('div');
    ck.className = 'knob';
    const cki = document.createElement('div');
    cki.className = 'knob-inner';
    ck.appendChild(cki);
    const clab = document.createElement('div');
    clab.className = 'knob-label';
    clab.textContent = 'Colour';
    const cval = document.createElement('div');
    cval.className = 'knob-value';
    cval.textContent = 'White';
    colWrap.appendChild(ck); colWrap.appendChild(clab); colWrap.appendChild(cval);
    row.appendChild(colWrap);

    // Level knob
    const levWrap = document.createElement('div');
    levWrap.className = 'knob-wrapper';
    const lk = document.createElement('div');
    lk.className = 'knob';
    const lki = document.createElement('div');
    lki.className = 'knob-inner';
    lk.appendChild(lki);
    const llab = document.createElement('div');
    llab.className = 'knob-label';
    llab.textContent = 'Level';
    const lval = document.createElement('div');
    lval.className = 'knob-value';
    lval.textContent = '0.00';
    levWrap.appendChild(lk); levWrap.appendChild(llab); levWrap.appendChild(lval);
    row.appendChild(levWrap);

    block.appendChild(row);
    container.appendChild(block);

    const colourToLabel = v => {
      if (v < 0.33) return 'Low';
      if (v > 0.66) return 'High';
      return 'White';
    };

    new Knob(ck, {
      min: 0, max: 1, initial: this.colour,
      valueElement: cval,
      format: v => colourToLabel(v),
      pixelsForFullRange: 200,
      onChange: v => {
        this.colour = v;
        this._updateColourParam(v);
      }
    });

    new Knob(lk, {
      min: 0, max: 1, initial: 0.0,
      valueElement: lval,
      format: v => v.toFixed(2),
      pixelsForFullRange: 200,
      onChange: v => {
        if (this.amp && this.amp.gain) {
          const ctx = this.getAudioCtx();
          const now = ctx.currentTime;
          this.amp.gain.cancelScheduledValues(now);
          this.amp.gain.setTargetAtTime(v, now, 0.03);
        }
      }
    });
  }
}
// ---------------- JOYSTICK ----------------
class JoystickModule extends Module {
  constructor(engine, id) {
    super(engine, id, 'Stick');
    this.xConst = null;
    this.yConst = null;
    this.xGain = null;
    this.yGain = null;
    this.x = 0;
    this.y = 0;
  }
  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.xConst) return;
    this.xConst = ctx.createConstantSource();
    this.yConst = ctx.createConstantSource();
    this.xConst.offset.value = 0;
    this.yConst.offset.value = 0;
    this.xGain = ctx.createGain();
    this.yGain = ctx.createGain();
    this.xConst.connect(this.xGain);
    this.yConst.connect(this.yGain);
    this.outputs.push({ id: 'xOut', kind: 'cv', node: this.xGain, label: 'Stick X' });
    this.outputs.push({ id: 'yOut', kind: 'cv', node: this.yGain, label: 'Stick Y' });
  }
  start() {
    this._initAudioNodes();
    const ctx = this.getAudioCtx();
    const t = ctx.currentTime + 0.05;
    try { this.xConst.start(t); } catch(e) {}
    try { this.yConst.start(t); } catch(e) {}
  }
  stop(t) {
    if (!this.xConst || !this.yConst) return;
    try { this.xConst.stop(t); } catch(e) {}
    try { this.yConst.stop(t); } catch(e) {}
  }
  setPosition(nx, ny) {
    const ctx = this.getAudioCtx();
    if (!ctx || !this.xConst || !this.yConst) return;
    const x = Math.max(-1, Math.min(1, nx));
    const y = Math.max(-1, Math.min(1, ny));
    this.x = x;
    this.y = y;
    const now = ctx.currentTime;
    this.xConst.offset.cancelScheduledValues(now);
    this.yConst.offset.cancelScheduledValues(now);
    this.xConst.offset.setTargetAtTime(x, now, 0.03);
    this.yConst.offset.setTargetAtTime(y, now, 0.03);
  }
  createPanel(container) {
    const block = document.createElement('div');
    block.className = 'joystick-block';
    const title = document.createElement('div');
    title.className = 'voice-title';
    title.textContent = 'Stick';
    block.appendChild(title);

    const pad = document.createElement('div');
    pad.className = 'joystick-pad';
    const handle = document.createElement('div');
    handle.className = 'joystick-handle';
    pad.appendChild(handle);
    block.appendChild(pad);

    const infoRow = document.createElement('div');
    infoRow.style.display = 'flex';
    infoRow.style.justifyContent = 'space-between';
    infoRow.style.fontSize = '0.75rem';
    infoRow.style.marginTop = '0.2rem';
    const xSpan = document.createElement('span');
    const ySpan = document.createElement('span');
    xSpan.textContent = 'X: 0.00';
    ySpan.textContent = 'Y: 0.00';
    infoRow.appendChild(xSpan);
    infoRow.appendChild(ySpan);
    block.appendChild(infoRow);

    container.appendChild(block);

    const updateHandle = (nx, ny) => {
      const px = (nx + 1) / 2;
      const py = (1 - ny) / 2;
      handle.style.left = (px * 100) + '%';
      handle.style.top = (py * 100) + '%';
      handle.style.transform = 'translate(-50%, -50%)';
      xSpan.textContent = 'X: ' + nx.toFixed(2);
      ySpan.textContent = 'Y: ' + ny.toFixed(2);
    };

    const processEvent = (ev) => {
      const rect = pad.getBoundingClientRect();
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top) / rect.height;
      const nx = Math.max(-1, Math.min(1, x * 2 - 1));
      const ny = Math.max(-1, Math.min(1, 1 - y * 2));
      this.setPosition(nx, ny);
      updateHandle(nx, ny);
    };

    pad.addEventListener('pointerdown', ev => {
      if (window._synthApp && window._synthApp.ensureAudio) {
        window._synthApp.ensureAudio();
      }
      pad.setPointerCapture(ev.pointerId);
      processEvent(ev);
    });
    pad.addEventListener('pointermove', ev => {
      if (ev.buttons === 0) return;
      processEvent(ev);
    });
    pad.addEventListener('pointerup', ev => {
      try { pad.releasePointerCapture(ev.pointerId); } catch(e) {}
    });
    pad.addEventListener('pointerleave', ev => {
      if (ev.buttons === 0) return;
      try { pad.releasePointerCapture(ev.pointerId); } catch(e) {}
    });

    updateHandle(0, 0);
  }
}

// ---------------- MATRIX ----------------
class Matrix {
  constructor(engine, tableEl, sourcePorts, destPorts, options = {}) {
    this.engine = engine;
    this.tableEl = tableEl;
    this.sourcePorts = sourcePorts;
    this.destPorts = destPorts;
    this.connections = [];
    this.options = Object.assign({
      freqDepth: 80,
      ampDepth: 0.5,
      outputGain: 1.0
    }, options);
  }
  build() {
    this.tableEl.innerHTML = '';
    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    const th0 = document.createElement('th');
    th0.textContent = 'Sources \\ Destinos';
    trHead.appendChild(th0);
    for (const d of this.destPorts) {
      const th = document.createElement('th');
      const span = document.createElement('span');
      span.className = 'matrix-header-vertical';
      span.textContent = d.label;
      th.appendChild(span);
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);
    this.tableEl.appendChild(thead);

    const tbody = document.createElement('tbody');
    this.connections = [];
    this.sourcePorts.forEach((src, r) => {
      this.connections[r] = [];
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = src.label;
      tr.appendChild(th);
      this.destPorts.forEach((dest, c) => {
        this.connections[r][c] = null;
        const td = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'pin-btn';
        btn.dataset.row = r;
        btn.dataset.col = c;
        btn.addEventListener('click', () => this.toggleConnection(btn, r, c));
        td.appendChild(btn);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    this.tableEl.appendChild(tbody);
  }
  getPortNode(portInfo, isSource) {
    if (!portInfo || !portInfo.moduleId) return null;
    const mod = this.engine.findModule(portInfo.moduleId);
    if (!mod) return null;
    if (isSource) {
      const out = mod.outputs.find(o => o.id === portInfo.portId);
      return out ? out.node : null;
    } else {
      const inp = mod.inputs.find(i => i.id === portInfo.portId);
      return inp || null;
    }
  }
  toggleConnection(btn, r, c) {
    if (window._synthApp && window._synthApp.ensureAudio) {
      window._synthApp.ensureAudio();
    }
    if (btn.classList.contains('active')) {
      btn.classList.remove('active');
      this.removeConnection(r, c);
    } else {
      btn.classList.add('active');
      this.createConnection(r, c);
    }
  }
  createConnection(r, c) {
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const srcInfo = this.sourcePorts[r];
    const destInfo = this.destPorts[c];

    if (destInfo.type === 'output') {
      const srcNode = this.getPortNode(srcInfo, true);
      if (!srcNode) return;
      const g = ctx.createGain();
      g.gain.value = this.options.outputGain;
      srcNode.connect(g);
      if (destInfo.bus === 1 && this.engine.bus1) g.connect(this.engine.bus1);
      else if (destInfo.bus === 2 && this.engine.bus2) g.connect(this.engine.bus2);
      else if (this.engine.masterL) g.connect(this.engine.masterL);
      this.connections[r][c] = g;
      return;
    }

    const srcNode = this.getPortNode(srcInfo, true);
    const destPort = this.getPortNode(destInfo, false);
    if (!srcNode || !destPort || !destPort.param) return;
    const g = ctx.createGain();
    if (destInfo.type === 'freq') g.gain.value = this.options.freqDepth;
    if (destInfo.type === 'amp') g.gain.value = this.options.ampDepth;
    srcNode.connect(g);
    g.connect(destPort.param);
    this.connections[r][c] = g;
  }
  removeConnection(r, c) {
    const conn = this.connections[r][c];
    if (!conn) return;
    try { conn.disconnect(); } catch(e) {}
    this.connections[r][c] = null;
  }
}

// ---------------- OUTPUT ROUTER UI ----------------
function createOutputRouterUI(engine, container) {
  const block = document.createElement('div');
  block.className = 'voice-block';
  const title = document.createElement('div');
  title.className = 'voice-title';
  title.textContent = 'Output Router (Ch1/Ch2 → L/R)';
  block.appendChild(title);

  const row = document.createElement('div');
  row.className = 'knob-row';

  function makeKnob(labelText, min, max, initial, format, onChange, pixelsForFullRange) {
    const wrap = document.createElement('div');
    wrap.className = 'knob-wrapper';
    const k = document.createElement('div');
    k.className = 'knob';
    const ki = document.createElement('div');
    ki.className = 'knob-inner';
    k.appendChild(ki);
    const lab = document.createElement('div');
    lab.className = 'knob-label';
    lab.textContent = labelText;
    const val = document.createElement('div');
    val.className = 'knob-value';
    wrap.appendChild(k); wrap.appendChild(lab); wrap.appendChild(val);
    new Knob(k, {
      min, max, initial, valueElement: val,
      format, onChange, pixelsForFullRange: pixelsForFullRange || 200
    });
    row.appendChild(wrap);
  }

  // Bus 1
  makeKnob('Ch1 Level', 0, 1, engine.bus1Level,
    v => v.toFixed(2),
    v => engine.setBusLevel(1, v), 200);
  makeKnob('Ch1 Pan', -1, 1, engine.bus1Pan,
    v => (v<0?'L ':'R ') + Math.abs(v).toFixed(2),
    v => engine.setBusPan(1, v), 200);

  // Bus 2
  makeKnob('Ch2 Level', 0, 1, engine.bus2Level,
    v => v.toFixed(2),
    v => engine.setBusLevel(2, v), 200);
  makeKnob('Ch2 Pan', -1, 1, engine.bus2Pan,
    v => (v<0?'L ':'R ') + Math.abs(v).toFixed(2),
    v => engine.setBusPan(2, v), 200);

  block.appendChild(row);
  container.appendChild(block);
}

// ---------------- APP ----------------
// ---------------- OUTPUT ROUTER MODULE (CV para niveles) ----------------
class OutputRouterModule extends Module {
  constructor(engine, id) {
    super(engine, id, 'Output Router');
  }
  start() {
    // Crear entradas de CV para los niveles cuando el motor ya tiene los nodos
    const e = this.engine;
    if (!e.audioCtx || !e.bus1Mod || !e.bus2Mod) return;
    if (this.inputs.length > 0) return;
    this.inputs.push({
      id: 'bus1LevelCV',
      kind: 'cv',
      param: e.bus1Mod.gain,
      label: 'Output Ch Level 1'
    });
    this.inputs.push({
      id: 'bus2LevelCV',
      kind: 'cv',
      param: e.bus2Mod.gain,
      label: 'Output Ch Level 2'
    });
  }
}

class App {
  constructor() {
    this.engine = new AudioEngine();
    this.oscRowEl = document.getElementById('oscRow');
    this.pulseRowEl = document.getElementById('pulseRow');
    this.noiseRowEl = document.getElementById('noiseRow');
    this.matrixEl = document.getElementById('matrixTable');
    this.stickRowEl = document.getElementById('stickRow');
    this.routerRowEl = document.getElementById('routerRow');
    this.matrix = null;
    this._setupModules();
    this._setupUI();
  }

  ensureAudio() { this.engine.start(); }

  _setupModules() {
    const osc1 = new OscillatorModule(this.engine, 'osc1', 110);
    const osc2 = new OscillatorModule(this.engine, 'osc2', 220);
    const osc3 = new PulseModule(this.engine, 'osc3', 330);
    const noise = new NoiseModule(this.engine, 'noise');
    const stick = new JoystickModule(this.engine, 'stick');
    const router = new OutputRouterModule(this.engine, 'router');

    this.engine.addModule(osc1);
    this.engine.addModule(osc2);
    this.engine.addModule(osc3);
    this.engine.addModule(noise);
    this.engine.addModule(stick);
    this.engine.addModule(router);

    osc1.createPanel(this.oscRowEl);
    osc2.createPanel(this.oscRowEl);
    osc3.createPanel(this.pulseRowEl);
    noise.createPanel(this.noiseRowEl);
    stick.createPanel(this.stickRowEl);
    createOutputRouterUI(this.engine, this.routerRowEl);

    const sourcePorts = [
      { moduleId: 'osc1', portId: 'audioOut', label: 'Oscillator 1 I' },
      { moduleId: 'osc1', portId: 'audioOut', label: 'Oscillator 1 II' },
      { moduleId: 'osc2', portId: 'audioOut', label: 'Oscillator 2 I' },
      { moduleId: 'osc2', portId: 'audioOut', label: 'Oscillator 2 II' },
      { moduleId: 'osc3', portId: 'audioOut', label: 'Oscillator 3 I' },
      { moduleId: 'osc3', portId: 'audioOut', label: 'Oscillator 3 II' },
      { moduleId: 'noise',  portId: 'audioOut', label: 'Noise' },
      { moduleId: null,  portId: null, label: 'Input Channel 1' },
      { moduleId: null,  portId: null, label: 'Input Channel 2' },
      { moduleId: null,  portId: null, label: 'Filter' },
      { moduleId: null,  portId: null, label: 'Trapezoid' },
      { moduleId: null,  portId: null, label: 'Envelope Signal' },
      { moduleId: null,  portId: null, label: 'Ring Modulator' },
      { moduleId: null,  portId: null, label: 'Reverberation' },
      { moduleId: 'stick',  portId: 'xOut', label: 'Stick X' },
      { moduleId: 'stick',  portId: 'yOut', label: 'Stick Y' }
    ];

    const destPorts = [
      // Signal inputs
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Meter' },
      { moduleId: null,   portId: null,     type: 'output', bus: 1, label: 'Output Ch 1' },
      { moduleId: null,   portId: null,     type: 'output', bus: 2, label: 'Output Ch 2' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Envelope A' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Envelope B' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Ring Mod A' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Ring Mod B' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Reverb' },
      // Control inputs
      { moduleId: 'osc1', portId: 'freqCV', type: 'freq',   label: 'Osc Freq 1' },
      { moduleId: 'osc2', portId: 'freqCV', type: 'freq',   label: 'Osc Freq 2' },
      { moduleId: 'osc3', portId: 'freqCV', type: 'freq',   label: 'Osc Freq 3' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Decay' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Reverb Mix' },
      { moduleId: null,   portId: null,     type: 'freq',   label: 'Filter Freq' },
      { moduleId: 'router', portId: 'bus1LevelCV', type: 'amp',    label: 'Output Ch Level 1' },
      { moduleId: 'router', portId: 'bus2LevelCV', type: 'amp',    label: 'Output Ch Level 2' }
    ];

    this.matrix = new Matrix(this.engine, this.matrixEl, sourcePorts, destPorts, {
      freqDepth: 80,
      ampDepth: 0.5,
      outputGain: 1.0
    });
    this.matrix.build();
  }

  _setupUI() {
    const muteBtn = document.getElementById('muteBtn');
    muteBtn.addEventListener('click', () => {
      this.ensureAudio();
      this.engine.toggleMute();
      muteBtn.textContent = this.engine.muted ? '🔇 Mute ON' : '🔊 Audio ON';
      muteBtn.classList.toggle('off', this.engine.muted);
    });
  }
}


// --------- ZOOM / PAN del panel completo ---------
(function() {
  const outer = document.getElementById('viewportOuter');
  const inner = document.getElementById('viewportInner');
  if (!outer || !inner) return;

  let scale = 1;
  let minScale = 0.1; // permite alejar mucho
  let maxScale = 3.0;
  let offsetX = 0;
  let offsetY = 0;

  function applyTransform() {
    inner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }
  applyTransform();

  function isInteractiveTarget(el) {
    if (!el) return false;
    return !!el.closest('.knob, .knob-inner, .pin-btn, .joystick-pad, .joystick-handle');
  }

  // Zoom con rueda (desktop), centrado en el cursor
  outer.addEventListener('wheel', ev => {
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      const rect = outer.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const zoomFactor = ev.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(maxScale, Math.max(minScale, scale * zoomFactor));
      const sx = cx - offsetX;
      const sy = cy - offsetY;
      offsetX = cx - sx * (newScale / scale);
      offsetY = cy - sy * (newScale / scale);
      scale = newScale;
      applyTransform();
    }
  }, { passive: false });

  // Estado para pan con un dedo
  let isPanning = false;
  let panPointerId = null;
  let lastX = 0;
  let lastY = 0;

  // Pinch-zoom con dos dedos (móvil/tablet), centrado en el punto medio
  const pointers = new Map();
  let lastDist = null;

  outer.addEventListener('pointerdown', ev => {
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    // Si solo hay un dedo y no estamos sobre un control interactivo, iniciamos pan
    if (pointers.size === 1 && !isInteractiveTarget(ev.target)) {
      isPanning = true;
      panPointerId = ev.pointerId;
      lastX = ev.clientX;
      lastY = ev.clientY;
    }
  });

  outer.addEventListener('pointermove', ev => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size === 2) {
      // Pinch-zoom: dos dedos
      ev.preventDefault();
      const arr = Array.from(pointers.values());
      const dx = arr[0].x - arr[1].x;
      const dy = arr[0].y - arr[1].y;
      const dist = Math.hypot(dx, dy);
      const rect = outer.getBoundingClientRect();
      const cx = (arr[0].x + arr[1].x) / 2 - rect.left;
      const cy = (arr[0].y + arr[1].y) / 2 - rect.top;
      if (lastDist != null) {
        const zoomFactor = dist / lastDist;
        const newScale = Math.min(maxScale, Math.max(minScale, scale * zoomFactor));
        const sx = cx - offsetX;
        const sy = cy - offsetY;
        offsetX = cx - sx * (newScale / scale);
        offsetY = cy - sy * (newScale / scale);
        scale = newScale;
        applyTransform();
      }
      lastDist = dist;
      // Cuando hay dos dedos, desactivamos pan a un dedo
      isPanning = false;
      panPointerId = null;
      return;
    }

    // Si hay un solo dedo activo y estamos en modo pan
    if (pointers.size === 1 && isPanning && panPointerId === ev.pointerId) {
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      offsetX += dx;
      offsetY += dy;
      applyTransform();
    }
  }, { passive: false });

  outer.addEventListener('pointerup', ev => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) lastDist = null;
    if (panPointerId === ev.pointerId) {
      isPanning = false;
      panPointerId = null;
    }
  });
  outer.addEventListener('pointercancel', ev => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) lastDist = null;
    if (panPointerId === ev.pointerId) {
      isPanning = false;
      panPointerId = null;
    }
  });
})();

window.addEventListener('DOMContentLoaded', () => {
  window._synthApp = new App();
  if (window._synthApp && window._synthApp.ensureAudio) {
    window._synthApp.ensureAudio();
  }
});