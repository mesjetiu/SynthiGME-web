export class AudioEngine {
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

    this.bus1 = ctx.createGain();
    this.bus2 = ctx.createGain();
    this.bus1.gain.value = 1.0;
    this.bus2.gain.value = 1.0;

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
    let pan;
    let gainL;
    let gainR;
    if (busIndex === 1) {
      pan = this.bus1Pan;
      gainL = this.bus1L.gain;
      gainR = this.bus1R.gain;
    } else {
      pan = this.bus2Pan;
      gainL = this.bus2L.gain;
      gainR = this.bus2R.gain;
    }
    const angle = (pan + 1) * 0.25 * Math.PI;
    const left = Math.cos(angle);
    const right = Math.sin(angle);
    const now = ctx.currentTime;
    gainL.cancelScheduledValues(now);
    gainR.cancelScheduledValues(now);
    gainL.setTargetAtTime(left, now, 0.03);
    gainR.setTargetAtTime(right, now, 0.03);
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

  addModule(module) {
    this.modules.push(module);
  }

  findModule(id) {
    return this.modules.find(m => m.id === id) || null;
  }

  setMute(flag) {
    this.muted = flag;
    if (!this.audioCtx || !this.masterL || !this.masterR) return;
    const now = this.audioCtx.currentTime;
    const value = this.muted ? 0 : this.masterBaseGain;
    this.masterL.gain.cancelScheduledValues(now);
    this.masterR.gain.cancelScheduledValues(now);
    this.masterL.gain.setTargetAtTime(value, now, 0.03);
    this.masterR.gain.setTargetAtTime(value, now, 0.03);
  }

  toggleMute() {
    this.setMute(!this.muted);
  }
}

export class Module {
  constructor(engine, id, name) {
    this.engine = engine;
    this.id = id;
    this.name = name;
    this.inputs = [];
    this.outputs = [];
  }

  getAudioCtx() {
    return this.engine.audioCtx;
  }
}
