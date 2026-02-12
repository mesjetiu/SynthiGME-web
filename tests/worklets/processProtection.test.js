/**
 * Tests para protección try/catch en process() de worklets críticos.
 * 
 * Verifica que los worklets:
 * - Capturan errores en process() sin propagarlos
 * - Producen silencio limpio (zeros) ante un error
 * - Envían port.postMessage con type='process-error' una sola vez
 * - Mantienen el nodo activo (return true) incluso tras error
 * 
 * Fase 2 del plan de telemetría.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mock del entorno de AudioWorklet ───
// Los worklets se ejecutan en un scope especial. Simulamos lo mínimo necesario.

function createWorkletEnvironment() {
  // Variables globales que los worklets esperan
  globalThis.sampleRate = 48000;
  globalThis.currentTime = 0;
  globalThis.currentFrame = 0;
  
  // Clase base de AudioWorkletProcessor
  if (!globalThis.AudioWorkletProcessor) {
    globalThis.AudioWorkletProcessor = class AudioWorkletProcessor {
      constructor() {
        this.port = {
          onmessage: null,
          postMessage: () => {}
        };
      }
    };
  }
  
  // registerProcessor mock
  const registered = {};
  globalThis.registerProcessor = (name, cls) => {
    registered[name] = cls;
  };
  
  return registered;
}

/**
 * Crea outputs mock con Float32Arrays de tamaño dado
 */
function createOutputs(numOutputs, numChannels, length) {
  return Array.from({ length: numOutputs }, () =>
    Array.from({ length: numChannels }, () => new Float32Array(length))
  );
}

/**
 * Crea inputs vacíos
 */
function createEmptyInputs(numInputs = 1) {
  return Array.from({ length: numInputs }, () => []);
}

/**
 * Crea parámetros mock para un procesador (k-rate: 1 valor)
 */
function createParameters(paramMap) {
  const params = {};
  for (const [key, value] of Object.entries(paramMap)) {
    params[key] = new Float32Array([value]);
  }
  return params;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: synthOscillator
// ─────────────────────────────────────────────────────────────────────────────

describe('synthOscillator.worklet — protección process()', () => {
  let SynthOscillatorProcessor;
  
  beforeEach(async () => {
    const registered = createWorkletEnvironment();
    // Import fresh copy
    await import(`../../src/assets/js/worklets/synthOscillator.worklet.js?t=${Date.now()}`);
    SynthOscillatorProcessor = registered['synth-oscillator'];
  });
  
  it('debe registrar el procesador synth-oscillator', () => {
    assert.ok(SynthOscillatorProcessor, 'Procesador debe estar registrado');
  });
  
  it('process() retorna true en operación normal', () => {
    const proc = new SynthOscillatorProcessor({ processorOptions: { mode: 'single', waveform: 'sine' } });
    const outputs = createOutputs(1, 1, 128);
    const inputs = createEmptyInputs();
    const params = createParameters({
      frequency: 440, detune: 0, pulseWidth: 0.5, symmetry: 0.5, gain: 1,
      sineLevel: 1, sawLevel: 0, triLevel: 0, pulseLevel: 0
    });
    
    const result = proc.process(inputs, outputs, params);
    assert.equal(result, true);
  });
  
  it('process() produce silencio y reporta error si processSingle falla', () => {
    const proc = new SynthOscillatorProcessor({ processorOptions: { mode: 'single', waveform: 'sine' } });
    
    // Forzar error inyectando un método roto
    proc.processSingle = () => { throw new Error('test explosion'); };
    
    const messages = [];
    proc.port.postMessage = (msg) => messages.push(msg);
    
    const outputs = createOutputs(1, 1, 128);
    // Poner basura en el output para verificar que se llena con zeros
    outputs[0][0].fill(0.999);
    
    const result = proc.process(createEmptyInputs(), outputs, createParameters({
      frequency: 440, detune: 0, pulseWidth: 0.5, symmetry: 0.5, gain: 1,
      sineLevel: 1, sawLevel: 0, triLevel: 0, pulseLevel: 0
    }));
    
    assert.equal(result, true, 'Debe retornar true para mantener nodo activo');
    
    // Verificar silencio
    for (const sample of outputs[0][0]) {
      assert.equal(sample, 0, 'Output debe ser silencio (0)');
    }
    
    // Verificar reporte de error
    assert.equal(messages.length, 1, 'Debe enviar un mensaje de error');
    assert.equal(messages[0].type, 'process-error');
    assert.ok(messages[0].message.includes('test explosion'));
  });
  
  it('solo reporta el error una vez (flag _processErrorReported)', () => {
    const proc = new SynthOscillatorProcessor({ processorOptions: { mode: 'single', waveform: 'sine' } });
    proc.processSingle = () => { throw new Error('repeated'); };
    
    const messages = [];
    proc.port.postMessage = (msg) => messages.push(msg);
    
    const outputs = createOutputs(1, 1, 128);
    const params = createParameters({
      frequency: 440, detune: 0, pulseWidth: 0.5, symmetry: 0.5, gain: 1,
      sineLevel: 1, sawLevel: 0, triLevel: 0, pulseLevel: 0
    });
    
    // Llamar process() múltiples veces
    proc.process(createEmptyInputs(), outputs, params);
    proc.process(createEmptyInputs(), outputs, params);
    proc.process(createEmptyInputs(), outputs, params);
    
    assert.equal(messages.length, 1, 'Solo debe reportar 1 vez');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: vcaProcessor
// ─────────────────────────────────────────────────────────────────────────────

describe('vcaProcessor.worklet — protección process()', () => {
  let VCAProcessor;
  
  beforeEach(async () => {
    const registered = createWorkletEnvironment();
    await import(`../../src/assets/js/worklets/vcaProcessor.worklet.js?t=${Date.now()}`);
    VCAProcessor = registered['vca-processor'];
  });
  
  it('debe registrar el procesador vca-processor', () => {
    assert.ok(VCAProcessor, 'Procesador debe estar registrado');
  });
  
  it('process() produce silencio y reporta si voltageToGain falla', () => {
    const proc = new VCAProcessor();
    
    // Inyectar fallo
    proc.voltageToGain = () => { throw new Error('vca crash'); };
    
    const messages = [];
    proc.port.postMessage = (msg) => messages.push(msg);
    
    // Crear inputs con audio real
    const audioInput = [new Float32Array(128).fill(0.5)];
    const cvInput = [new Float32Array(128).fill(0.1)];
    const inputs = [audioInput, cvInput];
    const outputs = createOutputs(1, 1, 128);
    outputs[0][0].fill(0.999);
    
    const params = createParameters({
      dialVoltage: -6, cvScale: 12, cutoffEnabled: 0, slewTime: 0.005
    });
    
    const result = proc.process(inputs, outputs, params);
    assert.equal(result, true, 'Debe retornar true');
    
    // Verificar silencio
    for (const sample of outputs[0][0]) {
      assert.equal(sample, 0, 'Output debe ser 0');
    }
    
    // Verificar reporte único
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'process-error');
  });
  
  it('solo reporta el error una vez', () => {
    const proc = new VCAProcessor();
    proc.voltageToGain = () => { throw new Error('vca crash'); };
    
    const messages = [];
    proc.port.postMessage = (msg) => messages.push(msg);
    
    const audioInput = [new Float32Array(128).fill(0.5)];
    const cvInput = [new Float32Array(128).fill(0.1)];
    const params = createParameters({
      dialVoltage: -6, cvScale: 12, cutoffEnabled: 0, slewTime: 0.005
    });
    
    proc.process([audioInput, cvInput], createOutputs(1, 1, 128), params);
    proc.process([audioInput, cvInput], createOutputs(1, 1, 128), params);
    
    assert.equal(messages.length, 1, 'Solo debe reportar 1 vez');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: noiseGenerator
// ─────────────────────────────────────────────────────────────────────────────

describe('noiseGenerator.worklet — protección process()', () => {
  let NoiseGeneratorProcessor;
  
  beforeEach(async () => {
    const registered = createWorkletEnvironment();
    await import(`../../src/assets/js/worklets/noiseGenerator.worklet.js?t=${Date.now()}`);
    NoiseGeneratorProcessor = registered['noise-generator'];
  });
  
  it('debe registrar el procesador noise-generator', () => {
    assert.ok(NoiseGeneratorProcessor, 'Procesador debe estar registrado');
  });
  
  it('process() produce silencio y reporta si Math.random falla dentro del try', () => {
    const proc = new NoiseGeneratorProcessor();
    
    // Inyectar fallo sustituyendo la propiedad interna que causa crash
    // Saboteamos _Kinv para que produzca NaN → que escalaría a un error
    // Mejor: sobrescribir directamente una propiedad con un getter que explote
    const origRandom = Math.random;
    let callCount = 0;
    Math.random = () => {
      callCount++;
      if (callCount > 2) throw new Error('noise crash');
      return origRandom();
    };
    
    const messages = [];
    proc.port.postMessage = (msg) => messages.push(msg);
    
    const outputs = createOutputs(1, 1, 128);
    outputs[0][0].fill(0.999);
    const params = createParameters({ colourPosition: 0 });
    
    const result = proc.process(createEmptyInputs(), outputs, params);
    
    // Restaurar Math.random
    Math.random = origRandom;
    
    assert.equal(result, true, 'Debe retornar true');
    
    // Verificar silencio
    for (const sample of outputs[0][0]) {
      assert.equal(sample, 0, 'Output debe ser 0');
    }
    
    assert.equal(messages.length, 1, 'Debe reportar error');
    assert.equal(messages[0].type, 'process-error');
  });
  
  it('solo reporta el error una vez', () => {
    const proc = new NoiseGeneratorProcessor();
    
    const origRandom = Math.random;
    Math.random = () => { throw new Error('noise repeat'); };
    
    const messages = [];
    proc.port.postMessage = (msg) => messages.push(msg);
    
    const params = createParameters({ colourPosition: 0 });
    
    proc.process(createEmptyInputs(), createOutputs(1, 1, 128), params);
    proc.process(createEmptyInputs(), createOutputs(1, 1, 128), params);
    proc.process(createEmptyInputs(), createOutputs(1, 1, 128), params);
    
    Math.random = origRandom;
    
    assert.equal(messages.length, 1, 'Solo debe reportar 1 vez');
  });
});
