/**
 * Tests para modules/joystick.js — contra la clase real.
 *
 * Hasta septiembre de 2026 este fichero probaba una copia (`MockJoystickModule`)
 * de la lógica del módulo, que además arrancaba con rango 5 cuando el módulo
 * real arranca con rango 0. Ahora instancia `JoystickModule` con el
 * AudioContext simulado de `tests/mocks/audioContext.mock.js` y comprueba lo
 * que de verdad hace: ConstantSource → Gain por eje, salidas para la matriz,
 * posición con rampa lineal, rango con rampa suave, recortes, dormancy
 * (silenciar y restaurar) y ciclo de vida.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockAudioContext } from '../mocks/audioContext.mock.js';

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
});

const { JoystickModule } = await import('../../src/assets/js/modules/joystick.js');
const { joystickConfig } = await import('../../src/assets/js/configs/index.js');

describe('JoystickModule', () => {
  let ctx;
  let joy;

  beforeEach(() => {
    ctx = createMockAudioContext();
    joy = new JoystickModule({ audioCtx: ctx }, 'joystick-left');
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Inicialización', () => {
    it('empieza en el centro (0, 0), con rango 0 en ambos ejes y sin nodos', () => {
      assert.equal(joy.name, 'Joystick');
      assert.equal(joy.id, 'joystick-left');
      assert.equal(joy.getX(), 0);
      assert.equal(joy.getY(), 0);
      assert.equal(joy.getRangeX(), 0);
      assert.equal(joy.getRangeY(), 0);
      assert.equal(joy.isStarted, false);
      assert.equal(joy.xConst, null);
      assert.equal(joy.xGain, null);
    });

    it('sin config usa las rampas por defecto (10 ms posición, 50 ms rango)', () => {
      assert.deepEqual(joy.config.ramps, { position: 0.01, range: 0.05 });
    });

    it('acepta las rampas de joystick.config.js tal como se las pasa panelAssembler', () => {
      const ramps = joystickConfig.defaults.ramps;
      assert.ok(ramps, 'joystick.config.js debe tener defaults.ramps');
      const custom = new JoystickModule({ audioCtx: ctx }, 'j', { ramps });
      assert.deepEqual(custom.config.ramps, { position: ramps.position, range: ramps.range });
      assert.notEqual(custom.config.ramps.position, 0.01, 'la config no coincide con el default: debe verse el cambio');
    });

    it('start() crea un ConstantSource y un Gain por eje', () => {
      joy.start();
      assert.equal(ctx._createdNodes.constantSource.length, 2);
      assert.equal(ctx._createdNodes.gain.length, 2);
      assert.ok(joy.xConst && joy.yConst && joy.xGain && joy.yGain);
      assert.equal(joy.isStarted, true);
    });

    it('los offsets arrancan en 0 (centro) y las ganancias en el rango inicial (0)', () => {
      joy.start();
      assert.equal(joy.xConst.offset.value, 0);
      assert.equal(joy.yConst.offset.value, 0);
      assert.equal(joy.xGain.gain.value, 0);
      assert.equal(joy.yGain.gain.value, 0);
    });

    it('si el rango se fija antes de start(), la ganancia inicial lo refleja', () => {
      joy.setRangeX(7);
      joy.setRangeY(2);
      joy.start();
      assert.equal(joy.xGain.gain.value, 0.7);
      assert.equal(joy.yGain.gain.value, 0.2);
    });

    it('start() arranca las fuentes 50 ms después del tiempo actual', () => {
      ctx.currentTime = 1.5;
      joy._initAudioNodes();
      const starts = [];
      joy.xConst.start = t => starts.push(t);
      joy.yConst.start = t => starts.push(t);
      joy.start();
      assert.deepEqual(starts, [1.55, 1.55]);
    });

    it('start() es idempotente: no recrea nodos ni rearranca las fuentes', () => {
      joy.start();
      const first = joy.xConst;
      joy.start();
      assert.strictEqual(joy.xConst, first);
      assert.equal(joy.xConst._calls.start, 1);
      assert.equal(joy.outputs.length, 2);
    });

    it('sin AudioContext, start() no hace nada', () => {
      const noCtx = new JoystickModule({ audioCtx: null }, 'j');
      noCtx.start();
      assert.equal(noCtx.isStarted, false);
      assert.equal(noCtx.xConst, null);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Cableado y salidas para la matriz', () => {
    beforeEach(() => joy.start());

    it('cada ConstantSource se conecta a su Gain', () => {
      assert.equal(joy.xConst._calls.connect, 1);
      assert.equal(joy.yConst._calls.connect, 1);
    });

    it('registra las salidas de CV xOut e yOut sobre los Gain', () => {
      assert.deepEqual(joy.outputs.map(o => o.id), ['xOut', 'yOut']);
      assert.ok(joy.outputs.every(o => o.kind === 'cv'));
      assert.strictEqual(joy.outputs[0].node, joy.xGain);
      assert.strictEqual(joy.outputs[1].node, joy.yGain);
      assert.deepEqual(joy.outputs.map(o => o.label), ['Joystick X', 'Joystick Y']);
    });

    it('getOutputNodeX/Y devuelven los Gain', () => {
      assert.strictEqual(joy.getOutputNodeX(), joy.xGain);
      assert.strictEqual(joy.getOutputNodeY(), joy.yGain);
    });
  });

  it('getOutputNodeX/Y inicializan los nodos si aún no existen, sin arrancar', () => {
    const x = joy.getOutputNodeX();
    assert.ok(x);
    assert.strictEqual(x, joy.xGain);
    assert.ok(joy.yGain);
    assert.equal(joy.isStarted, false);
    assert.equal(joy.xConst._calls.start, 0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('setPosition', () => {
    beforeEach(() => joy.start());

    it('guarda X e Y y los lleva a los offsets con rampa lineal', () => {
      ctx.currentTime = 2;
      joy.setPosition(0.5, -0.3);
      assert.equal(joy.getX(), 0.5);
      assert.equal(joy.getY(), -0.3);
      assert.equal(joy.xConst.offset.value, 0.5);
      assert.equal(joy.yConst.offset.value, -0.3);
      for (const p of [joy.xConst.offset, joy.yConst.offset]) {
        assert.equal(p._calls.cancelScheduledValues, 1);
        assert.equal(p._calls.setValueAtTime, 1);
        assert.equal(p._calls.linearRampToValueAtTime, 1);
        assert.equal(p._calls.setTargetAtTime, 0);
      }
    });

    it('recorta a ±1', () => {
      joy.setPosition(5, -5);
      assert.equal(joy.getX(), 1);
      assert.equal(joy.getY(), -1);
      assert.equal(joy.xConst.offset.value, 1);
      assert.equal(joy.yConst.offset.value, -1);
    });

    it('los extremos y el centro se mantienen exactos', () => {
      for (const [x, y] of [[1, 1], [-1, -1], [0, 0], [0.25, -0.75]]) {
        joy.setPosition(x, y);
        assert.equal(joy.getX(), x);
        assert.equal(joy.getY(), y);
      }
    });

    it('sin nodos guarda la posición sin reventar', () => {
      const fresh = new JoystickModule({ audioCtx: ctx }, 'j');
      assert.doesNotThrow(() => fresh.setPosition(0.4, 0.6));
      assert.equal(fresh.getX(), 0.4);
      assert.equal(fresh.getY(), 0.6);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('setRangeX / setRangeY', () => {
    beforeEach(() => joy.start());

    it('el dial 0-10 se convierte linealmente en ganancia 0-1', () => {
      for (const [dial, gain] of [[0, 0], [2.5, 0.25], [5, 0.5], [10, 1]]) {
        joy.setRangeX(dial);
        assert.equal(joy.getRangeX(), dial);
        assert.equal(joy.xGain.gain.value, gain);
      }
    });

    it('cada eje va por su cuenta', () => {
      joy.setRangeX(8);
      joy.setRangeY(3);
      assert.equal(joy.xGain.gain.value, 0.8);
      assert.equal(joy.yGain.gain.value, 0.3);
    });

    it('recorta el dial a 0-10', () => {
      joy.setRangeX(-4);
      assert.equal(joy.getRangeX(), 0);
      assert.equal(joy.xGain.gain.value, 0);
      joy.setRangeY(15);
      assert.equal(joy.getRangeY(), 10);
      assert.equal(joy.yGain.gain.value, 1);
    });

    it('aplica el rango con rampa suave (setTargetAtTime), no de golpe', () => {
      joy.setRangeX(6);
      assert.equal(joy.xGain.gain._calls.setTargetAtTime, 1);
      assert.equal(joy.xGain.gain._calls.setValueAtTime, 0);
    });

    it('_rangeDialToGain recorta fuera de 0..10', () => {
      assert.equal(joy._rangeDialToGain(-1), 0);
      assert.equal(joy._rangeDialToGain(11), 1);
      assert.equal(joy._rangeDialToGain(5), 0.5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Dormancy', () => {
    beforeEach(() => {
      joy.start();
      joy.setRangeX(7);
      joy.setRangeY(4);
      joy.setPosition(0.5, -0.5);
    });

    it('al dormir, las dos ganancias caen a 0 y se recuerdan los rangos', () => {
      joy.setDormant(true);
      assert.equal(joy.isDormant, true);
      assert.equal(joy.xGain.gain.value, 0);
      assert.equal(joy.yGain.gain.value, 0);
      assert.equal(joy._preDormantRangeX, 7);
      assert.equal(joy._preDormantRangeY, 4);
      // La posición no se toca: el silencio lo hace la ganancia
      assert.equal(joy.xConst.offset.value, 0.5);
    });

    it('al despertar, restaura las ganancias y resincroniza la posición', () => {
      joy.setDormant(true);
      joy.setDormant(false);
      assert.equal(joy.isDormant, false);
      assert.equal(joy.xGain.gain.value, 0.7);
      assert.equal(joy.yGain.gain.value, 0.4);
      assert.equal(joy.xConst.offset.value, 0.5);
      assert.equal(joy.yConst.offset.value, -0.5);
    });

    it('setPosition durante dormancy guarda pero no toca los offsets', () => {
      joy.setDormant(true);
      const before = joy.xConst.offset._calls.linearRampToValueAtTime;
      joy.setPosition(-0.9, 0.9);
      assert.equal(joy.getX(), -0.9);
      assert.equal(joy.getY(), 0.9);
      assert.equal(joy.xConst.offset.value, 0.5);
      assert.equal(joy.xConst.offset._calls.linearRampToValueAtTime, before);
    });

    it('al despertar aplica la posición cambiada durante dormancy', () => {
      joy.setDormant(true);
      joy.setPosition(-0.9, 0.9);
      joy.setDormant(false);
      assert.equal(joy.xConst.offset.value, -0.9);
      assert.equal(joy.yConst.offset.value, 0.9);
    });

    it('setRange durante dormancy guarda el valor sin abrir la ganancia, y se aplica al despertar', () => {
      joy.setDormant(true);
      joy.setRangeX(10);
      joy.setRangeY(1);
      assert.equal(joy.getRangeX(), 10);
      assert.equal(joy.xGain.gain.value, 0);
      assert.equal(joy.yGain.gain.value, 0);
      joy.setDormant(false);
      assert.equal(joy.xGain.gain.value, 1);
      assert.equal(joy.yGain.gain.value, 0.1);
    });

    it('setDormant con el mismo estado no hace nada', () => {
      joy.setDormant(true);
      const calls = joy.xGain.gain._calls.setTargetAtTime;
      joy.setDormant(true);
      assert.equal(joy.xGain.gain._calls.setTargetAtTime, calls);
    });

    it('sin nodos, setDormant solo cambia la bandera', () => {
      const fresh = new JoystickModule({ audioCtx: ctx }, 'j');
      assert.doesNotThrow(() => fresh.setDormant(true));
      assert.equal(fresh.isDormant, true);
      assert.equal(fresh._preDormantRangeX, null);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Stop', () => {
    it('stop() para las fuentes, desconecta todo y suelta los nodos', () => {
      joy.start();
      const { xConst, yConst, xGain, yGain } = joy;
      joy.stop();
      assert.equal(xConst._calls.stop, 1);
      assert.equal(yConst._calls.stop, 1);
      for (const node of [xConst, yConst, xGain, yGain]) {
        assert.equal(node._calls.disconnect, 1);
      }
      assert.equal(joy.xConst, null);
      assert.equal(joy.yConst, null);
      assert.equal(joy.xGain, null);
      assert.equal(joy.yGain, null);
      assert.equal(joy.isStarted, false);
    });

    it('stop() sin start() no hace nada', () => {
      assert.doesNotThrow(() => joy.stop());
      assert.equal(joy.isStarted, false);
    });

    it('tras stop() se puede volver a arrancar con nodos nuevos y el rango guardado', () => {
      joy.start();
      joy.setRangeX(9);
      const old = joy.xGain;
      joy.stop();
      joy.start();
      assert.notStrictEqual(joy.xGain, old);
      assert.equal(joy.xGain.gain.value, 0.9);
      assert.equal(joy.isStarted, true);
    });
  });
});
