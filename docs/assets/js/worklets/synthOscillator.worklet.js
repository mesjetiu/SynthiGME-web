/**
 * SynthOscillator AudioWorklet Processor
 * 
 * Oscilador con control de fase para síntesis con:
 * - Pulse width modulable sin clicks (fase coherente)
 * - Sine symmetry modulable sin clicks (fase coherente)
 * - Soporte para hard sync (reset de fase externo)
 * 
 * @version 0.2.0 - Añadido sine con symmetry
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
      }
    ];
  }

  constructor(options) {
    super();
    this.phase = 0;
    this.lastSyncSample = -1;
    this.isRunning = true;
    
    // Tipo de onda: 'pulse' o 'sine'
    this.waveform = options?.processorOptions?.waveform || 'pulse';

    // Escuchar mensajes del hilo principal
    this.port.onmessage = (event) => {
      if (event.data.type === 'stop') {
        this.isRunning = false;
      } else if (event.data.type === 'resetPhase') {
        this.phase = 0;
      } else if (event.data.type === 'setWaveform') {
        this.waveform = event.data.waveform;
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

  process(inputs, outputs, parameters) {
    if (!this.isRunning) return false;

    const output = outputs[0];
    const syncInput = inputs[0]?.[0]; // Input 0 para señal de sync
    
    const freqParam = parameters.frequency;
    const widthParam = parameters.pulseWidth;
    const symmetryParam = parameters.symmetry;
    const gainParam = parameters.gain;

    const numSamples = output[0]?.length || 128;

    for (let i = 0; i < numSamples; i++) {
      // Obtener valores de parámetros (a-rate o k-rate)
      const freq = freqParam.length > 1 ? freqParam[i] : freqParam[0];
      const width = widthParam.length > 1 ? widthParam[i] : widthParam[0];
      const symmetry = symmetryParam.length > 1 ? symmetryParam[i] : symmetryParam[0];
      const gain = gainParam.length > 1 ? gainParam[i] : gainParam[0];

      // Hard sync: detectar flanco positivo en señal de entrada
      if (syncInput && syncInput.length > i) {
        const syncSample = syncInput[i];
        if (syncSample > 0 && this.lastSyncSample <= 0) {
          this.phase = 0; // Reset instantáneo de fase
        }
        this.lastSyncSample = syncSample;
      }

      // Calcular delta de fase
      const dt = freq / sampleRate;

      // Generar sample según tipo de onda
      let sample;
      if (this.waveform === 'sine') {
        sample = this.generateAsymmetricSine(this.phase, symmetry);
      } else {
        // pulse (default)
        sample = this.generatePulse(this.phase, width, dt);
      }

      // Aplicar ganancia
      sample *= gain;

      // Escribir a todos los canales de salida
      for (let channel = 0; channel < output.length; channel++) {
        output[channel][i] = sample;
      }

      // Avanzar fase (siempre continua, nunca salta)
      this.phase += dt;
      if (this.phase >= 1) {
        this.phase -= 1;
      }
    }

    return true;
  }
}

registerProcessor('synth-oscillator', SynthOscillatorProcessor);
