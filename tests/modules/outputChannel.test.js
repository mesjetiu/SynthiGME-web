/**
 * Tests para modules/outputChannel.js — contra las clases reales.
 *
 * Hasta septiembre de 2026 este fichero replicaba en funciones locales el
 * filtro RC del worklet, el panning de igual potencia, el VCA CEM 3330 y un
 * `setExternalCV` de juguete. Nada de eso tocaba `src/`. Además, el
 * `setExternalCV` copiado usaba siempre la curva logarítmica, cuando el real
 * usa la lineal por defecto (`isFaderLinearResponseEnabled()`).
 *
 * Dónde vive ahora cada cosa:
 * - VCA CEM 3330 (dial→voltaje→ganancia, corte mecánico, saturación):
 *   tests/utils/voltageConstants.test.js, contra las funciones reales.
 * - Panning de igual potencia: tests/core/engine.test.js (`setOutputPan`).
 * - Filtro RC pasivo: tests/worklets/outputFilter.worklet.test.js, contra el
 *   worklet real.
 * - Aquí: `OutputChannel` (estado inicial desde el engine y la config,
 *   serialize/deserialize, CV externo en los dos modos de fader) y
 *   `OutputChannelsPanel` (número de canales, formatos de patch, getChannel).
 *
 * El módulo importa UI (ModuleFrame, Knob, tooltips), pero el constructor y
 * la lógica de estado no tocan el DOM: basta un `document` mínimo para
 * importarlo. `createPanel()` queda fuera (necesita DOM real).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import '../mocks/localStorage.mock.js';

globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
};
globalThis.document ??= {
  dispatchEvent() { return true; },
  addEventListener() {},
  getElementById() { return null; },
  createElement() { throw new Error('createElement no debería usarse en estos tests'); },
  body: { appendChild() {} }
};
globalThis.window ??= {
  addEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} })
};

const { OutputChannel, OutputChannelsPanel } = await import('../../src/assets/js/modules/outputChannel.js');
const { outputChannelConfig } = await import('../../src/assets/js/configs/index.js');
const {
  vcaCalculateGain,
  vcaCalculateGainLinear
} = await import('../../src/assets/js/utils/voltageConstants.js');

const FADER_MODE_KEY = 'synthigme-fader-linear-response';

/** Engine falso: solo lo que OutputChannel le pide. */
function createFakeEngine({ levels = [], filters = [], pans = [] } = {}) {
  const calls = [];
  return {
    calls,
    outputPans: pans,
    getOutputLevel: i => levels[i],
    getOutputFilter: i => filters[i],
    setOutputLevel(i, gain, options) { calls.push({ method: 'setOutputLevel', i, gain, options }); },
    setOutputFilter(i, value) { calls.push({ method: 'setOutputFilter', i, value }); },
    setOutputPan(i, value) { calls.push({ method: 'setOutputPan', i, value }); }
  };
}

function levelCalls(engine) {
  return engine.calls.filter(c => c.method === 'setOutputLevel');
}

function setFaderLinear(enabled) {
  localStorage.setItem(FADER_MODE_KEY, String(enabled));
}

describe('OutputChannel', () => {
  let engine;

  beforeEach(() => {
    localStorage.clear();
    engine = createFakeEngine();
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Construcción', () => {
    it('id y título derivan del índice (base 1)', () => {
      const ch = new OutputChannel(engine, 2);
      assert.equal(ch.id, 'output-channel-3');
      assert.equal(ch.name, 'Out 3');
      assert.equal(ch.channelIndex, 2);
    });

    it('acepta un título propio', () => {
      const ch = new OutputChannel(engine, 0, { title: 'Main L' });
      assert.equal(ch.name, 'Main L');
    });

    it('sin estado en el engine, arranca con los valores iniciales de la config', () => {
      const ch = new OutputChannel(engine, 0);
      assert.deepEqual(ch.values, {
        level: outputChannelConfig.faders.level.initial,
        filter: outputChannelConfig.knobs.filter.initial,
        pan: outputChannelConfig.knobs.pan.initial,
        power: outputChannelConfig.switches.power.initial,
        externalCV: 0
      });
    });

    it('si el engine ya tiene estado para ese canal, lo toma de ahí', () => {
      engine = createFakeEngine({ levels: [0, 7.5], filters: [0, -3], pans: [0, 0.4] });
      const ch = new OutputChannel(engine, 1);
      assert.equal(ch.values.level, 7.5);
      assert.equal(ch.values.filter, -3);
      assert.equal(ch.values.pan, 0.4);
    });

    it('un engine sin getOutputFilter no rompe: el filtro sale de la config', () => {
      delete engine.getOutputFilter;
      const ch = new OutputChannel(engine, 0);
      assert.equal(ch.values.filter, outputChannelConfig.knobs.filter.initial);
    });

    it('no toca el engine ni el DOM al construirse', () => {
      const ch = new OutputChannel(engine, 0);
      assert.deepEqual(engine.calls, []);
      assert.equal(ch.frame, null);
      assert.equal(ch.slider, null);
      assert.equal(ch.filterKnobUI, null);
      assert.equal(ch.panKnobUI, null);
      assert.equal(ch.powerSwitch, null);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('serialize / deserialize', () => {
    it('serialize devuelve level, filter, pan y power (no el CV externo)', () => {
      const ch = new OutputChannel(engine, 0);
      ch.values.level = 6;
      ch.values.filter = -2;
      ch.values.pan = 0.5;
      ch.values.power = true;
      ch.values.externalCV = 3;
      assert.deepEqual(ch.serialize(), { level: 6, filter: -2, pan: 0.5, power: true });
    });

    it('deserialize(level) guarda el valor y aplica la ganancia VCA con rampa de 60 ms', () => {
      const ch = new OutputChannel(engine, 3);
      ch.deserialize({ level: 5 });
      assert.equal(ch.values.level, 5);
      const [call] = levelCalls(engine);
      assert.equal(call.i, 3);
      assert.equal(call.gain, vcaCalculateGainLinear(5, 0));
      assert.deepEqual(call.options, { ramp: 0.06 });
    });

    it('deserialize(level) tiene en cuenta el CV externo ya presente', () => {
      const ch = new OutputChannel(engine, 0);
      ch.values.externalCV = 2;
      ch.deserialize({ level: 5 });
      assert.equal(levelCalls(engine)[0].gain, vcaCalculateGainLinear(5, 2));
    });

    it('deserialize(filter) y deserialize(pan) van al engine sin transformar', () => {
      const ch = new OutputChannel(engine, 1);
      ch.deserialize({ filter: -4, pan: 0.25 });
      assert.equal(ch.values.filter, -4);
      assert.equal(ch.values.pan, 0.25);
      assert.deepEqual(engine.calls, [
        { method: 'setOutputFilter', i: 1, value: -4 },
        { method: 'setOutputPan', i: 1, value: 0.25 }
      ]);
    });

    it('deserialize(power) cambia el estado aunque no haya UI', () => {
      const ch = new OutputChannel(engine, 0);
      ch.deserialize({ power: true });
      assert.equal(ch.values.power, true);
      ch.deserialize({ power: false });
      assert.equal(ch.values.power, false);
    });

    it('ignora campos ausentes o con tipo incorrecto', () => {
      const ch = new OutputChannel(engine, 0);
      const before = { ...ch.values };
      ch.deserialize({ level: '5', filter: null, pan: undefined, power: 'true' });
      ch.deserialize(null);
      ch.deserialize({});
      assert.deepEqual(ch.values, before);
      assert.deepEqual(engine.calls, []);
    });

    it('round-trip: lo que serialize produce, deserialize lo restaura', () => {
      const a = new OutputChannel(engine, 0);
      a.deserialize({ level: 8, filter: 3, pan: -0.6, power: true });
      const b = new OutputChannel(createFakeEngine(), 0);
      b.deserialize(a.serialize());
      assert.deepEqual(b.serialize(), { level: 8, filter: 3, pan: -0.6, power: true });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('setExternalCV', () => {
    it('almacena el voltaje y getExternalCV lo devuelve', () => {
      const ch = new OutputChannel(engine, 0);
      ch.setExternalCV(2.5);
      assert.equal(ch.getExternalCV(), 2.5);
      assert.equal(ch.values.externalCV, 2.5);
    });

    it('por defecto (fader lineal) aplica vcaCalculateGainLinear(level, cv) con rampa de 10 ms', () => {
      const ch = new OutputChannel(engine, 2);
      ch.values.level = 5;
      ch.setExternalCV(3);
      const [call] = levelCalls(engine);
      assert.equal(call.i, 2);
      assert.equal(call.gain, vcaCalculateGainLinear(5, 3));
      assert.deepEqual(call.options, { ramp: 0.01 });
    });

    it('con el fader en modo logarítmico aplica vcaCalculateGain(level, cv)', () => {
      setFaderLinear(false);
      const ch = new OutputChannel(engine, 0);
      ch.values.level = 5;
      ch.setExternalCV(3);
      const gain = levelCalls(engine)[0].gain;
      assert.equal(gain, vcaCalculateGain(5, 3));
      assert.notEqual(gain, vcaCalculateGainLinear(5, 3), 'los dos modos deben distinguirse');
    });

    it('el modo se lee de localStorage en cada llamada', () => {
      const ch = new OutputChannel(engine, 0);
      ch.values.level = 5;
      ch.setExternalCV(1);
      setFaderLinear(false);
      ch.setExternalCV(1);
      const [lin, log] = levelCalls(engine).map(c => c.gain);
      assert.equal(lin, vcaCalculateGainLinear(5, 1));
      assert.equal(log, vcaCalculateGain(5, 1));
    });

    it('acepta una rampa personalizada', () => {
      const ch = new OutputChannel(engine, 0);
      ch.setExternalCV(1, { ramp: 0.5 });
      assert.deepEqual(levelCalls(engine)[0].options, { ramp: 0.5 });
    });

    for (const linear of [true, false]) {
      it(`corte mecánico (fader en 0) ignora el CV — modo ${linear ? 'lineal' : 'logarítmico'}`, () => {
        setFaderLinear(linear);
        const ch = new OutputChannel(engine, 0);
        ch.values.level = 0;
        for (const cv of [0, 5, 12, -5]) ch.setExternalCV(cv);
        assert.deepEqual(levelCalls(engine).map(c => c.gain), [0, 0, 0, 0]);
      });
    }

    it('CV positivo sube la ganancia y CV negativo la baja (ambos modos)', () => {
      for (const linear of [true, false]) {
        setFaderLinear(linear);
        const e = createFakeEngine();
        const ch = new OutputChannel(e, 0);
        ch.values.level = 5;
        ch.setExternalCV(0);
        ch.setExternalCV(2);
        ch.setExternalCV(-2);
        const [base, up, down] = levelCalls(e).map(c => c.gain);
        assert.ok(up > base, `modo ${linear}: CV +2 debe subir (${up} > ${base})`);
        assert.ok(down < base, `modo ${linear}: CV -2 debe bajar (${down} < ${base})`);
      }
    });

    it('un cambio de fader posterior recalcula con el último CV', () => {
      const ch = new OutputChannel(engine, 0);
      ch.values.level = 5;
      ch.setExternalCV(2);
      ch.deserialize({ level: 8 });
      const last = levelCalls(engine).at(-1);
      assert.equal(last.gain, vcaCalculateGainLinear(8, 2));
      assert.equal(ch.getExternalCV(), 2);
    });

    it('llamadas sucesivas aplican siempre el último valor', () => {
      const ch = new OutputChannel(engine, 0);
      ch.values.level = 5;
      for (const cv of [1, 2, 3, -1]) ch.setExternalCV(cv);
      assert.equal(levelCalls(engine).length, 4);
      assert.equal(ch.getExternalCV(), -1);
      assert.equal(levelCalls(engine).at(-1).gain, vcaCalculateGainLinear(5, -1));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('OutputChannelsPanel', () => {
  let engine;

  beforeEach(() => {
    localStorage.clear();
    engine = createFakeEngine();
  });

  /** Panel con canales ya construidos, sin pasar por createPanel (DOM). */
  function panelWithChannels(count) {
    const panel = new OutputChannelsPanel(engine, count);
    for (let i = 0; i < count; i++) panel.channels.push(new OutputChannel(engine, i));
    return panel;
  }

  describe('número de canales', () => {
    it('sin argumento usa outputChannelConfig.count (8)', () => {
      assert.equal(outputChannelConfig.count, 8);
      assert.equal(new OutputChannelsPanel(engine).channelCount, 8);
    });

    it('con argumento explícito lo respeta, incluido 0', () => {
      assert.equal(new OutputChannelsPanel(engine, 4).channelCount, 4);
      assert.equal(new OutputChannelsPanel(engine, 0).channelCount, 0);
    });

    it('null cuenta como "sin argumento"', () => {
      assert.equal(new OutputChannelsPanel(engine, null).channelCount, 8);
    });

    it('empieza sin canales creados: los crea createPanel', () => {
      assert.deepEqual(new OutputChannelsPanel(engine).channels, []);
    });
  });

  describe('serialize / deserialize', () => {
    it('serialize agrupa el estado de cada canal en channels[]', () => {
      const panel = panelWithChannels(2);
      panel.channels[1].deserialize({ level: 4, pan: 0.5 });
      const data = panel.serialize();
      assert.equal(data.channels.length, 2);
      assert.deepEqual(data.channels[1], { level: 4, filter: 0, pan: 0.5, power: false });
    });

    it('formato nuevo { channels: [...] } restaura cada canal por índice', () => {
      const panel = panelWithChannels(3);
      panel.deserialize({ channels: [{ level: 1 }, { level: 2, power: true }, { filter: 5 }] });
      assert.equal(panel.channels[0].values.level, 1);
      assert.equal(panel.channels[1].values.level, 2);
      assert.equal(panel.channels[1].values.power, true);
      assert.equal(panel.channels[2].values.filter, 5);
    });

    it('formato antiguo { levels: [...] } solo restaura niveles y salta los no numéricos', () => {
      const panel = panelWithChannels(3);
      panel.deserialize({ levels: [3, 'x', 7] });
      assert.equal(panel.channels[0].values.level, 3);
      assert.equal(panel.channels[1].values.level, 0);
      assert.equal(panel.channels[2].values.level, 7);
      assert.equal(levelCalls(engine).length, 2);
    });

    it('más entradas que canales no revienta', () => {
      const panel = panelWithChannels(1);
      assert.doesNotThrow(() => panel.deserialize({ channels: [{ level: 1 }, { level: 2 }] }));
      assert.doesNotThrow(() => panel.deserialize({ levels: [1, 2, 3] }));
      assert.equal(panel.channels[0].values.level, 1);
    });

    it('datos vacíos o de otro formato no hacen nada', () => {
      const panel = panelWithChannels(1);
      panel.deserialize(null);
      panel.deserialize({});
      panel.deserialize({ channels: 'no' });
      assert.deepEqual(engine.calls, []);
    });
  });

  it('getChannel devuelve el canal por índice o null', () => {
    const panel = panelWithChannels(2);
    assert.strictEqual(panel.getChannel(1), panel.channels[1]);
    assert.equal(panel.getChannel(2), null);
    assert.equal(panel.getChannel(-1), null);
  });
});
