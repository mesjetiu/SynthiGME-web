/**
 * Tests del slew inherente del módulo oscilador (synthOscillator.worklet.js).
 *
 * Los amplificadores CA3140 del Synthi 100 tienen un slew rate finito: las
 * transiciones de pulso y sierra no pueden ser instantáneas. El worklet lo
 * emula con un one-pole (`_applyOnePoleFilter`, α = 1 − e^(−2π·fc/fs)) a
 * `moduleSlewCutoff` (20 kHz por defecto) sobre pulse y sawtooth; sine y
 * triangle no se tocan.
 *
 * Hasta septiembre de 2026 este fichero reimplementaba ese filtro y se lo
 * probaba a sí mismo. Ahora carga el worklet real, genera las formas de onda
 * con él y mide el efecto (rise/fall time, energía HF) con los helpers de
 * `tests/audio/spectralAnalysis.js`. El filtro RC de los pines de la matriz,
 * que el espejo también recalculaba, ya está cubierto contra código real en
 * `tests/audio/pinFiltering.test.js`.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  measureRiseTime,
  measureFallTime,
  measureHighFrequencyEnergy,
  computeSpectrum
} from '../audio/spectralAnalysis.js';

import {
  computeOnePoleAlpha,
  MODULE_INHERENT_CUTOFF
} from '../../src/assets/js/utils/voltageConstants.js';

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

let OscillatorProcessor;

async function loadProcessor() {
  const registered = createWorkletEnvironment();
  await import(`../../src/assets/js/worklets/synthOscillator.worklet.js?t=${Date.now()}`);
  OscillatorProcessor = registered['synth-oscillator'];
  assert.ok(OscillatorProcessor, 'el worklet debe registrarse como "synth-oscillator"');
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function createOsc(processorOptions = {}) {
  const proc = new OscillatorProcessor({ processorOptions });
  if (!proc.port._messages) {
    proc.port._messages = [];
    proc.port.postMessage = m => proc.port._messages.push(m);
  }
  return proc;
}

function send(proc, data) {
  proc.port.onmessage({ data });
}

function params(freq, extra = {}) {
  const p = {
    frequency: new Float32Array([freq]),
    detune: new Float32Array([0]),
    pulseWidth: new Float32Array([0.5]),
    symmetry: new Float32Array([0.5]),
    gain: new Float32Array([1]),
    sineLevel: new Float32Array([0]),
    sawLevel: new Float32Array([0]),
    triLevel: new Float32Array([0]),
    pulseLevel: new Float32Array([0]),
  };
  for (const [k, v] of Object.entries(extra)) p[k] = new Float32Array([v]);
  return p;
}

/** Genera `seconds` de la forma de onda en modo single con el oscilador real. */
function render(proc, waveform, freq, seconds = 0.05) {
  send(proc, { type: 'setWaveform', waveform });
  const blocks = Math.ceil(seconds * SAMPLE_RATE / BLOCK);
  const out = new Float32Array(blocks * BLOCK);
  const p = params(freq);
  for (let b = 0; b < blocks; b++) {
    const chunk = new Float32Array(BLOCK);
    proc.process([[]], [[chunk]], p);
    out.set(chunk, b * BLOCK);
  }
  return out;
}

/** Misma forma de onda con y sin slew, desde osciladores recién creados. */
function renderPair(waveform, freq, cutoff) {
  const withSlew = createOsc({ moduleSlewEnabled: true, moduleSlewCutoff: cutoff });
  const without = createOsc({ moduleSlewEnabled: false });
  return {
    withSlew: render(withSlew, waveform, freq),
    without: render(without, waveform, freq),
  };
}

const hfDb = (samples, fromHz = 10000) =>
  measureHighFrequencyEnergy(computeSpectrum(samples, SAMPLE_RATE), fromHz).energyDb;

// ═══════════════════════════════════════════════════════════════════════════

describe('Slew inherente del módulo (synth-oscillator)', () => {
  beforeEach(loadProcessor);

  describe('Coeficiente del one-pole', () => {
    it('el worklet y voltageConstants calculan el mismo α', () => {
      const proc = createOsc();
      for (const fc of [100, 1000, 5000, 15915, 20000, 23999]) {
        assert.equal(proc._computeOnePoleAlpha(fc, SAMPLE_RATE), computeOnePoleAlpha(fc, SAMPLE_RATE), `fc=${fc}`);
      }
    });

    it('α = 1 − e^(−2π·fc/fs); bypass desde Nyquist; 0 con fc ≤ 0', () => {
      const proc = createOsc();
      assert.ok(Math.abs(proc._computeOnePoleAlpha(1000, SAMPLE_RATE) - (1 - Math.exp(-2 * Math.PI * 1000 / SAMPLE_RATE))) < 1e-15);
      assert.equal(proc._computeOnePoleAlpha(SAMPLE_RATE / 2, SAMPLE_RATE), 1);
      assert.equal(proc._computeOnePoleAlpha(100000, SAMPLE_RATE), 1);
      assert.equal(proc._computeOnePoleAlpha(0, SAMPLE_RATE), 0);
      assert.equal(proc._computeOnePoleAlpha(-100, SAMPLE_RATE), 0);
      assert.ok(proc._computeOnePoleAlpha(100, SAMPLE_RATE) < 0.02);
    });

    it('por defecto: 20 kHz (MODULE_INHERENT_CUTOFF), habilitado, α ≈ 0,927 a 48 kHz', () => {
      const proc = createOsc();
      assert.equal(proc.moduleSlewCutoff, 20000);
      assert.equal(proc.moduleSlewCutoff, MODULE_INHERENT_CUTOFF);
      assert.equal(proc.moduleSlewEnabled, true);
      assert.ok(Math.abs(proc.slewAlpha - 0.927) < 0.001, `α=${proc.slewAlpha}`);
      assert.equal(proc.slewAlpha, computeOnePoleAlpha(20000, SAMPLE_RATE));
      assert.equal(proc.prevPulseSample, 0);
      assert.equal(proc.prevSawSample, 0);
    });

    it('processorOptions fijan cutoff y habilitación', () => {
      const proc = createOsc({ moduleSlewCutoff: 5000, moduleSlewEnabled: false });
      assert.equal(proc.moduleSlewCutoff, 5000);
      assert.equal(proc.slewAlpha, computeOnePoleAlpha(5000, SAMPLE_RATE));
      assert.equal(proc.moduleSlewEnabled, false);
    });

    it('setModuleSlewCutoff recalcula α; setModuleSlewEnabled conmuta', () => {
      const proc = createOsc();
      send(proc, { type: 'setModuleSlewCutoff', value: 2000 });
      assert.equal(proc.moduleSlewCutoff, 2000);
      assert.equal(proc.slewAlpha, computeOnePoleAlpha(2000, SAMPLE_RATE));
      send(proc, { type: 'setModuleSlewEnabled', enabled: false });
      assert.equal(proc.moduleSlewEnabled, false);
      send(proc, { type: 'setModuleSlewEnabled', enabled: true });
      assert.equal(proc.moduleSlewEnabled, true);
    });

    it('_applyOnePoleFilter: α=1 deja pasar, α=0 retiene, en medio interpola', () => {
      const proc = createOsc();
      assert.equal(proc._applyOnePoleFilter(0.8, -0.3, 1), 0.8);
      assert.equal(proc._applyOnePoleFilter(0.8, -0.3, 0), -0.3);
      assert.ok(Math.abs(proc._applyOnePoleFilter(1, 0, 0.25) - 0.25) < 1e-15);
      assert.ok(Math.abs(proc._applyOnePoleFilter(1, 0.5, 0.5) - 0.75) < 1e-15);
    });
  });

  describe('Efecto medido en las formas de onda del oscilador', () => {
    it('pulso: con el slew a 2 kHz los flancos tardan más en subir que sin slew', () => {
      const { withSlew, without } = renderPair('pulse', 440, 2000);
      const raw = measureRiseTime(without, SAMPLE_RATE, { findFirst: false });
      const slewed = measureRiseTime(withSlew, SAMPLE_RATE, { findFirst: false });
      assert.ok(raw.transitionsFound > 5 && slewed.transitionsFound > 5);
      // one-pole a 2 kHz: t(10→90 %) = ln 9 / (2π·fc) ≈ 175 µs ≈ 8 muestras
      assert.ok(slewed.avgRiseTime > raw.avgRiseTime * 2,
        `slew ${(slewed.avgRiseTime * 1e6).toFixed(0)} µs vs crudo ${(raw.avgRiseTime * 1e6).toFixed(0)} µs`);
      assert.ok(slewed.avgRiseTime > 100e-6 && slewed.avgRiseTime < 400e-6,
        `rise time ${(slewed.avgRiseTime * 1e6).toFixed(0)} µs`);
    });

    it('pulso: con el slew por defecto (20 kHz) el flanco sigue por debajo de 1 ms', () => {
      const proc = createOsc();
      const out = render(proc, 'pulse', 100, 0.1);
      const r = measureRiseTime(out, SAMPLE_RATE);
      assert.ok(r.transitionsFound > 0);
      assert.ok(r.riseTime > 0 && r.riseTime < 1e-3, `rise time ${(r.riseTime * 1e6).toFixed(0)} µs`);
    });

    it('pulso: el slew por defecto quita energía por encima de 10 kHz', () => {
      const { withSlew, without } = renderPair('pulse', 440, 20000);
      // Medido: ≈0,8 dB en la banda 10–24 kHz (un polo a 20 kHz es suave y el
      // pulso PolyBLEP ya trae poca energía ahí arriba)
      const attenuation = hfDb(without) - hfDb(withSlew);
      assert.ok(attenuation >= 0.5, `atenuación HF ${attenuation.toFixed(2)} dB`);
    });

    it('pulso: el slew no cambia la amplitud ni el valor medio (DC intacta)', () => {
      const { withSlew, without } = renderPair('pulse', 440, 20000);
      const stats = s => {
        let sum = 0, max = 0;
        for (const v of s) { sum += v; max = Math.max(max, Math.abs(v)); }
        return { mean: sum / s.length, max };
      };
      const a = stats(withSlew), b = stats(without);
      assert.ok(Math.abs(a.mean - b.mean) < 0.01, `media ${a.mean} vs ${b.mean}`);
      assert.ok(a.max > 0.95, `pico con slew ${a.max}`);
    });

    it('sierra: el reset cae más despacio con el slew a 2 kHz', () => {
      const { withSlew, without } = renderPair('sawtooth', 440, 2000);
      const raw = measureFallTime(without, SAMPLE_RATE, { findFirst: false });
      const slewed = measureFallTime(withSlew, SAMPLE_RATE, { findFirst: false });
      assert.ok(raw.transitionsFound > 5 && slewed.transitionsFound > 5);
      assert.ok(slewed.avgFallTime > raw.avgFallTime,
        `slew ${(slewed.avgFallTime * 1e6).toFixed(0)} µs vs crudo ${(raw.avgFallTime * 1e6).toFixed(0)} µs`);
    });

    it('seno y triángulo salen idénticos con o sin slew', () => {
      for (const waveform of ['sine', 'triangle']) {
        const { withSlew, without } = renderPair(waveform, 440, 2000);
        assert.deepEqual(Array.from(withSlew), Array.from(without), waveform);
      }
    });

    it('con el slew deshabilitado pulso y sierra salen sin filtrar', () => {
      for (const waveform of ['pulse', 'sawtooth']) {
        const on = createOsc({ moduleSlewEnabled: true, moduleSlewCutoff: 2000 });
        const off = createOsc({ moduleSlewEnabled: false });
        const a = render(on, waveform, 440);
        const b = render(off, waveform, 440);
        assert.ok(a.some((v, i) => Math.abs(v - b[i]) > 1e-3), `${waveform}: el slew debe notarse`);
        assert.equal(off.prevPulseSample, 0, 'sin slew no se toca el estado');
        assert.equal(off.prevSawSample, 0);
      }
    });

    it('un cutoff ≥ Nyquist equivale a no filtrar (muestra a muestra)', () => {
      const bypass = createOsc({ moduleSlewCutoff: 24000 });
      const off = createOsc({ moduleSlewEnabled: false });
      assert.equal(bypass.slewAlpha, 1);
      assert.deepEqual(Array.from(render(bypass, 'pulse', 440)), Array.from(render(off, 'pulse', 440)));
    });

    it('cuanto más bajo el cutoff, menos energía HF (monótono)', () => {
      const energies = [20000, 8000, 2000].map(fc => {
        const proc = createOsc({ moduleSlewCutoff: fc });
        return hfDb(render(proc, 'pulse', 440), 5000);
      });
      assert.ok(energies[0] > energies[1] && energies[1] > energies[2], energies.map(e => e.toFixed(1)).join(' > '));
    });

    it('el estado del filtro persiste entre bloques (sin escalón en la frontera)', () => {
      const proc = createOsc({ moduleSlewCutoff: 2000 });
      send(proc, { type: 'setWaveform', waveform: 'sawtooth' });
      const p = params(440);
      const a = new Float32Array(BLOCK);
      proc.process([[]], [[a]], p);
      assert.equal(Math.fround(proc.prevSawSample), a[BLOCK - 1], 'el estado es la última muestra emitida (gain 1)');
      const b = new Float32Array(BLOCK);
      proc.process([[]], [[b]], p);
      const inner = Math.abs(a[BLOCK - 1] - a[BLOCK - 2]);
      const boundary = Math.abs(b[0] - a[BLOCK - 1]);
      assert.ok(boundary < inner * 3 + 1e-3, `frontera ${boundary} vs interno ${inner}`);
    });

    it('cambiar el cutoff por mensaje se nota en el audio siguiente', () => {
      const proc = createOsc();
      const before = hfDb(render(proc, 'pulse', 440));
      send(proc, { type: 'setModuleSlewCutoff', value: 1000 });
      const after = hfDb(render(proc, 'pulse', 440));
      assert.ok(before - after > 6, `HF antes ${before.toFixed(1)} dB, después ${after.toFixed(1)} dB`);
    });
  });

  describe('Modo multi', () => {
    function renderMulti(proc, levels, seconds = 0.05) {
      const blocks = Math.ceil(seconds * SAMPLE_RATE / BLOCK);
      const out0 = new Float32Array(blocks * BLOCK);
      const out1 = new Float32Array(blocks * BLOCK);
      const p = params(440, levels);
      for (let b = 0; b < blocks; b++) {
        const c0 = new Float32Array(BLOCK), c1 = new Float32Array(BLOCK);
        proc.process([[]], [[c0], [c1]], p);
        out0.set(c0, b * BLOCK);
        out1.set(c1, b * BLOCK);
      }
      return { out0, out1 };
    }

    it('el pulso de la salida 1 y la sierra de la salida 0 también pasan por el slew', () => {
      const on = createOsc({ mode: 'multi', moduleSlewCutoff: 2000 });
      const off = createOsc({ mode: 'multi', moduleSlewEnabled: false });
      const a = renderMulti(on, { pulseLevel: 1, sawLevel: 1 });
      const b = renderMulti(off, { pulseLevel: 1, sawLevel: 1 });
      assert.ok(hfDb(b.out1) - hfDb(a.out1) > 3, 'pulso filtrado');
      assert.ok(hfDb(b.out0) - hfDb(a.out0) > 3, 'sierra filtrada');
    });

    it('seno y triángulo del modo multi no cambian con el slew', () => {
      const on = createOsc({ mode: 'multi', moduleSlewCutoff: 2000 });
      const off = createOsc({ mode: 'multi', moduleSlewEnabled: false });
      const a = renderMulti(on, { sineLevel: 1, triLevel: 1 });
      const b = renderMulti(off, { sineLevel: 1, triLevel: 1 });
      assert.deepEqual(Array.from(a.out0), Array.from(b.out0));
      assert.deepEqual(Array.from(a.out1), Array.from(b.out1));
    });
  });
});
