/**
 * Tests del worklet real `scope-capture` (captura sincronizada Y/X para el
 * osciloscopio del panel 2).
 *
 * Hasta septiembre de 2026 no tenía ningún test. Aquí se carga el worklet de
 * verdad, se le dan señales conocidas por sus dos entradas y se comprueba lo
 * que manda por el puerto (`scopeData`): cadencia de un mensaje por
 * `bufferSize` muestras, contenido del ring buffer, alineación por trigger
 * Schmitt (nivel + histéresis), `validLength` en ciclos completos, modo AUTO
 * tras 30 frames sin trigger, y los mensajes de configuración, dormancy y
 * stop que le manda `modules/oscilloscope.js`.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const SAMPLE_RATE = 48000;
const BLOCK = 128;
const BUFFER = 1024;

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

let ScopeCaptureProcessor;
const realLog = console.log;

async function loadProcessor() {
  console.log = () => {};          // setDormant traza por consola
  const registered = createWorkletEnvironment();
  await import(`../../src/assets/js/worklets/scopeCapture.worklet.js?t=${Date.now()}`);
  ScopeCaptureProcessor = registered['scope-capture'];
  assert.ok(ScopeCaptureProcessor, 'el worklet debe registrarse como "scope-capture"');
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function createProcessor(processorOptions) {
  const proc = new ScopeCaptureProcessor(processorOptions ? { processorOptions } : undefined);
  if (!proc.port._messages) {
    proc.port._messages = [];
    proc.port.postMessage = m => proc.port._messages.push(m);
  }
  return proc;
}

const send = (proc, data) => proc.port.onmessage({ data });
const messages = proc => proc.port._messages.filter(m => m.type === 'scopeData');

/**
 * Alimenta `n` muestras (múltiplo de 128) con signalY(i) en la entrada 0 y
 * signalX(i) en la 1 (o sin entrada X si es null). Devuelve el último valor
 * de process().
 */
function feed(proc, signalY, signalX, n, { offset = 0 } = {}) {
  let ok = true;
  for (let start = 0; start < n; start += BLOCK) {
    const y = new Float32Array(BLOCK);
    const x = signalX ? new Float32Array(BLOCK) : null;
    for (let i = 0; i < BLOCK; i++) {
      y[i] = signalY(offset + start + i);
      if (x) x[i] = signalX(offset + start + i);
    }
    ok = proc.process(x ? [[y], [x]] : [[y]], []);
  }
  return ok;
}

const sine = (freq, amp = 0.5) => i => amp * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE);
const ramp = i => i;
const silence = () => 0;

// Seno de 480 Hz: periodo exacto de 100 muestras a 48 kHz. Con histéresis
// Schmitt 0,05 y amplitud 0,5, el primer cruce válido es la muestra 2
// (0,5·sin(2π·2/100) ≈ 0,063 ≥ 0,05; la 1 da 0,031).
const SINE_480 = sine(480);
const FIRST_TRIGGER = 2;

// ═══════════════════════════════════════════════════════════════════════════

describe('scope-capture worklet', () => {
  beforeEach(loadProcessor);
  afterEach(() => { console.log = realLog; });

  describe('Arranque y opciones', () => {
    it('valores por defecto: buffer 1024, ring 2048, trigger a 0 con Schmitt 0,05 e histéresis 150', () => {
      const proc = createProcessor();
      assert.equal(proc.bufferSize, BUFFER);
      assert.equal(proc.ringSize, 2 * BUFFER);
      assert.equal(proc.ringY.length, 2 * BUFFER);
      assert.equal(proc.ringX.length, 2 * BUFFER);
      assert.equal(proc.triggerEnabled, true);
      assert.equal(proc.triggerLevel, 0);
      assert.equal(proc.triggerHysteresis, 150);
      assert.equal(proc.schmittHysteresis, 0.05);
      assert.equal(proc.triggerArmed, true);
      assert.equal(proc.autoTriggerThreshold, 30);
      assert.equal(proc.active, true);
      assert.equal(proc.dormant, false);
    });

    it('processorOptions (como las manda oscilloscope.js) cambian buffer e histéresis', () => {
      const proc = createProcessor({ bufferSize: 2048, triggerHysteresis: 20, schmittHysteresis: 0.1 });
      assert.equal(proc.bufferSize, 2048);
      assert.equal(proc.ringSize, 4096);
      assert.equal(proc.holdoffMax, 8192);
      assert.equal(proc.minSamplesPerSend, 2048);
      assert.equal(proc.triggerHysteresis, 20);
      assert.equal(proc.schmittHysteresis, 0.1);
    });
  });

  describe('Cadencia y formato de scopeData', () => {
    it('manda un mensaje cada bufferSize muestras, con la forma que consume el módulo', () => {
      const proc = createProcessor();
      feed(proc, silence, null, BUFFER - BLOCK);
      assert.equal(messages(proc).length, 0);
      feed(proc, silence, null, BLOCK);
      const [m] = messages(proc);
      assert.equal(messages(proc).length, 1);
      assert.deepEqual(Object.keys(m).sort(),
        ['bufferX', 'bufferY', 'isAuto', 'sampleRate', 'triggered', 'type', 'validLength'].sort());
      assert.ok(m.bufferY instanceof Float32Array);
      assert.ok(m.bufferX instanceof Float32Array);
      assert.equal(m.bufferY.length, BUFFER);
      assert.equal(m.bufferX.length, BUFFER);
      assert.equal(m.sampleRate, SAMPLE_RATE);
      assert.equal(typeof m.triggered, 'boolean');
      assert.equal(typeof m.isAuto, 'boolean');
      feed(proc, silence, null, BUFFER);
      assert.equal(messages(proc).length, 2);
    });

    it('process() devuelve true y no escribe en outputs (solo captura)', () => {
      const proc = createProcessor();
      assert.equal(feed(proc, SINE_480, null, BLOCK), true);
    });

    it('sin entrada Y no escribe nada y sigue vivo', () => {
      const proc = createProcessor();
      assert.equal(proc.process([], []), true);
      assert.equal(proc.process([[]], []), true);
      assert.equal(proc.writeIndex, 0);
      assert.equal(proc.samplesSinceLastSend, 0);
    });
  });

  describe('Ring buffer (sin trigger)', () => {
    it('entrega las últimas bufferSize muestras en orden, y las siguientes en el frame siguiente', () => {
      const proc = createProcessor();
      send(proc, { type: 'setTriggerEnabled', enabled: false });
      feed(proc, ramp, null, 2 * BUFFER);
      const [m1, m2] = messages(proc);
      assert.equal(m1.triggered, false);
      assert.equal(m1.validLength, BUFFER);
      assert.deepEqual([...m1.bufferY], Array.from({ length: BUFFER }, (_, i) => i));
      assert.deepEqual([...m2.bufferY], Array.from({ length: BUFFER }, (_, i) => BUFFER + i));
    });

    it('captura X a la vez que Y; sin entrada X, ceros', () => {
      const proc = createProcessor();
      send(proc, { type: 'setTriggerEnabled', enabled: false });
      feed(proc, ramp, i => -i, BUFFER);
      const [m] = messages(proc);
      assert.deepEqual([...m.bufferX], Array.from({ length: BUFFER }, (_, i) => -i));

      const proc2 = createProcessor();
      send(proc2, { type: 'setTriggerEnabled', enabled: false });
      feed(proc2, ramp, null, BUFFER);
      assert.ok(messages(proc2)[0].bufferX.every(v => v === 0));
    });

    it('da la vuelta al ring sin perder continuidad', () => {
      const proc = createProcessor();
      send(proc, { type: 'setTriggerEnabled', enabled: false });
      feed(proc, ramp, null, 5 * BUFFER);
      const m = messages(proc).at(-1);
      assert.equal(m.bufferY[0], 4 * BUFFER);
      assert.equal(m.bufferY[BUFFER - 1], 5 * BUFFER - 1);
      assert.equal(proc.writeIndex, (5 * BUFFER) % (2 * BUFFER));
    });
  });

  describe('Trigger Schmitt y alineación', () => {
    it('alinea el buffer al primer cruce ascendente del umbral superior (nivel + histéresis)', () => {
      const proc = createProcessor();
      feed(proc, SINE_480, ramp, BUFFER);
      const [m] = messages(proc);
      assert.equal(m.triggered, true);
      assert.equal(m.isAuto, false);
      assert.equal(m.bufferX[0], FIRST_TRIGGER, 'la X (rampa) delata la muestra de origen');
      assert.equal(m.bufferY[0], Math.fround(SINE_480(FIRST_TRIGGER)));
      assert.ok(m.bufferY[0] >= 0.05 && m.bufferY[1] > m.bufferY[0], 'cruce ascendente del umbral');
    });

    it('validLength es un múltiplo entero del periodo; el resto se rellena con el último valor válido', () => {
      const proc = createProcessor();
      feed(proc, SINE_480, ramp, BUFFER);
      const [m] = messages(proc);
      assert.equal(m.validLength % 100, 0);
      assert.equal(m.validLength, 1000);
      for (let k = 0; k < m.validLength; k++) assert.equal(m.bufferX[k], FIRST_TRIGGER + k);
      for (let k = m.validLength; k < BUFFER; k++) {
        assert.equal(m.bufferY[k], m.bufferY[m.validLength - 1]);
        assert.equal(m.bufferX[k], m.bufferX[m.validLength - 1]);
      }
    });

    it('la imagen es estable: frames sucesivos arrancan en la misma fase', () => {
      const proc = createProcessor();
      feed(proc, SINE_480, ramp, 6 * BUFFER);
      const ms = messages(proc);
      assert.equal(ms.length, 6);
      for (const m of ms) {
        assert.equal(m.triggered, true);
        assert.equal(m.bufferX[0] % 100, FIRST_TRIGGER, `frame arranca en la muestra ${m.bufferX[0]}`);
        assert.equal(m.bufferY[0], ms[0].bufferY[0]);
      }
    });

    it('QUIRK: el periodo que detecta es el primer múltiplo del real que supera la histéresis temporal', () => {
      // Con triggerHysteresis 150 y periodo 100, el segundo trigger aceptado
      // está a 200 muestras; validLength sigue siendo múltiplo de 100, así que
      // la imagen no baila, pero lastPeriod no es el periodo de la señal.
      const proc = createProcessor();
      feed(proc, SINE_480, null, BUFFER);
      assert.equal(proc.lastPeriod, 200);

      const proc2 = createProcessor();
      send(proc2, { type: 'setTriggerHysteresis', samples: 0 });
      feed(proc2, SINE_480, null, BUFFER);
      assert.equal(proc2.lastPeriod, 100);
      assert.equal(messages(proc2)[0].validLength, 1000);
    });

    it('setTriggerLevel desplaza el punto de disparo (y se limita a ±1)', () => {
      const proc = createProcessor();
      send(proc, { type: 'setTriggerLevel', level: 0.3 });
      feed(proc, SINE_480, null, BUFFER);
      const [m] = messages(proc);
      assert.equal(m.triggered, true);
      assert.ok(m.bufferY[0] >= 0.35, `arranca en ${m.bufferY[0]}`);
      assert.ok(m.bufferY[1] > m.bufferY[0]);
      send(proc, { type: 'setTriggerLevel', level: 7 });
      assert.equal(proc.triggerLevel, 1);
      send(proc, { type: 'setTriggerLevel', level: -7 });
      assert.equal(proc.triggerLevel, -1);
    });

    it('una señal que no sale de la banda muerta del Schmitt no dispara; bajando la histéresis, sí', () => {
      const proc = createProcessor();
      feed(proc, sine(480, 0.02), null, BUFFER);
      assert.equal(messages(proc)[0].triggered, false);

      const proc2 = createProcessor();
      send(proc2, { type: 'setSchmittHysteresis', value: 0.01 });
      feed(proc2, sine(480, 0.02), null, BUFFER);
      assert.equal(messages(proc2)[0].triggered, true);
    });

    it('setSchmittHysteresis se limita a 0–0,5 y re-arma el trigger', () => {
      const proc = createProcessor();
      proc.triggerArmed = false;
      send(proc, { type: 'setSchmittHysteresis', value: 0.9 });
      assert.equal(proc.schmittHysteresis, 0.5);
      assert.equal(proc.triggerArmed, true);
      send(proc, { type: 'setSchmittHysteresis', value: -1 });
      assert.equal(proc.schmittHysteresis, 0);
    });

    it('detectTrigger: dispara armado al cruzar el umbral superior, se desarma, y se re-arma bajo el inferior', () => {
      const proc = createProcessor();                 // nivel 0, banda ±0,05
      assert.equal(proc.detectTrigger(0.04, 0.05), true);
      assert.equal(proc.triggerArmed, false);
      assert.equal(proc.detectTrigger(0.04, 0.5), false, 'desarmado: no dispara');
      assert.equal(proc.detectTrigger(0, -0.04), false, 'aún dentro de la banda');
      assert.equal(proc.triggerArmed, false);
      assert.equal(proc.detectTrigger(-0.04, -0.05), false);
      assert.equal(proc.triggerArmed, true, 'bajo el umbral inferior se re-arma');
      assert.equal(proc.detectTrigger(0.049, 0.049), false, 'sin cruzar el superior no dispara');
    });

    it('con un solo trigger en el buffer (30 Hz) alinea pero no puede medir periodo', () => {
      const proc = createProcessor();
      feed(proc, sine(30), ramp, BUFFER);
      const [m] = messages(proc);
      assert.equal(m.triggered, true);
      assert.equal(m.validLength, BUFFER);
      assert.equal(proc.lastPeriod, 0);
      assert.ok(m.bufferY[0] >= 0.05 && m.bufferY[1] > m.bufferY[0]);
    });

    it('sin triggers en un frame se pierde el anclaje', () => {
      const proc = createProcessor();
      feed(proc, SINE_480, null, BUFFER);
      assert.notEqual(proc.lastTriggerRingIdx, null);
      feed(proc, silence, null, BUFFER);
      assert.equal(proc.lastTriggerRingIdx, null);
      assert.equal(proc.lastPeriod, 0);
      assert.equal(messages(proc)[1].triggered, false);
    });
  });

  describe('Modo AUTO', () => {
    it('tras 30 frames sin trigger avisa isAuto, y un trigger lo apaga', () => {
      const proc = createProcessor();
      feed(proc, silence, null, 30 * BUFFER);
      const ms = messages(proc);
      assert.equal(ms.length, 30);
      assert.ok(ms.slice(0, 29).every(m => m.isAuto === false), 'los 29 primeros no');
      assert.equal(ms[29].isAuto, true);
      assert.equal(ms[29].triggered, false);
      feed(proc, silence, null, BUFFER);
      assert.equal(messages(proc)[30].isAuto, true, 'sigue en AUTO');
      feed(proc, SINE_480, null, BUFFER);
      const last = messages(proc).at(-1);
      assert.equal(last.triggered, true);
      assert.equal(last.isAuto, false);
      assert.equal(proc.framesWithoutTrigger, 0);
    });
  });

  describe('setBufferSize', () => {
    it('cambia a un tamaño válido: nuevo ring, cadencia y buffers de ese tamaño', () => {
      const proc = createProcessor();
      send(proc, { type: 'setTriggerEnabled', enabled: false });
      send(proc, { type: 'setBufferSize', size: 512 });
      assert.equal(proc.bufferSize, 512);
      assert.equal(proc.ringSize, 1024);
      assert.equal(proc.writeIndex, 0, 'el ring se reinicia');
      assert.equal(proc.holdoffMax, 2048);
      assert.equal(proc.minSamplesPerSend, 512);
      feed(proc, ramp, null, 512);
      const [m] = messages(proc);
      assert.equal(m.bufferY.length, 512);
      assert.equal(m.bufferY[0], 0);
      assert.equal(m.bufferY[511], 511);
      feed(proc, ramp, null, 512, { offset: 512 });
      assert.equal(messages(proc).length, 2, 'la cadencia pasa a 512');
      assert.equal(messages(proc)[1].bufferY[0], 512);
    });

    it('QUIRK: el cambio no reinicia el contador de envío y el primer frame tras cambiar lleva ceros del ring nuevo', () => {
      // setBufferSize vacía el ring pero no samplesSinceLastSend: con 128
      // muestras ya contadas, el primer scopeData sale a las 384 nuevas y las
      // 128 primeras posiciones son el relleno a cero del ring recién creado.
      const proc = createProcessor();
      send(proc, { type: 'setTriggerEnabled', enabled: false });
      feed(proc, ramp, null, BLOCK);
      send(proc, { type: 'setBufferSize', size: 512 });
      assert.equal(proc.samplesSinceLastSend, BLOCK);
      feed(proc, ramp, null, 3 * BLOCK, { offset: BLOCK });
      const [m] = messages(proc);
      assert.equal(messages(proc).length, 1);
      assert.ok(m.bufferY.subarray(0, BLOCK).every(v => v === 0));
      assert.equal(m.bufferY[BLOCK], BLOCK);
      assert.equal(m.bufferY[511], 511);
    });

    it('un tamaño que no está en 512/1024/2048/4096 se ignora', () => {
      const proc = createProcessor();
      send(proc, { type: 'setBufferSize', size: 1000 });
      assert.equal(proc.bufferSize, BUFFER);
      assert.equal(proc.ringSize, 2 * BUFFER);
    });
  });

  describe('Dormancy y ciclo de vida', () => {
    it('setDormant true: sigue vivo pero ni escribe ni manda; false: reanuda', () => {
      const proc = createProcessor();
      send(proc, { type: 'setDormant', dormant: true });
      assert.equal(feed(proc, SINE_480, null, 2 * BUFFER), true);
      assert.equal(messages(proc).length, 0);
      assert.equal(proc.writeIndex, 0);
      send(proc, { type: 'setDormant', dormant: false });
      feed(proc, SINE_480, null, BUFFER);
      assert.equal(messages(proc).length, 1);
    });

    it('stop: process() devuelve false', () => {
      const proc = createProcessor();
      send(proc, { type: 'stop' });
      assert.equal(proc.active, false);
      assert.equal(feed(proc, SINE_480, null, BLOCK), false);
    });

    it('mensajes desconocidos se ignoran', () => {
      const proc = createProcessor();
      assert.doesNotThrow(() => send(proc, { type: 'otro' }));
      assert.equal(proc.active, true);
      assert.equal(proc.bufferSize, BUFFER);
    });
  });
});
