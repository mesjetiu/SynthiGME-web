/**
 * SynthOscillator AudioWorklet Processor
 * 
 * Oscilador multi-waveform con fase maestra unificada:
 * - 4 formas de onda (sine, sawtooth, triangle, pulse) generadas desde una única fase
 * - La fase maestra es la rampa del sawtooth (0→1), garantizando coherencia
 * - Pulse width y sine symmetry modulables sin clicks
 * - Anti-aliasing PolyBLEP en todas las discontinuidades
 * - Soporte para hard sync (reset de fase desde señal externa)
 * 
 * MODOS DE OPERACIÓN:
 * - 'single': Una forma de onda, 1 salida (compatibilidad legacy)
 * - 'multi': 4 formas de onda, 2 salidas (sine+saw, tri+pulse)
 * 
 * @version 0.4.0 - Fase maestra unificada + preparación hard sync
 */

class SynthOscillatorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'frequency',
        defaultValue: 440,
        minValue: 0.01,
        maxValue: 22050,
        automationRate: 'a-rate'
      },
      {
        name: 'detune',
        defaultValue: 0,
        minValue: -12000,  // ±10 octavas
        maxValue: 12000,
        automationRate: 'a-rate'
      },
      {
        name: 'pulseWidth',
        defaultValue: 0.5,
        minValue: 0.01,
        maxValue: 0.99,
        automationRate: 'a-rate'
      },
      {
        name: 'symmetry',
        defaultValue: 0.5,
        minValue: 0.01,
        maxValue: 0.99,
        automationRate: 'a-rate'
      },
      {
        name: 'gain',
        defaultValue: 1.0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      },
      // Niveles individuales para modo multi
      {
        name: 'sineLevel',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      },
      {
        name: 'sawLevel',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      },
      {
        name: 'triLevel',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      },
      {
        name: 'pulseLevel',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      }
    ];
  }

  constructor(options) {
    super();
    // Fase maestra: rampa 0→1 (= sawtooth normalizado)
    this.phase = 0;
    this.lastSyncSample = -1;
    this.isRunning = true;
    this._syncDebugCounter = 0; // Debug: contador para logs
    
    // Modo: 'single' (1 waveform, 1 output) o 'multi' (4 waveforms, 2 outputs)
    this.mode = options?.processorOptions?.mode || 'single';
    
    // Tipo de onda para modo single: 'pulse', 'sine', 'triangle', 'sawtooth'
    this.waveform = options?.processorOptions?.waveform || 'pulse';

    // Escuchar mensajes del hilo principal
    this.port.onmessage = (event) => {
      if (event.data.type === 'stop') {
        this.isRunning = false;
      } else if (event.data.type === 'resetPhase') {
        this.phase = 0;
      } else if (event.data.type === 'setWaveform') {
        this.waveform = event.data.waveform;
      } else if (event.data.type === 'setMode') {
        this.mode = event.data.mode;
      }
    };
  }

  /**
   * PolyBLEP para reducir aliasing en transiciones bruscas
   */
  polyBlep(t, dt) {
    if (t < dt) {
      const t0 = t / dt;
      return t0 + t0 - t0 * t0 - 1;
    } else if (t > 1 - dt) {
      const t0 = (t - 1) / dt;
      return t0 * t0 + t0 + t0 + 1;
    }
    return 0;
  }

  /**
   * Genera onda pulse con duty cycle variable
   */
  generatePulse(phase, width, dt) {
    let sample = phase < width ? 1 : -1;
    // Aplicar PolyBLEP en las transiciones
    sample += this.polyBlep(phase, dt);
    sample -= this.polyBlep((phase + 1 - width) % 1, dt);
    return sample;
  }

  /**
   * Genera onda sine con simetría variable (asimétrica)
   * symmetry = 0.5 es sine normal
   * < 0.5 comprime la mitad positiva, > 0.5 comprime la negativa
   */
  generateAsymmetricSine(phase, symmetry) {
    // Transformar fase según simetría
    let transformedPhase;
    
    if (phase < symmetry) {
      // Primera mitad del ciclo (subida)
      transformedPhase = (phase / symmetry) * 0.5;
    } else {
      // Segunda mitad del ciclo (bajada)
      transformedPhase = 0.5 + ((phase - symmetry) / (1 - symmetry)) * 0.5;
    }
    
    // Generar sine con fase transformada
    return Math.sin(transformedPhase * 2 * Math.PI);
  }

  /**
   * Genera onda sawtooth con anti-aliasing PolyBLEP
   * Rango: -1 a +1
   */
  generateSawtooth(phase, dt) {
    // Sawtooth naive: rampa de -1 a +1
    let sample = 2 * phase - 1;
    // Aplicar PolyBLEP en la discontinuidad (fase = 0/1)
    sample -= this.polyBlep(phase, dt);
    return sample;
  }

  /**
   * Genera onda triangle con anti-aliasing
   * Derivada del sawtooth integrado
   */
  generateTriangle(phase, dt) {
    // Triangle: valor absoluto del sawtooth escalado
    // Más eficiente: cálculo directo
    let sample;
    if (phase < 0.5) {
      sample = 4 * phase - 1;
    } else {
      sample = 3 - 4 * phase;
    }
    return sample;
  }

  /**
   * Procesa modo single: una forma de onda, una salida
   */
  processSingle(outputs, inputs, parameters, numSamples) {
    const output = outputs[0];
    const syncInput = inputs[0]?.[0];
    
    const freqParam = parameters.frequency;
    const detuneParam = parameters.detune;
    const widthParam = parameters.pulseWidth;
    const symmetryParam = parameters.symmetry;
    const gainParam = parameters.gain;

    for (let i = 0; i < numSamples; i++) {
      const baseFreq = freqParam.length > 1 ? freqParam[i] : freqParam[0];
      const detuneCents = detuneParam.length > 1 ? detuneParam[i] : detuneParam[0];
      const freq = baseFreq * Math.pow(2, detuneCents / 1200);
      const width = widthParam.length > 1 ? widthParam[i] : widthParam[0];
      const symmetry = symmetryParam.length > 1 ? symmetryParam[i] : symmetryParam[0];
      const gain = gainParam.length > 1 ? gainParam[i] : gainParam[0];

      // Hard sync
      if (syncInput && syncInput.length > i) {
        const syncSample = syncInput[i];
        if (syncSample > 0 && this.lastSyncSample <= 0) {
          this.phase = 0;
        }
        this.lastSyncSample = syncSample;
      }

      const dt = freq / sampleRate;

      let sample;
      switch (this.waveform) {
        case 'sine':
          sample = this.generateAsymmetricSine(this.phase, symmetry);
          break;
        case 'triangle':
          sample = this.generateTriangle(this.phase, dt);
          break;
        case 'sawtooth':
          sample = this.generateSawtooth(this.phase, dt);
          break;
        default:
          sample = this.generatePulse(this.phase, width, dt);
      }

      sample *= gain;

      for (let channel = 0; channel < output.length; channel++) {
        output[channel][i] = sample;
      }

      this.phase += dt;
      if (this.phase >= 1) this.phase -= 1;
    }
  }

  /**
   * Procesa modo multi: 4 formas de onda desde fase maestra, 2 salidas
   * - Output 0: sine + sawtooth (mezcla en main thread)
   * - Output 1: triangle + pulse (mezcla en main thread)
   * 
   * ARQUITECTURA DE FASE MAESTRA:
   * La fase (0→1) es una rampa lineal = sawtooth normalizado.
   * Todas las formas de onda derivan de esta fase:
   * - Sawtooth: 2*phase - 1 (la fase misma, escalada)
   * - Sine: sin(transformPhase(phase) * 2π)
   * - Triangle: |2*phase - 1| escalado
   * - Pulse: phase < width ? 1 : -1
   * 
   * Esto garantiza coherencia perfecta entre formas de onda.
   */
  processMulti(outputs, inputs, parameters, numSamples) {
    const output0 = outputs[0]; // sine + saw
    const output1 = outputs[1]; // tri + pulse
    const syncInput = inputs[0]?.[0];
    
    // Debug: verificar que llega señal de sync (solo cada ~1 segundo)
    if (syncInput && syncInput.length > 0) {
      this._syncDebugCounter = (this._syncDebugCounter || 0) + 1;
      if (this._syncDebugCounter % 375 === 1) { // ~1 vez por segundo a 48kHz
        const maxVal = Math.max(...syncInput.slice(0, 32));
        const minVal = Math.min(...syncInput.slice(0, 32));
        console.log(`[SynthOsc] Sync input received: min=${minVal.toFixed(3)}, max=${maxVal.toFixed(3)}, len=${syncInput.length}`);
      }
    }
    
    const freqParam = parameters.frequency;
    const detuneParam = parameters.detune;
    const widthParam = parameters.pulseWidth;
    const symmetryParam = parameters.symmetry;
    const sineLevelParam = parameters.sineLevel;
    const sawLevelParam = parameters.sawLevel;
    const triLevelParam = parameters.triLevel;
    const pulseLevelParam = parameters.pulseLevel;

    for (let i = 0; i < numSamples; i++) {
      const baseFreq = freqParam.length > 1 ? freqParam[i] : freqParam[0];
      const detuneCents = detuneParam.length > 1 ? detuneParam[i] : detuneParam[0];
      const freq = baseFreq * Math.pow(2, detuneCents / 1200);
      const width = widthParam.length > 1 ? widthParam[i] : widthParam[0];
      const symmetry = symmetryParam.length > 1 ? symmetryParam[i] : symmetryParam[0];
      const sineLevel = sineLevelParam.length > 1 ? sineLevelParam[i] : sineLevelParam[0];
      const sawLevel = sawLevelParam.length > 1 ? sawLevelParam[i] : sawLevelParam[0];
      const triLevel = triLevelParam.length > 1 ? triLevelParam[i] : triLevelParam[0];
      const pulseLevel = pulseLevelParam.length > 1 ? pulseLevelParam[i] : pulseLevelParam[0];

      // Hard sync: flanco positivo resetea fase
      if (syncInput && syncInput.length > i) {
        const syncSample = syncInput[i];
        if (syncSample > 0 && this.lastSyncSample <= 0) {
          this.phase = 0;
        }
        this.lastSyncSample = syncSample;
      }

      const dt = freq / sampleRate;

      // Generar las 4 formas de onda desde la fase maestra
      const sine = this.generateAsymmetricSine(this.phase, symmetry) * sineLevel;
      const saw = this.generateSawtooth(this.phase, dt) * sawLevel;
      const tri = this.generateTriangle(this.phase, dt) * triLevel;
      const pulse = this.generatePulse(this.phase, width, dt) * pulseLevel;

      // Output 0: sine + saw
      if (output0 && output0[0]) {
        output0[0][i] = sine + saw;
      }
      
      // Output 1: tri + pulse
      if (output1 && output1[0]) {
        output1[0][i] = tri + pulse;
      }

      // Avanzar fase maestra
      this.phase += dt;
      if (this.phase >= 1) this.phase -= 1;
    }
  }

  process(inputs, outputs, parameters) {
    if (!this.isRunning) return false;

    const numSamples = outputs[0]?.[0]?.length || 128;

    if (this.mode === 'multi') {
      this.processMulti(outputs, inputs, parameters, numSamples);
    } else {
      this.processSingle(outputs, inputs, parameters, numSamples);
    }

    return true;
  }
}

registerProcessor('synth-oscillator', SynthOscillatorProcessor);
