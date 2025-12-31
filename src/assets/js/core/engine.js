// Núcleo de audio: contexto WebAudio y clase base Module para el resto del sistema

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE AUDIO
// ─────────────────────────────────────────────────────────────────────────────
// Valores centralizados para evitar "magic numbers" dispersos en el código.
// ─────────────────────────────────────────────────────────────────────────────
export const AUDIO_CONSTANTS = {
  /** Tiempo de rampa por defecto para cambios de parámetros (30ms, evita clicks) */
  DEFAULT_RAMP_TIME: 0.03,
  /** Tiempo de rampa lento para faders y controles de volumen (60ms) */
  SLOW_RAMP_TIME: 0.06,
  /** Tiempo de rampa rápido para modulaciones (10ms) */
  FAST_RAMP_TIME: 0.01
};

/**
 * Helper para actualizar un AudioParam con rampa suave.
 * Evita clicks cancelando valores programados y usando setTargetAtTime.
 * 
 * @param {AudioParam} param - El parámetro a actualizar
 * @param {number} value - El nuevo valor objetivo
 * @param {AudioContext} ctx - El contexto de audio (para obtener currentTime)
 * @param {Object} [options] - Opciones de rampa
 * @param {number} [options.ramp=0.03] - Tiempo de rampa en segundos
 */
export function setParamSmooth(param, value, ctx, { ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME } = {}) {
  if (!param || !ctx) return;
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, ramp);
}

export class AudioEngine {
  constructor(options = {}) {
    const { outputChannels = 8 } = options;
    this.audioCtx = null;
    this.modules = [];
    this.isRunning = false;
    this.muted = false;
    this.masterBaseGain = 1.0;
    this.workletReady = false;
    this._workletLoadPromise = null;

    this.outputChannels = outputChannels;
    this.outputLevels = Array.from({ length: this.outputChannels }, () => 0.0);
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

    // Cargar AudioWorklet para osciladores con fase coherente
    this._loadWorklet();

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
    const angle = (pan + 1) * 0.25 * Math.PI;
    const left = Math.cos(angle);
    const right = Math.sin(angle);
    setParamSmooth(bus.panLeft.gain, left, ctx);
    setParamSmooth(bus.panRight.gain, right, ctx);
  }

  setOutputLevel(busIndex, value, { ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME } = {}) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return;
    this.outputLevels[busIndex] = value;
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (ctx && bus) {
      setParamSmooth(bus.levelNode.gain, value, ctx, { ramp });
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

  /**
   * Establece el ruteo directo de una salida lógica a las salidas físicas L/R.
   * Permite control aditivo: cada salida puede ir a L, R, ambos o ninguno.
   * @param {number} busIndex - Índice de la salida (0-based)
   * @param {number} leftGain - Ganancia hacia L (0.0 = off, 1.0 = full)
   * @param {number} rightGain - Ganancia hacia R (0.0 = off, 1.0 = full)
   */
  setOutputRouting(busIndex, leftGain, rightGain) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return;
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (!ctx || !bus) {
      // Guardar para aplicar después del start()
      this._pendingRouting = this._pendingRouting || [];
      this._pendingRouting[busIndex] = { leftGain, rightGain };
      return;
    }
    setParamSmooth(bus.panLeft.gain, leftGain, ctx);
    setParamSmooth(bus.panRight.gain, rightGain, ctx);
  }

  /**
   * Obtiene el ruteo actual de una salida
   * @param {number} busIndex
   * @returns {{ left: number, right: number } | null}
   */
  getOutputRouting(busIndex) {
    const bus = this.outputBuses[busIndex];
    if (!bus) return null;
    return {
      left: bus.panLeft?.gain?.value ?? 0,
      right: bus.panRight?.gain?.value ?? 0
    };
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
    const value = this.muted ? 0 : this.masterBaseGain;
    setParamSmooth(this.masterL.gain, value, this.audioCtx);
    setParamSmooth(this.masterR.gain, value, this.audioCtx);
  }

  toggleMute() {
    this.setMute(!this.muted);
  }

  /**
   * Carga los AudioWorklets del sistema.
   * Se llama automáticamente en start(), pero puede llamarse antes si se necesita.
   * @returns {Promise<void>}
   */
  async _loadWorklet() {
    if (this._workletLoadPromise) return this._workletLoadPromise;
    if (!this.audioCtx) return Promise.resolve();

    this._workletLoadPromise = (async () => {
      try {
        // Cargar todos los worklets necesarios
        const worklets = [
          './assets/js/worklets/synthOscillator.worklet.js',
          './assets/js/worklets/scopeCapture.worklet.js',
          './assets/js/worklets/noiseGenerator.worklet.js'
        ];
        
        await Promise.all(
          worklets.map(path => this.audioCtx.audioWorklet.addModule(path))
        );
        
        this.workletReady = true;
        console.log('[AudioEngine] All worklets loaded:', worklets.length);
      } catch (err) {
        console.error('[AudioEngine] Failed to load worklet:', err);
        this.workletReady = false;
      }
    })();

    return this._workletLoadPromise;
  }

  /**
   * Espera a que el worklet esté listo antes de crear nodos.
   * @returns {Promise<boolean>} true si el worklet está disponible
   */
  async ensureWorkletReady() {
    if (this.workletReady) return true;
    
    // Si no hay contexto de audio, iniciarlo primero
    if (!this.audioCtx) {
      this.start();
    }
    
    // Si no hay promesa de carga, iniciar carga
    if (!this._workletLoadPromise) {
      this._loadWorklet();
    }
    
    // Esperar a que termine la carga
    if (this._workletLoadPromise) {
      await this._workletLoadPromise;
      return this.workletReady;
    }
    return false;
  }

  /**
   * Crea un nodo SynthOscillator con fase coherente.
   * @param {Object} options - Opciones iniciales
   * @param {string} [options.waveform='pulse'] - Tipo de onda: 'pulse' o 'sine'
   * @param {number} [options.frequency=440] - Frecuencia inicial
   * @param {number} [options.pulseWidth=0.5] - Ancho de pulso inicial (0.01-0.99) para pulse
   * @param {number} [options.symmetry=0.5] - Simetría inicial (0.01-0.99) para sine
   * @param {number} [options.gain=1.0] - Ganancia inicial
   * @returns {AudioWorkletNode|null} El nodo o null si worklet no disponible
   */
  createSynthOscillator(options = {}) {
    if (!this.audioCtx || !this.workletReady) {
      console.warn('[AudioEngine] Worklet not ready, cannot create SynthOscillator');
      return null;
    }

    const { 
      waveform = 'pulse',
      frequency = 440, 
      pulseWidth = 0.5, 
      symmetry = 0.5,
      gain = 1.0 
    } = options;

    const node = new AudioWorkletNode(this.audioCtx, 'synth-oscillator', {
      numberOfInputs: 1,  // Input para sync
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { waveform }
    });

    // Establecer valores iniciales
    node.parameters.get('frequency').value = frequency;
    node.parameters.get('pulseWidth').value = pulseWidth;
    node.parameters.get('symmetry').value = symmetry;
    node.parameters.get('gain').value = gain;

    // Métodos de conveniencia
    node.setFrequency = (value, ramp = 0.01) => {
      const param = node.parameters.get('frequency');
      const now = this.audioCtx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, ramp);
    };

    node.setPulseWidth = (value, ramp = 0.01) => {
      const param = node.parameters.get('pulseWidth');
      const now = this.audioCtx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(Math.max(0.01, Math.min(0.99, value)), now, ramp);
    };

    node.setSymmetry = (value, ramp = 0.01) => {
      const param = node.parameters.get('symmetry');
      const now = this.audioCtx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(Math.max(0.01, Math.min(0.99, value)), now, ramp);
    };

    node.setGain = (value, ramp = 0.01) => {
      const param = node.parameters.get('gain');
      const now = this.audioCtx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, ramp);
    };

    node.setWaveform = (wf) => {
      node.port.postMessage({ type: 'setWaveform', waveform: wf });
    };

    node.resetPhase = () => {
      node.port.postMessage({ type: 'resetPhase' });
    };

    node.stop = () => {
      node.port.postMessage({ type: 'stop' });
    };

    return node;
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
