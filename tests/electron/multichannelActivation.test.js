/**
 * Tests de la activación multicanal real (src/assets/js/audioSetup.js) y del
 * callback `onOutputModeChange` real que registra `setupAudioSettingsModal`
 * (src/assets/js/uiInitializer.js).
 *
 * Hasta septiembre de 2026 este fichero copiaba a mano una versión resumida
 * de `activateMultichannelOutput` y se la probaba a sí misma. Ahora se llama
 * al código real con dobles solo en la frontera: el engine, el AudioContext,
 * `AudioWorkletNode` y `window.multichannelAPI` (el puente nativo que solo
 * existe en Electron). Así queda fijado el flujo que motivó el fichero: pedir
 * multicanal con el DSP apagado y sin AudioContext no debe romper, sino
 * encender el DSP, arrancar el audio, re-aplicar el patch y activar los 12
 * canales; y cualquier fallo debe dejar el engine en estéreo y el stream
 * nativo cerrado.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import '../mocks/localStorage.mock.js';

// ─── JSDOM (setupAudioSettingsModal construye modales de verdad) ─────────────
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.CustomEvent = dom.window.CustomEvent;
global.SVGElement = dom.window.SVGElement;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.fetch = async () => { throw new Error('fetch no disponible en tests'); };

// ─── Dobles de la frontera Web Audio ─────────────────────────────────────────

class FakeNode {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
    this.disconnectCalls = [];
  }
  connect(node) { this.connections.push(node); return node; }
  disconnect(node) {
    this.disconnectCalls.push(node ?? null);
    this.connections = node ? this.connections.filter(n => n !== node) : [];
  }
  addEventListener() {}
}

class FakeAudioWorkletNode extends FakeNode {
  constructor(ctx, name, options) {
    super('worklet');
    this.context = ctx;
    this.name = name;
    this.options = options;
    this.port = {
      onmessage: null,
      posted: [],
      closed: false,
      postMessage(m) { this.posted.push(m); },
      close() { this.closed = true; },
    };
    FakeAudioWorkletNode.instances.push(this);
  }
}
FakeAudioWorkletNode.instances = [];
global.AudioWorkletNode = FakeAudioWorkletNode;

function fakeAudioCtx({ workletFails = false, scriptProcessorFails = false, state = 'running' } = {}) {
  const ctx = {
    sampleRate: 48000,
    state,
    destination: new FakeNode('destination'),
    modules: [],
    resumed: 0,
    audioWorklet: {
      async addModule(url) {
        if (workletFails) throw new Error('worklet no disponible');
        ctx.modules.push(url);
      },
    },
    createGain() {
      const g = new FakeNode('gain');
      g.gain = { value: 1 };
      return g;
    },
    createScriptProcessor(bufferSize, inputChannels, outputChannels) {
      if (scriptProcessorFails) throw new Error('ScriptProcessor no disponible');
      const p = new FakeNode('scriptProcessor');
      Object.assign(p, { bufferSize, inputChannels, outputChannels, onaudioprocess: null });
      return p;
    },
    async resume() { ctx.resumed++; ctx.state = 'running'; },
  };
  return ctx;
}

function fakeEngine({ dspEnabled = true, hasCtx = true, ctxOptions = {}, workletReady = true } = {}) {
  return {
    dspEnabled,
    audioCtx: hasCtx ? fakeAudioCtx(ctxOptions) : null,
    workletReady: hasCtx && workletReady,
    _nextWorkletReady: workletReady,
    physicalChannels: 2,
    physicalChannelLabels: ['L', 'R'],
    _skipDestinationConnect: false,
    merger: new FakeNode('merger'),
    startCalls: [],
    forceCalls: [],
    outputDeviceCalls: [],
    outputChannels: 8,
    getPhysicalChannelInfo: () => ({ count: 2, labels: ['L', 'R'] }),
    setOutputRouting: () => ({}),
    setInputDevice: async () => ({ success: true }),
    setInputRouting: () => {},
    setStereoBusRouting: () => {},
    toggleMute: () => {},
    setFilterBypassEnabled: () => {},
    setFilterBypassDebug: () => {},
    async setOutputDevice(id) { this.outputDeviceCalls.push(id); return { success: true, channels: 2 }; },
    forcePhysicalChannels(count, labels, skip) {
      this.forceCalls.push([count, labels, skip]);
      this.physicalChannels = count;
      this.physicalChannelLabels = labels;
      this._skipDestinationConnect = skip;
    },
    async resumeDSP() { this.dspEnabled = true; },
    async suspendDSP() { this.dspEnabled = false; },
    start(opts) {
      this.startCalls.push(opts);
      if (!this.audioCtx) this.audioCtx = fakeAudioCtx(ctxOptions);
    },
    async ensureWorkletReady() {
      this.workletReady = this._nextWorkletReady;
      return this.workletReady;
    },
  };
}

/** Puente nativo `window.multichannelAPI` (solo existe en Electron). */
function fakeMultichannelAPI({ openSuccess = true, attach = true } = {}) {
  return {
    isOpen: false,
    calls: [],           // orden de llamadas: 'setLatency', 'open', 'close'…
    opens: [],
    latencies: [],
    written: [],
    attached: null,
    closes: 0,
    async open(opts) {
      this.calls.push('open');
      this.opens.push(opts);
      if (!openSuccess) return { success: false, error: 'PipeWire no responde' };
      this.isOpen = true;
      return { success: true, info: '12ch' };
    },
    async close() { this.calls.push('close'); this.isOpen = false; this.closes++; },
    write(buf) { this.written.push(buf); },
    setLatency(ms) { this.calls.push('setLatency'); this.latencies.push(ms); },
    attachSharedBuffer(sab, frames) {
      if (attach === 'throw') throw new Error('sin SAB');
      this.attached = { sab, frames };
      return attach;
    },
    async checkAvailability() { return { available: true }; },
  };
}

function fakeModal(outputMode = 'stereo') {
  return {
    outputMode,
    selectedOutputDevice: 'default',
    modeCalls: [],
    channelUpdates: [],
    getConfiguredLatencyMs: () => 42,
    setOutputMode(mode, notify = true) { this.modeCalls.push([mode, notify]); this.outputMode = mode; },
    updatePhysicalChannels(count, labels) { this.channelUpdates.push([count, labels]); },
  };
}

function fakeApp({ engine = {}, api = {}, modal = fakeModal() } = {}) {
  window.multichannelAPI = api === null ? undefined : fakeMultichannelAPI(api);
  return {
    engine: fakeEngine(engine),
    audioSettingsModal: modal,
    _multichannelActive: false,
    _multichannelWorklet: null,
    _multichannelSilencer: null,
    _multichannelProcessor: null,
    _sharedAudioBuffer: null,
    _envelopeShaperModules: [],
    _sequencerModule: null,
    scopeStarted: 0,
    routingApplied: 0,
    _ensurePanel2ScopeStarted() { this.scopeStarted++; },
    _applyAllRoutingToEngine() { this.routingApplied++; },
    _disconnectSystemAudioInput() {},
  };
}

const CHANNEL_LABELS_12 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MODAL_LABELS_12 = ['Pan 1-4 L', 'Pan 1-4 R', 'Pan 5-8 L', 'Pan 5-8 R',
  'Out 1', 'Out 2', 'Out 3', 'Out 4', 'Out 5', 'Out 6', 'Out 7', 'Out 8'];

const {
  activateMultichannelOutput, activateMultichannelOutputFallback,
  deactivateMultichannelOutput, ensureAudio, restoreMultichannelIfSaved,
} = await import('../../src/assets/js/audioSetup.js');
const { setupAudioSettingsModal } = await import('../../src/assets/js/uiInitializer.js');
const { STORAGE_KEYS } = await import('../../src/assets/js/utils/constants.js');

// ═══════════════════════════════════════════════════════════════════════════

describe('Activación multicanal (audioSetup.js real)', () => {
  const realConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };

  before(() => {
    // El logger y el debug del SharedArrayBuffer escriben por consola
    console.log = console.warn = console.error = console.info = () => {};
  });
  after(() => Object.assign(console, realConsole));

  beforeEach(() => {
    FakeAudioWorkletNode.instances.length = 0;
    localStorage.clear();
  });
  afterEach(() => {
    delete window.multichannelAPI;
    delete window.powerAPI;
  });

  describe('activateMultichannelOutput — guardias', () => {
    it('en navegador (sin window.multichannelAPI) falla sin tocar el engine', async () => {
      const app = fakeApp({ api: null });
      const result = await activateMultichannelOutput(app);
      assert.equal(result.success, false);
      assert.match(result.error, /multichannelAPI/);
      assert.equal(app._multichannelActive, false);
      assert.deepEqual(app.engine.forceCalls, []);
    });

    it('sin AudioContext falla sin tocar el engine (el bug original crasheaba aquí)', async () => {
      const app = fakeApp({ engine: { hasCtx: false } });
      const result = await activateMultichannelOutput(app);
      assert.equal(result.success, false);
      assert.match(result.error, /AudioContext/);
      assert.equal(app._multichannelActive, false);
      assert.deepEqual(app.engine.forceCalls, []);
      assert.equal(app.engine.physicalChannels, 2);
      assert.deepEqual(window.multichannelAPI.opens, [], 'no abre el stream');
    });

    it('ya activo: éxito inmediato e idempotente', async () => {
      const app = fakeApp();
      app._multichannelActive = true;
      const result = await activateMultichannelOutput(app);
      assert.equal(result.success, true);
      assert.deepEqual(app.engine.forceCalls, []);
      assert.deepEqual(window.multichannelAPI.opens, []);
    });
  });

  describe('activateMultichannelOutput — camino con AudioWorklet', () => {
    it('fuerza 12 canales, fija la latencia antes de abrir, y abre a la frecuencia del contexto', async () => {
      const app = fakeApp();
      const api = window.multichannelAPI;
      const result = await activateMultichannelOutput(app);
      assert.equal(result.success, true);
      assert.deepEqual(app.engine.forceCalls, [[12, CHANNEL_LABELS_12, true]]);
      assert.deepEqual(api.calls, ['setLatency', 'open']);
      assert.deepEqual(api.latencies, [42]);
      assert.deepEqual(api.opens, [{ sampleRate: 48000, channels: 12 }]);
      assert.equal(app._multichannelActive, true);
    });

    it('usa la latencia configurada en el modal; sin modal, 42 ms', async () => {
      const app = fakeApp({ modal: { getConfiguredLatencyMs: () => 100 } });
      await activateMultichannelOutput(app);
      assert.deepEqual(window.multichannelAPI.latencies, [100]);

      const app2 = fakeApp({ modal: null });
      await activateMultichannelOutput(app2);
      assert.deepEqual(window.multichannelAPI.latencies, [42]);
    });

    it('si el puente no tiene setLatency, no falla', async () => {
      const app = fakeApp();
      delete window.multichannelAPI.setLatency;
      const result = await activateMultichannelOutput(app);
      assert.equal(result.success, true);
    });

    it('carga el worklet y crea el nodo multichannel-capture con 12 canales discretos', async () => {
      const app = fakeApp();
      await activateMultichannelOutput(app);
      const ctx = app.engine.audioCtx;
      assert.equal(ctx.modules.length, 1);
      assert.match(ctx.modules[0], /multichannelCapture\.worklet\.js$/);
      assert.equal(FakeAudioWorkletNode.instances.length, 1);
      const node = FakeAudioWorkletNode.instances[0];
      assert.equal(node, app._multichannelWorklet);
      assert.equal(node.context, ctx);
      assert.equal(node.name, 'multichannel-capture');
      assert.deepEqual(node.options, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 12,
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete',
        processorOptions: { channels: 12, chunkSize: 2048 },
      });
    });

    it('recablea merger → worklet → silenciador (gain 0) → destination', async () => {
      const app = fakeApp();
      const { merger } = app.engine;
      merger.connect(app.engine.audioCtx.destination);       // como estaba en estéreo
      await activateMultichannelOutput(app);
      const ctx = app.engine.audioCtx;
      assert.deepEqual(merger.disconnectCalls, [null], 'desconecta todo antes de recablear');
      assert.deepEqual(merger.connections, [app._multichannelWorklet]);
      assert.deepEqual(app._multichannelWorklet.connections, [app._multichannelSilencer]);
      assert.equal(app._multichannelSilencer.gain.value, 0);
      assert.deepEqual(app._multichannelSilencer.connections, [ctx.destination]);
    });

    it('crea un SharedArrayBuffer de 8192 frames × 12 canales, lo adjunta y lo manda al worklet al "ready"', async () => {
      const app = fakeApp();
      await activateMultichannelOutput(app);
      const api = window.multichannelAPI;
      assert.ok(api.attached.sab instanceof SharedArrayBuffer);
      assert.equal(api.attached.frames, 8192);
      assert.equal(api.attached.sab.byteLength, 8 + 8192 * 12 * 4);
      const control = new Int32Array(api.attached.sab, 0, 2);
      assert.deepEqual([...control], [0, 0]);
      assert.equal(app._sharedAudioBuffer, api.attached.sab);
      assert.equal(app._sharedBufferFrames, 8192);

      const { port } = app._multichannelWorklet;
      assert.deepEqual(port.posted, [], 'no manda nada hasta que el worklet avisa');
      port.onmessage({ data: { type: 'ready' } });
      assert.deepEqual(port.posted, [{ type: 'init', sharedBuffer: api.attached.sab, bufferFrames: 8192 }]);
      assert.doesNotThrow(() => port.onmessage({ data: { type: 'initialized' } }));
    });

    it('si el puente no puede adjuntar el SAB, sigue en modo MessagePort: audioData → write()', async () => {
      const app = fakeApp({ api: { attach: false } });
      await activateMultichannelOutput(app);
      assert.equal(app._sharedAudioBuffer, null);
      const { port } = app._multichannelWorklet;
      port.onmessage({ data: { type: 'ready' } });
      assert.deepEqual(port.posted, [], 'sin SAB no hay init');

      const chunk = new Float32Array([0.1, 0.2, 0.3]);
      port.onmessage({ data: { type: 'audioData', buffer: chunk.buffer, frames: 1 } });
      assert.equal(window.multichannelAPI.written.length, 1);
      assert.ok(window.multichannelAPI.written[0] instanceof Float32Array);
      assert.deepEqual([...window.multichannelAPI.written[0]], [...chunk]);
      assert.equal(app._mcWorkletChunks, 1);
    });

    it('si attachSharedBuffer lanza, también cae al modo MessagePort sin romper', async () => {
      const app = fakeApp({ api: { attach: 'throw' } });
      const result = await activateMultichannelOutput(app);
      assert.equal(result.success, true);
      assert.equal(app._sharedAudioBuffer, null);
    });
  });

  describe('activateMultichannelOutput — fallos', () => {
    it('si open() falla vuelve a estéreo (2 canales, sin saltarse destination) y no activa', async () => {
      const app = fakeApp({ api: { openSuccess: false } });
      const result = await activateMultichannelOutput(app);
      assert.equal(result.success, false);
      assert.equal(result.error, 'PipeWire no responde');
      assert.deepEqual(app.engine.forceCalls, [[12, CHANNEL_LABELS_12, true], [2, ['L', 'R'], false]]);
      assert.equal(app.engine._skipDestinationConnect, false);
      assert.equal(app._multichannelActive, false);
      assert.equal(app._multichannelWorklet, null);
      assert.equal(window.multichannelAPI.isOpen, false);
      assert.equal(app.engine.audioCtx.modules.length, 0, 'no llega a cargar el worklet');
    });

    it('si el worklet no carga, usa el fallback ScriptProcessor(512, 12→2)', async () => {
      const app = fakeApp({ engine: { ctxOptions: { workletFails: true } } });
      const result = await activateMultichannelOutput(app);
      assert.equal(result.success, true);
      assert.equal(app._multichannelActive, true);
      assert.equal(app._multichannelWorklet, null);
      const p = app._multichannelProcessor;
      assert.equal(p.kind, 'scriptProcessor');
      assert.deepEqual([p.bufferSize, p.inputChannels, p.outputChannels], [512, 12, 2]);
      assert.deepEqual(app.engine.merger.connections, [p]);
      assert.deepEqual(p.connections, [app._multichannelSilencer]);
      assert.deepEqual(app._multichannelSilencer.connections, [app.engine.audioCtx.destination]);
      assert.equal(window.multichannelAPI.isOpen, true, 'el stream sigue abierto');
    });

    it('si worklet y fallback fallan: cierra el stream, vuelve a estéreo y no activa', async () => {
      const app = fakeApp({ engine: { ctxOptions: { workletFails: true, scriptProcessorFails: true } } });
      const result = await activateMultichannelOutput(app);
      assert.equal(result.success, false);
      assert.match(result.error, /fallaron/);
      assert.equal(app._multichannelActive, false);
      assert.equal(window.multichannelAPI.isOpen, false);
      assert.equal(window.multichannelAPI.closes, 1);
      assert.deepEqual(app.engine.forceCalls.at(-1), [2, ['L', 'R'], false]);
    });
  });

  describe('activateMultichannelOutputFallback', () => {
    it('con AudioContext null lanza (y no deja estado a medias)', async () => {
      const app = fakeApp({ engine: { hasCtx: false } });
      await assert.rejects(() => activateMultichannelOutputFallback(app), { message: /AudioContext is null/ });
      assert.equal(app._multichannelActive, false);
      assert.equal(app._multichannelProcessor, null);
    });

    it('onaudioprocess silencia la salida y manda la entrada interleaved al puente', async () => {
      const app = fakeApp();
      await activateMultichannelOutputFallback(app);
      const input = [new Float32Array([1, 2, 3]), new Float32Array([10, 20, 30])];
      const output = [new Float32Array([7, 7, 7]), new Float32Array([7, 7, 7])];
      app._multichannelProcessor.onaudioprocess({
        inputBuffer: { length: 3, numberOfChannels: 2, getChannelData: ch => input[ch] },
        outputBuffer: { numberOfChannels: 2, getChannelData: ch => output[ch] },
      });
      assert.ok(output.every(ch => ch.every(v => v === 0)), 'la salida al destination es silencio');
      const written = window.multichannelAPI.written;
      assert.equal(written.length, 1);
      assert.ok(written[0] instanceof ArrayBuffer);
      assert.deepEqual([...new Float32Array(written[0])], [1, 10, 2, 20, 3, 30]);
    });
  });

  describe('deactivateMultichannelOutput', () => {
    it('inactivo: no hace nada (ni cierra el stream)', async () => {
      const app = fakeApp();
      await deactivateMultichannelOutput(app);
      assert.equal(window.multichannelAPI.closes, 0);
      assert.deepEqual(app.engine.merger.connections, []);
    });

    it('tras el worklet: para el worklet, cierra el puerto y el stream, y devuelve el merger al destination', async () => {
      const app = fakeApp();
      await activateMultichannelOutput(app);
      const worklet = app._multichannelWorklet;
      const silencer = app._multichannelSilencer;
      const { merger } = app.engine;
      await deactivateMultichannelOutput(app);

      assert.equal(window.multichannelAPI.closes, 1);
      assert.equal(window.multichannelAPI.isOpen, false);
      assert.deepEqual(worklet.port.posted, [{ type: 'stop' }]);
      assert.equal(worklet.port.closed, true);
      assert.ok(merger.disconnectCalls.includes(worklet));
      assert.deepEqual(worklet.disconnectCalls, [null]);
      assert.deepEqual(silencer.disconnectCalls, [null]);
      assert.equal(app._multichannelWorklet, null);
      assert.equal(app._multichannelSilencer, null);
      assert.equal(app._multichannelActive, false);
      assert.equal(app.engine._skipDestinationConnect, false);
      assert.deepEqual(merger.connections, [app.engine.audioCtx.destination]);
    });

    it('tras el fallback: desconecta el ScriptProcessor y borra su callback', async () => {
      const app = fakeApp({ engine: { ctxOptions: { workletFails: true } } });
      await activateMultichannelOutput(app);
      const p = app._multichannelProcessor;
      await deactivateMultichannelOutput(app);
      assert.equal(p.onaudioprocess, null);
      assert.deepEqual(p.disconnectCalls, [null]);
      assert.equal(app._multichannelProcessor, null);
      assert.equal(app._multichannelActive, false);
    });

    it('tres ciclos activar/desactivar: un stream y un worklet por ciclo, estado limpio al final', async () => {
      const app = fakeApp();
      for (let i = 1; i <= 3; i++) {
        assert.equal((await activateMultichannelOutput(app)).success, true, `ciclo ${i}`);
        await deactivateMultichannelOutput(app);
        assert.equal(window.multichannelAPI.opens.length, i);
        assert.equal(window.multichannelAPI.closes, i);
        assert.equal(FakeAudioWorkletNode.instances.length, i);
      }
      assert.equal(app._multichannelActive, false);
      assert.equal(app._multichannelWorklet, null);
      assert.equal(app._multichannelSilencer, null);
      assert.deepEqual(app.engine.merger.connections, [app.engine.audioCtx.destination]);
    });
  });

  describe('ensureAudio', () => {
    it('con DSP apagado devuelve false y no arranca nada', async () => {
      const app = fakeApp({ engine: { dspEnabled: false, hasCtx: false } });
      assert.equal(await ensureAudio(app), false);
      assert.deepEqual(app.engine.startCalls, []);
      assert.equal(app.engine.audioCtx, null);
    });

    it('arranca el engine con latencyHint "interactive" por defecto, o el guardado', async () => {
      const app = fakeApp({ engine: { hasCtx: false } });
      assert.equal(await ensureAudio(app), true);
      assert.deepEqual(app.engine.startCalls, [{ latencyHint: 'interactive' }]);
      assert.ok(app.engine.audioCtx);
      assert.equal(app.scopeStarted, 1);

      localStorage.setItem(STORAGE_KEYS.LATENCY_MODE, 'playback');
      const app2 = fakeApp({ engine: { hasCtx: false } });
      await ensureAudio(app2);
      assert.deepEqual(app2.engine.startCalls, [{ latencyHint: 'playback' }]);
    });

    it('reanuda un AudioContext suspendido', async () => {
      const app = fakeApp({ engine: { ctxOptions: { state: 'suspended' } } });
      await ensureAudio(app);
      assert.equal(app.engine.audioCtx.resumed, 1);
    });

    it('llamadas concurrentes comparten el mismo arranque (una sola vez)', async () => {
      const app = fakeApp({ engine: { hasCtx: false } });
      const p1 = ensureAudio(app);
      const p2 = ensureAudio(app);
      assert.ok(app._ensureAudioPromise, 'hay un arranque en curso');
      assert.deepEqual(await Promise.all([p1, p2]), [true, true]);
      assert.equal(app.engine.startCalls.length, 1);
      assert.equal(app._ensureAudioPromise, null, 'se limpia al acabar');
      await ensureAudio(app);
      assert.equal(app.engine.startCalls.length, 2, 'después sí se puede volver a llamar');
    });

    it('pide a Electron no dormir el sistema, salvo que el usuario lo haya desactivado', async () => {
      let prevented = 0;
      window.powerAPI = { preventSleep: () => prevented++ };
      await ensureAudio(fakeApp());
      assert.equal(prevented, 1);
      localStorage.setItem(STORAGE_KEYS.WAKE_LOCK_ENABLED, 'false');
      await ensureAudio(fakeApp());
      assert.equal(prevented, 1);
    });

    it('arranca envelope shapers y secuenciador que no estuvieran arrancados', async () => {
      const app = fakeApp();
      const es1 = { isStarted: false, start() { this.isStarted = true; this.starts = 1; } };
      const es2 = { isStarted: true, start() { this.starts = (this.starts || 0) + 1; } };
      app._envelopeShaperModules = [es1, es2];
      app._sequencerModule = { isStarted: false, start() { this.isStarted = true; } };
      await ensureAudio(app);
      assert.equal(es1.starts, 1);
      assert.equal(es2.starts, undefined);
      assert.equal(app._sequencerModule.isStarted, true);
    });

    it('restaura el multicanal guardado en el modal, una sola vez', async () => {
      const app = fakeApp({ modal: fakeModal('multichannel') });
      await ensureAudio(app);
      assert.equal(app._multichannelActive, true);
      assert.deepEqual(app.audioSettingsModal.channelUpdates, [[12, MODAL_LABELS_12]]);
      assert.equal(app.routingApplied, 1);
      await deactivateMultichannelOutput(app);
      await ensureAudio(app);
      assert.equal(app._multichannelActive, false, 'la segunda vez ya no restaura');
      assert.equal(window.multichannelAPI.opens.length, 1);
    });

    it('si restaurar multicanal falla, el modal vuelve a estéreo sin notificar (evita el bucle)', async () => {
      const app = fakeApp({ api: null, modal: fakeModal('multichannel') });
      await ensureAudio(app);
      assert.deepEqual(app.audioSettingsModal.modeCalls, [['stereo', false]]);
      assert.equal(app.engine.physicalChannels, 2);
    });

    it('restoreMultichannelIfSaved en estéreo no hace nada', async () => {
      const app = fakeApp();
      await restoreMultichannelIfSaved(app);
      assert.equal(app._multichannelRestored, true);
      assert.deepEqual(window.multichannelAPI.opens, []);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // El callback real del modal, con el flujo real detrás
  // ═════════════════════════════════════════════════════════════════════════

  describe('onOutputModeChange real (setupAudioSettingsModal + audioSetup)', () => {
    function wiredApp(engineOpts, apiOpts) {
      const app = fakeApp({ engine: engineOpts, api: apiOpts });
      Object.assign(app, {
        audioSettingsModal: null,
        patchBrowser: null,
        _recordingEngine: null,
        _recordingSettingsModal: null,
        _recordingOverlay: null,
        settingsModal: null,
        wakeLockManager: null,
        dormancyManager: null,
        _saveOnExit: false,
        _oscEnabled: false,
        _panel2Data: null,
        _panel2ScopeStarted: false,
        _panel3LayoutData: null,
        appliedPatches: [],
        dspEvents: [],
        _serializeCurrentState: () => ({ fake: 'patch' }),
        _applyPatch: async (state) => { app.appliedPatches.push(state); },
        _applyInputRouting: () => {},
        _activateMultichannelOutput: () => activateMultichannelOutput(app),
        _deactivateMultichannelOutput: () => deactivateMultichannelOutput(app),
        _activateMultichannelInput: async () => ({ success: false, error: 'sin entrada en el test' }),
        _deactivateMultichannelInput: async () => { app.inputDeactivated = (app.inputDeactivated || 0) + 1; },
        ensureAudio: () => ensureAudio(app),
      });
      document.addEventListener('synth:dspChanged', e => app.dspEvents.push(e.detail));
      setupAudioSettingsModal(app);
      return app;
    }

    /** Como el radio del modal: el modo ya cambió, y llega el callback. */
    async function requestMode(app, mode) {
      app.audioSettingsModal.outputMode = mode;
      await app.audioSettingsModal.onOutputModeChange(mode);
    }

    it('escenario del bug original: DSP apagado y sin AudioContext → enciende, arranca, re-aplica el patch y activa 12 canales', async () => {
      const app = wiredApp({ dspEnabled: false, hasCtx: false });
      await requestMode(app, 'multichannel');

      assert.equal(app.engine.dspEnabled, true, 'DSP encendido automáticamente');
      assert.equal(app.engine.startCalls.length, 1, 'audio arrancado');
      assert.ok(app.engine.audioCtx, 'AudioContext creado');
      assert.deepEqual(app.appliedPatches, [{ fake: 'patch' }], 're-aplica el patch al venir de DSP off');
      assert.deepEqual(app.dspEvents, [{ enabled: true }], 'notifica synth:dspChanged');
      assert.equal(app._multichannelActive, true);
      assert.equal(app.engine.physicalChannels, 12);
      assert.equal(app.audioSettingsModal.physicalChannels, 12);
      assert.deepEqual(app.audioSettingsModal.channelLabels, MODAL_LABELS_12);
      assert.equal(app.audioSettingsModal.outputMode, 'multichannel');
      assert.equal(window.multichannelAPI.opens.length, 1,
        'ensureAudio ya lo restauró (modal en multicanal); la activación explícita no abre otro stream');
      assert.ok(app.routingApplied >= 1);
    });

    it('con DSP ya encendido no re-aplica el patch ni notifica dspChanged', async () => {
      const app = wiredApp({ dspEnabled: true, hasCtx: true });
      await requestMode(app, 'multichannel');
      assert.equal(app._multichannelActive, true);
      assert.deepEqual(app.appliedPatches, []);
      assert.deepEqual(app.dspEvents, []);
    });

    it('si el audio no arranca (worklet nunca listo), vuelve a estéreo sin notificar ni re-aplicar el patch', async () => {
      const app = wiredApp({ dspEnabled: false, hasCtx: false, workletReady: false });
      await requestMode(app, 'multichannel');
      assert.equal(app.engine.dspEnabled, true, 'el DSP sí se encendió');
      assert.equal(app.audioSettingsModal.outputMode, 'stereo');
      assert.equal(localStorage.getItem(STORAGE_KEYS.OUTPUT_MODE), 'stereo');
      assert.deepEqual(app.appliedPatches, [], 'no llega a re-aplicar el patch');
      assert.deepEqual(app.dspEvents, []);
    });

    it('QUIRK: en ese caso ensureAudio ya había restaurado el multicanal, y al revertir el modal nadie lo desactiva', async () => {
      // ensureAudio restaura el multicanal guardado en el modal ANTES de mirar si
      // el worklet está listo; el callback, al ver audioReady=false, pone el
      // modal en estéreo con notify=false, así que el engine se queda en 12
      // canales con el stream nativo abierto y el modal diciendo "estéreo".
      const app = wiredApp({ dspEnabled: false, hasCtx: false, workletReady: false });
      await requestMode(app, 'multichannel');
      assert.equal(app.audioSettingsModal.outputMode, 'stereo');
      assert.equal(app._multichannelActive, true);
      assert.equal(app.engine.physicalChannels, 12);
      assert.equal(window.multichannelAPI.isOpen, true);
    });

    it('en navegador (sin puente nativo) la petición vuelve a estéreo', async () => {
      const app = wiredApp({ dspEnabled: true, hasCtx: true }, null);
      await requestMode(app, 'multichannel');
      assert.equal(app.audioSettingsModal.outputMode, 'stereo');
      assert.equal(app._multichannelActive, false);
      assert.equal(app.engine.physicalChannels, 2);
    });

    it('volver a estéreo desactiva entrada y salida multicanal y restaura el dispositivo elegido', async () => {
      const app = wiredApp({ dspEnabled: true, hasCtx: true });
      await requestMode(app, 'multichannel');
      assert.equal(app._multichannelActive, true);
      await requestMode(app, 'stereo');
      assert.equal(app._multichannelActive, false);
      assert.equal(app.inputDeactivated, 1);
      assert.equal(window.multichannelAPI.closes, 1);
      assert.deepEqual(app.engine.outputDeviceCalls, [app.audioSettingsModal.selectedOutputDevice]);
      assert.deepEqual(app.engine.merger.connections, [app.engine.audioCtx.destination]);
    });
  });
});
