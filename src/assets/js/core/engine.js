// Núcleo de audio: contexto WebAudio y clase base Module para el resto del sistema
export class AudioEngine {
  constructor(options = {}) {
    const { outputChannels = 8 } = options;
    this.audioCtx = null;
    this.modules = [];
    this.isRunning = false;
    this.muted = false;
    this.masterBaseGain = 1.0;

    this.outputChannels = outputChannels;
    this.outputLevels = Array.from({ length: this.outputChannels }, () => 0.0);
    // Por defecto, el bus 1 debe estar abierto para que el bypass a Output 1 sea audible.
    if (this.outputLevels.length > 0) this.outputLevels[0] = 1.0;
    this.outputPans = Array.from({ length: this.outputChannels }, () => 0.0);
    this.outputBuses = [];

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

    this.bus1Level = this.outputLevels[0] ?? 0.0;
    this.bus1Pan = this.outputPans[0] ?? 0.0;
    this.bus2Level = this.outputLevels[1] ?? 0.0;
    this.bus2Pan = this.outputPans[1] ?? 0.0;
  }

  start() {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.audioCtx = ctx;

    this.masterL = ctx.createGain();
    this.masterR = ctx.createGain();
    this.masterL.gain.value = this.muted ? 0 : this.masterBaseGain;
    this.masterR.gain.value = this.muted ? 0 : this.masterBaseGain;

    this.outputBuses = [];
    for (let i = 0; i < this.outputChannels; i += 1) {
      const busInput = ctx.createGain();
      busInput.gain.value = 1.0;
      const levelNode = ctx.createGain();
      levelNode.gain.value = this.outputLevels[i];
      busInput.connect(levelNode);

      const panLeft = ctx.createGain();
      const panRight = ctx.createGain();
      levelNode.connect(panLeft);
      levelNode.connect(panRight);
      panLeft.connect(this.masterL);
      panRight.connect(this.masterR);

      this.outputBuses.push({
        input: busInput,
        levelNode,
        panLeft,
        panRight
      });
    }

    this.bus1 = this.outputBuses[0]?.input || null;
    this.bus2 = this.outputBuses[1]?.input || null;
    this.bus1Mod = this.outputBuses[0]?.levelNode || null;
    this.bus2Mod = this.outputBuses[1]?.levelNode || null;
    this.bus1L = this.outputBuses[0]?.panLeft || null;
    this.bus1R = this.outputBuses[0]?.panRight || null;
    this.bus2L = this.outputBuses[1]?.panLeft || null;
    this.bus2R = this.outputBuses[1]?.panRight || null;

    this.merger = ctx.createChannelMerger(2);
    this.masterL.connect(this.merger, 0, 0);
    this.masterR.connect(this.merger, 0, 1);
    this.merger.connect(ctx.destination);

    for (const m of this.modules) {
      if (m.start) m.start();
    }
    for (let i = 0; i < this.outputChannels; i += 1) {
      this.updateOutputPan(i);
    }
    this.isRunning = true;
  }

  updateOutputPan(busIndex) {
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (!ctx || !bus) return;
    const pan = this.outputPans[busIndex] ?? 0;
    const gainL = bus.panLeft.gain;
    const gainR = bus.panRight.gain;
    const angle = (pan + 1) * 0.25 * Math.PI;
    const left = Math.cos(angle);
    const right = Math.sin(angle);
    const now = ctx.currentTime;
    gainL.cancelScheduledValues(now);
    gainR.cancelScheduledValues(now);
    gainL.setTargetAtTime(left, now, 0.03);
    gainR.setTargetAtTime(right, now, 0.03);
  }

  setOutputLevel(busIndex, value, { ramp = 0.03 } = {}) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return;
    this.outputLevels[busIndex] = value;
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (ctx && bus) {
      const now = ctx.currentTime;
      bus.levelNode.gain.cancelScheduledValues(now);
      bus.levelNode.gain.setTargetAtTime(value, now, ramp);
    }
    if (busIndex === 0) this.bus1Level = value;
    if (busIndex === 1) this.bus2Level = value;
  }

  getOutputLevel(busIndex) {
    return this.outputLevels[busIndex] ?? 0.0;
  }

  setOutputPan(busIndex, value) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return;
    this.outputPans[busIndex] = value;
    this.updateOutputPan(busIndex);
    if (busIndex === 0) this.bus1Pan = value;
    if (busIndex === 1) this.bus2Pan = value;
  }

  getOutputBusNode(busIndex) {
    return this.outputBuses[busIndex]?.input || null;
  }

  connectNodeToOutput(busIndex, node) {
    const busNode = this.getOutputBusNode(busIndex);
    if (!busNode || !node) return null;
    node.connect(busNode);
    return busNode;
  }

  setBusLevel(bus, value) {
    const targetIndex = bus - 1;
    this.setOutputLevel(targetIndex, value);
  }

  setBusPan(bus, value) {
    const targetIndex = bus - 1;
    this.setOutputPan(targetIndex, value);
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
