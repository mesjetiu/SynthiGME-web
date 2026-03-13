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

    test('clock en canal 12, amplitud 1.0 durante ~5ms', () => {
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
        if (allClock[i] === 1.0 && allClock[i - 1] === 0.0) {
          pulseStart = i;
          break;
        }
      }
      // Si empieza en sample 0, el pulso comienza ahí
      if (pulseStart === -1 && allClock[0] === 1.0) {
        pulseStart = 0;
      }

      assert.ok(pulseStart >= 0, 'Debe haber al menos un pulso clock');

      // Medir ancho del pulso
      let pulseWidth = 0;
      for (let i = pulseStart; i < allClock.length; i++) {
        if (allClock[i] === 1.0) {
          pulseWidth++;
        } else {
          break;
        }
      }

      assert.strictEqual(pulseWidth, expectedPulseSamples,
        `Pulso clock debe tener ${expectedPulseSamples} samples, tiene ${pulseWidth}`);
    });

    test('clock pulse valores solo {0.0, 1.0}', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setClockRate', value: 8 } });
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });

      for (let block = 0; block < 50; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});

        for (const sample of outputs[0][CH_CLOCK]) {
          assert.ok(sample === 0.0 || sample === 1.0,
            `Clock sample ${sample} debe ser 0.0 o 1.0`);
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
      for (let block = 0; block < blocksPerSecond; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
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
          if (clock[i] === 1.0 && clock[i - 1] === 0.0) {
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

      for (let block = 0; block < 100; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
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

      for (let block = 0; block < 100; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
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

      for (let block = 0; block < 50; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
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
      proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });

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
      proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });
      const inputs = createInputs(8, 128);
      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      assert.strictEqual(proc.process(inputs, outputs, {}), true);
    });

    test('despertar de dormancy: clock reanuda pulsos', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });
      proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });

      // Avanzar el reloj internamente durante dormancy
      for (let block = 0; block < 50; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
      }

      // Despertar
      proc.port.onmessage({ data: { type: 'setDormant', dormant: false } });

      let edgeCount = 0;
      for (let block = 0; block < 100; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
        const clock = outputs[0][CH_CLOCK];
        for (let i = 1; i < 128; i++) {
          if (clock[i] === 1.0 && clock[i - 1] === 0.0) {
            edgeCount++;
          }
        }
      }
      assert.ok(edgeCount > 0, 'Clock debe reanudar tras despertar de dormancy');
    });

    test('clock sigue corriendo internamente durante dormancy', () => {
      const proc = new SequencerProcessor();
      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      proc.port.onmessage({ data: { type: 'setRunClock', value: true } });

      // Contar ticks internos reportados vía postMessage
      let ticksDuringDormancy = 0;
      proc.port.postMessage = (msg) => {
        if (msg.type === 'tick') ticksDuringDormancy++;
      };

      proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });

      // Procesar ~0.5s a 500 Hz → debería haber ~250 ticks
      const blocks = Math.ceil(SAMPLE_RATE * 0.5 / 128);
      for (let block = 0; block < blocks; block++) {
        const inputs = createInputs(8, 128);
        const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
        proc.process(inputs, outputs, {});
      }

      assert.ok(ticksDuringDormancy > 100,
        `El reloj debe seguir contando internamente durante dormancy (ticks: ${ticksDuringDormancy})`);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // EXTERNAL CLOCK INPUT
  // ─────────────────────────────────────────────────────────────────────

  describe('External clock input', () => {

    test('flanco externo >1V en input 0 genera tick', () => {
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
      // Señal a 0.5V (debajo del umbral de 1V)
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
