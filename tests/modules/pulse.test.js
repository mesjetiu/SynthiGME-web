/**
 * Tests del PulseModule real (src/assets/js/modules/pulse.js).
 *
 * Hasta septiembre de 2026 este fichero probaba una réplica escrita en el
 * propio test, que además arrancaba con pw = 0.5 cuando el módulo real
 * arranca con 0. Ahora se instancia el módulo de verdad sobre el mock de
 * AudioContext y se comprueba lo que hace: nodos, cableado, forma de onda
 * pedida (coeficientes de Fourier del pulso), entradas/salidas y start/stop.
 *
 * Nota: PulseModule no lo usa ningún panel del Synthi 100 (los osciladores
 * de verdad generan su pulso en el worklet). Se mantiene y se protege
 * mientras exista en src/; si se retira, este test se va con él.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockAudioContext } from '../mocks/audioContext.mock.js';
import { PulseModule } from '../../src/assets/js/modules/pulse.js';
import { createPulseWave } from '../../src/assets/js/utils/waveforms.js';
import { oscillatorConfig } from '../../src/assets/js/configs/index.js';

describe('PulseModule', () => {
  let ctx;
  let engine;
  let pulse;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = { audioCtx: ctx };
    pulse = new PulseModule(engine, 1, 440);
  });

  describe('Construcción', () => {
    it('nombre "Pulso <id>", baseFreq guardada y pw inicial 0', () => {
      assert.equal(pulse.id, 1);
      assert.equal(pulse.name, 'Pulso 1');
      assert.equal(pulse.baseFreq, 440);
      assert.equal(pulse.pw, 0);
    });

    it('no crea nodos hasta start()', () => {
      assert.equal(pulse.osc, null);
      assert.equal(pulse.amp, null);
      assert.deepEqual(pulse.inputs, []);
      assert.deepEqual(pulse.outputs, []);
      assert.equal(ctx._createdNodes.oscillator.length, 0);
    });

    it('toma el número de armónicos del pulso de oscillator.config.js', () => {
      assert.equal(pulse._pulseHarmonics, oscillatorConfig.defaults.audio.pulseHarmonics);
      assert.equal(pulse._pulseHarmonics, 32);
    });

    it('_updatePulseWave antes de start() no hace nada', () => {
      assert.doesNotThrow(() => pulse._updatePulseWave(0.3));
      assert.equal(pulse.pw, 0, 'pw no cambia si no hay oscilador');
    });
  });

  describe('start()', () => {
    beforeEach(() => pulse.start());

    it('crea un oscilador y un amplificador, ambos a 0', () => {
      assert.equal(ctx._createdNodes.oscillator.length, 1);
      assert.equal(ctx._createdNodes.gain.length, 1);
      assert.equal(pulse.osc, ctx._createdNodes.oscillator[0]);
      assert.equal(pulse.amp, ctx._createdNodes.gain[0]);
      assert.equal(pulse.osc.frequency.value, 0);
      assert.equal(pulse.amp.gain.value, 0);
    });

    it('cablea oscilador → amplificador', () => {
      assert.equal(pulse.osc._calls.connect, 1);
    });

    it('arranca el oscilador (una sola vez, aunque se repita start)', () => {
      assert.equal(pulse.osc._calls.start, 1);
      pulse.start();
      pulse.start();
      assert.equal(ctx._createdNodes.oscillator.length, 1, 'no crea nodos nuevos');
      assert.equal(pulse.osc._calls.start, 3, 'delega en el nodo, que ignora arranques repetidos');
    });

    it('sobrevive a un oscilador que lanza en start() repetido', () => {
      pulse.osc.start = () => { throw new DOMException('already started', 'InvalidStateError'); };
      assert.doesNotThrow(() => pulse.start());
    });

    it('registra la salida de audio en el amplificador', () => {
      assert.equal(pulse.outputs.length, 1);
      const [out] = pulse.outputs;
      assert.equal(out.id, 'audioOut');
      assert.equal(out.kind, 'audio');
      assert.equal(out.node, pulse.amp);
      assert.equal(out.label, 'Pulso 1 OUT');
    });

    it('registra las entradas de CV sobre frequency y gain', () => {
      assert.deepEqual(pulse.inputs.map(i => i.id), ['freqCV', 'ampCV']);
      assert.ok(pulse.inputs.every(i => i.kind === 'cv'));
      assert.equal(pulse.inputs[0].param, pulse.osc.frequency);
      assert.equal(pulse.inputs[0].label, 'Pulso 1 FREQ');
      assert.equal(pulse.inputs[1].param, pulse.amp.gain);
      assert.equal(pulse.inputs[1].label, 'Pulso 1 AMP');
    });

    it('aplica la onda de pulso inicial (pw = 0 → duty mínimo 0.01)', () => {
      assert.equal(pulse.osc._calls.setPeriodicWave, 1);
      const wave = pulse.osc._periodicWave;
      assert.equal(wave.imag.length, 33, '32 armónicos + DC');
      assert.ok(wave.real.every(v => v === 0), 'solo términos seno');
      const expected = createPulseWave(ctx, 0, 32);
      assert.deepEqual(wave.imag, expected.imag);
    });

    it('sin AudioContext no crea nada ni revienta en _initAudioNodes', () => {
      const p = new PulseModule({ audioCtx: null }, 2, 100);
      assert.doesNotThrow(() => p._initAudioNodes());
      assert.equal(p.osc, null);
    });
  });

  describe('Forma de onda', () => {
    beforeEach(() => pulse.start());

    it('_updatePulseWave cambia el duty y pide una onda nueva', () => {
      pulse._updatePulseWave(0.25);
      assert.equal(pulse.pw, 0.25);
      assert.equal(pulse.osc._calls.setPeriodicWave, 2);
      assert.deepEqual(pulse.osc._periodicWave.imag, createPulseWave(ctx, 0.25, 32).imag);
    });

    it('duty 0.5 = onda cuadrada: solo armónicos impares', () => {
      pulse._updatePulseWave(0.5);
      const { imag } = pulse.osc._periodicWave;
      for (let n = 1; n <= 32; n++) {
        if (n % 2 === 0) assert.ok(Math.abs(imag[n]) < 1e-12, `armónico par ${n} debe ser 0`);
        else assert.ok(Math.abs(imag[n]) > 0.01, `armónico impar ${n} presente`);
      }
      assert.ok(Math.abs(imag[1] - 2 / Math.PI) < 1e-6, 'fundamental 2/π (Float32)');
    });

    it('duties simétricos (d y 1-d) dan el mismo espectro en módulo', () => {
      pulse._updatePulseWave(0.2);
      const a = pulse.osc._periodicWave.imag;
      pulse._updatePulseWave(0.8);
      const b = pulse.osc._periodicWave.imag;
      for (let n = 1; n <= 32; n++) {
        assert.ok(Math.abs(Math.abs(a[n]) - Math.abs(b[n])) < 1e-12, `armónico ${n}`);
      }
    });

    it('duty fuera de rango se acota a [0.01, 0.99] al generar la onda', () => {
      pulse._updatePulseWave(-5);
      assert.deepEqual(pulse.osc._periodicWave.imag, createPulseWave(ctx, 0.01, 32).imag);
      pulse._updatePulseWave(7);
      assert.deepEqual(pulse.osc._periodicWave.imag, createPulseWave(ctx, 0.99, 32).imag);
    });
  });

  describe('stop()', () => {
    it('antes de start() no hace nada', () => {
      assert.doesNotThrow(() => pulse.stop());
    });

    it('para el oscilador y tolera paradas repetidas', () => {
      pulse.start();
      pulse.stop();
      assert.equal(pulse.osc._calls.stop, 1);
      pulse.osc.stop = () => { throw new DOMException('already stopped', 'InvalidStateError'); };
      assert.doesNotThrow(() => pulse.stop());
    });

    it('conserva los nodos: stop() no desmonta el módulo', () => {
      pulse.start();
      pulse.stop();
      assert.notEqual(pulse.osc, null);
      assert.notEqual(pulse.amp, null);
      assert.equal(pulse.osc._calls.disconnect, 0);
    });
  });
});
