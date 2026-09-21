/**
 * Tests del worklet real `pitch-to-voltage-converter` (placa PC-25 del
 * Synthi 100): detector de pitch por cruces por cero → voltaje 1 V/oct.
 *
 * Hasta septiembre de 2026 este fichero replicaba las fórmulas
 * (freqToVoltage, rangeDialToSpread, cruces por cero) y las probaba a sí
 * mismas. Ahora se carga el worklet de verdad en Node y se le dan señales
 * reales (senos, cuadradas, silencio), midiendo el voltaje que saca.
 *
 * Escala de salida: V = log2(f/440) · spread / 4 (la señal digital va en
 * ±1 = ±4 V, así que 1 V/oct son 0,25 unidades por octava).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const SAMPLE_RATE = 48000;
const BLOCK = 128;

// ═══════════════════════════════════════════════════════════════════════════
// Entorno de worklet en Node
// ═══════════════════════════════════════════════════════════════════════════

function createWorkletEnvironment() {
  globalThis.sampleRate = SAMPLE_RATE;
  globalThis.currentTime = 0;
  globalThis.currentFrame = 0;
  if (!globalThis.AudioWorkletProcessor) {
    globalThis.AudioWorkletProcessor = class AudioWorkletProcessor {
      constructor() {
        this.port = { onmessage: null, _messages: [], postMessage(m) { this._messages.push(m); } };
      }
    };
  }
  const registered = {};
  globalThis.registerProcessor = (name, cls) => { registered[name] = cls; };
  return registered;
}

let PVCProcessor;

async function loadProcessor() {
  const registered = createWorkletEnvironment();
  await import(`../../src/assets/js/worklets/pitchToVoltageConverter.worklet.js?t=${Date.now()}`);
  PVCProcessor = registered['pitch-to-voltage-converter'];
  assert.ok(PVCProcessor, 'el worklet debe registrarse como "pitch-to-voltage-converter"');
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function createProcessor() {
  return new PVCProcessor();
}

function send(proc, data) {
  proc.port.onmessage({ data });
}

/** Procesa un bloque de entrada mono y devuelve el canal de salida. */
function processBlock(proc, input) {
  const out = new Float32Array(BLOCK);
  const inputs = input ? [[input]] : [[]];
  const ok = proc.process(inputs, [[out]]);
  return { ok, out };
}

/** Genera y procesa `blocks` bloques de una señal; devuelve la última salida. */
function feed(proc, signalAt, blocks) {
  let out;
  let n = 0;
  for (let b = 0; b < blocks; b++) {
    const input = new Float32Array(BLOCK);
    for (let i = 0; i < BLOCK; i++) input[i] = signalAt(n++);
    ({ out } = processBlock(proc, input));
  }
  return out;
}

const sine = (freq, amp = 0.5) => n => amp * Math.sin(2 * Math.PI * freq * n / SAMPLE_RATE);
const square = (freq, amp = 0.5) => n => (Math.sin(2 * Math.PI * freq * n / SAMPLE_RATE) >= 0 ? amp : -amp);

/** Error en cents entre el voltaje de salida y la frecuencia real, para un spread dado. */
const centsError = (voltage, freq, spread = 1) => 1200 * ((voltage * 4) / spread - Math.log2(freq / 440));

/**
 * El detector mide semiperiodos en muestras enteras, sin interpolar: la
 * lectura salta entre los dos semiperiodos vecinos y el error máximo es el
 * de una muestra. Se acepta ese paso más 1 cent de margen.
 */
function quantizationCents(freq) {
  const halfPeriod = SAMPLE_RATE / (2 * freq);
  return 1200 * Math.log2(halfPeriod / (halfPeriod - 1)) + 1;
}

function assertPitch(voltage, freq, spread = 1) {
  const err = centsError(voltage, freq, spread);
  const tol = quantizationCents(freq);
  assert.ok(Math.abs(err) < tol, `${freq} Hz (spread ${spread}): ${err.toFixed(1)} cents, tolerancia ±${tol.toFixed(1)}`);
}

/** _heldVoltage es double; la salida es Float32: comparar con la misma precisión. */
const f32 = v => Math.fround(v);

// ═══════════════════════════════════════════════════════════════════════════

describe('pitch-to-voltage-converter worklet', () => {
  beforeEach(loadProcessor);

  describe('Estado inicial y mensajes', () => {
    it('arranca despierto, sin voltaje retenido y con spread 1 (dial 7)', () => {
      const proc = createProcessor();
      assert.equal(proc._dormant, false);
      assert.equal(proc._stopped, false);
      assert.equal(proc._spreadFactor, 1);
      assert.equal(proc._heldVoltage, 0);
    });

    it('setRange convierte el dial 0..10 a spread −2..+2 con codo en 3,5 y 7', () => {
      const proc = createProcessor();
      const cases = [[0, -2], [1.75, -1], [3.5, 0], [5.25, 0.5], [7, 1], [8.5, 1.5], [10, 2]];
      for (const [dial, spread] of cases) {
        send(proc, { type: 'setRange', value: dial });
        assert.ok(Math.abs(proc._spreadFactor - spread) < 1e-12, `dial ${dial} → ${proc._spreadFactor}`);
      }
    });

    it('el spread es monótono creciente en todo el dial', () => {
      const proc = createProcessor();
      let prev = -Infinity;
      for (let d = 0; d <= 10; d += 0.25) {
        const s = proc._rangeDialToSpread(d);
        assert.ok(s > prev, `dial ${d}`);
        prev = s;
      }
    });

    it('setDormant y stop cambian el estado; mensajes desconocidos no', () => {
      const proc = createProcessor();
      send(proc, { type: 'setDormant', dormant: true });
      assert.equal(proc._dormant, true);
      send(proc, { type: 'setDormant', dormant: 0 });
      assert.equal(proc._dormant, false);
      send(proc, { type: 'otro' });
      assert.equal(proc._stopped, false);
      send(proc, { type: 'stop' });
      assert.equal(proc._stopped, true);
    });
  });

  describe('Ciclo de vida en process()', () => {
    it('tras stop devuelve false (el nodo muere)', () => {
      const proc = createProcessor();
      send(proc, { type: 'stop' });
      assert.equal(processBlock(proc, new Float32Array(BLOCK)).ok, false);
    });

    it('sin canal de salida sigue vivo sin hacer nada', () => {
      const proc = createProcessor();
      assert.equal(proc.process([[new Float32Array(BLOCK)]], [[]]), true);
    });

    it('dormido saca 0 pero conserva el voltaje retenido', () => {
      const proc = createProcessor();
      feed(proc, sine(880), 10);
      const held = proc._heldVoltage;
      assert.ok(held > 0);
      send(proc, { type: 'setDormant', dormant: true });
      const { ok, out } = processBlock(proc, new Float32Array(BLOCK).map((_, i) => sine(880)(i)));
      assert.equal(ok, true);
      assert.ok(out.every(v => v === 0));
      assert.equal(proc._heldVoltage, held);
      send(proc, { type: 'setDormant', dormant: false });
      const { out: after } = processBlock(proc, new Float32Array(BLOCK));
      assert.ok(after.every(v => v === f32(held)), 'al despertar vuelve a sacar lo retenido');
    });

    it('sin entrada conectada saca el voltaje retenido', () => {
      const proc = createProcessor();
      proc._heldVoltage = 0.125;
      const { out } = processBlock(proc, null);
      assert.ok(out.every(v => v === 0.125));
      const { out: empty } = processBlock(proc, new Float32Array(0));
      assert.ok(empty.every(v => v === 0.125));
    });
  });

  describe('Track & hold', () => {
    it('la señal bajo el umbral (RMS < 0,02) no cambia el voltaje', () => {
      const proc = createProcessor();
      feed(proc, sine(880), 10);
      const held = proc._heldVoltage;
      const out = feed(proc, sine(220, 0.01), 10);      // 220 Hz muy bajito
      assert.equal(proc._heldVoltage, held);
      assert.ok(out.every(v => v === f32(held)));
    });

    it('el silencio absoluto tampoco', () => {
      const proc = createProcessor();
      feed(proc, sine(1000), 10);
      const held = proc._heldVoltage;
      const out = feed(proc, () => 0, 20);
      assert.ok(out.every(v => v === f32(held)));
    });

    it('sin ninguna detección previa saca 0', () => {
      const proc = createProcessor();
      const out = feed(proc, () => 0, 3);
      assert.ok(out.every(v => v === 0));
    });
  });

  describe('Detección de pitch → voltaje 1 V/oct', () => {
    it('440 Hz → 0 V (±1 muestra de semiperiodo = ±32 cents)', () => {
      const proc = createProcessor();
      const out = feed(proc, sine(440), 20);
      assertPitch(out[0], 440);
    });

    it('880 Hz → +1 octava (= +0,25 en escala digital, 1 V real)', () => {
      const proc = createProcessor();
      const out = feed(proc, sine(880), 20);
      assertPitch(out[0], 880);
      assert.ok(Math.abs(out[0] - 0.25) < 0.02);
    });

    it('la salida es DC: todo el bloque lleva el mismo valor', () => {
      const proc = createProcessor();
      const out = feed(proc, sine(1000), 20);
      assert.ok(out.every(v => v === out[0]));
    });

    it('sigue 1 V/oct en todo el rango 250..8000 Hz, dentro de la cuantización', () => {
      for (const f of [250, 300, 400, 500, 600, 750, 800, 1000, 1200, 1500, 2000, 3000, 4000, 6000, 8000]) {
        const proc = createProcessor();
        const out = feed(proc, sine(f), 30);
        assertPitch(out[0], f);
      }
    });

    it('cuando el semiperiodo es entero, la lectura es exacta', () => {
      // 250 Hz → 96 muestras; 1000 → 24; 2000 → 12; 4000 → 6
      for (const f of [250, 1000, 2000, 4000]) {
        const proc = createProcessor();
        const out = feed(proc, sine(f), 30);
        assert.ok(Math.abs(centsError(out[0], f)) < 0.5, `${f} Hz: ${centsError(out[0], f).toFixed(2)} cents`);
      }
    });

    it('QUIRK: sin interpolar cruces, un semiperiodo no entero sale desafinado', () => {
      // 1100 Hz → 21,8 muestras: el detector lee 21 (+66 cents) o 22 (−14).
      // Nunca lo justo. Se fija tal cual está; ver AUDITORIA-2026-09.md.
      const proc = createProcessor();
      const out = feed(proc, sine(1100), 30);
      const err = Math.abs(centsError(out[0], 1100));
      assert.ok(err > 5, `debería estar desafinado y da ${err.toFixed(1)} cents`);
      assert.ok(err < quantizationCents(1100));
    });

    it('funciona igual con una cuadrada', () => {
      const proc = createProcessor();
      const out = feed(proc, square(1000), 20);
      assertPitch(out[0], 1000);
    });

    it('la amplitud no afecta (es un detector de cruces, no de nivel)', () => {
      const a = feed(createProcessor(), sine(660, 0.05), 20)[0];
      const b = feed(createProcessor(), sine(660, 1.0), 20)[0];
      assert.ok(Math.abs(a - b) < 1e-9);
    });

    it('por debajo de 250 Hz no se detecta nada', () => {
      const proc = createProcessor();
      feed(proc, sine(100), 40);
      assert.equal(proc._heldVoltage, 0);
      assert.equal(proc._detectedFreq, 0);
    });

    it('QUIRK: por encima de 8 kHz se lee 8 kHz (semiperiodo de 3 muestras)', () => {
      // A 12 kHz el semiperiodo son 2 muestras (rechazado, 12 kHz), pero el
      // muestreo alterna con tramos de 3 (= 8000 Hz, justo el máximo) y esos
      // se aceptan. No hay filtro antialias delante del detector.
      const proc = createProcessor();
      feed(proc, sine(12000), 40);
      assert.equal(proc._detectedFreq, 8000);
    });

    it('sigue un cambio de nota con fase continua: 440 → 880 → 1760', () => {
      const proc = createProcessor();
      let phase = 0;
      const play = (freq, blocks) => {
        for (let b = 0; b < blocks; b++) {
          const input = new Float32Array(BLOCK);
          for (let i = 0; i < BLOCK; i++) {
            input[i] = 0.5 * Math.sin(phase);
            phase += 2 * Math.PI * freq / SAMPLE_RATE;
          }
          processBlock(proc, input);
        }
      };
      play(440, 20);
      assertPitch(proc._heldVoltage, 440);
      play(880, 20);
      assertPitch(proc._heldVoltage, 880);
      play(1760, 20);
      assertPitch(proc._heldVoltage, 1760);
    });

    it('QUIRK: bajar a una nota fuera de rango deja retenido el semiperiodo de la transición', () => {
      // De 880 Hz a 220 Hz el primer semiperiodo estirado mide ≈ 43 muestras
      // (≈ 558 Hz), está dentro de 250..8000 y se acepta; como 220 Hz ya no
      // se detecta, esa lectura falsa se queda en el track & hold. Sin
      // validación de continuidad no hay forma de descartarla.
      const proc = createProcessor();
      let phase = 0;
      const play = (freq, blocks) => {
        for (let b = 0; b < blocks; b++) {
          const input = new Float32Array(BLOCK);
          for (let i = 0; i < BLOCK; i++) {
            input[i] = 0.5 * Math.sin(phase);
            phase += 2 * Math.PI * freq / SAMPLE_RATE;
          }
          processBlock(proc, input);
        }
      };
      play(880, 20);
      play(220, 40);
      const readHz = 440 * Math.pow(2, proc._heldVoltage * 4);
      assert.ok(readHz > 250 && readHz < 880, `retiene ${readHz.toFixed(0)} Hz, ni 880 ni 220`);
    });

    it('un cruce que cae justo en la frontera entre bloques se mide bien', () => {
      // 375 Hz → semiperiodo de 64 muestras: cruces en 0, 64, 128, 192…
      const proc = createProcessor();
      const out = feed(proc, sine(375), 30);
      assert.ok(Math.abs(centsError(out[0], 375)) < 0.5);
    });
  });

  describe('Spread (dial Range)', () => {
    it('spread 2 (dial 10) dobla la pendiente: 880 Hz → +0,5', () => {
      const proc = createProcessor();
      send(proc, { type: 'setRange', value: 10 });
      const out = feed(proc, sine(880), 20);
      assertPitch(out[0], 880, 2);
      assert.ok(Math.abs(out[0] - 0.5) < 0.04);
    });

    it('spread −2 (dial 0) invierte: 880 Hz → −0,5', () => {
      const proc = createProcessor();
      send(proc, { type: 'setRange', value: 0 });
      const out = feed(proc, sine(880), 20);
      assertPitch(out[0], 880, -2);
      assert.ok(Math.abs(out[0] - (-0.5)) < 0.04);
    });

    it('spread 0 (dial 3,5): cualquier nota → 0 V', () => {
      const proc = createProcessor();
      send(proc, { type: 'setRange', value: 3.5 });
      assert.ok(Math.abs(feed(proc, sine(880), 20)[0]) < 1e-12);
      assert.ok(Math.abs(feed(proc, sine(3000), 20)[0]) < 1e-12);
    });

    it('cambiar el rango se aplica en la siguiente detección, no al voltaje ya retenido', () => {
      const proc = createProcessor();
      feed(proc, sine(880), 20);
      send(proc, { type: 'setRange', value: 10 });
      const heldBefore = proc._heldVoltage;
      const silent = feed(proc, () => 0, 5);
      assert.ok(silent.every(v => v === f32(heldBefore)), 'sin señal, sigue el valor viejo');
      feed(proc, sine(880), 20);
      assertPitch(proc._heldVoltage, 880, 2);
    });
  });
});
