/**
 * Tests del worklet real `multichannel-capture` (12 salidas → SharedArrayBuffer).
 *
 * Hasta septiembre de 2026 este fichero reimplementaba la aritmética del ring
 * buffer y se la probaba a sí misma. Ahora carga el worklet de verdad, le da
 * un SharedArrayBuffer real (Node lo tiene) y comprueba lo que escribe en él,
 * cómo mueve `writeIndex` con `Atomics`, qué pasa cuando el lector (C++) no
 * consume, y el modo fallback por MessagePort cuando no hay SAB.
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

let CaptureProcessor;
const realLog = console.log;
const realWarn = console.warn;

async function loadProcessor() {
  console.log = () => {};      // el worklet traza por consola en constructor y process
  console.warn = () => {};
  const registered = createWorkletEnvironment();
  await import(`../../src/assets/js/worklets/multichannelCapture.worklet.js?t=${Date.now()}`);
  CaptureProcessor = registered['multichannel-capture'];
  assert.ok(CaptureProcessor, 'el worklet debe registrarse como "multichannel-capture"');
}

function restoreConsole() {
  console.log = realLog;
  console.warn = realWarn;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function createProcessor(processorOptions = {}) {
  const proc = new CaptureProcessor({ processorOptions });
  if (!proc.port._messages) {
    proc.port._messages = [];
    proc.port.postMessage = m => proc.port._messages.push(m);
  }
  return proc;
}

function send(proc, data) {
  proc.port.onmessage({ data });
}

/** Crea un SAB con el layout del addon y lo entrega al worklet con `init`. */
function attachSharedBuffer(proc, bufferFrames, channels = proc.channels) {
  const sab = new SharedArrayBuffer(CONTROL_BYTES + bufferFrames * channels * 4);
  send(proc, { type: 'init', sharedBuffer: sab, bufferFrames });
  return {
    sab,
    control: new Int32Array(sab, 0, 2),
    audio: new Float32Array(sab, CONTROL_BYTES, bufferFrames * channels),
  };
}

const writeIndex = ({ control }) => Atomics.load(control, 0);
const setReadIndex = ({ control }, v) => Atomics.store(control, 1, v);

/** Bloque de entrada de `channels` canales, cada uno con `fill(ch, i)`. */
function inputBlock(channels, fill = (ch, i) => ch + i / 1000, frames = BLOCK) {
  return Array.from({ length: channels }, (_, ch) =>
    new Float32Array(frames).map((_, i) => fill(ch, i)));
}

function processBlock(proc, input, outputChannels = 0) {
  const output = Array.from({ length: outputChannels }, () => new Float32Array(BLOCK));
  const ok = proc.process([input], [output], {});
  return { ok, output };
}

// ═══════════════════════════════════════════════════════════════════════════

describe('multichannel-capture worklet', () => {
  beforeEach(loadProcessor);
  afterEach(restoreConsole);

  describe('Arranque', () => {
    it('12 canales por defecto, chunk de fallback de 2048 frames, avisa "ready"', () => {
      const proc = createProcessor();
      assert.equal(proc.channels, 12);
      assert.equal(proc.fallbackChunkSize, 2048);
      assert.equal(proc.fallbackBuffer.length, 2048 * 12);
      assert.equal(proc.fallbackMode, true);
      assert.equal(proc.initialized, false);
      assert.deepEqual(proc.port._messages, [{ type: 'ready' }]);
    });

    it('processorOptions cambian canales y tamaño de chunk', () => {
      const proc = createProcessor({ channels: 4, chunkSize: 256 });
      assert.equal(proc.channels, 4);
      assert.equal(proc.fallbackChunkSize, 256);
      assert.equal(proc.fallbackBuffer.length, 256 * 4);
    });
  });

  describe('init con SharedArrayBuffer', () => {
    it('mapea control (2×Int32) y audio (Float32 desde el byte 8), pone writeIndex a 0 y confirma', () => {
      const proc = createProcessor({ channels: 2 });
      const buf = attachSharedBuffer(proc, 1000);
      Atomics.store(buf.control, 0, 77);        // basura previa
      // El init ya pasó: comprobamos lo que dejó
      assert.equal(proc.initialized, true);
      assert.equal(proc.fallbackMode, false);
      assert.equal(proc.bufferFrames, 1000);
      assert.equal(proc.controlBuffer.length, 2);
      assert.equal(proc.audioBuffer.byteOffset, CONTROL_BYTES);
      assert.equal(proc.audioBuffer.length, 1000 * 2);
      assert.deepEqual(proc.port._messages.at(-1), { type: 'initialized', bufferFrames: 1000 });
    });

    it('al inicializar deja writeIndex en 0 y no toca readIndex (lo pone C++)', () => {
      const proc = createProcessor({ channels: 2 });
      const sab = new SharedArrayBuffer(CONTROL_BYTES + 100 * 2 * 4);
      const control = new Int32Array(sab, 0, 2);
      Atomics.store(control, 0, 55);
      Atomics.store(control, 1, 33);
      send(proc, { type: 'init', sharedBuffer: sab, bufferFrames: 100 });
      assert.equal(Atomics.load(control, 0), 0);
      assert.equal(Atomics.load(control, 1), 33);
    });

    it('init sin sharedBuffer se ignora', () => {
      const proc = createProcessor();
      send(proc, { type: 'init', bufferFrames: 100 });
      assert.equal(proc.initialized, false);
      assert.equal(proc.fallbackMode, true);
    });

    it('un buffer demasiado pequeño para los frames declarados deja el worklet en fallback', () => {
      const proc = createProcessor({ channels: 12 });
      const realError = console.error;
      console.error = () => {};
      try {
        const sab = new SharedArrayBuffer(CONTROL_BYTES + 10 * 12 * 4);
        send(proc, { type: 'init', sharedBuffer: sab, bufferFrames: 1000 });
      } finally {
        console.error = realError;
      }
      assert.equal(proc.initialized, false);
      assert.equal(proc.fallbackMode, true);
    });
  });

  describe('Escritura al ring buffer', () => {
    it('escribe un bloque interleaved y avanza writeIndex 128', () => {
      const proc = createProcessor({ channels: 3 });
      const buf = attachSharedBuffer(proc, 1000);
      processBlock(proc, inputBlock(3));
      assert.equal(writeIndex(buf), BLOCK);
      for (let i = 0; i < BLOCK; i++) {
        for (let ch = 0; ch < 3; ch++) {
          assert.equal(buf.audio[i * 3 + ch], Math.fround(ch + i / 1000), `frame ${i} ch ${ch}`);
        }
      }
    });

    it('bloques sucesivos se encadenan sin huecos', () => {
      const proc = createProcessor({ channels: 1 });
      const buf = attachSharedBuffer(proc, 1000);
      processBlock(proc, inputBlock(1, (_, i) => i));
      processBlock(proc, inputBlock(1, (_, i) => 1000 + i));
      assert.equal(writeIndex(buf), 2 * BLOCK);
      assert.equal(buf.audio[BLOCK - 1], BLOCK - 1);
      assert.equal(buf.audio[BLOCK], 1000);
      assert.equal(buf.audio[2 * BLOCK - 1], 1000 + BLOCK - 1);
    });

    it('da la vuelta al final del buffer (wrap) y writeIndex vuelve al principio', () => {
      const proc = createProcessor({ channels: 1 });
      const buf = attachSharedBuffer(proc, 200);
      processBlock(proc, inputBlock(1, (_, i) => i));  // 0..127 en [0,128)
      setReadIndex(buf, 100);                          // el lector ha consumido 100: libres 171
      processBlock(proc, inputBlock(1, (_, i) => 500 + i)); // [128,200) y [0,56)
      assert.equal(writeIndex(buf), 56);
      assert.equal(buf.audio[199], 500 + 71);
      assert.equal(buf.audio[0], 500 + 72);
      assert.equal(buf.audio[55], 500 + 127);
    });

    it('la entrada con menos canales que el buffer rellena los que faltan con 0', () => {
      const proc = createProcessor({ channels: 4 });
      const buf = attachSharedBuffer(proc, 1000);
      processBlock(proc, inputBlock(2, () => 0.5));
      assert.equal(buf.audio[0], 0.5);
      assert.equal(buf.audio[1], 0.5);
      assert.equal(buf.audio[2], 0);
      assert.equal(buf.audio[3], 0);
    });

    it('la entrada con más canales que el buffer ignora los sobrantes', () => {
      const proc = createProcessor({ channels: 2 });
      const buf = attachSharedBuffer(proc, 1000);
      processBlock(proc, inputBlock(4, ch => ch + 1));
      assert.equal(buf.audio[0], 1);
      assert.equal(buf.audio[1], 2);
      assert.equal(buf.audio[2], 1, 'el frame siguiente empieza en el canal 0');
    });

    it('un canal con null se escribe como silencio', () => {
      const proc = createProcessor({ channels: 2 });
      const buf = attachSharedBuffer(proc, 1000);
      processBlock(proc, [new Float32Array(BLOCK).fill(0.25), null]);
      assert.equal(buf.audio[0], 0.25);
      assert.equal(buf.audio[1], 0);
    });
  });

  describe('Overflow (el lector no consume)', () => {
    it('con el buffer casi lleno descarta el bloque entero y cuenta el overflow', () => {
      const proc = createProcessor({ channels: 1 });
      const buf = attachSharedBuffer(proc, 300);       // caben 299 frames
      processBlock(proc, inputBlock(1, () => 1));      // 128
      processBlock(proc, inputBlock(1, () => 1));      // 256
      assert.equal(proc.overflowCount, 0);
      processBlock(proc, inputBlock(1, () => 9));      // 384 > 299 → fuera
      assert.equal(writeIndex(buf), 256);
      assert.equal(proc.overflowCount, 1);
      assert.equal(buf.audio[256], 0, 'no se ha escrito nada');
    });

    it('el slot de guarda: con exactamente 128 libres entra, con 127 no', () => {
      const proc = createProcessor({ channels: 1 });
      const buf = attachSharedBuffer(proc, 129);       // 128 útiles
      processBlock(proc, inputBlock(1, () => 1));
      assert.equal(proc.overflowCount, 0);
      assert.equal(writeIndex(buf), 128);

      const proc2 = createProcessor({ channels: 1 });
      const buf2 = attachSharedBuffer(proc2, 128);     // 127 útiles
      processBlock(proc2, inputBlock(1, () => 1));
      assert.equal(proc2.overflowCount, 1);
      assert.equal(writeIndex(buf2), 0);
    });

    it('cuando el lector avanza readIndex vuelve a haber sitio', () => {
      const proc = createProcessor({ channels: 1 });
      const buf = attachSharedBuffer(proc, 300);
      processBlock(proc, inputBlock(1, () => 1));
      processBlock(proc, inputBlock(1, () => 1));
      processBlock(proc, inputBlock(1, () => 1));      // overflow
      assert.equal(proc.overflowCount, 1);
      setReadIndex(buf, 256);                          // C++ ha consumido todo
      processBlock(proc, inputBlock(1, () => 7));
      assert.equal(proc.overflowCount, 1);
      assert.equal(writeIndex(buf), (256 + 128) % 300);
      assert.equal(buf.audio[256], 7);
    });

    it('espacio con writeIndex por detrás de readIndex (tras el wrap)', () => {
      const proc = createProcessor({ channels: 1 });
      const buf = attachSharedBuffer(proc, 300);
      Atomics.store(buf.control, 0, 100);              // ya dio la vuelta
      setReadIndex(buf, 200);                          // libres: 200-100-1 = 99 < 128
      processBlock(proc, inputBlock(1, () => 1));
      assert.equal(proc.overflowCount, 1);
      setReadIndex(buf, 229);                          // libres: 128
      processBlock(proc, inputBlock(1, () => 1));
      assert.equal(proc.overflowCount, 1);
      assert.equal(writeIndex(buf), 228);
    });
  });

  describe('Fallback por MessagePort (sin SharedArrayBuffer)', () => {
    it('acumula hasta el chunk y entonces manda audioData interleaved', () => {
      const proc = createProcessor({ channels: 2, chunkSize: 256 });
      processBlock(proc, inputBlock(2, (ch, i) => ch * 10 + i));
      assert.equal(proc.fallbackPos, BLOCK);
      assert.equal(proc.port._messages.length, 1, 'solo "ready" hasta ahora');
      processBlock(proc, inputBlock(2, (ch, i) => 100 + ch * 10 + i));
      assert.equal(proc.fallbackPos, 0);
      const msg = proc.port._messages.at(-1);
      assert.equal(msg.type, 'audioData');
      assert.equal(msg.frames, 256);
      assert.equal(msg.channels, 2);
      const data = new Float32Array(msg.buffer);
      assert.equal(data.length, 256 * 2);
      assert.equal(data[0], 0);
      assert.equal(data[1], 10);
      assert.equal(data[2 * BLOCK], 100);
      assert.equal(data[2 * 255 + 1], 100 + 10 + 127);
    });

    it('el chunk enviado no comparte memoria con el siguiente', () => {
      const proc = createProcessor({ channels: 1, chunkSize: 128 });
      processBlock(proc, inputBlock(1, () => 1));
      const first = proc.port._messages.at(-1).buffer;
      processBlock(proc, inputBlock(1, () => 2));
      const second = proc.port._messages.at(-1).buffer;
      assert.notEqual(first, second);
      assert.equal(new Float32Array(first)[0], 1);
      assert.equal(new Float32Array(second)[0], 2);
    });

    it('un chunk que no es múltiplo de 128 se corta donde toca', () => {
      const proc = createProcessor({ channels: 1, chunkSize: 200 });
      processBlock(proc, inputBlock(1, (_, i) => i));
      processBlock(proc, inputBlock(1, (_, i) => 1000 + i));
      const msg = proc.port._messages.at(-1);
      assert.equal(msg.frames, 200);
      assert.equal(new Float32Array(msg.buffer)[199], 1000 + 71);
      assert.equal(proc.fallbackPos, 56, 'los 56 restantes esperan al siguiente chunk');
    });

    it('con el SAB inicializado ya no manda nada por el puerto', () => {
      const proc = createProcessor({ channels: 1, chunkSize: 128 });
      attachSharedBuffer(proc, 1000);
      const before = proc.port._messages.length;
      processBlock(proc, inputBlock(1, () => 1));
      processBlock(proc, inputBlock(1, () => 1));
      assert.equal(proc.port._messages.length, before);
    });
  });

  describe('Pass-through y ciclo de vida', () => {
    it('copia la entrada a la salida (el grafo la silencia con un GainNode)', () => {
      const proc = createProcessor({ channels: 2 });
      const input = inputBlock(2, (ch, i) => ch + i);
      const { ok, output } = processBlock(proc, input, 2);
      assert.equal(ok, true);
      assert.deepEqual(Array.from(output[0]), Array.from(input[0]));
      assert.deepEqual(Array.from(output[1]), Array.from(input[1]));
    });

    it('con menos canales de salida que de entrada copia los que puede', () => {
      const proc = createProcessor({ channels: 2 });
      const { output } = processBlock(proc, inputBlock(2, ch => ch + 1), 1);
      assert.equal(output.length, 1);
      assert.equal(output[0][0], 1);
    });

    it('sin entrada conectada sigue vivo y no escribe', () => {
      const proc = createProcessor({ channels: 1 });
      const buf = attachSharedBuffer(proc, 100);
      assert.equal(proc.process([[]], [[]], {}), true);
      assert.equal(proc.process([], [[]], {}), true);
      assert.equal(writeIndex(buf), 0);
    });

    it('stop: process() devuelve false', () => {
      const proc = createProcessor({ channels: 1 });
      send(proc, { type: 'stop' });
      assert.equal(processBlock(proc, inputBlock(1)).ok, false);
    });

    it('mensajes desconocidos se ignoran', () => {
      const proc = createProcessor();
      assert.doesNotThrow(() => send(proc, { type: 'otro' }));
      assert.equal(proc.stopped, false);
    });
  });
});
