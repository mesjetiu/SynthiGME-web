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
    
    // Dormancy: cuando true, el worklet no procesa (early exit)
    this.dormant = false;
    
    // Modo: 'single' (1 waveform, 1 output) o 'multi' (4 waveforms, 2 outputs)
    this.mode = options?.processorOptions?.mode || 'single';
    
    // Tipo de onda para modo single: 'pulse', 'sine', 'triangle', 'sawtooth'
    this.waveform = options?.processorOptions?.waveform || 'pulse';
    
    // Atenuación histórica del Sine Shape:
    // Factor de reducción de amplitud en extremos del control Shape.
    // Según manual Synthi 100: seno = 4V p-p, cuspoide = 0.5V p-p → ratio 8:1
    // 0.0 = sin atenuación (amplitud constante)
    // 1.0 = atenuación completa según hardware (8:1 en extremos)
    // Por defecto 1.0 para emular comportamiento histórico.
    this.sineShapeAttenuation = options?.processorOptions?.sineShapeAttenuation ?? 1.0;
    
    // Pureza del seno en el centro (Symmetry = 0.5):
    // Controla cuánto seno digital puro se mezcla en el centro.
    // 1.0 = seno puro perfecto en el centro (sin armónicos)
    // 0.0 = 100% componente analógica incluso en el centro (conserva carácter del circuito)
    // Valores intermedios permiten mantener algo de "coloración" analógica.
    // Por defecto 0.7 para conservar algo del carácter electrónico.
    this.sinePurity = options?.processorOptions?.sinePurity ?? 0.7;
    
    // Coeficiente de saturación k para tanh waveshaper:
    // Controla la "dureza" de la saturación.
    // 1.0 = saturación muy suave, 1.55 = default calibrado, 2.0 = más pronunciada
    this.saturationK = options?.processorOptions?.saturationK ?? 1.55;
    
    // Offset máximo de asimetría:
    // Define cuánto offset DC se aplica a la triangular antes del tanh.
    // 0.5 = deformación moderada, 0.85 = default, 1.0 = máxima
    this.maxOffset = options?.processorOptions?.maxOffset ?? 0.85;

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
      } else if (event.data.type === 'setDormant') {
        this.dormant = event.data.dormant;
        // Log en consola del worklet (visible en DevTools > Sources > Threads)
        console.log(`[Worklet] Oscillator dormant: ${this.dormant}`);
      } else if (event.data.type === 'setSineShapeAttenuation') {
        this.sineShapeAttenuation = event.data.value;
      } else if (event.data.type === 'setSinePurity') {
        this.sinePurity = event.data.value;
      } else if (event.data.type === 'setSaturationK') {
        this.saturationK = event.data.value;
      } else if (event.data.type === 'setMaxOffset') {
        this.maxOffset = event.data.value;
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
   * Genera onda sine con simetría variable (Estilo Synthi 100)
   * 
   * HYBRID APPROACH (Implementado Enero 2026):
   * Basado en análisis de diagramas de circuito del Synthi 100 y manual del GME Cuenca.
   * 
   * 1. Centro (Symmetry 0.5): 
   *    Generación digital pura (Math.cos). Garantiza ausencia total de armónicos.
   * 
   * 2. Extremos (Symmetry -> 0 o 1):
   *    Emulación analógica mediante Waveshaper (Tanh) aplicado a un núcleo triangular.
   *    Produce la característica deformación de "Vientre Redondo / Punta Aguda" 
   *    con saturación suave y cruce por cero lineal.
   * 
   * 3. Transición:
   *    Crossfade suave basado en la distancia al centro.
   * 
   * @param {number} phase - Fase actual (0 a 1)
   * @param {number} symmetry - Valor de simetría (0 a 1)
   * @param {number|null} precomputedTri - Optimización: triángulo estándar (-1 a 1) pre-calculado.
   */
  generateAsymmetricSine(phase, symmetry, precomputedTri = null) {
    // === 1. Componente ANALÓGICA (Triángulo + Tanh) ===
    
    let tri;
    
    // Optimización: Si ya tenemos el triángulo alineado (Standard: Phase 0 = Peak +1),
    // lo usamos directamente. Ya NO necesitamos invertirlo.
    if (precomputedTri !== null) {
      tri = precomputedTri;
    } else {
      // Cálculo manual si no se provee (ej. modo single)
      // Debe coincidir con el generateTriangle actualizado:
      // Phase 0 -> +1 (Peak), Phase 0.5 -> -1 (Valley)
      const triPhase = phase % 1; // Ya no necesitamos offset +0.5
      if (triPhase < 0.5) {
        tri = 1 - 4 * triPhase;
      } else {
        tri = 4 * triPhase - 3;
      }
    }
    
    // Offset para asimetría (configurable via panel3.config.js)
    const offset = (0.5 - symmetry) * 2.0 * this.maxOffset;
    
    // Waveshaping (Tanh) - k configurable via panel3.config.js
    // Default k=1.55 basado en ajuste visual "poco más de 1/4 de recorrido"
    const k = this.saturationK;
    const analogRaw = Math.tanh(k * (tri + offset));
    
    // Corrección DC y Normalización
    const maxVal = Math.tanh(k * (1 + offset));
    const minVal = Math.tanh(k * (-1 + offset));
    const scale = 2.0 / (maxVal - minVal);
    const dcCorrection = (maxVal + minVal) * 0.5;
    
    const analogSine = (analogRaw - dcCorrection) * scale;

    // === 2. Componente DIGITAL (Seno Puro) ===
    // Solo se calcula si estamos cerca del centro para eficiencia, 
    // pero siempre necesitamos alinearla: Math.cos(2PI*phase) empieza en 1 (Peak)
    const pureSine = Math.cos(phase * 2 * Math.PI);

    // === 3. MEZCLA (Crossfade) ===
    // Distancia al centro normalizada (0.0 en centro, 1.0 en extremos)
    const dist = Math.abs(symmetry - 0.5) * 2.0;
    
    // Curva de mezcla:
    // Queremos que el seno puro domine en el centro y desaparezca rápido
    // para dejar paso al carácter analógico.
    // Usamos una potencia para que la "zona pura" sea estrecha pero suave.
    const analogMix = Math.pow(dist, 0.5); // Raíz cuadrada hace que el carácter entre rápido
    
    // Aplicar sinePurity: limita cuánto seno puro se usa en el centro.
    // Si sinePurity=1, en el centro (dist=0) se usa 100% seno puro.
    // Si sinePurity=0.7, en el centro se usa 70% puro + 30% analógico.
    const pureMix = (1 - analogMix) * this.sinePurity;
    const analogFinal = 1 - pureMix; // El resto es analógico
    
    // Interpolación: pureMix de digital + analogFinal de analógico
    const mixedSine = pureSine * pureMix + analogSine * analogFinal;
    
    // === 4. ATENUACIÓN HISTÓRICA ===
    // Emula la reducción de amplitud del hardware original.
    // Manual Synthi 100: seno 4V p-p → cuspoide 0.5V p-p (ratio 8:1)
    // Curva cuadrática: suave en centro, pronunciada en extremos.
    // dist=0 → attenuation=1.0, dist=1 → attenuation=0.125
    if (this.sineShapeAttenuation > 0) {
      const minAmp = 0.125; // 1/8 = 0.5V/4V del manual
      // Interpolación: 1.0 - dist² * (1 - minAmp) * attenuationFactor
      const attenuation = 1.0 - (dist * dist) * (1.0 - minAmp) * this.sineShapeAttenuation;
      return mixedSine * attenuation;
    }
    
    return mixedSine;
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
   * ALINEACIÓN DE FASE:
   * Phase 0 -> +1 (Peak)
   * Phase 0.5 -> -1 (Valley)
   * Esto la alinea con el pico positivo del Sine y el reinicio del Sawtooth.
   */
  generateTriangle(phase, dt) {
    let sample;
    if (phase < 0.5) {
      // Downward slope: 1 -> -1 (Phase 0 to 0.5)
      // Original (-1->1): 4*p - 1
      // Inverted (1->-1): 1 - 4*p
      sample = 1 - 4 * phase;
    } else {
      // Upward slope: -1 -> 1 (Phase 0.5 to 1.0)
      // Original (1->-1): 3 - 4*p
      // Inverted (-1->1): 4*p - 3
      sample = 4 * phase - 3;
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

      // Generar formas de onda
      // Optimización: Reutilizamos el cálculo de triángulo para el seno
      const rawTri = this.generateTriangle(this.phase, dt);
      
      const sine = this.generateAsymmetricSine(this.phase, symmetry, rawTri) * sineLevel;
      const saw = this.generateSawtooth(this.phase, dt) * sawLevel;
      const tri = rawTri * triLevel;
      // 3. Pulse: Shift Phase by +0.25 (90 degrees)
      // ALINEACIÓN: Centra el estado HIGH del pulso alrededor del ciclo positivo del Seno.
      // Así, Phase 0 (Sine Peak) = Centro del Pulse HIGH.
      const pulsePhase = (this.phase + 0.25) % 1; 
      const pulse = this.generatePulse(pulsePhase, width, dt) * pulseLevel;

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

    // ─────────────────────────────────────────────────────────────────────────
    // DORMANCY: Early exit - no procesar formas de onda, solo silencio
    // La fase se mantiene para preservar coherencia al despertar
    // ─────────────────────────────────────────────────────────────────────────
    if (this.dormant) {
      // Llenar outputs con ceros (silencio)
      for (const output of outputs) {
        for (const channel of output) {
          channel.fill(0);
        }
      }
      return true; // Mantener el nodo activo pero sin procesar
    }

    if (this.mode === 'multi') {
      this.processMulti(outputs, inputs, parameters, numSamples);
    } else {
      this.processSingle(outputs, inputs, parameters, numSamples);
    }

    return true;
  }
}

registerProcessor('synth-oscillator', SynthOscillatorProcessor);
