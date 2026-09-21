/**
 * Tests del worklet real `multichannel-playback` (SharedArrayBuffer → 8 entradas).
 *
 * Hasta septiembre de 2026 este fichero reimplementaba la lectura del ring
 * buffer y se la probaba a sí misma. Ahora carga el worklet de verdad, hace
 * de "C++": escribe frames en un SharedArrayBuffer real y mueve `writeIndex`
 * con `Atomics`, y comprueba lo que el worklet saca por sus canales, cómo
 * avanza `readIndex`, y qué hace en underflow (lee lo que hay y rellena con
 * silencio, sin bloquear).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const BLOCK = 128;
const CONTROL_BYTES = 8;   // writeIndex + readIndex (Int32)

// ═══════════════════════════════════════════════════════════════════════════
// Entorno de worklet en Node
// ═══════════════════════════════════════════════════════════════════════════

function createWorkletEnvironment() {
  globalThis.sampleRate = 48000;
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

let PlaybackProcessor;
const realLog = console.log;
const realWarn = console.warn;

async function loadProcessor() {
  console.log = () => {};      // el worklet traza por consola en constructor y process
  console.warn = () => {};
  const registered = createWorkletEnvironment();
  await import(`../../src/assets/js/worklets/multichannelPlayback.worklet.js?t=${Date.now()}`);
  PlaybackProcessor = registered['multichannel-playback'];
  assert.ok(PlaybackProcessor, 'el worklet debe registrarse como "multichannel-playback"');
}

function restoreConsole() {
  console.log = realLog;
  console.warn = realWarn;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers: el test hace el papel del addon C++ (escritor)
// ═══════════════════════════════════════════════════════════════════════════

function createProcessor(processorOptions = {}) {
  const proc = new PlaybackProcessor({ processorOptions });
  if (!proc.port._messages) {
    proc.port._messages = [];
    proc.port.postMessage = m => proc.port._messages.push(m);
  }
  return proc;
}

function send(proc, data) {
  proc.port.onmessage({ data });
}

function attachSharedBuffer(proc, bufferFrames, channels = proc.channels) {
  const sab = new SharedArrayBuffer(CONTROL_BYTES + bufferFrames * channels * 4);
  send(proc, { type: 'init', sharedBuffer: sab, bufferFrames });
  const buf = {
    sab,
    bufferFrames,
    channels,
    control: new Int32Array(sab, 0, 2),
    audio: new Float32Array(sab, CONTROL_BYTES, bufferFrames * channels),
  };
  return buf;
}

const readIndex = ({ control }) => Atomics.load(control, 1);

/** Como C++: escribe `frames` frames interleaved desde writeIndex y lo avanza. */
function producerWrite(buf, frames, fill = (ch, frame) => ch * 100 + frame) {
  let pos = Atomics.load(buf.control, 0);
  for (let f = 0; f < frames; f++) {
    for (let ch = 0; ch < buf.channels; ch++) buf.audio[pos * buf.channels + ch] = fill(ch, f);
    pos = (pos + 1) % buf.bufferFrames;
  }
  Atomics.store(buf.control, 0, pos);
}

function processBlock(proc, outputChannels = proc.channels) {
  const output = Array.from({ length: outputChannels }, () => new Float32Array(BLOCK).fill(NaN));
  const ok = proc.process([], [output], {});
  return { ok, output };
}

// ═══════════════════════════════════════════════════════════════════════════

describe('multichannel-playback worklet', () => {
  beforeEach(loadProcessor);
  afterEach(restoreConsole);

  describe('Arranque e init', () => {
    it('8 canales por defecto y avisa "ready"', () => {
      const proc = createProcessor();
      assert.equal(proc.channels, 8);
      assert.equal(proc.initialized, false);
      assert.deepEqual(proc.port._messages, [{ type: 'ready' }]);
    });

    it('processorOptions cambian los canales', () => {
      assert.equal(createProcessor({ channels: 2 }).channels, 2);
    });

    it('init mapea el SAB, pone readIndex a 0 sin tocar writeIndex (lo pone C++) y confirma', () => {
      const proc = createProcessor({ channels: 2 });
      const sab = new SharedArrayBuffer(CONTROL_BYTES + 100 * 2 * 4);
      const control = new Int32Array(sab, 0, 2);
      Atomics.store(control, 0, 40);
      Atomics.store(control, 1, 99);
      send(proc, { type: 'init', sharedBuffer: sab, bufferFrames: 100 });
      assert.equal(proc.initialized, true);
      assert.equal(proc.bufferFrames, 100);
      assert.equal(proc.audioBuffer.byteOffset, CONTROL_BYTES);
      assert.equal(proc.audioBuffer.length, 200);
      assert.equal(Atomics.load(control, 0), 40);
      assert.equal(Atomics.load(control, 1), 0);
      assert.deepEqual(proc.port._messages.at(-1), { type: 'initialized', bufferFrames: 100 });
    });

    it('init sin sharedBuffer se ignora; un SAB demasiado pequeño no inicializa', () => {
      const proc = createProcessor({ channels: 8 });
      send(proc, { type: 'init', bufferFrames: 100 });
      assert.equal(proc.initialized, false);
      const realError = console.error;
      console.error = () => {};
      try {
        send(proc, { type: 'init', sharedBuffer: new SharedArrayBuffer(64), bufferFrames: 1000 });
      } finally {
        console.error = realError;
      }
      assert.equal(proc.initialized, false);
    });
  });

  describe('Lectura del ring buffer', () => {
    it('sin inicializar saca silencio y sigue vivo', () => {
      const proc = createProcessor({ channels: 2 });
      const { ok, output } = processBlock(proc);
      assert.equal(ok, true);
      assert.ok(output.every(ch => ch.every(v => v === 0)));
    });

    it('lee un bloque interleaved por canal y avanza readIndex 128', () => {
      const proc = createProcessor({ channels: 3 });
      const buf = attachSharedBuffer(proc, 1000);
      producerWrite(buf, 256);
      const { output } = processBlock(proc);
      assert.equal(readIndex(buf), BLOCK);
      for (let ch = 0; ch < 3; ch++) {
        for (let i = 0; i < BLOCK; i++) assert.equal(output[ch][i], ch * 100 + i, `ch ${ch} frame ${i}`);
      }
    });

    it('bloques sucesivos continúan donde acabó el anterior', () => {
      const proc = createProcessor({ channels: 1 });
      const buf = attachSharedBuffer(proc, 1000);
      producerWrite(buf, 300, (_, f) => f);
      processBlock(proc);
      const { output } = processBlock(proc);
      assert.equal(output[0][0], BLOCK);
      assert.equal(output[0][BLOCK - 1], 2 * BLOCK - 1);
      assert.equal(readIndex(buf), 2 * BLOCK);
    });

    it('da la vuelta al final del buffer (wrap) en el productor y en el lector', () => {
      const proc = createProcessor({ channels: 1 });
      const buf = attachSharedBuffer(proc, 200);
      producerWrite(buf, 128, (_, f) => f);          // [0,128)
      processBlock(proc);                            // readIndex 128
      producerWrite(buf, 128, (_, f) => 500 + f);    // [128,200) y [0,56); writeIndex 56
      assert.equal(Atomics.load(buf.control, 0), 56);
      const { output } = processBlock(proc);
      assert.equal(output[0][0], 500);
      assert.equal(output[0][71], 500 + 71);         // último antes del wrap (pos 199)
      assert.equal(output[0][72], 500 + 72);         // pos 0
      assert.equal(output[0][127], 500 + 127);
      assert.equal(readIndex(buf), 56);
    });

    it('con más canales de salida que en el buffer, los extra salen a 0', () => {
      const proc = createProcessor({ channels: 2 });
      const buf = attachSharedBuffer(proc, 1000);
      producerWrite(buf, 128, () => 0.5);
      const { output } = processBlock(proc, 4);
      assert.ok(output[0].every(v => v === 0.5));
      assert.ok(output[1].every(v => v === 0.5));
      assert.ok(output[2].every(v => v === 0));
      assert.ok(output[3].every(v => v === 0));
    });

    it('con menos canales de salida que en el buffer lee solo los primeros', () => {
      const proc = createProcessor({ channels: 4 });
      const buf = attachSharedBuffer(proc, 1000);
      producerWrite(buf, 128, ch => ch + 1);
      const { output } = processBlock(proc, 2);
      assert.equal(output[0][0], 1);
      assert.equal(output[1][0], 2);
      assert.equal(readIndex(buf), BLOCK, 'el frame se consume entero aunque no se saquen todos los canales');
    });
  });

  describe('Underflow (el productor va lento)', () => {
    it('buffer vacío: silencio, cuenta un underflow y readIndex no se mueve', () => {
      const proc = createProcessor({ channels: 2 });
      const buf = attachSharedBuffer(proc, 1000);
      const { output } = processBlock(proc);
      assert.equal(proc.underflowCount, 1);
      assert.ok(output.every(ch => ch.every(v => v === 0)));
      assert.equal(readIndex(buf), 0);
    });

    it('con menos de 128 frames saca los que hay y rellena el resto con 0', () => {
      const proc = createProcessor({ channels: 1 });
      const buf = attachSharedBuffer(proc, 1000);
      producerWrite(buf, 50, (_, f) => 1 + f);
      const { output } = processBlock(proc);
      assert.equal(proc.underflowCount, 1);
      for (let i = 0; i < 50; i++) assert.equal(output[0][i], 1 + i);
      for (let i = 50; i < BLOCK; i++) assert.equal(output[0][i], 0);
      assert.equal(readIndex(buf), 50);
    });

    it('exactamente 128 disponibles no es underflow', () => {
      const proc = createProcessor({ channels: 1 });
      const buf = attachSharedBuffer(proc, 1000);
      producerWrite(buf, 128);
      processBlock(proc);
      assert.equal(proc.underflowCount, 0);
    });

    it('tras un underflow, cuando el productor alcanza, sigue desde donde se quedó', () => {
      const proc = createProcessor({ channels: 1 });
      const buf = attachSharedBuffer(proc, 1000);
      producerWrite(buf, 50, (_, f) => f);
      processBlock(proc);                              // underflow, readIndex 50
      producerWrite(buf, 200, (_, f) => 50 + f);       // continúa la numeración
      const { output } = processBlock(proc);
      assert.equal(proc.underflowCount, 1);
      assert.equal(output[0][0], 50);
      assert.equal(output[0][127], 177);
      assert.equal(readIndex(buf), 178);
    });

    it('disponibilidad con writeIndex por detrás de readIndex (tras el wrap)', () => {
      const proc = createProcessor({ channels: 1 });
      attachSharedBuffer(proc, 300);
      assert.equal(proc._calculateAvailable(50, 250), 100);
      assert.equal(proc._calculateAvailable(250, 50), 200);
      assert.equal(proc._calculateAvailable(10, 10), 0);
    });
  });

  describe('Ciclo de vida', () => {
    it('sin salida conectada sigue vivo y no consume', () => {
      const proc = createProcessor({ channels: 1 });
      const buf = attachSharedBuffer(proc, 1000);
      producerWrite(buf, 128);
      assert.equal(proc.process([], [[]], {}), true);
      assert.equal(proc.process([], [], {}), true);
      assert.equal(readIndex(buf), 0);
    });

    it('stop: process() devuelve false', () => {
      const proc = createProcessor({ channels: 1 });
      send(proc, { type: 'stop' });
      assert.equal(processBlock(proc).ok, false);
    });

    it('mensajes desconocidos se ignoran', () => {
      const proc = createProcessor();
      assert.doesNotThrow(() => send(proc, { type: 'otro' }));
      assert.equal(proc.stopped, false);
    });
  });
});
