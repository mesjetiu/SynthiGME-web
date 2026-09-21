/**
 * Tests del worklet real `recording-capture-processor`, el que alimenta la
 * grabación WAV multipista (core/recordingEngine.js → `_startWavRecording`).
 *
 * Hasta septiembre de 2026 no tenía ningún test. Aquí se carga el worklet de
 * verdad, se le mandan los comandos que le manda el motor (`start`/`stop`) y
 * se comprueba lo que devuelve por el puerto: un mensaje `samples` por bloque
 * con una copia independiente de cada canal (transferida, no compartida),
 * silencio en los canales que faltan, nada mientras no graba, y el `stopped`
 * con el que el motor finaliza el fichero.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const BLOCK = 128;

// ═══════════════════════════════════════════════════════════════════════════
// Entorno de worklet en Node
// ═══════════════════════════════════════════════════════════════════════════

function createWorkletEnvironment() {
  globalThis.sampleRate = 48000;
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

let RecordingCaptureProcessor;

async function loadProcessor() {
  const registered = createWorkletEnvironment();
  await import(`../../src/assets/js/worklets/recordingCapture.worklet.js?t=${Date.now()}`);
  RecordingCaptureProcessor = registered['recording-capture-processor'];
  assert.ok(RecordingCaptureProcessor, 'el worklet debe registrarse como "recording-capture-processor"');
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Crea el procesador como lo crea recordingEngine.js y captura mensajes y listas de transferencia. */
function createProcessor(channelCount) {
  const options = channelCount === undefined ? {} : { processorOptions: { channelCount } };
  const proc = new RecordingCaptureProcessor(options);
  proc.port._messages = [];
  proc.port._transfers = [];
  proc.port.postMessage = (m, transfer) => {
    proc.port._messages.push(m);
    proc.port._transfers.push(transfer);
  };
  return proc;
}

const command = (proc, cmd) => proc.port.onmessage({ data: { command: cmd } });
const samples = proc => proc.port._messages.filter(m => m.type === 'samples');
const stopped = proc => proc.port._messages.filter(m => m.type === 'stopped');
const block = value => new Float32Array(BLOCK).fill(value);

// ═══════════════════════════════════════════════════════════════════════════

describe('recording-capture-processor worklet', () => {
  beforeEach(loadProcessor);

  describe('Arranque', () => {
    it('por defecto graba 2 canales y arranca parado', () => {
      const proc = createProcessor();
      assert.equal(proc.channelCount, 2);
      assert.equal(proc.isRecording, false);
    });

    it('processorOptions.channelCount fija el número de pistas (como hace recordingEngine con _trackCount)', () => {
      assert.equal(createProcessor(8).channelCount, 8);
      assert.equal(createProcessor(1).channelCount, 1);
    });
  });

  describe('Sin grabar', () => {
    it('no manda nada aunque reciba audio, y sigue vivo', () => {
      const proc = createProcessor();
      assert.equal(proc.process([[block(0.5), block(-0.5)]], []), true);
      assert.equal(proc.port._messages.length, 0);
    });

    it('un start seguido de audio ya manda; parado tras stop no', () => {
      const proc = createProcessor();
      command(proc, 'start');
      assert.equal(proc.isRecording, true);
      proc.process([[block(0.1), block(0.2)]], []);
      assert.equal(samples(proc).length, 1);
      command(proc, 'stop');
      assert.equal(proc.isRecording, false);
      proc.process([[block(0.1), block(0.2)]], []);
      assert.equal(samples(proc).length, 1, 'tras stop no llegan más muestras');
    });
  });

  describe('Grabando', () => {
    it('manda un mensaje samples por bloque, con una Float32Array de 128 por canal', () => {
      const proc = createProcessor(2);
      command(proc, 'start');
      for (let i = 0; i < 5; i++) proc.process([[block(i), block(-i)]], []);
      const ms = samples(proc);
      assert.equal(ms.length, 5);
      ms.forEach((m, i) => {
        assert.equal(m.channels.length, 2);
        assert.ok(m.channels.every(c => c instanceof Float32Array && c.length === BLOCK));
        assert.equal(m.channels[0][0], i);
        assert.equal(m.channels[1][BLOCK - 1], -i);
      });
    });

    it('las muestras son una copia: reutilizar el buffer de entrada no altera lo ya enviado', () => {
      const proc = createProcessor(1);
      command(proc, 'start');
      const inputBuf = block(0.25);
      proc.process([[inputBuf]], []);
      inputBuf.fill(0.75);
      const [m] = samples(proc);
      assert.notEqual(m.channels[0], inputBuf);
      assert.notEqual(m.channels[0].buffer, inputBuf.buffer);
      assert.equal(m.channels[0][0], 0.25);
    });

    it('transfiere los buffers al hilo principal (lista de transferencia = un ArrayBuffer por canal)', () => {
      const proc = createProcessor(3);
      command(proc, 'start');
      proc.process([[block(1), block(2), block(3)]], []);
      const [m] = samples(proc);
      const [transfer] = proc.port._transfers;
      assert.equal(transfer.length, 3);
      m.channels.forEach((c, i) => assert.equal(transfer[i], c.buffer));
    });

    it('rellena con silencio los canales que la entrada no trae', () => {
      const proc = createProcessor(4);
      command(proc, 'start');
      proc.process([[block(0.5)]], []);
      const [m] = samples(proc);
      assert.equal(m.channels.length, 4);
      assert.equal(m.channels[0][0], 0.5);
      for (let ch = 1; ch < 4; ch++) {
        assert.equal(m.channels[ch].length, BLOCK);
        assert.ok(m.channels[ch].every(v => v === 0), `canal ${ch} en silencio`);
      }
    });

    it('ignora los canales de entrada que sobran respecto a channelCount', () => {
      const proc = createProcessor(2);
      command(proc, 'start');
      proc.process([[block(1), block(2), block(3), block(4)]], []);
      const [m] = samples(proc);
      assert.equal(m.channels.length, 2);
      assert.equal(m.channels[1][0], 2);
    });

    it('sin entrada conectada (inputs[0] vacío o ausente) no manda nada pero sigue vivo', () => {
      const proc = createProcessor();
      command(proc, 'start');
      assert.equal(proc.process([[]], []), true);
      assert.equal(proc.process([], []), true);
      assert.equal(samples(proc).length, 0);
    });

    it('process() devuelve siempre true: el nodo no se recoge mientras grabe o espere', () => {
      const proc = createProcessor();
      assert.equal(proc.process([[block(0)]], []), true);
      command(proc, 'start');
      assert.equal(proc.process([[block(0)]], []), true);
      command(proc, 'stop');
      assert.equal(proc.process([[block(0)]], []), true);
    });
  });

  describe('Comandos', () => {
    it('stop confirma con un mensaje stopped (recordingEngine finaliza el WAV al recibirlo)', () => {
      const proc = createProcessor();
      command(proc, 'start');
      command(proc, 'stop');
      assert.equal(stopped(proc).length, 1);
      assert.deepEqual(stopped(proc)[0], { type: 'stopped' });
    });

    it('stop sin haber arrancado también confirma (el motor lo tolera)', () => {
      const proc = createProcessor();
      command(proc, 'stop');
      assert.equal(stopped(proc).length, 1);
      assert.equal(proc.isRecording, false);
    });

    it('start dos veces sigue grabando una sola vez por bloque', () => {
      const proc = createProcessor();
      command(proc, 'start');
      command(proc, 'start');
      proc.process([[block(0)]], []);
      assert.equal(samples(proc).length, 1);
    });

    it('se puede volver a grabar tras parar', () => {
      const proc = createProcessor();
      command(proc, 'start');
      proc.process([[block(1)]], []);
      command(proc, 'stop');
      proc.process([[block(2)]], []);
      command(proc, 'start');
      proc.process([[block(3)]], []);
      const ms = samples(proc);
      assert.equal(ms.length, 2);
      assert.equal(ms[0].channels[0][0], 1);
      assert.equal(ms[1].channels[0][0], 3);
    });

    it('comandos desconocidos o mensajes sin command se ignoran', () => {
      const proc = createProcessor();
      assert.doesNotThrow(() => command(proc, 'pause'));
      assert.doesNotThrow(() => proc.port.onmessage({ data: {} }));
      assert.equal(proc.isRecording, false);
      assert.equal(proc.port._messages.length, 0);
    });
  });
});
