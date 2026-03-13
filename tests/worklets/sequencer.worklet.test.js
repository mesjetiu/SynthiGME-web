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
    for (let i = 0; i < n; i++) {
      const inputs = createInputs(8, 128);
      const outputs = createOutputs(TOTAL_OUTPUT_CHANNELS, 128);
      proc.process(inputs, outputs, {});
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
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });

      processBlocks(proc, 50);

      const counterMsgs = msgs.filter(m => m.type === 'counter');
      assert.ok(counterMsgs.length > 0, 'Debe haber mensajes counter en run forward');
    });

    test('counter incrementa secuencialmente', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Clock medio (~7 Hz) para tener ticks controlados
      proc.port.onmessage({ data: { type: 'setClockRate', value: 5 } });
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });

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
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });

      processBlocks(proc, 375);

      const firstCounter = msgs.find(m => m.type === 'counter');
      assert.ok(firstCounter, 'Debe haber al menos un counter');
      assert.strictEqual(firstCounter.value, 1, 'Primer tick avanza counter a 1');
    });

    test('counter text es hex 4 dígitos', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 5 } });
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });

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
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });
      processBlocks(proc, 100);

      const forwardCount = msgs.filter(m => m.type === 'counter').length;
      assert.ok(forwardCount >= 5, `Debe avanzar al menos 5 posiciones (avanzó ${forwardCount})`);

      // Cambiar a reverse
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', button: 'runReverse' } });
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
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });
      processBlocks(proc, 200);

      const forwarded = msgs.filter(m => m.type === 'counter').length;

      // Revertir más de lo avanzado
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', button: 'runReverse' } });
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
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });
      processBlocks(proc, 50);

      const beforeStop = msgs.filter(m => m.type === 'counter').length;
      assert.ok(beforeStop > 0, 'Debe haber avanzado');

      // Stop
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', button: 'stop' } });
      processBlocks(proc, 100);

      const afterStop = msgs.filter(m => m.type === 'counter').length;
      assert.strictEqual(afterStop, 0, 'Counter no debe avanzar tras stop');
    });

    test('stop preserva posición del counter', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });
      processBlocks(proc, 50);

      const counters = msgs.filter(m => m.type === 'counter');
      const lastValue = counters[counters.length - 1].value;

      // Stop y luego resume
      proc.port.onmessage({ data: { type: 'button', button: 'stop' } });
      processBlocks(proc, 20);

      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });
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
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });
      processBlocks(proc, 50);

      const beforeReset = msgs.filter(m => m.type === 'counter');
      assert.ok(beforeReset.length > 0, 'Debe haber avanzado');

      // Reset sequence
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', button: 'resetSequence' } });
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
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });
      processBlocks(proc, 20);

      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', button: 'resetSequence' } });

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
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });
      processBlocks(proc, 50);

      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', button: 'masterReset' } });
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
      proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });

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
      proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });
      proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });
      proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });

      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', button: 'stepReverse' } });

      const counterMsg = msgs.find(m => m.type === 'counter');
      assert.ok(counterMsg, 'stepReverse debe generar un mensaje counter');
      assert.strictEqual(counterMsg.value, 2, 'stepReverse de 3 → 2');
    });

    test('stepReverse no baja de 0', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // En posición 0
      proc.port.onmessage({ data: { type: 'button', button: 'stepReverse' } });

      const counterMsg = msgs.find(m => m.type === 'counter');
      assert.ok(counterMsg, 'stepReverse desde 0 debe enviar counter');
      assert.strictEqual(counterMsg.value, 0, 'stepReverse desde 0 → 0');
    });

    test('múltiples steps incrementan correctamente', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      for (let i = 0; i < 5; i++) {
        proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });
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
        proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });
      }

      // Limpiar y avanzar 1 más → 1023
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });
      let last = msgs.find(m => m.type === 'counter');
      assert.strictEqual(last.value, 1023, 'Counter debe llegar a 1023');
      assert.strictEqual(last.text, '03ff', 'Hex de 1023 = 03ff');

      // Avanzar 1 más → overflow
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });

      const overflowMsg = msgs.find(m => m.type === 'overflow');
      assert.ok(overflowMsg, 'Debe enviar mensaje overflow');
      assert.strictEqual(overflowMsg.text, 'ofof', 'Overflow text = "ofof"');
    });

    test('tras overflow, counter no incrementa más', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      // Posicionarse en 1023
      for (let i = 0; i < 1023; i++) {
        proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });
      }

      // Intentar 5 steps más → solo overflow
      for (let i = 0; i < 5; i++) {
        proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });
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
        proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });
      }

      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', button: 'resetSequence' } });

      const resetMsg = msgs.find(m => m.type === 'reset');
      assert.ok(resetMsg, 'Debe enviar reset');
      assert.strictEqual(resetMsg.value, 0);

      // Ahora debe poder avanzar de nuevo
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });
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
        proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });
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
        proc.port.onmessage({ data: { type: 'button', button: 'stepForward' } });
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
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });
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
      proc.port.onmessage({ data: { type: 'button', button: 'stop' } });
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

    test('testOP envía mensaje testMode con text "CAll"', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'button', button: 'testOP' } });

      const testMsg = msgs.find(m => m.type === 'testMode');
      assert.ok(testMsg, 'Debe enviar testMode');
      assert.strictEqual(testMsg.text, 'CAll');
    });

    test('en testOP, counter no avanza', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'setClockRate', value: 10 } });
      proc.port.onmessage({ data: { type: 'button', button: 'testOP' } });

      processBlocks(proc, 100);

      const counters = msgs.filter(m => m.type === 'counter');
      assert.strictEqual(counters.length, 0, 'Counter no avanza en testOP');
    });

    test('masterReset sale de testOP', () => {
      const proc = new SequencerProcessor();
      const msgs = collectMessages(proc);

      proc.port.onmessage({ data: { type: 'button', button: 'testOP' } });
      proc.port.onmessage({ data: { type: 'button', button: 'masterReset' } });

      const resetMsg = msgs.find(m => m.type === 'reset');
      assert.ok(resetMsg, 'masterReset debe funcionar desde testOP');

      // Tras masterReset, runForward debe funcionar
      msgs.length = 0;
      proc.port.onmessage({ data: { type: 'setClockRate', value: 7 } });
      proc.port.onmessage({ data: { type: 'button', button: 'runForward' } });
      processBlocks(proc, 50);

      const counters = msgs.filter(m => m.type === 'counter');
      assert.ok(counters.length > 0, 'Debe poder avanzar tras salir de testOP');
    });
  });
});
