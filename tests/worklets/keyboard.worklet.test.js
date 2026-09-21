/**
 * Tests para keyboard.worklet.js — contra el AudioWorkletProcessor real.
 *
 * Hasta septiembre de 2026 este fichero reimplementaba las fórmulas del
 * worklet («deben coincidir con keyboard.worklet.js») y probaba la copia.
 * Ahora se carga el worklet en Node con un `AudioWorkletProcessor` de
 * juguete, se le mandan los mismos mensajes que le manda `modules/keyboard.js`
 * (noteOn, noteOff, setPitchSpread…) y se mira lo que escribe en sus tres
 * canales de salida: pitch, velocity y gate.
 *
 * Qué se verifica:
 * - Pitch: pivote F#3, 1V/Oct a spread=9, offset, invert, spread 0 y 10
 * - Velocity y gate: escala del dial ±5 → ±1.25 digital (±5V)
 * - Prioridad de nota más alta y sample & hold al soltar
 * - Retrigger: modo Kbd (solo tras soltar todo) y modo On (cambio de pitch),
 *   con el gap de ~2 ms en el que el gate cae a 0
 * - Dormancy y stop
 * - Que los processorOptions de keyboard.config.js llegan al worklet
 * - Escalado hasta el oscilador: 0.25 digital × 4800 = 1200 cents
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import keyboardConfig from '../../src/assets/js/configs/modules/keyboard.config.js';
import { DIGITAL_TO_VOLTAGE } from '../../src/assets/js/utils/voltageConstants.js';

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
        this.port = { onmessage: null, postMessage: () => {} };
      }
    };
  }

  const registered = {};
  globalThis.registerProcessor = (name, cls) => {
    registered[name] = cls;
  };
  return registered;
}

let KeyboardProcessor;

async function loadProcessor() {
  const registered = createWorkletEnvironment();
  await import(`../../src/assets/js/worklets/keyboard.worklet.js?t=${Date.now()}`);
  KeyboardProcessor = registered['keyboard'];
  assert.ok(KeyboardProcessor, 'el worklet debe registrarse como "keyboard"');
}

/** Procesador con las opciones reales de keyboard.config.js. */
function createProcessor(processorOptions = keyboardConfig.audio) {
  return new KeyboardProcessor({ processorOptions });
}

/** Manda un mensaje por el port, como hace modules/keyboard.js. */
function send(proc, message) {
  proc.port.onmessage({ data: message });
}

function noteOn(proc, note, velocity = 100) {
  send(proc, { type: 'noteOn', note, velocity });
}

function noteOff(proc, note) {
  send(proc, { type: 'noteOff', note });
}

/**
 * Procesa un bloque y devuelve el valor de cada canal (son DC: se comprueba
 * que todo el bloque es constante y se devuelve el primer sample).
 */
function render(proc, length = BLOCK) {
  const outputs = [[new Float32Array(length), new Float32Array(length), new Float32Array(length)]];
  const keepAlive = proc.process([], outputs);
  const [pitch, velocity, gate] = outputs[0].map(ch => {
    for (let i = 1; i < ch.length; i++) {
      assert.equal(ch[i], ch[0], 'la salida DC debe ser constante en el bloque');
    }
    return ch[0];
  });
  return { pitch, velocity, gate, keepAlive };
}

function assertClose(actual, expected, tolerance = 1e-6) {
  // Las salidas son Float32: la tolerancia va acorde
  assert.ok(Math.abs(actual - expected) < tolerance, `esperado ${expected}, obtenido ${actual}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Worklet — Pitch', () => {
  beforeEach(loadProcessor);

  test('nota pivote F#3 (66) → 0 a spread=9', () => {
    const proc = createProcessor();
    noteOn(proc, 66);
    assert.equal(render(proc).pitch, 0);
  });

  test('F#4 (78) → 0.25 digital a spread=9 (1V/Oct = 0.25 digital/Oct)', () => {
    const proc = createProcessor();
    noteOn(proc, 78);
    assertClose(render(proc).pitch, 0.25);
  });

  test('F#2 (54) → -0.25 digital a spread=9', () => {
    const proc = createProcessor();
    noteOn(proc, 54);
    assertClose(render(proc).pitch, -0.25);
  });

  test('1 semitono → 1/48 digital a spread=9', () => {
    const proc = createProcessor();
    noteOn(proc, 67);
    assertClose(render(proc).pitch, 1 / 12 / DIGITAL_TO_VOLTAGE);
  });

  test('spread=0 → todas las notas dan 0', () => {
    const proc = createProcessor();
    send(proc, { type: 'setPitchSpread', value: 0 });
    noteOn(proc, 60);
    assert.equal(render(proc).pitch, 0);
    noteOn(proc, 72);
    assert.equal(render(proc).pitch, 0);
  });

  test('spread=10 → intervalo expandido (>0.25 digital/Oct)', () => {
    const proc = createProcessor();
    send(proc, { type: 'setPitchSpread', value: 10 });
    noteOn(proc, 78);
    assert.ok(render(proc).pitch > 0.25);
  });

  test('cambiar el spread con una nota sostenida recalcula el pitch', () => {
    const proc = createProcessor();
    noteOn(proc, 78);
    assertClose(render(proc).pitch, 0.25);
    send(proc, { type: 'setPitchSpread', value: 4.5 });
    assertClose(render(proc).pitch, 0.125);
  });

  test('el offset se suma al pitch (en voltios, dividido por DIGITAL_TO_VOLTAGE)', () => {
    const proc = createProcessor();
    send(proc, { type: 'setPitchOffset', value: 2.5 });
    noteOn(proc, 66);
    assertClose(render(proc).pitch, 2.5 / DIGITAL_TO_VOLTAGE);
  });

  test('invert invierte la polaridad del pitch, no la del offset', () => {
    const proc = createProcessor();
    noteOn(proc, 78);
    const normal = render(proc).pitch;
    send(proc, { type: 'setInvert', value: true });
    assertClose(render(proc).pitch, -normal);
    send(proc, { type: 'setPitchOffset', value: 1 });
    assertClose(render(proc).pitch, -normal + 1 / DIGITAL_TO_VOLTAGE);
  });

  test('sin ninguna nota pulsada, la salida es solo el offset', () => {
    const proc = createProcessor();
    assert.equal(render(proc).pitch, 0);
    send(proc, { type: 'setPitchOffset', value: 3 });
    assertClose(render(proc).pitch, 3 / DIGITAL_TO_VOLTAGE);
  });
});

describe('Keyboard Worklet — Velocity', () => {
  beforeEach(loadProcessor);

  test('velocity 127 con level +5 → 1.25 digital (5V)', () => {
    const proc = createProcessor();
    noteOn(proc, 60, 127);
    assertClose(render(proc).velocity, 5 / DIGITAL_TO_VOLTAGE);
  });

  test('velocity 0 con level +5 → 0', () => {
    const proc = createProcessor();
    noteOn(proc, 60, 0);
    assert.equal(render(proc).velocity, 0);
  });

  test('velocity 127 con level -5 → -1.25 digital (inversión)', () => {
    const proc = createProcessor();
    send(proc, { type: 'setVelocityLevel', value: -5 });
    noteOn(proc, 60, 127);
    assertClose(render(proc).velocity, -5 / DIGITAL_TO_VOLTAGE);
  });

  test('velocityLevel 0 → sin efecto', () => {
    const proc = createProcessor();
    send(proc, { type: 'setVelocityLevel', value: 0 });
    noteOn(proc, 60, 127);
    assert.equal(render(proc).velocity, 0);
  });

  test('velocity media (64) con level +5 → (64/127)·5/4', () => {
    const proc = createProcessor();
    noteOn(proc, 60, 64);
    assertClose(render(proc).velocity, (64 / 127) * 5 / DIGITAL_TO_VOLTAGE);
  });

  test('cambiar el level con la velocity retenida recalcula la salida', () => {
    const proc = createProcessor();
    noteOn(proc, 60, 127);
    noteOff(proc, 60);
    send(proc, { type: 'setVelocityLevel', value: 2 });
    assertClose(render(proc).velocity, 2 / DIGITAL_TO_VOLTAGE);
  });
});

describe('Keyboard Worklet — Gate', () => {
  beforeEach(loadProcessor);

  test('gate ON con level +5 → 1.25 digital; OFF → 0 (sin memoria)', () => {
    const proc = createProcessor();
    noteOn(proc, 60);
    assertClose(render(proc).gate, 5 / DIGITAL_TO_VOLTAGE);
    noteOff(proc, 60);
    assert.equal(render(proc).gate, 0);
  });

  test('gate ON con level -5 → -1.25 digital; OFF → 0', () => {
    const proc = createProcessor();
    send(proc, { type: 'setGateLevel', value: -5 });
    noteOn(proc, 60);
    assertClose(render(proc).gate, -5 / DIGITAL_TO_VOLTAGE);
    noteOff(proc, 60);
    assert.equal(render(proc).gate, 0);
  });

  test('gate level 0 → 0 en ambos estados', () => {
    const proc = createProcessor();
    send(proc, { type: 'setGateLevel', value: 0 });
    noteOn(proc, 60);
    assert.equal(render(proc).gate, 0);
    noteOff(proc, 60);
    assert.equal(render(proc).gate, 0);
  });

  test('cambiar el level con el gate ON actualiza la salida en el acto', () => {
    const proc = createProcessor();
    noteOn(proc, 60);
    send(proc, { type: 'setGateLevel', value: 2.5 });
    assertClose(render(proc).gate, 2.5 / DIGITAL_TO_VOLTAGE);
  });

  test('sin tecla pulsada el gate arranca en 0', () => {
    const proc = createProcessor();
    assert.equal(render(proc).gate, 0);
  });
});

describe('Keyboard Worklet — High-note priority y Sample & Hold', () => {
  beforeEach(loadProcessor);

  test('con varias teclas suena la más alta, en cualquier orden de pulsación', () => {
    const proc = createProcessor();
    [60, 64, 67, 72].forEach(n => noteOn(proc, n));
    assertClose(render(proc).pitch, (72 - 66) / 12 / DIGITAL_TO_VOLTAGE);

    const proc2 = createProcessor();
    [72, 67, 60].forEach(n => noteOn(proc2, n));
    assertClose(render(proc2).pitch, (72 - 66) / 12 / DIGITAL_TO_VOLTAGE);
  });

  test('pitch y velocity se mantienen tras soltar (S&H); solo cae el gate', () => {
    const proc = createProcessor();
    noteOn(proc, 72, 80);
    const held = render(proc);
    noteOff(proc, 72);
    const released = render(proc);
    assert.equal(released.pitch, held.pitch);
    assert.equal(released.velocity, held.velocity);
    assert.equal(released.gate, 0);
  });

  test('una nota más baja no cambia la velocity; una más alta sí', () => {
    const proc = createProcessor();
    noteOn(proc, 72, 100);
    noteOn(proc, 60, 50);
    assertClose(render(proc).velocity, (100 / 127) * 5 / DIGITAL_TO_VOLTAGE);

    const proc2 = createProcessor();
    noteOn(proc2, 60, 50);
    noteOn(proc2, 72, 100);
    assertClose(render(proc2).velocity, (100 / 127) * 5 / DIGITAL_TO_VOLTAGE);
  });

  test('soltar la nota alta con la baja retenida → pitch baja, gate sigue ON', () => {
    const proc = createProcessor();
    noteOn(proc, 60);
    noteOn(proc, 72);
    noteOff(proc, 72);
    const out = render(proc);
    assertClose(out.pitch, (60 - 66) / 12 / DIGITAL_TO_VOLTAGE);
    assertClose(out.gate, 5 / DIGITAL_TO_VOLTAGE);
  });

  test('soltar todas → gate OFF y pitch de la última nota sonante', () => {
    const proc = createProcessor();
    noteOn(proc, 60);
    noteOn(proc, 72);
    noteOff(proc, 72);
    noteOff(proc, 60);
    const out = render(proc);
    assert.equal(out.gate, 0);
    assertClose(out.pitch, (60 - 66) / 12 / DIGITAL_TO_VOLTAGE);
  });

  test('tras soltar todo, la siguiente nota más grave que la retenida sí cambia la velocity', () => {
    const proc = createProcessor();
    noteOn(proc, 72, 100);
    noteOff(proc, 72);
    noteOn(proc, 60, 30); // primera tecla de un grupo nuevo
    assertClose(render(proc).velocity, (30 / 127) * 5 / DIGITAL_TO_VOLTAGE);
  });
});

describe('Keyboard Worklet — Retrigger', () => {
  beforeEach(loadProcessor);

  const GATE_ON = 5 / DIGITAL_TO_VOLTAGE;

  test('el gap es ~2 ms: 96 samples a 48 kHz', () => {
    const proc = createProcessor();
    assert.equal(proc._retriggerGapSamples, 96);
  });

  test('modo Kbd (0): primera nota enciende el gate sin gap', () => {
    const proc = createProcessor();
    noteOn(proc, 60);
    assertClose(render(proc).gate, GATE_ON);
  });

  test('modo Kbd (0): legato hacia arriba NO redispara', () => {
    const proc = createProcessor();
    noteOn(proc, 60);
    render(proc);
    noteOn(proc, 72);
    assertClose(render(proc).gate, GATE_ON);
  });

  test('modo Kbd (0): soltar la alta con la baja retenida NO redispara', () => {
    const proc = createProcessor();
    noteOn(proc, 60);
    noteOn(proc, 72);
    render(proc);
    noteOff(proc, 72);
    assertClose(render(proc).gate, GATE_ON);
  });

  test('modo Kbd (0): soltar todo y volver a pulsar enciende el gate de nuevo', () => {
    const proc = createProcessor();
    noteOn(proc, 60);
    noteOff(proc, 60);
    assert.equal(render(proc).gate, 0);
    noteOn(proc, 72);
    assertClose(render(proc).gate, GATE_ON);
  });

  test('modo On (1): primera nota enciende el gate sin gap', () => {
    const proc = createProcessor();
    send(proc, { type: 'setRetrigger', value: 1 });
    noteOn(proc, 60);
    assertClose(render(proc).gate, GATE_ON);
  });

  test('modo On (1): legato hacia arriba abre un gap de 96 samples y vuelve a ON', () => {
    const proc = createProcessor();
    send(proc, { type: 'setRetrigger', value: 1 });
    noteOn(proc, 60);
    render(proc);
    noteOn(proc, 72);
    // Bloques de 64: 96 samples de gap ocupan el 1º y el 2º; el 3º ya está ON
    const gap1 = render(proc, 64);
    assert.equal(gap1.gate, 0);
    // Durante el gap pitch y velocity siguen saliendo (ya con la nota nueva)
    assertClose(gap1.pitch, (72 - 66) / 12 / DIGITAL_TO_VOLTAGE);
    assertClose(gap1.velocity, (100 / 127) * 5 / DIGITAL_TO_VOLTAGE);
    assert.equal(render(proc, 64).gate, 0);
    assertClose(render(proc, 64).gate, GATE_ON);
  });

  test('modo On (1): con bloques de 128 el gap ocupa un bloque entero', () => {
    const proc = createProcessor();
    send(proc, { type: 'setRetrigger', value: 1 });
    noteOn(proc, 60);
    render(proc);
    noteOn(proc, 72);
    assert.equal(render(proc).gate, 0);
    assertClose(render(proc).gate, GATE_ON);
  });

  test('modo On (1): una nota más baja NO redispara (el pitch no cambia)', () => {
    const proc = createProcessor();
    send(proc, { type: 'setRetrigger', value: 1 });
    noteOn(proc, 72);
    render(proc);
    noteOn(proc, 60);
    assertClose(render(proc).gate, GATE_ON);
  });

  test('modo On (1): soltar la alta con la baja retenida SÍ redispara', () => {
    const proc = createProcessor();
    send(proc, { type: 'setRetrigger', value: 1 });
    noteOn(proc, 60);
    noteOn(proc, 72);
    render(proc); render(proc); // consumir el gap del legato
    noteOff(proc, 72);
    assert.equal(render(proc).gate, 0);
    const after = render(proc);
    assertClose(after.gate, GATE_ON);
    assertClose(after.pitch, (60 - 66) / 12 / DIGITAL_TO_VOLTAGE);
  });

  test('modo On (1): la misma nota dos veces NO redispara', () => {
    const proc = createProcessor();
    send(proc, { type: 'setRetrigger', value: 1 });
    noteOn(proc, 60);
    render(proc);
    noteOn(proc, 60);
    assertClose(render(proc).gate, GATE_ON);
  });

  test('modo On (1): soltar una nota que no era la más alta NO redispara', () => {
    const proc = createProcessor();
    send(proc, { type: 'setRetrigger', value: 1 });
    noteOn(proc, 60);
    noteOn(proc, 72);
    render(proc); render(proc);
    noteOff(proc, 60);
    assertClose(render(proc).gate, GATE_ON);
  });

  test('modo On (1): el gap respeta el gateLevel vigente al terminar', () => {
    const proc = createProcessor();
    send(proc, { type: 'setRetrigger', value: 1 });
    noteOn(proc, 60);
    noteOn(proc, 72);
    send(proc, { type: 'setGateLevel', value: -5 });
    render(proc); // gap
    assertClose(render(proc).gate, -5 / DIGITAL_TO_VOLTAGE);
  });
});

describe('Keyboard Worklet — Dormancy y stop', () => {
  beforeEach(loadProcessor);

  test('dormant: las tres salidas a 0 aunque haya nota pulsada', () => {
    const proc = createProcessor();
    noteOn(proc, 78, 127);
    send(proc, { type: 'setDormant', dormant: true });
    const out = render(proc);
    assert.deepEqual([out.pitch, out.velocity, out.gate], [0, 0, 0]);
    assert.equal(out.keepAlive, true);
  });

  test('al despertar recupera el estado retenido', () => {
    const proc = createProcessor();
    noteOn(proc, 78, 127);
    send(proc, { type: 'setDormant', dormant: true });
    render(proc);
    send(proc, { type: 'setDormant', dormant: false });
    const out = render(proc);
    assertClose(out.pitch, 0.25);
    assertClose(out.velocity, 5 / DIGITAL_TO_VOLTAGE);
    assertClose(out.gate, 5 / DIGITAL_TO_VOLTAGE);
  });

  test('dormant durante el gap de retrigger también silencia', () => {
    const proc = createProcessor();
    send(proc, { type: 'setRetrigger', value: 1 });
    noteOn(proc, 60);
    noteOn(proc, 72);
    send(proc, { type: 'setDormant', dormant: true });
    const out = render(proc, 64);
    assert.deepEqual([out.pitch, out.velocity, out.gate], [0, 0, 0]);
  });

  test('stop: process devuelve false y el nodo puede recogerse', () => {
    const proc = createProcessor();
    assert.equal(render(proc).keepAlive, true);
    send(proc, { type: 'stop' });
    assert.equal(render(proc).keepAlive, false);
  });

  test('un mensaje desconocido no rompe nada', () => {
    const proc = createProcessor();
    assert.doesNotThrow(() => send(proc, { type: 'loQueSea', value: 1 }));
  });
});

describe('Keyboard Worklet — processorOptions', () => {
  beforeEach(loadProcessor);

  test('keyboard.config.js define pivote F#3, spread unidad 9, 12 semitonos y 2 ms', () => {
    assert.equal(keyboardConfig.audio.pivotNote, 66);
    assert.equal(keyboardConfig.audio.spreadUnity, 9);
    assert.equal(keyboardConfig.audio.semitonesPerOctave, 12);
    assert.equal(keyboardConfig.audio.retriggerGapMs, 2);
    assert.equal(DIGITAL_TO_VOLTAGE, 4.0);
  });

  test('sin processorOptions se aplican los mismos valores por defecto', () => {
    const proc = new KeyboardProcessor();
    assert.equal(proc._pivotNote, 66);
    assert.equal(proc._spreadUnity, 9);
    assert.equal(proc._semitonesPerOctave, 12);
    assert.equal(proc._retriggerGapSamples, 96);
  });

  test('un pivote distinto mueve el 0V a esa nota', () => {
    const proc = createProcessor({ ...keyboardConfig.audio, pivotNote: 60 });
    noteOn(proc, 60);
    assert.equal(render(proc).pitch, 0);
    noteOn(proc, 72);
    assertClose(render(proc).pitch, 0.25);
  });

  test('el gap se calcula con el sampleRate del contexto', () => {
    const proc = createProcessor({ ...keyboardConfig.audio, retriggerGapMs: 10 });
    assert.equal(proc._retriggerGapSamples, 480);
  });
});

describe('Keyboard Worklet — Cadena de audio (escalado CV hasta el oscilador)', () => {
  beforeEach(loadProcessor);

  // Cadena: worklet → GainNode(1) → pin de matriz (1) → freqCVInput(×4800) → detune
  // freqCVInput.gain = CENTS_PER_OCTAVE × DIGITAL_TO_VOLTAGE (panelRouting.js)
  const CENTS_PER_OCTAVE = 1200;
  const FREQ_CV_GAIN = CENTS_PER_OCTAVE * DIGITAL_TO_VOLTAGE;

  function detuneCents(note) {
    const proc = createProcessor();
    noteOn(proc, note);
    return render(proc).pitch * FREQ_CV_GAIN;
  }

  test('freqCVInput gain es 4800 (1200 × 4)', () => {
    assert.equal(FREQ_CV_GAIN, 4800);
  });

  // Tolerancia de una milésima de cent: el pitch sale en Float32
  test('F#4 → 1200 cents (1 octava); F#5 → 2400', () => {
    assertClose(detuneCents(78), 1200, 1e-3);
    assertClose(detuneCents(90), 2400, 1e-3);
  });

  test('1 semitono → 100 cents', () => {
    assertClose(detuneCents(67), 100, 1e-3);
  });

  test('5 octavas de teclado (MIDI 36→96) → 6000 cents', () => {
    assertClose(detuneCents(96) - detuneCents(36), 6000, 1e-3);
  });

  test('gate y velocity a dial +5 → 5V reales', () => {
    const proc = createProcessor();
    noteOn(proc, 60, 127);
    const out = render(proc);
    assertClose(out.gate * DIGITAL_TO_VOLTAGE, 5);
    assertClose(out.velocity * DIGITAL_TO_VOLTAGE, 5);
  });
});
