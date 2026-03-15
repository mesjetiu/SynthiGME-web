/**
 * Tests para Voltmeter — Medidor analógico de aguja para Output Channels
 * 
 * Verifica:
 * - Constructor y valores por defecto
 * - Creación de DOM (SVG, escalas, aguja, toggle)
 * - Modos de operación (Signal/Control)
 * - Conexión/desconexión de audio (AnalyserNode)
 * - Lectura y procesado de datos de audio (AC rectificado, DC directo)
 * - Balística de la aguja (smoothing)
 * - Serialización/deserialización del modo
 * - Limpieza de recursos (dispose)
 * 
 * @module tests/ui/voltmeter.test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createMockAudioContext, createMockAnalyserNode } from '../mocks/audioContext.mock.js';

// ── Configurar JSDOM antes de importar el componente ───────────────────────
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.SVGElement = dom.window.SVGElement || class SVGElement {};

const { Voltmeter } = await import('../../src/assets/js/ui/voltmeter.js');

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Crea un mock de nodo fuente de audio con context que soporta createAnalyser.
 * Simula el postVcaNode del engine.
 */
function createMockSourceNode() {
  const mockCtx = createMockAudioContext();
  return {
    context: mockCtx,
    connect(dest) { return dest; },
    disconnect() {}
  };
}

/**
 * Crea un Voltmeter con opciones mínimas para testing.
 */
function createTestVoltmeter(options = {}) {
  return new Voltmeter({
    id: options.id || 'test-voltmeter',
    channelIndex: options.channelIndex ?? 0,
    onChange: options.onChange || null
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Voltmeter - Constructor y valores por defecto', () => {

  it('estado inicial del modo es "signal"', () => {
    const vm = createTestVoltmeter();
    assert.strictEqual(vm._mode, 'signal');
  });

  it('channelIndex se asigna correctamente', () => {
    const vm = createTestVoltmeter({ channelIndex: 5 });
    assert.strictEqual(vm.channelIndex, 5);
  });

  it('channelIndex por defecto es 0', () => {
    const vm = new Voltmeter({});
    assert.strictEqual(vm.channelIndex, 0);
  });

  it('id se asigna desde opciones', () => {
    const vm = createTestVoltmeter({ id: 'voltmeter7' });
    assert.strictEqual(vm.id, 'voltmeter7');
  });

  it('genera id automático si no se proporciona', () => {
    const vm = new Voltmeter({});
    assert.ok(vm.id.startsWith('voltmeter-'));
  });

  it('valor suavizado inicial es 0', () => {
    const vm = createTestVoltmeter();
    assert.strictEqual(vm._smoothedValue, 0);
  });

  it('no tiene AnalyserNode sin conectar', () => {
    const vm = createTestVoltmeter();
    assert.strictEqual(vm._analyser, null);
  });

  it('no tiene elemento DOM antes de createElement', () => {
    const vm = createTestVoltmeter();
    assert.strictEqual(vm.element, null);
  });

  it('callback onChange se almacena', () => {
    const fn = () => {};
    const vm = createTestVoltmeter({ onChange: fn });
    assert.strictEqual(vm.onChange, fn);
  });
});

describe('Voltmeter - createElement()', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    vm = createTestVoltmeter();
  });

  it('retorna un elemento DOM', () => {
    const el = vm.createElement();
    assert.ok(el instanceof dom.window.HTMLElement);
  });

  it('elemento tiene clase "voltmeter"', () => {
    const el = vm.createElement();
    assert.ok(el.classList.contains('voltmeter'));
  });

  it('elemento tiene el id correcto', () => {
    const el = vm.createElement();
    assert.strictEqual(el.id, 'test-voltmeter');
  });

  it('almacena referencia al elemento', () => {
    const el = vm.createElement();
    assert.strictEqual(vm.element, el);
  });

  it('contiene un SVG del dial', () => {
    const el = vm.createElement();
    const svg = el.querySelector('svg');
    assert.ok(svg, 'debe contener un elemento SVG');
  });

  it('SVG tiene la clase voltmeter__dial', () => {
    const el = vm.createElement();
    const svg = el.querySelector('svg');
    assert.ok(svg.classList.contains('voltmeter__dial'));
  });

  it('contiene la aguja (needle)', () => {
    const el = vm.createElement();
    const needle = el.querySelector('.voltmeter__needle');
    assert.ok(needle, 'debe contener el elemento de aguja');
  });

  it('la aguja parte del punto de pivote (60, 68)', () => {
    const el = vm.createElement();
    const needle = el.querySelector('.voltmeter__needle');
    assert.strictEqual(needle.getAttribute('x1'), '60');
    assert.strictEqual(needle.getAttribute('y1'), '68');
  });

  it('contiene un pivote central (circle)', () => {
    const el = vm.createElement();
    const circles = el.querySelectorAll('circle');
    assert.ok(circles.length > 0, 'debe contener al menos un circle (pivote)');
  });

  it('contiene escala Signal (AC)', () => {
    const el = vm.createElement();
    const scaleSignal = el.querySelector('.voltmeter__scale-signal');
    assert.ok(scaleSignal, 'debe contener grupo de escala Signal');
  });

  it('contiene escala Control (DC)', () => {
    const el = vm.createElement();
    const scaleControl = el.querySelector('.voltmeter__scale-control');
    assert.ok(scaleControl, 'debe contener grupo de escala Control');
  });

  it('escala Signal visible por defecto', () => {
    const el = vm.createElement();
    const scaleSignal = el.querySelector('.voltmeter__scale-signal');
    assert.notStrictEqual(scaleSignal.style.display, 'none');
  });

  it('escala Control oculta por defecto', () => {
    const el = vm.createElement();
    const scaleControl = el.querySelector('.voltmeter__scale-control');
    assert.strictEqual(scaleControl.style.display, 'none');
  });

  it('contiene un toggle switch', () => {
    const el = vm.createElement();
    const toggle = el.querySelector('.synth-toggle');
    assert.ok(toggle, 'debe contener un Toggle Switch');
  });

  it('toggle tiene labels Sig/CV', () => {
    const el = vm.createElement();
    const labels = el.querySelectorAll('.synth-toggle__label');
    const texts = Array.from(labels).map(l => l.textContent);
    assert.ok(texts.includes('Sig'), 'debe incluir label "Sig"');
    assert.ok(texts.includes('CV'), 'debe incluir label "CV"');
  });
});

describe('Voltmeter - Escala AC (Signal Levels)', () => {

  it('incluye texto "0" en la escala Signal', () => {
    const vm = createTestVoltmeter();
    const el = vm.createElement();
    const texts = el.querySelectorAll('.voltmeter__scale-signal text');
    const values = Array.from(texts).map(t => t.textContent);
    assert.ok(values.includes('0'), 'escala debe incluir "0"');
  });

  it('incluye texto "10" en la escala Signal', () => {
    const vm = createTestVoltmeter();
    const el = vm.createElement();
    const texts = el.querySelectorAll('.voltmeter__scale-signal text');
    const values = Array.from(texts).map(t => t.textContent);
    assert.ok(values.includes('10'), 'escala debe incluir "10"');
  });

  it('muestra solo valores pares (0, 2, 4, 6, 8, 10)', () => {
    const vm = createTestVoltmeter();
    const el = vm.createElement();
    const texts = el.querySelectorAll('.voltmeter__scale-signal text');
    const values = Array.from(texts).map(t => t.textContent);
    const expected = ['0', '2', '4', '6', '8', '10'];
    for (const v of expected) {
      assert.ok(values.includes(v), `escala debe incluir "${v}"`);
    }
  });
});

describe('Voltmeter - Escala DC (Control Voltages)', () => {

  it('incluye texto "0" como centro-cero', () => {
    const vm = createTestVoltmeter();
    const el = vm.createElement();
    const texts = el.querySelectorAll('.voltmeter__scale-control text');
    const values = Array.from(texts).map(t => t.textContent);
    assert.ok(values.includes('0'), 'escala DC debe incluir "0" (centro)');
  });

  it('incluye "-5" y "+5" como extremos', () => {
    const vm = createTestVoltmeter();
    const el = vm.createElement();
    const texts = el.querySelectorAll('.voltmeter__scale-control text');
    const values = Array.from(texts).map(t => t.textContent);
    assert.ok(values.includes('-5'), 'escala DC debe incluir "-5"');
    assert.ok(values.includes('+5'), 'escala DC debe incluir "+5"');
  });

  it('incluye valores impares intermedios (-3, -1, +1, +3)', () => {
    const vm = createTestVoltmeter();
    const el = vm.createElement();
    const texts = el.querySelectorAll('.voltmeter__scale-control text');
    const values = Array.from(texts).map(t => t.textContent);
    for (const v of ['-3', '-1', '+1', '+3']) {
      assert.ok(values.includes(v), `escala DC debe incluir "${v}"`);
    }
  });
});

describe('Voltmeter - Cambio de modo (Toggle)', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    vm = createTestVoltmeter();
    vm.createElement();
  });

  it('al cambiar toggle a "b", modo pasa a "control"', () => {
    vm._toggle.toggle(); // a → b
    assert.strictEqual(vm._mode, 'control');
  });

  it('al cambiar toggle a "a", modo vuelve a "signal"', () => {
    vm._toggle.toggle(); // a → b
    vm._toggle.toggle(); // b → a
    assert.strictEqual(vm._mode, 'signal');
  });

  it('en modo control, escala DC visible y escala AC oculta', () => {
    vm._toggle.toggle(); // → control
    assert.strictEqual(vm._scaleSignal.style.display, 'none');
    assert.notStrictEqual(vm._scaleControl.style.display, 'none');
  });

  it('reset smoothedValue al cambiar de modo', () => {
    vm._smoothedValue = 0.75;
    vm._toggle.toggle();
    assert.strictEqual(vm._smoothedValue, 0);
  });

  it('llama a onChange callback con el nuevo modo', () => {
    let receivedMode = null;
    const vm2 = new Voltmeter({
      id: 'test-cb',
      onChange: (mode) => { receivedMode = mode; }
    });
    vm2.createElement();
    vm2._toggle.toggle();
    assert.strictEqual(receivedMode, 'control');
  });
});

describe('Voltmeter - connect()', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    vm = createTestVoltmeter();
    vm.createElement();
  });

  afterEach(() => {
    vm.disconnect();
  });

  it('crea un AnalyserNode al conectar', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    assert.ok(vm._analyser !== null, 'debe crear un AnalyserNode');
  });

  it('configura fftSize del AnalyserNode', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    assert.strictEqual(vm._analyser.fftSize, 256);
  });

  it('crea buffer de datos de tamaño correcto', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    assert.ok(vm._timeDomainData instanceof Float32Array);
    assert.strictEqual(vm._timeDomainData.length, 256);
  });

  it('inicia la lectura periódica', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    assert.ok(vm._intervalId !== null, 'debe iniciar un setInterval');
  });

  it('ignora si sourceNode es null', () => {
    vm.connect(null);
    assert.strictEqual(vm._analyser, null);
  });

  it('ignora si sourceNode no tiene context', () => {
    vm.connect({ connect() {} });
    assert.strictEqual(vm._analyser, null);
  });
});

describe('Voltmeter - disconnect()', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    vm = createTestVoltmeter();
    vm.createElement();
  });

  it('limpia el AnalyserNode', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    vm.disconnect();
    assert.strictEqual(vm._analyser, null);
  });

  it('limpia el buffer de datos', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    vm.disconnect();
    assert.strictEqual(vm._timeDomainData, null);
  });

  it('detiene la lectura periódica', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    vm.disconnect();
    assert.strictEqual(vm._intervalId, null);
  });

  it('resetea el valor suavizado', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    vm._smoothedValue = 0.8;
    vm.disconnect();
    assert.strictEqual(vm._smoothedValue, 0);
  });

  it('es seguro llamar sin haber conectado', () => {
    assert.doesNotThrow(() => vm.disconnect());
  });

  it('es seguro llamar múltiples veces', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    assert.doesNotThrow(() => {
      vm.disconnect();
      vm.disconnect();
    });
  });
});

describe('Voltmeter - _readAndUpdate() modo Signal (AC)', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    vm = createTestVoltmeter();
    vm.createElement();
  });

  afterEach(() => {
    vm.disconnect();
  });

  it('no falla si no hay analyser conectado', () => {
    assert.doesNotThrow(() => vm._readAndUpdate());
  });

  it('lee datos del AnalyserNode', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    const callsBefore = vm._analyser._calls.getFloatTimeDomainData;
    vm._readAndUpdate();
    assert.strictEqual(
      vm._analyser._calls.getFloatTimeDomainData,
      callsBefore + 1,
      'debe llamar a getFloatTimeDomainData'
    );
  });

  it('con señal silenciosa (todo ceros), valor suavizado tiende a 0', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    // El mock rellena con 0 por defecto
    vm._readAndUpdate();
    assert.ok(vm._smoothedValue >= 0, 'valor debe ser no negativo en modo AC');
    assert.ok(vm._smoothedValue < 0.01, 'valor debe tender a 0 en silencio');
  });

  it('con señal máxima, valor suavizado crece', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    // Simular señal con amplitud 1.0
    const mockAnalyser = vm._analyser;
    const originalGet = mockAnalyser.getFloatTimeDomainData.bind(mockAnalyser);
    mockAnalyser.getFloatTimeDomainData = (arr) => {
      mockAnalyser._calls.getFloatTimeDomainData++;
      arr.fill(1.0);
    };
    // Varias iteraciones para que el smoothing converja
    for (let i = 0; i < 50; i++) vm._readAndUpdate();
    assert.ok(vm._smoothedValue > 0.5, `valor suavizado debe crecer con señal fuerte, got ${vm._smoothedValue}`);
  });

  it('en modo AC, valor suavizado es siempre >= 0 (rectificado)', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    // Señal negativa
    vm._analyser.getFloatTimeDomainData = (arr) => {
      vm._analyser._calls.getFloatTimeDomainData++;
      arr.fill(-0.5);
    };
    vm._readAndUpdate();
    assert.ok(vm._smoothedValue >= 0, 'rectificador debe producir valores positivos');
  });
});

describe('Voltmeter - _readAndUpdate() modo Control (DC)', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    vm = createTestVoltmeter();
    vm.createElement();
    vm._toggle.toggle(); // → modo control
  });

  afterEach(() => {
    vm.disconnect();
  });

  it('con voltaje DC positivo, valor suavizado es positivo', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    vm._analyser.getFloatTimeDomainData = (arr) => {
      vm._analyser._calls.getFloatTimeDomainData++;
      arr.fill(3.0); // +3V DC
    };
    for (let i = 0; i < 50; i++) vm._readAndUpdate();
    assert.ok(vm._smoothedValue > 0, 'voltaje positivo debe dar valor positivo');
  });

  it('con voltaje DC negativo, valor suavizado es negativo', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    vm._analyser.getFloatTimeDomainData = (arr) => {
      vm._analyser._calls.getFloatTimeDomainData++;
      arr.fill(-3.0); // -3V DC
    };
    for (let i = 0; i < 50; i++) vm._readAndUpdate();
    assert.ok(vm._smoothedValue < 0, 'voltaje negativo debe dar valor negativo');
  });

  it('voltaje DC se clamp a rango ±1 normalizado', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    vm._analyser.getFloatTimeDomainData = (arr) => {
      vm._analyser._calls.getFloatTimeDomainData++;
      arr.fill(20.0); // muy por encima del rango ±5V
    };
    for (let i = 0; i < 100; i++) vm._readAndUpdate();
    assert.ok(vm._smoothedValue <= 1.0, `valor debe estar clampeado a 1, got ${vm._smoothedValue}`);
  });

  it('voltaje DC de 0V da valor suavizado cercano a 0 (centro)', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    // Mock default: fill(0)
    for (let i = 0; i < 50; i++) vm._readAndUpdate();
    assert.ok(Math.abs(vm._smoothedValue) < 0.01, 'sin voltaje, centro-cero');
  });
});

describe('Voltmeter - Balística de la aguja (smoothing)', () => {

  it('smoothing AC (0.92) es mayor que DC (0.85) → AC más lento', () => {
    // No accedemos a constantes directamente, pero verificamos el efecto:
    // Con la misma señal, en modo AC la aguja se mueve más lento que en DC
    const vmAC = createTestVoltmeter({ id: 'vm-ac' });
    vmAC.createElement();
    const sourceAC = createMockSourceNode();
    vmAC.connect(sourceAC);
    vmAC._analyser.getFloatTimeDomainData = (arr) => {
      vmAC._analyser._calls.getFloatTimeDomainData++;
      arr.fill(1.0);
    };

    const vmDC = createTestVoltmeter({ id: 'vm-dc' });
    vmDC.createElement();
    vmDC._toggle.toggle(); // → control
    const sourceDC = createMockSourceNode();
    vmDC.connect(sourceDC);
    vmDC._analyser.getFloatTimeDomainData = (arr) => {
      vmDC._analyser._calls.getFloatTimeDomainData++;
      arr.fill(1.0); // En DC, 1.0V/5V = 0.2 normalizado
    };

    // Una sola iteración
    vmAC._readAndUpdate();
    vmDC._readAndUpdate();

    // DC debe responder más rápido (smoothing menor → más peso al nuevo valor)
    // AC: new = 0 * 0.92 + 1.0 * 0.08 = 0.08
    // DC: 1.0/5.0=0.2, new = 0 * 0.85 + 0.2 * 0.15 = 0.03
    // Pero en AC el target es 1.0 vs DC 0.2, así que comparar % de target
    const acPctTarget = vmAC._smoothedValue / 1.0;  // % del target AC
    const dcPctTarget = vmDC._smoothedValue / 0.2;   // % del target DC (1.0/5.0)

    assert.ok(dcPctTarget > acPctTarget,
      `DC debe alcanzar mayor % del target que AC tras un paso: DC=${dcPctTarget.toFixed(3)}, AC=${acPctTarget.toFixed(3)}`);

    vmAC.disconnect();
    vmDC.disconnect();
  });
});

describe('Voltmeter - Ángulo de la aguja', () => {

  it('en modo signal con silencio, aguja a la izquierda (-50°)', () => {
    const vm = createTestVoltmeter();
    vm.createElement();
    // Verificar posición inicial
    const needle = vm._needle;
    const transform = needle.getAttribute('transform');
    assert.ok(transform.includes('-50'), 'aguja debe estar en ángulo mínimo (-50°)');
  });

  it('_setNeedleAngle actualiza el transform de la aguja', () => {
    const vm = createTestVoltmeter();
    vm.createElement();
    vm._setNeedleAngle(25);
    const transform = vm._needle.getAttribute('transform');
    assert.ok(transform.includes('25'), 'transform debe incluir el ángulo 25');
    assert.ok(transform.includes('60, 68'), 'rotación debe ser sobre el pivote (60, 68)');
  });

  it('_currentAngle se actualiza en _setNeedleAngle', () => {
    const vm = createTestVoltmeter();
    vm.createElement();
    vm._setNeedleAngle(30);
    assert.strictEqual(vm._currentAngle, 30);
  });
});

describe('Voltmeter - serialize()', () => {

  it('retorna objeto con modo actual', () => {
    const vm = createTestVoltmeter();
    vm.createElement();
    const data = vm.serialize();
    assert.deepStrictEqual(data, { mode: 'signal' });
  });

  it('serializa modo "control" correctamente', () => {
    const vm = createTestVoltmeter();
    vm.createElement();
    vm._toggle.toggle(); // → control
    const data = vm.serialize();
    assert.deepStrictEqual(data, { mode: 'control' });
  });
});

describe('Voltmeter - deserialize()', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    vm = createTestVoltmeter();
    vm.createElement();
  });

  it('restaura modo "control"', () => {
    vm.deserialize({ mode: 'control' });
    assert.strictEqual(vm._mode, 'control');
  });

  it('restaura modo "signal"', () => {
    vm._toggle.toggle(); // → control
    vm.deserialize({ mode: 'signal' });
    assert.strictEqual(vm._mode, 'signal');
  });

  it('actualiza visibilidad de escalas al deserializar', () => {
    vm.deserialize({ mode: 'control' });
    assert.strictEqual(vm._scaleSignal.style.display, 'none');
    assert.notStrictEqual(vm._scaleControl.style.display, 'none');
  });

  it('actualiza estado del toggle al deserializar', () => {
    vm.deserialize({ mode: 'control' });
    assert.strictEqual(vm._toggle.getState(), 'b');
  });

  it('ignora datos null', () => {
    assert.doesNotThrow(() => vm.deserialize(null));
    assert.strictEqual(vm._mode, 'signal'); // no cambia
  });

  it('ignora modo inválido', () => {
    vm.deserialize({ mode: 'invalid' });
    assert.strictEqual(vm._mode, 'signal'); // no cambia
  });

  it('ignora datos sin propiedad mode', () => {
    vm.deserialize({ foo: 'bar' });
    assert.strictEqual(vm._mode, 'signal'); // no cambia
  });
});

describe('Voltmeter - dispose()', () => {

  it('limpia todas las referencias', () => {
    const vm = createTestVoltmeter();
    vm.createElement();
    const source = createMockSourceNode();
    vm.connect(source);
    vm.dispose();
    assert.strictEqual(vm._analyser, null);
    assert.strictEqual(vm._toggle, null);
    assert.strictEqual(vm._needle, null);
    assert.strictEqual(vm.element, null);
  });

  it('detiene la lectura periódica', () => {
    const vm = createTestVoltmeter();
    vm.createElement();
    const source = createMockSourceNode();
    vm.connect(source);
    vm.dispose();
    assert.strictEqual(vm._intervalId, null);
  });

  it('es seguro llamar sin haber creado el elemento', () => {
    const vm = createTestVoltmeter();
    assert.doesNotThrow(() => vm.dispose());
  });
});

describe('Voltmeter - Marcas de graduación (ticks)', () => {

  it('tiene al menos 10 marcas de graduación', () => {
    const vm = createTestVoltmeter();
    const el = vm.createElement();
    // Cada tick es un <line> dentro del SVG (fuera de los grupos de escala)
    const svg = el.querySelector('svg');
    const allLines = svg.querySelectorAll('line');
    // Hay al menos 10 ticks + la aguja (1 line)
    assert.ok(allLines.length >= 11, `debe tener al menos 11 lines (10 ticks + aguja), tiene ${allLines.length}`);
  });
});

describe('Voltmeter - Múltiples instancias', () => {

  it('8 voltímetros pueden coexistir independientemente', () => {
    const voltmeters = [];
    for (let i = 0; i < 8; i++) {
      const vm = new Voltmeter({ id: `voltmeter${i + 1}`, channelIndex: i });
      vm.createElement();
      voltmeters.push(vm);
    }
    
    // Verificar que cada uno tiene su propio estado
    voltmeters[0]._toggle.toggle(); // → control
    assert.strictEqual(voltmeters[0]._mode, 'control');
    assert.strictEqual(voltmeters[1]._mode, 'signal'); // no afectado
    
    // Verificar IDs únicos
    const ids = voltmeters.map(vm => vm.id);
    assert.strictEqual(new Set(ids).size, 8, 'todos los IDs deben ser únicos');
    
    voltmeters.forEach(vm => vm.dispose());
  });
});
