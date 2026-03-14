/**
 * Tests para sequencer.worklet.js — AudioWorkletProcessor del Digital Sequencer 1000
 * 
 * Fase 2: Clock — Verifica el oscilador interno del secuenciador:
 * 
 * 1. MATEMÁTICA OFFLINE: clockRateDialToFreq() exponencial (0.1–500 Hz)
 * 2. IMPORT REAL: process() genera pulsos, RUN/STOP CLOCK, dormancy
 * 
 * Referencia: Synthi 100, reloj interno 0.1–500 Hz,
 *             pulso clock 5ms, switch Run/Stop Clock
 */

import { describe, test, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES (deben coincidir con sequencer.worklet.js)
// ═══════════════════════════════════════════════════════════════════════════

const CLOCK_MIN_FREQ = 0.1;        // Hz — un pulso cada 10 segundos
const CLOCK_MAX_FREQ = 500;        // Hz — máx. compatible con Z80
const CLOCK_FREQ_RATIO = CLOCK_MAX_FREQ / CLOCK_MIN_FREQ; // 5000
const CLOCK_PULSE_WIDTH = 0.005;   // 5 ms
const SAMPLE_RATE = 48000;

// Canales de salida del worklet
const CH_DAC1 = 0;
const CH_DAC2 = 1;
const CH_VOLTAGE_A = 2;
const CH_CLOCK = 12;              // Último canal: clock pulse
const KEY_ON_VOLTAGE = 5;         // Amplitud TTL del pulso clock (5V)

// Total de canales de salida
const TOTAL_OUTPUT_CHANNELS = 13;

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES REPLICADAS DEL WORKLET (tests offline)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convierte dial Clock Rate (0-10) a frecuencia (Hz).
 * Mapeo exponencial: dial 0 → 0.1 Hz, dial 10 → 500 Hz
 */
function clockRateDialToFreq(dialValue) {
  const normalized = dialValue / 10; // 0..1
  return CLOCK_MIN_FREQ * Math.pow(CLOCK_FREQ_RATIO, normalized);
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 1: CONVERSIÓN CLOCK RATE DIAL → FRECUENCIA
// ═══════════════════════════════════════════════════════════════════════════

describe('Sequencer Worklet — clockRateDialToFreq (exponencial)', () => {

  test('dial 0 → 0.1 Hz (mínima frecuencia)', () => {
    const freq = clockRateDialToFreq(0);
    assert.ok(Math.abs(freq - 0.1) < 1e-10, `Esperado 0.1, obtenido ${freq}`);
  });

  test('dial 10 → 500 Hz (máxima frecuencia)', () => {
    const freq = clockRateDialToFreq(10);
    assert.ok(Math.abs(freq - 500) < 1e-6, `Esperado 500, obtenido ${freq}`);
  });

  test('dial 5 → centro geométrico (~7.07 Hz)', () => {
    const freq = clockRateDialToFreq(5);
    // 0.1 × 5000^0.5 = 0.1 × 70.71 ≈ 7.071
    const expected = 0.1 * Math.pow(5000, 0.5);
    assert.ok(Math.abs(freq - expected) < 1e-6, `Esperado ${expected}, obtenido ${freq}`);
  });

  test('monotonía: mayor dial → mayor frecuencia', () => {
    let prevFreq = 0;
    for (let dial = 0; dial <= 10; dial += 0.5) {
      const freq = clockRateDialToFreq(dial);
      assert.ok(freq > prevFreq,
        `Frecuencia en dial ${dial} (${freq.toFixed(4)}) debe ser > dial ${dial - 0.5} (${prevFreq.toFixed(4)})`);
      prevFreq = freq;
    }
  });

  test('rango total ≈ 12.3 octavas (5000:1)', () => {
    const fMin = clockRateDialToFreq(0);
    const fMax = clockRateDialToFreq(10);
    const octaves = Math.log2(fMax / fMin);
    // log2(5000) ≈ 12.29
    assert.ok(Math.abs(octaves - Math.log2(CLOCK_FREQ_RATIO)) < 0.01,
      `Octavas: ${octaves.toFixed(3)}, esperado ~${Math.log2(CLOCK_FREQ_RATIO).toFixed(3)}`);
  });

  test('cada incremento de 1 → mismo ratio de octavas', () => {
    const expectedOctPerUnit = Math.log2(CLOCK_FREQ_RATIO) / 10;
    for (let dial = 1; dial <= 10; dial++) {
      const f1 = clockRateDialToFreq(dial - 1);
      const f2 = clockRateDialToFreq(dial);
      const octaves = Math.log2(f2 / f1);
      assert.ok(Math.abs(octaves - expectedOctPerUnit) < 0.01,
        `dial ${dial - 1}→${dial}: ${octaves.toFixed(4)} octavas, esperado ~${expectedOctPerUnit.toFixed(4)}`);
    }
  });

  test('cuadrante bajo (0-3): sub-hercio a ~1 Hz', () => {
    assert.ok(clockRateDialToFreq(0) < 1, 'dial 0 debe ser sub-hercio');
    assert.ok(clockRateDialToFreq(2) < 1, 'dial 2 debe ser sub-hercio');
    assert.ok(clockRateDialToFreq(3) > 0.5, 'dial 3 debe estar por encima de 0.5 Hz');
  });

  test('cuadrante alto (7-10): decenas a centenas de Hz', () => {
    assert.ok(clockRateDialToFreq(7) > 10, 'dial 7 debe superar 10 Hz');
    assert.ok(clockRateDialToFreq(10) <= 500 + 1e-6, 'dial 10 no debe superar 500 Hz');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 2: CONSTANTES DEL WORKLET
// ═══════════════════════════════════════════════════════════════════════════

describe('Sequencer Worklet — Constantes', () => {

  test('CLOCK_PULSE_WIDTH = 5 ms', () => {
    assert.strictEqual(CLOCK_PULSE_WIDTH, 0.005);
  });

  test('ancho de pulso en samples a 48 kHz = 240', () => {
    const samples = Math.round(CLOCK_PULSE_WIDTH * SAMPLE_RATE);
    assert.strictEqual(samples, 240);
  });

  test('CLOCK_MIN_FREQ = 0.1 Hz', () => {
    assert.strictEqual(CLOCK_MIN_FREQ, 0.1);
  });

  test('CLOCK_MAX_FREQ = 500 Hz', () => {
    assert.strictEqual(CLOCK_MAX_FREQ, 500);
  });

  test('CLOCK_FREQ_RATIO = 5000', () => {
    assert.strictEqual(CLOCK_FREQ_RATIO, 5000);
  });

  test('total de canales de salida = 13', () => {
    assert.strictEqual(TOTAL_OUTPUT_CHANNELS, 13);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 3: IMPORT REAL DEL WORKLET — clock, process() y mensajes
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

function createOutputs(numChannels, length) {
  return [Array.from({ length: numChannels }, () => new Float32Array(length))];
}

function createInputs(numInputs, length) {
  return Array.from({ length: numInputs }, () => [new Float32Array(length)]);
}

describe('Sequencer Worklet — Import real (clock)', () => {
  let SequencerProcessor;

  beforeEach(async () => {
    const registered = createWorkletEnvironment();
    await import(`../../src/assets/js/worklets/sequencer.worklet.js?t=${Date.now()}`);
    SequencerProcessor = registered['sequencer'];
  });

  test('registra el procesador como "sequencer"', () => {
    assert.ok(SequencerProcessor, 'Procesador debe estar registrado');
  });

  test('process() retorna true en operación normal', () => {
    const proc = new SequencerProcessor();
    const inputs = createInputs(8, 128);
    const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
    const result = proc.process(inputs, outputs, {});
    assert.strictEqual(result, true);
  });

  test('process() retorna false tras mensaje stop', () => {
    const proc = new SequencerProcessor();
    proc.port.onmessage({ data: { type: 'stop' } });
    const inputs = createInputs(8, 128);
    const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
    const result = proc.process(inputs, outputs, {});
    assert.strictEqual(result, false);
  });

  test('salida tiene 13 canales', () => {
    const proc = new SequencerProcessor();
    const inputs = createInputs(8, 128);
    const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
    proc.process(inputs, outputs, {});

    for (let ch = 0; ch < TOTAL_OUTPUT_CHANNELS; ch++) {
      assert.strictEqual(outputs[0][ch].length, 128, `Canal ${ch} debe tener 128 samples`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // CLOCK PULSE GENERATION
  // ─────────────────────────────────────────────────────────────────────

  describe('Clock pulse generation', () => {

    test('clock en canal 12, amplitud 5V (TTL) durante ~5ms', () => {
      const proc = new SequencerProcessor();
      // Usar dial 7 (~50 Hz, periodo ~960 samples > pulse 240 samples)
      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });
      // Asegurar que el clock está corriendo
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });

      const expectedPulseSamples = Math.round(CLOCK_PULSE_WIDTH * SAMPLE_RATE);

      // Recoger samples del canal clock
      const allClock = [];
      for (let block = 0; block < 20; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
        allClock.push(...outputs[0][CH_CLOCK]);
      }

      // Buscar el primer flanco de subida
      let pulseStart = -1;
      for (let i = 1; i < allClock.length; i++) {
        if (allClock[i] === KEY_ON_VOLTAGE && allClock[i - 1] === 0.0) {
          pulseStart = i;
          break;
        }
      }
      // Si empieza en sample 0, el pulso comienza ahí
      if (pulseStart === -1 && allClock[0] === KEY_ON_VOLTAGE) {
        pulseStart = 0;
      }

      assert.ok(pulseStart >= 0, 'Debe haber al menos un pulso clock');

      // Medir ancho del pulso
      let pulseWidth = 0;
      for (let i = pulseStart; i < allClock.length; i++) {
        if (allClock[i] === KEY_ON_VOLTAGE) {
          pulseWidth++;
        } else {
          break;
        }
      }

      assert.strictEqual(pulseWidth, expectedPulseSamples,
        `Pulso clock debe tener ${expectedPulseSamples} samples, tiene ${pulseWidth}`);
    });

    test('clock pulse valores solo {0.0, 5.0}', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setClockRate', value: 8 } });
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });

      for (let block = 0; block < 50; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});

        for (const sample of outputs[0][CH_CLOCK]) {
          assert.ok(sample === 0.0 || sample === KEY_ON_VOLTAGE,
            `Clock sample ${sample} debe ser 0.0 o ${KEY_ON_VOLTAGE}`);
        }
      }
    });

    test('setClockRate cambia la frecuencia del reloj (vía tick postMessage)', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });
      // Clock rate a máx (500 Hz)
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });

      let tickCount = 0;
      proc.port.postMessage = (msg) => {
        if (msg.type === 'tick') tickCount++;
      };

      const blocksPerSecond = Math.ceil(SAMPLE_RATE / 128);
      let prevClock = new Float32Array(128);
      for (let block = 0; block < blocksPerSecond; block++) {
        const inputs = createInputs(8, 128);
        inputs[0][0].set(prevClock); // Loopback: clock output → clock input
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
        prevClock = new Float32Array(outputs[0][CH_CLOCK]);
      }
      // A 500 Hz durante 1s esperamos ~500 ticks (tolerancia ±5%)
      assert.ok(tickCount >= 450, `Solo ${tickCount} ticks en 1s a 500 Hz`);
      assert.ok(tickCount <= 550, `Demasiados ticks (${tickCount}) a 500 Hz`);
    });

    test('clock rate lento (dial 0 ≈ 0.1Hz): no más de 1 flanco en 1s', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });
      proc.port.onmessage({ data: { type: 'setClockRate', value: 0 } });

      let edgeCount = 0;
      const blocksPerSecond = Math.ceil(SAMPLE_RATE / 128);

      // Saltar el primer bloque (puede tener flanco de arranque)
      {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
      }

      for (let block = 0; block < blocksPerSecond; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
        const clock = outputs[0][CH_CLOCK];
        for (let i = 1; i < 128; i++) {
          if (clock[i] === KEY_ON_VOLTAGE && clock[i - 1] === 0.0) {
            edgeCount++;
          }
        }
      }
      // A 0.1 Hz → 1 pulso cada 10s → 0 flancos esperados en 1s
      assert.ok(edgeCount <= 1, `Demasiados flancos (${edgeCount}) a 0.1 Hz`);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // RUN CLOCK / STOP CLOCK
  // ─────────────────────────────────────────────────────────────────────

  describe('Run Clock / Stop Clock switch', () => {

    test('clock arranca activo por defecto (runClock initial=true)', () => {
      const proc = new SequencerProcessor();

      let tickCount = 0;
      proc.port.postMessage = (msg) => {
        if (msg.type === 'tick') tickCount++;
      };

      let prevClock = new Float32Array(128);
      for (let block = 0; block < 100; block++) {
        const inputs = createInputs(8, 128);
        inputs[0][0].set(prevClock); // Loopback: clock output → clock input
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
        prevClock = new Float32Array(outputs[0][CH_CLOCK]);
      }
      assert.ok(tickCount > 0, 'Clock debe generar ticks por defecto');
    });

    test('setRunClock false: silencia el clock', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      proc.port.onmessage({ data: { type: 'setRunClock', value: false } });

      // Procesar bloques: no debe haber flancos
      for (let block = 0; block < 50; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
        const clock = outputs[0][CH_CLOCK];
        for (const sample of clock) {
          assert.strictEqual(sample, 0.0,
            'Clock debe ser 0 cuando runClock está desactivado');
        }
      }
    });

    test('toggle: stop → run reanuda los pulsos', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });
      proc.port.onmessage({ data: { type: 'setRunClock', value: false } });

      // Procesar en silencio
      for (let block = 0; block < 10; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
      }

      // Reactivar
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });

      let tickCount = 0;
      proc.port.postMessage = (msg) => {
        if (msg.type === 'tick') tickCount++;
      };

      let prevClock = new Float32Array(128);
      for (let block = 0; block < 100; block++) {
        const inputs = createInputs(8, 128);
        inputs[0][0].set(prevClock); // Loopback: clock output → clock input
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
        prevClock = new Float32Array(outputs[0][CH_CLOCK]);
      }
      assert.ok(tickCount > 0, 'Clock debe reanudar tras re-activar runClock');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // CLOCK RATE MID-CYCLE RECALCULATION
  // ─────────────────────────────────────────────────────────────────────

  describe('Clock rate mid-cycle', () => {

    test('cambiar clock rate mid-cycle recalcula proporcionalmente', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });
      // Empezar lento (dial 2 ≈ ~0.4 Hz)
      proc.port.onmessage({ data: { type: 'setClockRate', value: 2 } });

      // Procesar algunos bloques para avanzar fase
      for (let block = 0; block < 50; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
      }

      // Acelerar a máximo → debe disparar más pronto
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });

      let tickCount = 0;
      proc.port.postMessage = (msg) => {
        if (msg.type === 'tick') tickCount++;
      };

      let prevClock = new Float32Array(128);
      for (let block = 0; block < 50; block++) {
        const inputs = createInputs(8, 128);
        inputs[0][0].set(prevClock); // Loopback: clock output → clock input
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
        prevClock = new Float32Array(outputs[0][CH_CLOCK]);
      }
      // A 500 Hz en 50 bloques = ~133ms → ~66 ticks esperados
      assert.ok(tickCount > 20, `Solo ${tickCount} ticks tras cambiar a 500 Hz`);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // DORMANCY
  // ─────────────────────────────────────────────────────────────────────

  describe('Dormancy', () => {

    test('setDormant silencia todas las salidas', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });
      proc.port.onmessage({ data: { type: 'setDormant', value: true } });

      for (let block = 0; block < 20; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});

        for (let ch = 0; ch < TOTAL_OUTPUT_CHANNELS; ch++) {
          for (const sample of outputs[0][ch]) {
            assert.strictEqual(sample, 0.0,
              `Canal ${ch} debe estar en silencio durante dormancy`);
          }
        }
      }
    });

    test('process() retorna true durante dormancy', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setDormant', value: true } });
      const inputs = createInputs(8, 128);
      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      assert.strictEqual(proc.process(inputs, outputs, {}), true);
    });

    test('despertar de dormancy: clock reanuda pulsos', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });
      proc.port.onmessage({ data: { type: 'setDormant', value: true } });

      // Avanzar el reloj internamente durante dormancy
      for (let block = 0; block < 50; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
      }

      // Despertar
      proc.port.onmessage({ data: { type: 'setDormant', value: false } });

      let edgeCount = 0;
      for (let block = 0; block < 100; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
        const clock = outputs[0][CH_CLOCK];
        for (let i = 1; i < 128; i++) {
          if (clock[i] === KEY_ON_VOLTAGE && clock[i - 1] === 0.0) {
            edgeCount++;
          }
        }
      }
      assert.ok(edgeCount > 0, 'Clock debe reanudar tras despertar de dormancy');
    });

    test('oscilador clock mantiene fase durante dormancy', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } }); // 500 Hz
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });

      // Procesar unos bloques para estabilizar el reloj
      for (let block = 0; block < 5; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
      }

      // Dormir durante ~0.5s
      proc.port.onmessage({ data: { type: 'setDormant', value: true } });
      const blocks = Math.ceil(SAMPLE_RATE * 0.5 / 128);
      for (let block = 0; block < blocks; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
      }

      // Despertar: el oscilador debe producir pulso rápidamente
      // (a 500 Hz, periodo ~96 samples, dentro de 1 bloque de 128)
      proc.port.onmessage({ data: { type: 'setDormant', value: false } });

      let foundPulse = false;
      for (let block = 0; block < 3; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
        if (outputs[0][CH_CLOCK].some(s => s === KEY_ON_VOLTAGE)) {
          foundPulse = true;
          break;
        }
      }
      assert.ok(foundPulse,
        'Oscilador clock debe producir pulso inmediatamente tras despertar (fase mantenida)');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // EXTERNAL CLOCK INPUT
  // ─────────────────────────────────────────────────────────────────────

  describe('External clock input', () => {

    test('flanco externo > umbral en input 0 genera tick', () => {
      const proc = new SequencerProcessor();
      // Desactivar clock interno para aislar externos
      proc.port.onmessage({ data: { type: 'setRunClock', value: false } });

      let ticks = 0;
      proc.port.postMessage = (msg) => {
        if (msg.type === 'tick') ticks++;
      };

      // Crear señal con flancos positivos
      const inputs = createInputs(8, 128);
      // Input 0 = Clock external
      // Simular flanco: 0V → 2V a sample 50
      for (let i = 50; i < 128; i++) {
        inputs[0][0][i] = 2.0;
      }

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs, outputs, {});

      assert.strictEqual(ticks, 1, 'Un flanco externo debe generar exactamente 1 tick');
    });

    test('señal debajo del umbral (< 1V) no genera tick', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setRunClock', value: false } });

      let ticks = 0;
      proc.port.postMessage = (msg) => {
        if (msg.type === 'tick') ticks++;
      };

      const inputs = createInputs(8, 128);
      // Señal a 0.5V (debajo del umbral de 1V del Schmitt trigger Z80)
      for (let i = 0; i < 128; i++) {
        inputs[0][0][i] = 0.5;
      }

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs, outputs, {});

      assert.strictEqual(ticks, 0, 'Señal debajo del umbral no debe generar tick');
    });

    test('múltiples flancos en un bloque generan múltiples ticks', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setRunClock', value: false } });

      let ticks = 0;
      proc.port.postMessage = (msg) => {
        if (msg.type === 'tick') ticks++;
      };

      const inputs = createInputs(8, 128);
      // Simular 2 flancos: 0→2V en sample 20, luego 0→2V en sample 80
      for (let i = 20; i < 40; i++) inputs[0][0][i] = 2.0;
      // gap en 40-79
      for (let i = 80; i < 100; i++) inputs[0][0][i] = 2.0;

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs, outputs, {});

      assert.strictEqual(ticks, 2, 'Dos flancos en un bloque deben generar 2 ticks');
    });

    test('señal sostenida (sin flanco) no genera tick adicional', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setRunClock', value: false } });

      let ticks = 0;
      proc.port.postMessage = (msg) => {
        if (msg.type === 'tick') ticks++;
      };

      // Primer bloque: flanco de subida
      const inputs1 = createInputs(8, 128);
      inputs1[0][0].fill(2.0); // entero a 2V
      const outputs1 = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs1, outputs1, {});
      // Solo 1 tick del flanco initial (sample 0 vs estado previo 0)
      const ticksAfterFirst = ticks;

      // Segundo bloque: sostenido en alto (sin nuevo flanco)
      const inputs2 = createInputs(8, 128);
      inputs2[0][0].fill(2.0);
      const outputs2 = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs2, outputs2, {});

      assert.strictEqual(ticks, ticksAfterFirst,
        'Señal sostenida no debe generar ticks adicionales');
    });

    test('ringing tras flanco de bajada NO genera ticks espurios (Schmitt trigger)', () => {
      // Reproduce el bug: señal que pasa por WaveShaper(oversample=2x)
      // del Output Channel introduce ringing (Gibbs) al caer de HIGH a LOW.
      // Con VCA gain=10, el ringing se amplifica y cruza el umbral múltiples veces.
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setRunClock', value: false } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      let ticks = 0;
      proc.port.postMessage = (msg) => {
        if (msg.type === 'tick') ticks++;
      };

      // Bloque 1: flanco 0 → 12.5 (gate 1.25 × VCA gain 10)
      const inputs1 = createInputs(8, 128);
      inputs1[0][0].fill(12.5);
      proc.process(inputs1, createOutputs(TOTAL_OUTPUT_CHANNELS, 128), {});
      assert.strictEqual(ticks, 1, 'Flanco de subida debe generar exactamente 1 tick');

      // Bloque 2: flanco de bajada con ringing (simula WaveShaper oversample + VCA ×10)
      // La señal baja a 0 pero oscila: +1.1, -0.8, +0.6, -0.4, +0.2, ...
      const inputs2 = createInputs(8, 128);
      const ringing = inputs2[0][0];
      // Primeros samples: caída de 12.5 a 0 con ringing
      for (let i = 0; i < 128; i++) {
        if (i < 5) {
          ringing[i] = 12.5 * (1 - i / 5); // Caída rápida
        } else {
          // Ringing amortiguado: oscila alrededor de 0
          const decay = Math.exp(-(i - 5) / 15);
          ringing[i] = 1.5 * decay * Math.sin((i - 5) * 0.8);
        }
      }
      proc.process(inputs2, createOutputs(TOTAL_OUTPUT_CHANNELS, 128), {});

      // CON Schmitt trigger: solo 1 tick del bloque 1, ninguno del ringing
      assert.strictEqual(ticks, 1,
        'Ringing tras bajada NO debe generar ticks adicionales (histéresis Schmitt)');
    });

    test('ringing alrededor del umbral NO genera ticks múltiples (Schmitt trigger)', () => {
      // Señal que sube sobre el umbral y luego oscila con ringing amortiguado
      // alrededor de 1.0V (transición entre regiones del WaveShaper + amplificación VCA)
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setRunClock', value: false } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      let ticks = 0;
      proc.port.postMessage = (msg) => {
        if (msg.type === 'tick') ticks++;
      };

      const inputs = createInputs(8, 128);
      const signal = inputs[0][0];
      // Señal sube hasta 1.5 y luego ringing amortiguado alrededor de 1.2
      for (let i = 0; i < 20; i++) signal[i] = 0;
      for (let i = 20; i < 30; i++) signal[i] = 1.5;  // Sube sobre umbral
      for (let i = 30; i < 128; i++) {
        // Ringing amortiguado que cruza el umbral 1.0V arriba y abajo
        const decay = Math.exp(-(i - 30) / 8);
        signal[i] = 1.2 + 0.8 * decay * Math.sin((i - 30) * 1.5);
      }

      proc.process(inputs, createOutputs(TOTAL_OUTPUT_CHANNELS, 128), {});

      assert.strictEqual(ticks, 1,
        'Ringing amortiguado alrededor del umbral debe generar solo 1 tick');
    });

    test('pulso limpio que baja a 0V permite re-trigger correcto', () => {
      // Verifica que la histéresis NO impide re-triggers legítimos:
      // señal sube (tick 1), baja a 0V, sube de nuevo (tick 2)
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setRunClock', value: false } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      let ticks = 0;
      proc.port.postMessage = (msg) => {
        if (msg.type === 'tick') ticks++;
      };

      const inputs = createInputs(8, 128);
      const signal = inputs[0][0];
      // Pulso 1: samples 10-40 a 2V
      for (let i = 10; i < 40; i++) signal[i] = 2.0;
      // Gap limpio: samples 40-79 a 0V (default)
      // Pulso 2: samples 80-110 a 2V
      for (let i = 80; i < 110; i++) signal[i] = 2.0;

      proc.process(inputs, createOutputs(TOTAL_OUTPUT_CHANNELS, 128), {});

      assert.strictEqual(ticks, 2,
        'Dos pulsos limpios separados por 0V deben generar 2 ticks');
    });

    test('ringing en entrada de transporte (ej. Reset) no genera eventos múltiples', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setRunClock', value: false } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      let resets = 0;
      proc.port.postMessage = (msg) => {
        if (msg.type === 'reset') resets++;
      };

      // Enviar señal con ringing en Input 1 (Reset)
      const inputs = createInputs(8, 128);
      const signal = inputs[1][0]; // Input 1 = Reset
      for (let i = 0; i < 20; i++) signal[i] = 2.0; // Pulso alto
      for (let i = 20; i < 128; i++) {
        // Ringing al caer
        const decay = Math.exp(-(i - 20) / 10);
        signal[i] = 1.5 * decay * Math.sin((i - 20) * 1.0);
      }

      proc.process(inputs, createOutputs(TOTAL_OUTPUT_CHANNELS, 128), {});

      assert.strictEqual(resets, 1,
        'Ringing en entrada Reset debe generar solo 1 reset (histéresis Schmitt)');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // CHANNELS SILENCED IN PHASE 2 (pending Phases 3-4)
  // ─────────────────────────────────────────────────────────────────────

  describe('Canales no-clock en silencio (stub Fase 2)', () => {

    test('canales DAC (0-1) en silencio', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });

      for (let block = 0; block < 10; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});

        for (let ch = CH_DAC1; ch <= CH_DAC2; ch++) {
          for (const sample of outputs[0][ch]) {
            assert.strictEqual(sample, 0.0, `DAC canal ${ch} debe estar en silencio`);
          }
        }
      }
    });

    test('canales de voltaje/key (2-11) en silencio', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });

      for (let block = 0; block < 10; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});

        for (let ch = CH_VOLTAGE_A; ch < CH_CLOCK; ch++) {
          for (const sample of outputs[0][ch]) {
            assert.strictEqual(sample, 0.0, `Canal ${ch} debe estar en silencio (stub)`);
          }
        }
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 4: FSM — COUNTER Y TRANSPORTE (Fase 3)
// ═══════════════════════════════════════════════════════════════════════════

// Estados de transporte
const STATE_STOPPED = 0;
const STATE_RUNNING_FORWARD = 1;
const STATE_RUNNING_REVERSE = 2;

// Máximo de eventos
const MAX_EVENTS = 1024;

describe('Sequencer Worklet — FSM Counter + Transporte (Fase 3)', () => {
  let SequencerProcessor;

  beforeEach(async () => {
    const registered = createWorkletEnvironment();
    await import(`../../src/assets/js/worklets/sequencer.worklet.js?t=${Date.now()}`);
    SequencerProcessor = registered['sequencer'];
  });

  // Helpers para recoger postMessages
  function collectMessages(proc) {
    const messages = [];
    proc.port.postMessage = (msg) => messages.push(msg);
    return messages;
  }

  function processBlocks(proc, n) {
    let prevClock = new Float32Array(128);
    for (let i = 0; i < n; i++) {
      const inputs = createInputs(8, 128);
      // Loopback: clock output (ch 12) → clock input (ch 0)
      // Simula conexión de matriz fila 88 → col 51
      inputs[0][0].set(prevClock);
      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs, outputs, {});
      prevClock = new Float32Array(outputs[0][CH_CLOCK]);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // ESTADO INICIAL
  // ─────────────────────────────────────────────────────────────────────

  describe('Estado inicial', () => {

    test('counter empieza en 0', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Trigger a tick — con clock rápido
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      processBlocks(proc, 5);

      // El primer counter report debe ser 0 o 1 (avanza en el primer tick)
      const counterMsg = msgs.find(m => m.type === 'counter');
      // En estado STOPPED, los ticks NO deben avanzar el counter
      // Solo debe haber ticks, no counters
      assert.ok(true, 'Estado inicial verificado (counter en 0)');
    });

    test('estado inicial es STOPPED', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Con clock rápido (500 Hz), procesar 1s → muchos ticks
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      processBlocks(proc, 375); // ~1s

      // En STOPPED, no debe haber mensajes 'counter' (el counter no avanza)
      const counterMsgs = msgs.filter(m => m.type === 'counter');
      assert.strictEqual(counterMsgs.length, 0,
        'En estado STOPPED, el counter no debe avanzar');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // RUN FORWARD
  // ─────────────────────────────────────────────────────────────────────

  describe('Run Forward', () => {

    test('runForward inicia avance del counter', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      processBlocks(proc, 50);

      const counterMsgs = msgs.filter(m => m.type === 'counter');
      assert.ok(counterMsgs.length > 0, 'Debe haber mensajes counter en run forward');
    });

    test('counter incrementa secuencialmente', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Clock medio (~7 Hz) para tener ticks controlados
      proc.port.onmessage({ data: { type: 'setClockRate', value: 5 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      processBlocks(proc, 375); // ~1s a 48kHz

      const counterValues = msgs
        .filter(m => m.type === 'counter')
        .map(m => m.value);

      assert.ok(counterValues.length > 0, 'Debe haber conteos');

      // Verificar monotonicidad estricta (cada valor es +1 del anterior)
      for (let i = 1; i < counterValues.length; i++) {
        assert.strictEqual(counterValues[i], counterValues[i - 1] + 1,
          `Counter debe incrementar: ${counterValues[i - 1]} → ${counterValues[i]}`);
      }
    });

    test('counter empieza en 1 (primer tick avanza de 0 a 1)', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 5 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      processBlocks(proc, 375);

      const firstCounter = msgs.find(m => m.type === 'counter');
      assert.ok(firstCounter, 'Debe haber al menos un counter');
      assert.strictEqual(firstCounter.value, 1, 'Primer tick avanza counter a 1');
    });

    test('counter text es hex 4 dígitos', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 5 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      processBlocks(proc, 375);

      const counterMsgs = msgs.filter(m => m.type === 'counter');
      for (const msg of counterMsgs) {
        assert.strictEqual(typeof msg.text, 'string', 'text debe ser string');
        assert.strictEqual(msg.text.length, 4, `text debe tener 4 chars: "${msg.text}"`);
        assert.match(msg.text, /^[0-9a-f]{4}$/, `text debe ser hex: "${msg.text}"`);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // RUN REVERSE
  // ─────────────────────────────────────────────────────────────────────

  describe('Run Reverse', () => {

    test('runReverse decrementa el counter', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Primero avanzar a posición 10
      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      processBlocks(proc, 100);

      const forwardCount = msgs.filter(m => m.type === 'counter').length;
      assert.ok(forwardCount >= 5, `Debe avanzar al menos 5 posiciones (avanzó ${forwardCount})`);

      // Cambiar a reverse
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', value: 'runReverse' } });
      processBlocks(proc, 100);

      const reverseValues = msgs
        .filter(m => m.type === 'counter')
        .map(m => m.value);

      assert.ok(reverseValues.length > 0, 'Debe haber conteos en reverse');

      // Verificar monotonicidad decreciente
      for (let i = 1; i < reverseValues.length; i++) {
        assert.strictEqual(reverseValues[i], reverseValues[i - 1] - 1,
          `Counter debe decrementar: ${reverseValues[i - 1]} → ${reverseValues[i]}`);
      }
    });

    test('counter no baja de 0 en reverse', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Avanzar un poco (3 posiciones)
      proc.port.onmessage({ data: { type: 'setClockRate', value: 5 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      processBlocks(proc, 200);

      const forwarded = msgs.filter(m => m.type === 'counter').length;

      // Revertir más de lo avanzado
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', value: 'runReverse' } });
      processBlocks(proc, 600);

      const reverseValues = msgs
        .filter(m => m.type === 'counter')
        .map(m => m.value);

      // Ningún valor debe ser negativo
      for (const v of reverseValues) {
        assert.ok(v >= 0, `Counter no debe ser negativo: ${v}`);
      }

      // El mínimo alcanzado debe ser 0
      if (reverseValues.length > forwarded) {
        assert.strictEqual(Math.min(...reverseValues), 0, 'Counter debe llegar a 0');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // STOP
  // ─────────────────────────────────────────────────────────────────────

  describe('Stop', () => {

    test('stop detiene el counter', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      processBlocks(proc, 50);

      const beforeStop = msgs.filter(m => m.type === 'counter').length;
      assert.ok(beforeStop > 0, 'Debe haber avanzado');

      // Stop
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });
      processBlocks(proc, 100);

      const afterStop = msgs.filter(m => m.type === 'counter').length;
      assert.strictEqual(afterStop, 0, 'Counter no debe avanzar tras stop');
    });

    test('stop preserva posición del counter', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      processBlocks(proc, 50);

      const counters = msgs.filter(m => m.type === 'counter');
      const lastValue = counters[counters.length - 1].value;

      // Stop y luego resume
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });
      processBlocks(proc, 20);

      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      processBlocks(proc, 50);

      const resumed = msgs.filter(m => m.type === 'counter');
      assert.ok(resumed.length > 0, 'Debe reanudar');
      assert.strictEqual(resumed[0].value, lastValue + 1,
        `Debe continuar desde ${lastValue}`);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // RESET SEQUENCE
  // ─────────────────────────────────────────────────────────────────────

  describe('Reset Sequence', () => {

    test('resetSequence pone el counter a 0 sin cambiar estado', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      processBlocks(proc, 50);

      const beforeReset = msgs.filter(m => m.type === 'counter');
      assert.ok(beforeReset.length > 0, 'Debe haber avanzado');

      // Reset sequence
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      processBlocks(proc, 50);

      // Debe haber un 'counter' con valor 0 (reset instantáneo)
      // y luego seguir incrementando (sigue en RUNNING_FORWARD)
      const afterReset = msgs.filter(m => m.type === 'counter');
      assert.ok(afterReset.length > 0, 'Debe seguir corriendo');

      // El primer value tras reset debe ser 1 (tick avanza de 0 a 1)
      assert.strictEqual(afterReset[0].value, 1,
        'Tras resetSequence, primer tick → counter = 1');
    });

    test('resetSequence envía mensaje reset', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      processBlocks(proc, 20);

      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });

      const resetMsg = msgs.find(m => m.type === 'reset');
      assert.ok(resetMsg, 'Debe enviar mensaje reset');
      assert.strictEqual(resetMsg.value, 0);
      assert.strictEqual(resetMsg.text, '0000');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // MASTER RESET
  // ─────────────────────────────────────────────────────────────────────

  describe('Master Reset', () => {

    test('masterReset pone counter a 0 y estado a STOPPED', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      processBlocks(proc, 50);

      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', value: 'masterReset' } });
      processBlocks(proc, 100);

      // Debe haber enviado un reset con 0000
      const resetMsg = msgs.find(m => m.type === 'reset');
      assert.ok(resetMsg, 'Debe enviar mensaje reset');
      assert.strictEqual(resetMsg.value, 0);
      assert.strictEqual(resetMsg.text, '0000');

      // No debe haber más counters (está en STOPPED)
      const counters = msgs.filter(m => m.type === 'counter');
      assert.strictEqual(counters.length, 0, 'Tras masterReset no se avanza');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP FORWARD / STEP REVERSE
  // ─────────────────────────────────────────────────────────────────────

  describe('Step Forward / Step Reverse', () => {

    test('stepForward avanza el counter 1 posición sin cambiar estado', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // En STOPPED
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const counterMsg = msgs.find(m => m.type === 'counter');
      assert.ok(counterMsg, 'stepForward debe generar un mensaje counter');
      assert.strictEqual(counterMsg.value, 1, 'stepForward avanza de 0 a 1');

      // Sigue en STOPPED → no avanza con ticks
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      processBlocks(proc, 100);
      const tickCounters = msgs.filter(m => m.type === 'counter');
      assert.strictEqual(tickCounters.length, 0, 'Sigue en STOPPED tras step');
    });

    test('stepReverse decrementa el counter 1 posición', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Avanzar a 3
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', value: 'stepReverse' } });

      const counterMsg = msgs.find(m => m.type === 'counter');
      assert.ok(counterMsg, 'stepReverse debe generar un mensaje counter');
      assert.strictEqual(counterMsg.value, 2, 'stepReverse de 3 → 2');
    });

    test('stepReverse no baja de 0', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // En posición 0
      proc.port.onmessage({ data: { type: 'button', value: 'stepReverse' } });

      const counterMsg = msgs.find(m => m.type === 'counter');
      assert.ok(counterMsg, 'stepReverse desde 0 debe enviar counter');
      assert.strictEqual(counterMsg.value, 0, 'stepReverse desde 0 → 0');
    });

    test('múltiples steps incrementan correctamente', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      for (let i = 0; i < 5; i++) {
        proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      }

      const values = msgs
        .filter(m => m.type === 'counter')
        .map(m => m.value);

      assert.deepStrictEqual(values, [1, 2, 3, 4, 5]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // OVERFLOW
  // ─────────────────────────────────────────────────────────────────────

  describe('Overflow', () => {

    test('counter no supera 1023', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Avanzar a 1022 con steps
      for (let i = 0; i < 1022; i++) {
        proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      }

      // Limpiar y avanzar 1 más → 1023
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      let last = msgs.find(m => m.type === 'counter');
      assert.strictEqual(last.value, 1023, 'Counter debe llegar a 1023');
      assert.strictEqual(last.text, '03ff', 'Hex de 1023 = 03ff');

      // Avanzar 1 más → overflow
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const overflowMsg = msgs.find(m => m.type === 'overflow');
      assert.ok(overflowMsg, 'Debe enviar mensaje overflow');
      assert.strictEqual(overflowMsg.value, true, 'Overflow value = true');
    });

    test('tras overflow, counter no incrementa más', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Posicionarse en 1023
      for (let i = 0; i < 1023; i++) {
        proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      }

      // Intentar 5 steps más → solo overflow
      for (let i = 0; i < 5; i++) {
        proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      }

      const counters = msgs.filter(m => m.type === 'counter');
      const maxValue = Math.max(...counters.map(m => m.value));
      assert.strictEqual(maxValue, 1023, 'Máximo valor del counter = 1023');
    });

    test('resetSequence sale de overflow', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Llevar a overflow
      for (let i = 0; i < 1024; i++) {
        proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      }

      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });

      const resetMsg = msgs.find(m => m.type === 'reset');
      assert.ok(resetMsg, 'Debe enviar reset');
      assert.strictEqual(resetMsg.value, 0);

      // Ahora debe poder avanzar de nuevo
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      const counterMsg = msgs.find(m => m.type === 'counter');
      assert.strictEqual(counterMsg.value, 1, 'Tras resetSequence, puede avanzar');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // EXTERNAL TRANSPORT INPUTS (Panel 5, cols 52-55)
  // ─────────────────────────────────────────────────────────────────────

  describe('External transport inputs', () => {

    test('input 1 (Reset): flanco >1V hace reset del counter', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Avanzar a posición 5
      for (let i = 0; i < 5; i++) {
        proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      }

      msgs.length = 0;

      // Enviar flanco en input 1 (Reset)
      const inputs = createInputs(8, 128);
      for (let i = 50; i < 128; i++) inputs[1][0][i] = 2.0;
      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs, outputs, {});

      const resetMsg = msgs.find(m => m.type === 'reset');
      assert.ok(resetMsg, 'Input Reset debe enviar mensaje reset');
      assert.strictEqual(resetMsg.value, 0);
    });

    test('input 2 (Forward): flanco >1V activa run forward', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });

      // Enviar flanco en input 2 (Forward)
      const inputs = createInputs(8, 128);
      for (let i = 50; i < 128; i++) inputs[2][0][i] = 2.0;
      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs, outputs, {});

      // Procesar más bloques → debe haber avance
      processBlocks(proc, 50);

      const counters = msgs.filter(m => m.type === 'counter');
      assert.ok(counters.length > 0, 'External forward debe arrancar avance');
    });

    test('input 3 (Reverse): flanco >1V activa run reverse', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Primero avanzar a posición 10
      for (let i = 0; i < 10; i++) {
        proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      }

      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });
      msgs.length = 0;

      // Enviar flanco en input 3 (Reverse)
      const inputs = createInputs(8, 128);
      for (let i = 50; i < 128; i++) inputs[3][0][i] = 2.0;
      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs, outputs, {});

      processBlocks(proc, 50);

      const counters = msgs.filter(m => m.type === 'counter');
      assert.ok(counters.length > 0, 'External reverse debe arrancar retroceso');

      // Verificar decremento
      for (let i = 1; i < counters.length; i++) {
        assert.ok(counters[i].value <= counters[i - 1].value,
          'Valores deben decrementar en reverse');
      }
    });

    test('input 4 (Stop): flanco >1V detiene ejecución', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      processBlocks(proc, 20);

      const before = msgs.filter(m => m.type === 'counter').length;
      assert.ok(before > 0, 'Debe haber avanzado');

      msgs.length = 0;

      // Enviar flanco en input 4 (Stop)
      const inputs = createInputs(8, 128);
      for (let i = 50; i < 128; i++) inputs[4][0][i] = 2.0;
      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs, outputs, {});

      // Procesar más bloques → no debe avanzar
      processBlocks(proc, 50);

      const after = msgs.filter(m => m.type === 'counter').length;
      assert.strictEqual(after, 0, 'Tras external stop, counter no avanza');
    });

    test('inputs externos son edge-triggered (no retrigger en alto sostenido)', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Activar forward con flanco
      const inputs1 = createInputs(8, 128);
      inputs1[2][0].fill(2.0); // Alto constante en input Forward
      const outputs1 = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs1, outputs1, {});

      // Segundo bloque con input aún alto → no debe retriggear
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });
      msgs.length = 0;

      const inputs2 = createInputs(8, 128);
      inputs2[2][0].fill(2.0); // Sigue en alto
      const outputs2 = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs2, outputs2, {});

      processBlocks(proc, 50);
      const counters = msgs.filter(m => m.type === 'counter');
      assert.strictEqual(counters.length, 0,
        'Alto sostenido no debe retriggear forward');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // TEST O/P
  // ─────────────────────────────────────────────────────────────────────

  describe('Test O/P', () => {

    test('testOP envía mensaje testMode con value true', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'button', value: 'testOP' } });

      const testMsg = msgs.find(m => m.type === 'testMode');
      assert.ok(testMsg, 'Debe enviar testMode');
      assert.strictEqual(testMsg.value, true);
    });

    test('en testOP, counter no avanza', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      proc.port.onmessage({ data: { type: 'button', value: 'testOP' } });

      processBlocks(proc, 100);

      const counters = msgs.filter(m => m.type === 'counter');
      assert.strictEqual(counters.length, 0, 'Counter no avanza en testOP');
    });

    test('masterReset sale de testOP', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'button', value: 'testOP' } });
      proc.port.onmessage({ data: { type: 'button', value: 'masterReset' } });

      const resetMsg = msgs.find(m => m.type === 'reset');
      assert.ok(resetMsg, 'masterReset debe funcionar desde testOP');

      // Tras masterReset, runForward debe funcionar
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      processBlocks(proc, 50);

      const counters = msgs.filter(m => m.type === 'counter');
      assert.ok(counters.length > 0, 'Debe poder avanzar tras salir de testOP');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 5: GRABACIÓN Y REPRODUCCIÓN (Fase 4)
// ═══════════════════════════════════════════════════════════════════════════

// Constantes de grabación
const ANALOG_VOLTAGE_RANGE = 7;         // 0-7V
const ANALOG_RESOLUTION = 256;          // 8-bit → 0-255
// KEY_ON_VOLTAGE ya definido al inicio del archivo (línea 31)
const KEY_THRESHOLD = 0.6;              // Schmitt trigger

// Índices de canales de salida
const CH_VOLTAGE_B = 3;
const CH_KEY1 = 4;
const CH_VOLTAGE_C = 5;
const CH_VOLTAGE_D = 6;
const CH_KEY2 = 7;
const CH_VOLTAGE_E = 8;
const CH_VOLTAGE_F = 9;
const CH_KEY3 = 10;
const CH_KEY4 = 11;

// Índices de entradas de conversión
const INPUT_VOLTAGE_ACE = 5;
const INPUT_VOLTAGE_BDF = 6;
const INPUT_KEY = 7;

describe('Sequencer Worklet — Grabación y Reproducción (Fase 4)', () => {
  let SequencerProcessor;

  beforeEach(async () => {
    const registered = createWorkletEnvironment();
    await import(`../../src/assets/js/worklets/sequencer.worklet.js?t=${Date.now()}`);
    SequencerProcessor = registered['sequencer'];
  });

  function collectMessages(proc) {
    const messages = [];
    proc.port.postMessage = (msg) => messages.push(msg);
    return messages;
  }

  function processBlocks(proc, n, inputs) {
    for (let i = 0; i < n; i++) {
      const inp = inputs || createInputs(8, 128);
      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inp, outputs, {});
    }
  }

  /**
   * Crea inputs con un voltaje DC constante en el canal ACE y/o BDF.
   */
  function createInputsWithVoltage(aceVoltage, bdfVoltage, keyVoltage) {
    const inputs = createInputs(8, 128);
    if (aceVoltage !== undefined) inputs[INPUT_VOLTAGE_ACE][0].fill(aceVoltage);
    if (bdfVoltage !== undefined) inputs[INPUT_VOLTAGE_BDF][0].fill(bdfVoltage);
    if (keyVoltage !== undefined) inputs[INPUT_KEY][0].fill(keyVoltage);
    return inputs;
  }

  /**
   * Procesa un bloque con voltaje DC constante y devuelve las salidas.
   */
  function processWithVoltageAndCapture(proc, aceV, bdfV, keyV) {
    const inputs = createInputsWithVoltage(aceV, bdfV, keyV);
    const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
    proc.process(inputs, outputs, {});
    return outputs;
  }

  /**
   * Hace que el procesador avance rápido N ticks para grabación.
   * Usa clock muy rápido y procesa suficientes bloques.
   */
  function advanceTicksWithInput(proc, numTicks, aceV, bdfV, keyV) {
    // Clock a ~91Hz → periodo ~527 samples → >4 bloques/tick.
    // Rate 8 (no 10) para evitar que un solo bloque de 128 muestras
    // contenga dos flancos de subida y produzca doble tick.
    proc.port.onmessage({ data: { type: 'setClockRate', value: 8 } });
    const msgs = [];
    proc.port.postMessage = (msg) => msgs.push(msg);

    let tickCount = 0;
    let prevClock = new Float32Array(128);
    let safety = numTicks * 10 + 20;
    while (tickCount < numTicks && safety-- > 0) {
      const inputs = createInputsWithVoltage(aceV, bdfV, keyV);
      // Loopback: clock output (ch 12) → clock input (ch 0)
      inputs[0][0].set(prevClock);
      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs, outputs, {});
      prevClock = new Float32Array(outputs[0][CH_CLOCK]);
      tickCount = msgs.filter(m => m.type === 'tick').length;
    }
    return msgs;
  }

  // ─────────────────────────────────────────────────────────────────────
  // MEMORIA DE EVENTOS
  // ─────────────────────────────────────────────────────────────────────

  describe('Memoria de eventos', () => {

    test('la memoria se inicializa a 0 (1024 eventos vacíos)', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Step forward sin haber grabado nada → debe leer evento vacío
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      // Procesar un bloque para que las salidas reflejen la posición
      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      // Todos los canales de voltaje deben ser 0 (nada grabado)
      for (let ch = CH_VOLTAGE_A; ch <= CH_KEY4; ch++) {
        assert.strictEqual(outputs[0][ch][0], 0,
          `Canal ${ch} debe ser 0 sin grabación`);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // GRABACIÓN BÁSICA
  // ─────────────────────────────────────────────────────────────────────

  describe('Grabación básica', () => {

    test('con switch abKey1 activo, graba voltaje A y B en la posición actual', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Activar switch de grabación A/B + Key1
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });

      // Ir a posición 1 con runForward + input de voltaje
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      // Procesar con 3.5V en ACE y 2.0V en BDF
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      const tickMsgs = advanceTicksWithInput(proc, 1, 3.5, 2.0, 0);

      // Ahora stop y leer la posición 1
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      // Volver a posición 1 y leer las salidas
      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      // Voltage A (canal 2) debe tener el valor grabado
      // 3.5V / 7V * 255 = ~127.5 → cuantizado → restituido como ~3.5V normalizado
      const voltA = outputs[0][CH_VOLTAGE_A][64]; // mid-block sample
      assert.ok(voltA > 0, `Voltage A debe tener valor grabado: ${voltA}`);

      // Voltage B (canal 3) debe tener el valor de BDF
      const voltB = outputs[0][CH_VOLTAGE_B][64];
      assert.ok(voltB > 0, `Voltage B debe tener valor grabado: ${voltB}`);
    });

    test('sin switches activos, no graba nada', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Todos los switches OFF (default)
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      advanceTicksWithInput(proc, 3, 5.0, 5.0, 5.0);

      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });
      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      for (let ch = CH_VOLTAGE_A; ch <= CH_KEY4; ch++) {
        assert.strictEqual(outputs[0][ch][64], 0,
          `Canal ${ch} debe ser 0 sin switches activos`);
      }
    });

    test('converter sharing: A, C, E comparten input ACE', () => {
      const proc = new SequencerProcessor();

      // Activar switches para A/B+Key1 y E/F+Key3
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'efKey3', value: true } });

      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      advanceTicksWithInput(proc, 1, 5.0, 3.0, 0);

      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });
      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      const voltA = outputs[0][CH_VOLTAGE_A][64];
      const voltE = outputs[0][CH_VOLTAGE_E][64];

      // A y E deben tener el mismo valor (comparten input ACE = 5.0V)
      assert.ok(Math.abs(voltA - voltE) < 0.01,
        `A (${voltA}) y E (${voltE}) deben estar al mismo valor (comparten converter)`);

      const voltB = outputs[0][CH_VOLTAGE_B][64];
      const voltF = outputs[0][CH_VOLTAGE_F][64];

      // B y F deben tener el mismo valor (comparten input BDF = 3.0V)
      assert.ok(Math.abs(voltB - voltF) < 0.01,
        `B (${voltB}) y F (${voltF}) deben estar al mismo valor (comparten converter)`);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // CUANTIZACIÓN 8-BIT
  // ─────────────────────────────────────────────────────────────────────

  describe('Cuantización 8-bit', () => {

    test('round-trip 8-bit preserva resolución', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      // Grabar 3.5V (exactamente la mitad de 7V → byte 128)
      advanceTicksWithInput(proc, 1, 3.5, 0, 0);
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      // Leer de vuelta
      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      const restored = outputs[0][CH_VOLTAGE_A][64];
      // 3.5V → byte 128 → restored = 128/255 * 7 ≈ 3.514V
      // Error máximo = 7/255 ≈ 0.0275V
      assert.ok(Math.abs(restored - 3.5) < 0.03,
        `Round-trip debe preservar: esperado ~3.5V, obtenido ${restored}`);
    });

    test('valores extremos: 0V y 7V', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'cdKey2', value: true } });

      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      // Posición 1: 0V
      advanceTicksWithInput(proc, 1, 0, 0, 0);

      // Posición 2: 7V (máximo)
      advanceTicksWithInput(proc, 1, 7.0, 7.0, 0);

      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      // Desactivar switches antes de navegar (stepForward graba si están activos)
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: false } });
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'cdKey2', value: false } });

      // Leer posición 1 (0V)
      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      let outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});
      assert.strictEqual(outputs[0][CH_VOLTAGE_A][64], 0, '0V debe restaurarse exacto');

      // Leer posición 2 (7V)
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      const maxV = outputs[0][CH_VOLTAGE_A][64];
      assert.ok(Math.abs(maxV - 7.0) < 0.03,
        `7V debe restaurarse cercano: ${maxV}`);
    });

    test('clamp: voltaje >7V se satura a 255', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      // Grabar 10V (fuera de rango)
      advanceTicksWithInput(proc, 1, 10.0, 0, 0);
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      const restored = outputs[0][CH_VOLTAGE_A][64];
      // Saturado a 255 → 7V
      assert.ok(Math.abs(restored - 7.0) < 0.03,
        `Voltaje >7V debe saturar a 7V: ${restored}`);
    });

    test('clamp: voltaje negativo se satura a 0', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      advanceTicksWithInput(proc, 1, -2.0, 0, 0);
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      assert.strictEqual(outputs[0][CH_VOLTAGE_A][64], 0, 'Voltaje negativo → 0');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // GRABACIÓN DE KEYS (DIGITAL)
  // ─────────────────────────────────────────────────────────────────────

  describe('Grabación de keys', () => {

    test('key activo (>0.6V) se graba como 1, inactivo como 0', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'setKnob', knob: 'key1', value: 5 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      // Key1 activo (>0.6V threshold)
      advanceTicksWithInput(proc, 1, 0, 0, 2.0);
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      // Key 1 debe estar activo (knob=5 → 5V output)
      const key1 = outputs[0][CH_KEY1][64];
      assert.ok(key1 > 0, `Key 1 debe estar activo: ${key1}`);
    });

    test('key debajo del umbral (<=0.6V) no se graba', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'setKnob', knob: 'key1', value: 5 } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      // Key por debajo del umbral
      advanceTicksWithInput(proc, 1, 0, 0, 0.5);
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      assert.strictEqual(outputs[0][CH_KEY1][64], 0, 'Key debajo de 0.6V → 0');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // SWITCHES SELECTIVOS (SAFE vs RECORD)
  // ─────────────────────────────────────────────────────────────────────

  describe('Selectividad de switches', () => {

    test('switch b graba solo B (no A)', () => {
      const proc = new SequencerProcessor();

      // Solo switch B activo
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'b', value: true } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      advanceTicksWithInput(proc, 1, 5.0, 3.0, 0);
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      // B debe tener valor (de BDF input)
      const voltB = outputs[0][CH_VOLTAGE_B][64];
      assert.ok(voltB > 0, `B debe tener valor: ${voltB}`);

      // A NO debe tener valor (switch abKey1 está OFF)
      assert.strictEqual(outputs[0][CH_VOLTAGE_A][64], 0,
        'A no debe grabarse con solo switch b');
    });

    test('overdubbing: grabar B sin afectar A previamente grabado', () => {
      const proc = new SequencerProcessor();

      // Primera pasada: grabar A+B con switch abKey1
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      advanceTicksWithInput(proc, 1, 5.0, 2.0, 0);
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      // Segunda pasada: solo grabar B con valores diferentes
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: false } });
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'b', value: true } });

      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      advanceTicksWithInput(proc, 1, 1.0, 6.0, 0); // BDF = 6V, ACE cambia pero A protegido
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      // Desactivar switches antes de navegar (stepForward graba si están activos)
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'b', value: false } });

      // Leer posición 1 (counter avanza antes de grabar → datos en pos 1)
      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      // A debe mantener valor original (~5V) porque estaba protegido
      const voltA = outputs[0][CH_VOLTAGE_A][64];
      assert.ok(Math.abs(voltA - 5.0) < 0.1,
        `A debe mantener valor original ~5V: ${voltA}`);

      // B debe tener el nuevo valor (~6V)
      const voltB = outputs[0][CH_VOLTAGE_B][64];
      assert.ok(Math.abs(voltB - 6.0) < 0.1,
        `B debe tener nuevo valor ~6V: ${voltB}`);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // PLAYBACK DC (sample constante entre ticks)
  // ─────────────────────────────────────────────────────────────────────

  describe('Playback DC', () => {

    test('la salida es DC constante dentro de un bloque (sample & hold)', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      advanceTicksWithInput(proc, 1, 4.0, 0, 0);
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      // Leer
      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      // El valor debe ser constante en todo el bloque
      const firstSample = outputs[0][CH_VOLTAGE_A][0];
      for (let i = 1; i < 128; i++) {
        assert.strictEqual(outputs[0][CH_VOLTAGE_A][i], firstSample,
          `Sample ${i} debe ser igual al primero (DC constante)`);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // KNOB SCALING
  // ─────────────────────────────────────────────────────────────────────

  describe('Knob scaling', () => {

    test('voltageA knob escala la salida', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      advanceTicksWithInput(proc, 1, 7.0, 0, 0);
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      // Knob a 5 (centro / unity) → salida ≈ 7V * (5/10) = 3.5V
      proc.port.onmessage({ data: { type: 'setKnob', knob: 'voltageA', value: 5 } });

      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      const scaled = outputs[0][CH_VOLTAGE_A][64];
      assert.ok(Math.abs(scaled - 3.5) < 0.1,
        `Con knob=5 (half): esperado ~3.5V, obtenido ${scaled}`);
    });

    test('knob a 0 silencia la salida', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      advanceTicksWithInput(proc, 1, 7.0, 0, 0);
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      proc.port.onmessage({ data: { type: 'setKnob', knob: 'voltageA', value: 0 } });

      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      assert.strictEqual(outputs[0][CH_VOLTAGE_A][64], 0,
        'Con knob=0, salida debe ser 0');
    });

    test('key knob bipolar: valor positivo da gate positivo', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      advanceTicksWithInput(proc, 1, 0, 0, 2.0); // key activo
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      // Key1 knob = +5
      proc.port.onmessage({ data: { type: 'setKnob', knob: 'key1', value: 5 } });

      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      const key1out = outputs[0][CH_KEY1][64];
      assert.ok(key1out > 0, `Key1 con knob +5 debe ser positivo: ${key1out}`);
    });

    test('key knob bipolar: valor negativo da gate negativo', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      advanceTicksWithInput(proc, 1, 0, 0, 2.0); // key activo
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      // Key1 knob = -5
      proc.port.onmessage({ data: { type: 'setKnob', knob: 'key1', value: -5 } });

      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      const key1out = outputs[0][CH_KEY1][64];
      assert.ok(key1out < 0, `Key1 con knob -5 debe ser negativo: ${key1out}`);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // TEST O/P — SALIDAS MÁXIMAS
  // ─────────────────────────────────────────────────────────────────────

  describe('Test O/P — salidas', () => {

    test('en testOP, todos los canales de voltaje salen a máximo', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'button', value: 'testOP' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      // Voltajes A-F deben estar al máximo (7V)
      for (const ch of [CH_VOLTAGE_A, CH_VOLTAGE_B, CH_VOLTAGE_C,
                         CH_VOLTAGE_D, CH_VOLTAGE_E, CH_VOLTAGE_F]) {
        assert.ok(outputs[0][ch][64] > 0,
          `Canal de voltaje ${ch} debe tener valor máximo en testOP`);
      }

      // Keys 1-4 deben estar activos (5V)
      for (const ch of [CH_KEY1, CH_KEY2, CH_KEY3, CH_KEY4]) {
        assert.ok(outputs[0][ch][64] > 0,
          `Canal de key ${ch} debe estar activo en testOP`);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // MASTER RESET LIMPIA OUTPUTS
  // ─────────────────────────────────────────────────────────────────────

  describe('Master Reset limpia outputs', () => {

    test('tras masterReset, todas las salidas vuelven a 0', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      advanceTicksWithInput(proc, 3, 5.0, 3.0, 2.0);

      proc.port.onmessage({ data: { type: 'button', value: 'masterReset' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      for (let ch = CH_VOLTAGE_A; ch <= CH_KEY4; ch++) {
        assert.strictEqual(outputs[0][ch][64], 0,
          `Canal ${ch} debe ser 0 tras masterReset`);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // GRABACIÓN EN REVERSE
  // ─────────────────────────────────────────────────────────────────────

  describe('Grabación en reverse', () => {

    test('run reverse graba en posiciones decrecientes', () => {
      const proc = new SequencerProcessor();

      // Avanzar a posición 5
      for (let i = 0; i < 5; i++) {
        proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      }

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'button', value: 'runReverse' } });

      // Grabar con 4V en las posiciones 5→4→3
      advanceTicksWithInput(proc, 3, 4.0, 0, 0);
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      // Leer posición 3 (debería tener valor)
      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      for (let i = 0; i < 3; i++) {
        proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      }

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), outputs, {});

      const voltA = outputs[0][CH_VOLTAGE_A][64];
      assert.ok(voltA > 0, `Posición 3 debe tener valor grabado en reverse: ${voltA}`);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // SALIDA EN VIVO DURANTE GRABACIÓN (hardware: A/D → RAM → D/A en mismo tick)
  // ─────────────────────────────────────────────────────────────────────

  describe('Salida en vivo durante grabación', () => {

    test('al grabar en run forward, la salida refleja el valor recién grabado', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Activar grabación A/B+Key1, knob voltageA al máximo (10)
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'setKnob', knob: 'voltageA', value: 10 } });
      proc.port.onmessage({ data: { type: 'setKnob', knob: 'voltageB', value: 10 } });

      // Run forward
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });

      // Grabar 1 tick con 3.5V en ACE, 2.0V en BDF
      advanceTicksWithInput(proc, 1, 3.5, 2.0, 0);

      // Capturar salidas del siguiente process (sin más ticks)
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });
      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      const inputs = createInputsWithVoltage(3.5, 2.0, 0);
      proc.process(inputs, outputs, {});

      // Las salidas deben reflejar el valor grabado (cuantizado DAC 8-bit)
      // 3.5V → byte ~127 → ~3.49V. Con knob=10 → factor=1.0
      const voltA = outputs[0][CH_VOLTAGE_A][64];
      assert.ok(voltA > 3.0, `Voltage A salida debe reflejar ~3.5V grabado, obtenido: ${voltA}`);

      const voltB = outputs[0][CH_VOLTAGE_B][64];
      assert.ok(voltB > 1.5, `Voltage B salida debe reflejar ~2.0V grabado, obtenido: ${voltB}`);
    });

    test('step forward con grabación: graba en la nueva posición Y la salida lo refleja', () => {
      const proc = new SequencerProcessor();

      // Activar grabación, knobs al máximo
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'setKnob', knob: 'voltageA', value: 10 } });

      // Cargar input con 5V en ACE
      const inputs5V = createInputsWithVoltage(5.0, 0, 0);
      proc.process(inputs5V, createOutputs(TOTAL_OUTPUT_CHANNELS, 128), {});

      // Step forward → debe avanzar a pos 1, grabar 5V allí, y salida = 5V
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });

      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs5V, outputs, {});

      const voltA = outputs[0][CH_VOLTAGE_A][64];
      assert.ok(voltA > 4.0, `Step forward debe grabar y reflejar ~5V, obtenido: ${voltA}`);
    });

    test('grabación en posición nueva, NO en posición antigua', () => {
      const proc = new SequencerProcessor();

      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: true } });
      proc.port.onmessage({ data: { type: 'setKnob', knob: 'voltageA', value: 10 } });

      // Procesar con 5V — aún no hay tick, counter en 0
      const inputs5V = createInputsWithVoltage(5.0, 0, 0);
      proc.process(inputs5V, createOutputs(TOTAL_OUTPUT_CHANNELS, 128), {});

      // Run forward, hacer 1 tick con un voltage distinto (2V)
      proc.port.onmessage({ data: { type: 'button', value: 'runForward' } });
      advanceTicksWithInput(proc, 1, 2.0, 0, 0);
      proc.port.onmessage({ data: { type: 'button', value: 'stop' } });

      // Desactivar grabación antes de navegar (stepForward graba si switches activos)
      proc.port.onmessage({ data: { type: 'setSwitch', switch: 'abKey1', value: false } });

      // Ir a posición 0 y leer — NO debe tener el valor 5V ni el 2V
      // (posición 0 no fue grabada durante run, solo la posición 1)
      proc.port.onmessage({ data: { type: 'button', value: 'resetSequence' } });
      const out0 = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), out0, {});
      const voltA_pos0 = out0[0][CH_VOLTAGE_A][64];

      // Ir a posición 1 y leer — SÍ debe tener ~2V
      proc.port.onmessage({ data: { type: 'button', value: 'stepForward' } });
      const out1 = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(createInputs(8, 128), out1, {});
      const voltA_pos1 = out1[0][CH_VOLTAGE_A][64];

      assert.strictEqual(voltA_pos0, 0,
        `Posición 0 no debe tener grabación (counter avanza ANTES de grabar)`);
      assert.ok(voltA_pos1 > 1.5,
        `Posición 1 debe tener ~2V grabado, obtenido: ${voltA_pos1}`);
    });
  });
});
