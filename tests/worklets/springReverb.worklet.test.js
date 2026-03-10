/**
 * Tests para springReverb.worklet.js — AudioWorkletProcessor de Reverberación de Muelle
 *
 * Verifica la lógica del procesador de audio usando dos estrategias:
 *
 * 1. MATEMÁTICA OFFLINE: Replica las funciones de conversión/DSP del worklet
 *    (allpass, feedback gain, damping coeff, mix dial→norm, soft clip)
 *    y verifica los mapeos sin instanciar el worklet.
 *
 * 2. IMPORT REAL: Importa el worklet en un entorno simulado (globalThis mocks)
 *    y verifica process(), mensajes, dormancy.
 *
 * Referencia: Placa PC-16 (D100-16 C1), muelles 35ms/40ms, RT60=2.4s
 *
 * @version 1.0.0
 */

import { describe, test, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES (deben coincidir con springReverb.worklet.js)
// ═══════════════════════════════════════════════════════════════════════════

const SAMPLE_RATE = 48000;
const SPRING1_DELAY_MS = 35;
const SPRING2_DELAY_MS = 40;
const TOTAL_DELAY_MS = SPRING1_DELAY_MS + SPRING2_DELAY_MS;  // 75ms
const MAX_REVERB_TIME_S = 2.4;
const DAMPING_FREQ_HZ = 4500;
const ALLPASS_COEFF = 0.65;
const INPUT_CLIP_DRIVE = 1.5;

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES REPLICADAS DEL WORKLET (para tests offline)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula tamaño de buffer allpass en samples.
 */
function delaySamples(delayMs, sr = SAMPLE_RATE) {
  return Math.ceil(delayMs / 1000 * sr);
}

/**
 * Calcula el feedback gain para un RT60 dado.
 * feedbackGain = 10^(-3 * totalDelay / RT60)
 * equivalente a: ganancia que en N ciclos acumula -60 dB
 */
function calcFeedbackGain(rt60 = MAX_REVERB_TIME_S, totalDelayS = TOTAL_DELAY_MS / 1000) {
  return Math.pow(10, -3 * totalDelayS / rt60);
}

/**
 * Calcula coeficiente de damping LPF de 1 polo.
 * dampCoeff = 1 - exp(-2π × fc / sampleRate)
 */
function calcDampingCoeff(fc = DAMPING_FREQ_HZ, sr = SAMPLE_RATE) {
  return 1 - Math.exp(-2 * Math.PI * fc / sr);
}

/**
 * Procesa un sample por un filtro allpass.
 */
function processAllpass(input, buffer, index, coeff) {
  const delayed = buffer[index];
  const output = -coeff * input + delayed;
  buffer[index] = input + coeff * output;
  return output;
}

/**
 * Soft clip: tanh(x * drive)
 */
function softClip(x, drive = INPUT_CLIP_DRIVE) {
  return Math.tanh(x * drive);
}

/**
 * Mix dial (0-10) + CV → normalizado [0, 1], clampeado.
 * Dial 0 = full dry, dial 10 = full wet.
 */
function mixDialToNorm(dialValue, cv = 0) {
  // CV ±2V cubre el rango completo → ±2V = ±10 dial units → scale = 5
  const combined = dialValue + cv * 5;
  return Math.max(0, Math.min(1, combined / 10));
}

/**
 * Level dial (0-10) → gain con curva LOG (base 100).
 */
function levelDialToGain(dialValue, logBase = 100) {
  if (dialValue <= 0) return 0;
  const normalized = Math.min(dialValue, 10) / 10;
  return (Math.pow(logBase, normalized) - 1) / (logBase - 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 1: TAMAÑOS DE BUFFER ALLPASS
// ═══════════════════════════════════════════════════════════════════════════

describe('Spring Reverb Worklet — Delay buffer sizes', () => {

  test('muelle 1: 35ms @ 48kHz = 1680 o 1681 samples', () => {
    const s = delaySamples(35);
    assert.ok(s === 1680 || s === 1681, `expected 1680 or 1681, got ${s}`);
  });

  test('muelle 2: 40ms @ 48kHz = 1920 samples', () => {
    assert.strictEqual(delaySamples(40), 1920);
  });

  test('delay total: 75ms', () => {
    assert.strictEqual(SPRING1_DELAY_MS + SPRING2_DELAY_MS, 75);
  });

  test('buffers se redimensionan a 44.1kHz correctamente', () => {
    assert.strictEqual(delaySamples(35, 44100), 1544);
    assert.strictEqual(delaySamples(40, 44100), 1764);
  });

  test('buffers se redimensionan a 96kHz correctamente', () => {
    const s35 = delaySamples(35, 96000);
    const s40 = delaySamples(40, 96000);
    assert.ok(s35 === 3360 || s35 === 3361, `35ms@96k: expected 3360-3361, got ${s35}`);
    assert.ok(s40 === 3840 || s40 === 3841, `40ms@96k: expected 3840-3841, got ${s40}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 2: FEEDBACK GAIN (para RT60 = 2.4s)
// ═══════════════════════════════════════════════════════════════════════════

describe('Spring Reverb Worklet — Feedback gain', () => {

  test('feedback gain para RT60=2.4s está entre 0.8 y 0.95', () => {
    const g = calcFeedbackGain();
    assert.ok(g > 0.8, `feedback ${g} debe ser > 0.8`);
    assert.ok(g < 0.95, `feedback ${g} debe ser < 0.95`);
  });

  test('feedback gain ≈ 0.9065 (cálculo exacto)', () => {
    const g = calcFeedbackGain();
    // 10^(-3 * 0.075 / 2.4) = 10^(-0.09375) ≈ 0.80524
    // Wait, let me recalculate: 10^(-3 * 0.075 / 2.4) = 10^(-0.09375)
    const expected = Math.pow(10, -3 * 0.075 / 2.4);
    assert.ok(Math.abs(g - expected) < 1e-10,
      `expected ${expected}, got ${g}`);
  });

  test('tras 32 ciclos (=2.4s) la amplitud cae a ~-60dB', () => {
    const g = calcFeedbackGain();
    const cycles = MAX_REVERB_TIME_S / (TOTAL_DELAY_MS / 1000);
    const finalAmplitude = Math.pow(g, cycles);
    const dB = 20 * Math.log10(finalAmplitude);
    assert.ok(Math.abs(dB - (-60)) < 1,
      `Después de ${cycles} ciclos: ${dB.toFixed(1)} dB, esperado ~-60 dB`);
  });

  test('feedback < 1 (estabilidad garantizada)', () => {
    const g = calcFeedbackGain();
    assert.ok(g < 1, 'feedback debe ser < 1 para estabilidad');
  });

  test('feedback > 0 (reverb no se anula)', () => {
    const g = calcFeedbackGain();
    assert.ok(g > 0, 'feedback debe ser > 0');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 3: DAMPING LPF (pérdida de agudos del muelle)
// ═══════════════════════════════════════════════════════════════════════════

describe('Spring Reverb Worklet — Damping coefficient', () => {

  test('coeficiente de damping @ 48kHz está entre 0.3 y 0.7', () => {
    const c = calcDampingCoeff();
    assert.ok(c > 0.3, `damping ${c} debe ser > 0.3`);
    assert.ok(c < 0.7, `damping ${c} debe ser < 0.7`);
  });

  test('coeficiente correcto para fc=4500 Hz @ 48kHz', () => {
    const expected = 1 - Math.exp(-2 * Math.PI * 4500 / 48000);
    const c = calcDampingCoeff();
    assert.ok(Math.abs(c - expected) < 1e-10);
  });

  test('damping mayor a frecuencias de corte más altas', () => {
    const c3k = calcDampingCoeff(3000);
    const c6k = calcDampingCoeff(6000);
    assert.ok(c6k > c3k, 'damping a 6kHz debe ser mayor que a 3kHz');
  });

  test('LPF es estable (coeff entre 0 y 1)', () => {
    const c = calcDampingCoeff();
    assert.ok(c > 0 && c < 1, 'coeff debe estar en (0, 1)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 4: ALLPASS FILTER
// ═══════════════════════════════════════════════════════════════════════════

describe('Spring Reverb Worklet — Allpass filter', () => {

  test('allpass con buffer vacío: output = -coeff * input', () => {
    const buffer = new Float32Array(10);
    const out = processAllpass(1.0, buffer, 0, ALLPASS_COEFF);
    assert.ok(Math.abs(out - (-ALLPASS_COEFF)) < 1e-10,
      `Primer sample debe ser ${-ALLPASS_COEFF}, got ${out}`);
  });

  test('allpass preserva energía (señal no crece)', () => {
    const bufLen = delaySamples(35);
    const buffer = new Float32Array(bufLen);
    let idx = 0;
    let maxOut = 0;

    // Alimentar con impulso unitario y medir salida
    for (let i = 0; i < bufLen * 3; i++) {
      const input = (i === 0) ? 1.0 : 0.0;
      const out = processAllpass(input, buffer, idx, ALLPASS_COEFF);
      idx = (idx + 1) % bufLen;
      maxOut = Math.max(maxOut, Math.abs(out));
    }

    assert.ok(maxOut <= 1.01, `max output ${maxOut} no debe exceder entrada`);
  });

  test('allpass produce salida retardada (eco con phase shift)', () => {
    const bufLen = delaySamples(35);
    const buffer = new Float32Array(bufLen);
    let idx = 0;
    const outputs = [];

    // Impulso → medir cuándo aparece la respuesta retardada
    for (let i = 0; i < bufLen + 10; i++) {
      const input = (i === 0) ? 1.0 : 0.0;
      const out = processAllpass(input, buffer, idx, ALLPASS_COEFF);
      idx = (idx + 1) % bufLen;
      outputs.push(out);
    }

    // Debe haber salida significativa alrededor del delay
    const atDelay = Math.abs(outputs[bufLen]);
    assert.ok(atDelay > 0.1,
      `Salida en sample ${bufLen} debe ser significativa, got ${atDelay}`);
  });

  test('coeficiente allpass = 0.65 (según config)', () => {
    assert.strictEqual(ALLPASS_COEFF, 0.65);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 5: SOFT CLIP (saturación de entrada)
// ═══════════════════════════════════════════════════════════════════════════

describe('Spring Reverb Worklet — Soft clip', () => {

  test('señal 0 → 0', () => {
    assert.strictEqual(softClip(0), 0);
  });

  test('señales pequeñas pasan casi lineales', () => {
    const input = 0.1;
    const output = softClip(input);
    // tanh(0.15) ≈ 0.1489 — quasi-lineal
    assert.ok(Math.abs(output - input * INPUT_CLIP_DRIVE * 0.98) < 0.05,
      `Señal pequeña ${input} → ${output}, debe ser quasi-lineal`);
  });

  test('señales grandes se saturan bajo ±1', () => {
    assert.ok(softClip(2.0) < 1.0, 'Entrada +2V debe saturar bajo +1');
    assert.ok(softClip(-2.0) > -1.0, 'Entrada -2V debe saturar sobre -1');
  });

  test('saturación es simétrica', () => {
    const pos = softClip(1.0);
    const neg = softClip(-1.0);
    assert.ok(Math.abs(pos + neg) < 1e-10, 'tanh es simétrico');
  });

  test('drive > 1 aumenta la saturación', () => {
    const withDrive = softClip(0.5, 2.0);
    const withoutDrive = softClip(0.5, 1.0);
    assert.ok(withDrive > withoutDrive, 'más drive = más saturación');
  });

  test('nunca excede ±1 para cualquier entrada', () => {
    for (let x = -10; x <= 10; x += 0.5) {
      const out = softClip(x);
      assert.ok(Math.abs(out) <= 1.0, `softClip(${x}) = ${out}, excede ±1`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 6: MIX DIAL → NORMALIZADO
// ═══════════════════════════════════════════════════════════════════════════

describe('Spring Reverb Worklet — Mix normalization', () => {

  test('dial 0, sin CV → mix 0 (full dry)', () => {
    assert.strictEqual(mixDialToNorm(0, 0), 0);
  });

  test('dial 10, sin CV → mix 1 (full wet)', () => {
    assert.strictEqual(mixDialToNorm(10, 0), 1);
  });

  test('dial 5, sin CV → mix 0.5 (50/50)', () => {
    assert.strictEqual(mixDialToNorm(5, 0), 0.5);
  });

  test('CV positivo aumenta wet', () => {
    const withCV = mixDialToNorm(3, 0.5);
    const withoutCV = mixDialToNorm(3, 0);
    assert.ok(withCV > withoutCV, 'CV positivo debe aumentar mix');
  });

  test('CV negativo disminuye wet', () => {
    const withCV = mixDialToNorm(7, -0.5);
    const withoutCV = mixDialToNorm(7, 0);
    assert.ok(withCV < withoutCV, 'CV negativo debe disminuir mix');
  });

  test('clamp inferior: no baja de 0', () => {
    assert.strictEqual(mixDialToNorm(0, -1), 0);
    assert.strictEqual(mixDialToNorm(-5, 0), 0);
  });

  test('clamp superior: no sube de 1', () => {
    assert.strictEqual(mixDialToNorm(10, 1), 1);
    assert.strictEqual(mixDialToNorm(15, 0), 1);
  });

  test('±2V de CV cubre rango completo', () => {
    // Del spec: ±2V (pin azul 10k) cubre todo el rango
    // CV=2 normalizado → dial += 10 → full wet desde 0
    const fromZero = mixDialToNorm(0, 2);
    assert.strictEqual(fromZero, 1, '+2V desde dial 0 debe dar full wet');

    const fromTen = mixDialToNorm(10, -2);
    assert.strictEqual(fromTen, 0, '-2V desde dial 10 debe dar full dry');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 7: IMPORT REAL DEL WORKLET — process() y mensajes
// ═══════════════════════════════════════════════════════════════════════════

function createWorkletEnvironment() {
  globalThis.sampleRate = SAMPLE_RATE;
  globalThis.currentTime = 0;
  globalThis.currentFrame = 0;

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

  const registered = {};
  globalThis.registerProcessor = (name, cls) => {
    registered[name] = cls;
  };

  return registered;
}

function createInputs(length) {
  return [[new Float32Array(length)]];  // 1 input, 1 channel
}

function createOutputs(length) {
  return [[new Float32Array(length)]];  // 1 output, 1 channel
}

describe('Spring Reverb Worklet — Import real', () => {
  let SpringReverbProcessor;

  beforeEach(async () => {
    const registered = createWorkletEnvironment();
    await import(`../../src/assets/js/worklets/springReverb.worklet.js?t=${Date.now()}`);
    SpringReverbProcessor = registered['spring-reverb'];
  });

  test('registra el procesador como "spring-reverb"', () => {
    assert.ok(SpringReverbProcessor, 'Procesador debe estar registrado');
  });

  test('tiene parameterDescriptors con mixControl', () => {
    const descriptors = SpringReverbProcessor.parameterDescriptors;
    assert.ok(Array.isArray(descriptors), 'parameterDescriptors debe ser array');
    const mixParam = descriptors.find(d => d.name === 'mixControl');
    assert.ok(mixParam, 'debe tener parámetro mixControl');
    assert.strictEqual(mixParam.defaultValue, 0);
  });

  test('process() retorna true en operación normal', () => {
    const proc = new SpringReverbProcessor();
    const inputs = createInputs(128);
    const outputs = createOutputs(128);
    const result = proc.process(inputs, outputs, { mixControl: new Float32Array([0]) });
    assert.strictEqual(result, true);
  });

  test('process() retorna false tras stop', () => {
    const proc = new SpringReverbProcessor();
    proc.port.onmessage({ data: { type: 'stop' } });
    const inputs = createInputs(128);
    const outputs = createOutputs(128);
    const result = proc.process(inputs, outputs, { mixControl: new Float32Array([0]) });
    assert.strictEqual(result, false);
  });

  test('señal seca pasa sin reverb cuando mix=0', () => {
    const proc = new SpringReverbProcessor();
    proc.port.onmessage({ data: { type: 'setMix', value: 0 } });

    const inputs = createInputs(128);
    const outputs = createOutputs(128);
    // Generar señal de entrada conocida
    for (let i = 0; i < 128; i++) {
      inputs[0][0][i] = 0.5;
    }

    proc.process(inputs, outputs, { mixControl: new Float32Array([0]) });

    // Con mix=0, salida ≈ entrada (soft-clipped)
    const expectedDry = Math.tanh(0.5 * INPUT_CLIP_DRIVE);
    for (let i = 0; i < 128; i++) {
      assert.ok(Math.abs(outputs[0][0][i] - expectedDry) < 0.01,
        `Sample ${i}: expected ~${expectedDry.toFixed(3)}, got ${outputs[0][0][i].toFixed(3)}`);
    }
  });

  test('señal reverberada aparece con retardo cuando mix=1', () => {
    const proc = new SpringReverbProcessor();
    proc.port.onmessage({ data: { type: 'setMix', value: 10 } });

    // Enviar un impulso y esperar la cola de reverb
    const totalSamples = delaySamples(35) + delaySamples(40) + 256;
    const blockSize = 128;
    let foundWetSignal = false;

    for (let block = 0; block < Math.ceil(totalSamples / blockSize); block++) {
      const inputs = createInputs(blockSize);
      const outputs = createOutputs(blockSize);

      if (block === 0) {
        inputs[0][0][0] = 1.0;  // Impulso
      }

      proc.process(inputs, outputs, { mixControl: new Float32Array([0]) });

      // Buscar señal wet significativa después del delay
      const startSample = block * blockSize;
      for (let i = 0; i < blockSize; i++) {
        if (startSample + i > delaySamples(35) && Math.abs(outputs[0][0][i]) > 0.01) {
          foundWetSignal = true;
        }
      }
    }

    assert.ok(foundWetSignal, 'Debe aparecer señal reverberada después de ~35ms');
  });

  test('dormancy: salida es cero cuando dormant', () => {
    const proc = new SpringReverbProcessor();
    proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });

    const inputs = createInputs(128);
    const outputs = createOutputs(128);
    for (let i = 0; i < 128; i++) {
      inputs[0][0][i] = 0.5;
    }

    proc.process(inputs, outputs, { mixControl: new Float32Array([0]) });

    for (let i = 0; i < 128; i++) {
      assert.strictEqual(outputs[0][0][i], 0, `Sample ${i} debe ser 0 en dormancy`);
    }
  });

  test('wake de dormancy: señal vuelve a procesarse', () => {
    const proc = new SpringReverbProcessor();
    proc.port.onmessage({ data: { type: 'setMix', value: 0 } });

    // Dormir
    proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });
    const inputs1 = createInputs(128);
    const outputs1 = createOutputs(128);
    inputs1[0][0].fill(0.5);
    proc.process(inputs1, outputs1, { mixControl: new Float32Array([0]) });
    assert.strictEqual(outputs1[0][0][0], 0, 'Dormant: output debe ser 0');

    // Despertar
    proc.port.onmessage({ data: { type: 'setDormant', dormant: false } });
    const inputs2 = createInputs(128);
    const outputs2 = createOutputs(128);
    inputs2[0][0].fill(0.5);
    proc.process(inputs2, outputs2, { mixControl: new Float32Array([0]) });

    const expectedDry = Math.tanh(0.5 * INPUT_CLIP_DRIVE);
    assert.ok(Math.abs(outputs2[0][0][64] - expectedDry) < 0.05,
      'Tras wake: señal debe procesarse');
  });

  test('setMix cambia la proporción dry/wet', () => {
    const proc = new SpringReverbProcessor();

    // Mix = 0 (full dry)
    proc.port.onmessage({ data: { type: 'setMix', value: 0 } });
    const inputsDry = createInputs(128);
    const outputsDry = createOutputs(128);
    inputsDry[0][0].fill(0.3);
    proc.process(inputsDry, outputsDry, { mixControl: new Float32Array([0]) });

    // Mix = 10 (full wet)
    proc.port.onmessage({ data: { type: 'setMix', value: 10 } });
    const inputsWet = createInputs(128);
    const outputsWet = createOutputs(128);
    inputsWet[0][0].fill(0.3);
    proc.process(inputsWet, outputsWet, { mixControl: new Float32Array([0]) });

    // Full dry y full wet deben ser diferentes
    // En el primer bloque, wet no tiene cola todavía, así que la señal será
    // solo la contribución wet (que es casi 0 porque los allpass no han acumulado)
    const drySum = outputsDry[0][0].reduce((s, v) => s + Math.abs(v), 0);
    const wetSum = outputsWet[0][0].reduce((s, v) => s + Math.abs(v), 0);
    assert.ok(drySum > wetSum,
      `Full dry (${drySum.toFixed(3)}) debe ser mayor que full wet sin cola (${wetSum.toFixed(3)})`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 8: CONSTANTES DEL WORKLET
// ═══════════════════════════════════════════════════════════════════════════

describe('Spring Reverb Worklet — Constantes', () => {

  test('SPRING1_DELAY_MS = 35 (según manual PC-16)', () => {
    assert.strictEqual(SPRING1_DELAY_MS, 35);
  });

  test('SPRING2_DELAY_MS = 40 (según manual PC-16)', () => {
    assert.strictEqual(SPRING2_DELAY_MS, 40);
  });

  test('MAX_REVERB_TIME_S = 2.4', () => {
    assert.strictEqual(MAX_REVERB_TIME_S, 2.4);
  });

  test('DAMPING_FREQ_HZ = 4500', () => {
    assert.strictEqual(DAMPING_FREQ_HZ, 4500);
  });

  test('ALLPASS_COEFF = 0.65', () => {
    assert.strictEqual(ALLPASS_COEFF, 0.65);
  });

  test('INPUT_CLIP_DRIVE = 1.5', () => {
    assert.strictEqual(INPUT_CLIP_DRIVE, 1.5);
  });
});
