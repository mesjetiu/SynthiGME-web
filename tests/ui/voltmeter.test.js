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
 * - Equivalencias de unidades reales (Vp-p, dBm, V)
 * - Tooltips con información técnica
 * - Serialización/deserialización del modo
 * - Limpieza de recursos (dispose)
 * 
 * @module tests/ui/voltmeter.test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createMockAudioContext, createMockAnalyserNode } from '../mocks/audioContext.mock.js';
import '../mocks/localStorage.mock.js';

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

  it('pivote visual oculto por defecto (blueprint)', () => {
    const el = vm.createElement();
    const svg = el.querySelector('svg');
    const circles = svg.querySelectorAll('circle');
    assert.strictEqual(circles.length, 0, 'pivote oculto por blueprint');
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

  it('escalas ocultas por defecto (blueprint visible=false)', () => {
    const el = vm.createElement();
    const scaleSignal = el.querySelector('.voltmeter__scale-signal');
    const scaleControl = el.querySelector('.voltmeter__scale-control');
    assert.strictEqual(scaleSignal.style.display, 'none');
    assert.strictEqual(scaleControl.style.display, 'none');
  });

  it('contiene un toggle switch', () => {
    const el = vm.createElement();
    const toggle = el.querySelector('.synth-toggle');
    assert.ok(toggle, 'debe contener un Toggle Switch');
  });

  it('toggle sin labels visibles (serigrafiados en panel)', () => {
    const el = vm.createElement();
    const labels = el.querySelectorAll('.synth-toggle__label');
    for (const label of labels) {
      assert.strictEqual(label.textContent.trim(), '', 'label debe ser invisible (espacio)');
    }
  });

  it('aguja color negro (blueprint)', () => {
    const el = vm.createElement();
    const needle = el.querySelector('.voltmeter__needle');
    assert.strictEqual(needle.getAttribute('stroke'), '#000000');
  });
});

describe('Voltmeter - Escala AC (Signal Levels)', () => {

  it('grupo de escala Signal existe pero sin contenido (blueprint visible=false)', () => {
    const vm = createTestVoltmeter();
    const el = vm.createElement();
    const scaleGroup = el.querySelector('.voltmeter__scale-signal');
    assert.ok(scaleGroup, 'grupo de escala Signal debe existir');
    const texts = scaleGroup.querySelectorAll('text');
    assert.strictEqual(texts.length, 0, 'sin textos cuando blueprint.scaleAC.visible=false');
  });
});

describe('Voltmeter - Escala DC (Control Voltages)', () => {

  it('grupo de escala Control existe pero sin contenido (blueprint visible=false)', () => {
    const vm = createTestVoltmeter();
    const el = vm.createElement();
    const scaleGroup = el.querySelector('.voltmeter__scale-control');
    assert.ok(scaleGroup, 'grupo de escala Control debe existir');
    const texts = scaleGroup.querySelectorAll('text');
    assert.strictEqual(texts.length, 0, 'sin textos cuando blueprint.scaleDC.visible=false');
  });
});

describe('Voltmeter - Cambio de modo (Toggle)', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    vm = createTestVoltmeter();
    vm.createElement();
  });

  it('al cambiar toggle a "a" (arriba), modo pasa a "control" (CV)', () => {
    vm._toggle.toggle(); // b → a
    assert.strictEqual(vm._mode, 'control');
  });

  it('al cambiar toggle a "b" (abajo), modo vuelve a "signal"', () => {
    vm._toggle.toggle(); // b → a
    vm._toggle.toggle(); // a → b
    assert.strictEqual(vm._mode, 'signal');
  });

  it('en modo control, ambas escalas ocultas (blueprint visible=false)', () => {
    vm._toggle.toggle(); // → control
    assert.strictEqual(vm._scaleSignal.style.display, 'none');
    assert.strictEqual(vm._scaleControl.style.display, 'none');
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
    vm2._toggle.toggle(); // b→a = control
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

  it('smoothing AC (0.85) es mayor que DC (0.75) → AC más lento', () => {
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
      arr.fill(1.0);
    };

    // Una sola iteración
    vmAC._readAndUpdate();
    vmDC._readAndUpdate();

    // DC debe responder más rápido (smoothing menor → más peso al nuevo valor)
    // AC: new = 0 * 0.85 + 1.0 * 0.15 = 0.15
    // DC: clamp(1.0)=1.0, new = 0 * 0.75 + 1.0 * 0.25 = 0.25
    const acPctTarget = vmAC._smoothedValue / 1.0;
    const dcPctTarget = vmDC._smoothedValue / 1.0;

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
    vm._toggle.toggle(); // b→a = control
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
    // Con blueprint visible=false, ambas escalas permanecen ocultas
    assert.strictEqual(vm._scaleSignal.style.display, 'none');
    assert.strictEqual(vm._scaleControl.style.display, 'none');
  });

  it('actualiza estado del toggle al deserializar (control=a)', () => {
    vm.deserialize({ mode: 'control' });
    assert.strictEqual(vm._toggle.getState(), 'a');
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

  it('ticks ocultos por defecto (blueprint visible=false)', () => {
    const vm = createTestVoltmeter();
    const el = vm.createElement();
    const svg = el.querySelector('svg');
    const allLines = svg.querySelectorAll('line');
    // Solo la aguja (1 line), sin ticks
    assert.strictEqual(allLines.length, 1, `solo la aguja, sin ticks: tiene ${allLines.length}`);
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
    voltmeters[0]._toggle.toggle(); // b→a = control
    assert.strictEqual(voltmeters[0]._mode, 'control');
    assert.strictEqual(voltmeters[1]._mode, 'signal'); // no afectado
    
    // Verificar IDs únicos
    const ids = voltmeters.map(vm => vm.id);
    assert.strictEqual(new Set(ids).size, 8, 'todos los IDs deben ser únicos');
    
    voltmeters.forEach(vm => vm.dispose());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EQUIVALENCIAS DE UNIDADES — Ref: D100-13 C1, D100-08 W1
// ═══════════════════════════════════════════════════════════════════════════

describe('Voltmeter - getReadingInfo() modo Signal (AC)', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vm = createTestVoltmeter();
    vm.createElement();
  });

  it('con silencio: scaleValue=0, Vp-p=0', () => {
    vm._rawValue = 0; vm._rawPeak = 0; vm._rawRms = 0;
    const { scaleValue, parts } = vm.getReadingInfo();
    assert.strictEqual(scaleValue, 0);
    assert.ok(parts.some(p => p.includes('0.0 Vp-p')), `Vp-p incorrecto: ${parts}`);
  });

  it('fondo de escala: scaleValue=10, 10.0 Vp-p', () => {
    vm._rawValue = 1.0; vm._rawPeak = 1.0; vm._rawRms = 1.0;
    const { scaleValue, parts } = vm.getReadingInfo();
    assert.strictEqual(scaleValue, 10);
    assert.ok(parts.some(p => p.includes('10.0 Vp-p')), `Vp-p debe ser 10.0: ${parts}`);
  });

  it('medio de escala: scaleValue=5, 5.0 Vp-p', () => {
    vm._rawValue = 0.5; vm._rawPeak = 0.5; vm._rawRms = 0.5;
    const { scaleValue, parts } = vm.getReadingInfo();
    assert.strictEqual(scaleValue, 5);
    assert.ok(parts.some(p => p.includes('5.0 Vp-p')), `Vp-p debe ser 5.0: ${parts}`);
  });

  it('fondo de escala (RMS=1.0): ~16.2 dBm (5Vrms @ 600Ω)', () => {
    vm._rawValue = 1.0; vm._rawPeak = 1.0; vm._rawRms = 1.0;
    const { parts } = vm.getReadingInfo();
    const dBmP = parts.find(p => p.includes('dBm'));
    const val = parseFloat(dBmP);
    assert.ok(Math.abs(val - 16.2) < 0.2, `RMS 1.0 → ~16.2 dBm, got ${val}`);
  });

  it('medio de escala (RMS=0.5): ~10.2 dBm', () => {
    vm._rawValue = 0.5; vm._rawPeak = 0.5; vm._rawRms = 0.5;
    const { parts } = vm.getReadingInfo();
    // dBm = 10·log₁₀((0.5·5)²/(600·0.001)) = 10·log₁₀(6.25/0.6) ≈ 10.2
    const dBmPart = parts.find(p => p.includes('dBm'));
    assert.ok(dBmPart, 'debe incluir dBm');
    const dBmVal = parseFloat(dBmPart);
    assert.ok(Math.abs(dBmVal - 10.2) < 0.5, `dBm a mitad de escala ≈10.2, got ${dBmVal}`);
  });

  it('incluye ganancia digital (dBFS) cuando showAudioTooltip=true', () => {
    vm._rawValue = 1.0;
    const { parts } = vm.getReadingInfo();
    assert.ok(parts.some(p => p.includes('dB')), `debe incluir dB/dBFS: ${parts}`);
  });

  it('sin señal: no muestra dBm (evita -Infinity)', () => {
    vm._rawValue = 0; vm._rawRms = 0;
    const { parts } = vm.getReadingInfo();
    assert.ok(!parts.some(p => p.includes('dBm')), 'no debe incluir dBm en silencio');
  });

  it('Vp-p lineal: peak 0.2 → 2.0 Vp-p (escala 2)', () => {
    vm._rawValue = 0.2; vm._rawPeak = 0.2; vm._rawRms = 0.2;
    const { scaleValue, parts } = vm.getReadingInfo();
    assert.ok(Math.abs(scaleValue - 2) < 0.01, `escala debe ser 2, got ${scaleValue}`);
    assert.ok(parts.some(p => p.includes('2.0 Vp-p')), `Vp-p: peak 0.2×2×5=2.0, got ${parts}`);
  });

  it('respeta showVoltageTooltip=false: no muestra Vp-p ni dBm', () => {
    localStorage.setItem('synthigme-tooltip-show-voltage', 'false');
    vm._rawValue = 0.5; vm._rawPeak = 0.5; vm._rawRms = 0.5;
    const { parts } = vm.getReadingInfo();
    assert.ok(!parts.some(p => p.includes('Vp-p')), 'no debe incluir Vp-p');
    assert.ok(!parts.some(p => p.includes('dBm')), 'no debe incluir dBm');
  });

  it('respeta showAudioTooltip=false: no muestra dBFS', () => {
    localStorage.setItem('synthigme-tooltip-show-audio-values', 'false');
    vm._rawValue = 0.5; vm._rawPeak = 0.5; vm._rawRms = 0.5;
    const { parts } = vm.getReadingInfo();
    assert.ok(!parts.some(p => p.includes('dB') && !p.includes('dBm')), 'no debe incluir dBFS');
  });
});

describe('Voltmeter - getReadingInfo() modo Control (DC)', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vm = createTestVoltmeter();
    vm.createElement();
    vm._toggle.toggle(); // → modo control
  });

  it('centro-cero: scaleValue=0V', () => {
    vm._rawValue = 0;
    const { scaleValue, parts } = vm.getReadingInfo();
    assert.strictEqual(scaleValue, 0);
    assert.ok(parts.some(p => p.includes('+0.00 V')), `V debe ser +0.00: ${parts}`);
  });

  it('extremo positivo: +5.00V (rawValue=+1)', () => {
    vm._rawValue = 1.0;
    const { scaleValue, parts } = vm.getReadingInfo();
    assert.strictEqual(scaleValue, 5);
    assert.ok(parts.some(p => p.includes('+5.00 V')), `V debe ser +5.00: ${parts}`);
  });

  it('extremo negativo: -5.00V (rawValue=-1)', () => {
    vm._rawValue = -1.0;
    const { scaleValue, parts } = vm.getReadingInfo();
    assert.strictEqual(scaleValue, -5);
    assert.ok(parts.some(p => p.includes('-5.00 V')), `V debe ser -5.00: ${parts}`);
  });

  it('1 unidad de escala = 1V: escala +3 = +3.00V', () => {
    vm._rawValue = 0.6; // 0.6 * 5 = 3V
    const { scaleValue, parts } = vm.getReadingInfo();
    assert.ok(Math.abs(scaleValue - 3) < 0.01, `escala debe ser 3, got ${scaleValue}`);
    assert.ok(parts.some(p => p.includes('+3.00 V')), `V debe ser +3.00: ${parts}`);
  });

  it('escala -2 = -2.00V', () => {
    vm._rawValue = -0.4; // -0.4 * 5 = -2V
    const { scaleValue, parts } = vm.getReadingInfo();
    assert.ok(Math.abs(scaleValue - (-2)) < 0.01, `escala debe ser -2, got ${scaleValue}`);
    assert.ok(parts.some(p => p.includes('-2.00 V')), `V debe ser -2.00: ${parts}`);
  });

  it('respeta showVoltageTooltip=false: no muestra voltaje', () => {
    localStorage.setItem('synthigme-tooltip-show-voltage', 'false');
    vm._rawValue = 0.5;
    const { parts } = vm.getReadingInfo();
    assert.strictEqual(parts.length, 0, 'no debe incluir ninguna parte en modo DC sin voltage tooltip');
  });

  it('no incluye dB ni Vp-p en modo DC (no aplica)', () => {
    vm._rawValue = 0.5;
    const { parts } = vm.getReadingInfo();
    assert.ok(!parts.some(p => p.includes('Vp-p')), 'modo DC no tiene Vp-p');
    assert.ok(!parts.some(p => p.includes('dBm')), 'modo DC no tiene dBm');
    assert.ok(!parts.some(p => p.includes('dBFS')), 'modo DC no tiene dBFS');
  });
});

describe('Voltmeter - _generateTooltipContent()', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vm = createTestVoltmeter();
    vm.createElement();
  });

  it('modo Signal muestra escala X / 10', () => {
    vm._rawValue = 0.7;
    const html = vm._generateTooltipContent();
    assert.ok(html.includes('7.0 / 10'), `debe mostrar 7.0 / 10, got: ${html}`);
  });

  it('modo Control muestra escala X / ±5', () => {
    vm._toggle.toggle(); // → control
    vm._rawValue = 0.6;
    const html = vm._generateTooltipContent();
    assert.ok(html.includes('+3.0 / ±5'), `debe mostrar +3.0 / ±5, got: ${html}`);
  });

  it('modo Control negativo muestra signo -', () => {
    vm._toggle.toggle(); // → control
    vm._rawValue = -0.4;
    const html = vm._generateTooltipContent();
    assert.ok(html.includes('-2.0 / ±5'), `debe mostrar -2.0 / ±5, got: ${html}`);
  });

  it('incluye div con clase knob-tooltip__info si hay info técnica', () => {
    vm._rawValue = 0.5; vm._rawPeak = 0.5; vm._rawRms = 0.5;
    const html = vm._generateTooltipContent();
    assert.ok(html.includes('knob-tooltip__info'), 'debe incluir contenedor de info técnica');
  });

  it('incluye div con clase knob-tooltip__main', () => {
    vm._rawValue = 0.5; vm._rawPeak = 0.5; vm._rawRms = 0.5;
    const html = vm._generateTooltipContent();
    assert.ok(html.includes('knob-tooltip__main'), 'debe incluir contenedor principal');
  });
});

describe('Voltmeter - Tooltip DOM (_showTooltip / _hideTooltip)', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vm = createTestVoltmeter();
    vm.createElement();
    document.body.appendChild(vm.element);
  });

  afterEach(() => {
    vm.dispose();
  });

  it('_showTooltip crea un elemento tooltip en el body', () => {
    vm._showTooltip();
    const tooltips = document.querySelectorAll('.knob-tooltip');
    assert.strictEqual(tooltips.length, 1, 'debe crear un tooltip');
  });

  it('_showTooltip no duplica si ya existe', () => {
    vm._showTooltip();
    vm._showTooltip();
    const tooltips = document.querySelectorAll('.knob-tooltip');
    assert.strictEqual(tooltips.length, 1, 'no debe duplicar');
  });

  it('_hideTooltip elimina el tooltip', () => {
    vm._showTooltip();
    vm._hideTooltip();
    const tooltips = document.querySelectorAll('.knob-tooltip');
    assert.strictEqual(tooltips.length, 0, 'debe eliminar el tooltip');
  });

  it('_hideTooltip es seguro sin tooltip activo', () => {
    assert.doesNotThrow(() => vm._hideTooltip());
  });

  it('tooltip contiene info técnica del modo actual', () => {
    vm._rawValue = 0.5; vm._rawPeak = 0.5; vm._rawRms = 0.5;
    vm._showTooltip();
    const tooltip = document.querySelector('.knob-tooltip');
    assert.ok(tooltip.innerHTML.includes('Vp-p'), 'debe incluir Vp-p en modo Signal');
  });

  it('dispose limpia tooltip activo', () => {
    vm._showTooltip();
    vm.dispose();
    const tooltips = document.querySelectorAll('.knob-tooltip');
    assert.strictEqual(tooltips.length, 0, 'dispose debe limpiar tooltip');
  });
});

describe('Voltmeter - Equivalencia Vp-p correcta (ref: CEM 3330, D100-08 W1)', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vm = createTestVoltmeter();
    vm.createElement();
  });

  it('peak 0.25 → 2.5 Vp-p (±1.25V)', () => {
    vm._rawPeak = 0.25;
    const { parts } = vm.getReadingInfo();
    assert.ok(parts.some(p => p === '2.5 Vp-p'), `peak 0.25 → 2.5 Vp-p, got ${parts}`);
  });

  it('peak 0.75 → 7.5 Vp-p (±3.75V)', () => {
    vm._rawPeak = 0.75;
    const { parts } = vm.getReadingInfo();
    assert.ok(parts.some(p => p === '7.5 Vp-p'), `peak 0.75 → 7.5 Vp-p, got ${parts}`);
  });

  it('peak 0.1 → 1.0 Vp-p (±0.5V)', () => {
    vm._rawPeak = 0.1;
    const { parts } = vm.getReadingInfo();
    assert.ok(parts.some(p => p === '1.0 Vp-p'), `peak 0.1 → 1.0 Vp-p, got ${parts}`);
  });
});

describe('Voltmeter - Equivalencia dBm correcta (ref: D100-13 C1 calibración)', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vm = createTestVoltmeter();
    vm.createElement();
  });

  it('RMS 1.0 → ~16.2 dBm (5Vrms @ 600Ω)', () => {
    vm._rawRms = 1.0;
    const { parts } = vm.getReadingInfo();
    const dBmP = parts.find(p => p.includes('dBm'));
    const val = parseFloat(dBmP);
    assert.ok(Math.abs(val - 16.2) < 0.2, `RMS 1.0→16.2dBm, got ${val}`);
  });

  it('RMS 0.5 → ~10.2 dBm (2.5Vrms @ 600Ω)', () => {
    vm._rawRms = 0.5;
    const { parts } = vm.getReadingInfo();
    const dBmP = parts.find(p => p.includes('dBm'));
    const val = parseFloat(dBmP);
    assert.ok(Math.abs(val - 10.2) < 0.2, `RMS 0.5→10.2dBm, got ${val}`);
  });

  it('RMS 0.1 → ~-3.8 dBm (0.5Vrms @ 600Ω)', () => {
    vm._rawRms = 0.1;
    const { parts } = vm.getReadingInfo();
    const dBmP = parts.find(p => p.includes('dBm'));
    const val = parseFloat(dBmP);
    // dBm = 10·log₁₀((0.1·5)²/(600·0.001)) = 10·log₁₀(0.4167) ≈ -3.8
    assert.ok(Math.abs(val - (-3.8)) < 0.2, `RMS 0.1→-3.8dBm, got ${val}`);
  });

  it('dBm es coherente: +16dBm ref 600Ω = ~4.88 Vrms', () => {
    // Verificación de la calibración del manual:
    // +16 dBm ref 600Ω → P = 10^(16/10) mW = 39.81 mW
    // Vrms = sqrt(P * R) = sqrt(0.03981 * 600) = sqrt(23.886) ≈ 4.888 V
    // 16 Vp-p ≈ 8V pico → Vrms (sinusoidal) = 8/√2 ≈ 5.66V (ligeramente por encima)
    // La calibración del manual es una referencia, no una medida exacta
    const P_mW = Math.pow(10, 16 / 10);
    const Vrms = Math.sqrt(P_mW * 0.001 * 600);
    assert.ok(Vrms > 4.5 && Vrms < 5.5, `Vrms a +16dBm@600Ω ≈ 4.88V, got ${Vrms.toFixed(2)}`);
  });
});

describe('Voltmeter - Equivalencia DC correcta (ref: DVM sistema ±5V)', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vm = createTestVoltmeter();
    vm.createElement();
    vm._toggle.toggle(); // → control
  });

  it('1 unidad de escala DC = exactamente 1V', () => {
    // rawValue 0.2 → 0.2 * 5V = 1.0V exacto → escala = 1
    vm._rawValue = 0.2;
    const { scaleValue } = vm.getReadingInfo();
    assert.strictEqual(scaleValue, 1.0, '1 unidad = 1V');
  });

  it('float interno 0.2 mapea a 1V del hardware', () => {
    vm._rawValue = 0.2;
    const { parts } = vm.getReadingInfo();
    assert.ok(parts.some(p => p.includes('+1.00 V')), `0.2 float → +1V`);
  });

  it('float interno -0.6 mapea a -3V del hardware', () => {
    vm._rawValue = -0.6;
    const { parts } = vm.getReadingInfo();
    assert.ok(parts.some(p => p.includes('-3.00 V')), `-0.6 float → -3V`);
  });

  it('rango completo ±5V cubre joystick, random, secuenciador', () => {
    // Máximo positivo
    vm._rawValue = 1.0;
    const { scaleValue: maxV } = vm.getReadingInfo();
    assert.strictEqual(maxV, 5.0, 'máximo = +5V');

    // Máximo negativo
    vm._rawValue = -1.0;
    const { scaleValue: minV } = vm.getReadingInfo();
    assert.strictEqual(minV, -5.0, 'mínimo = -5V');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VALORES RAW vs SMOOTHED — Separación inercia de aguja / tooltip
// ═══════════════════════════════════════════════════════════════════════════

describe('Voltmeter - Valores raw (instantáneos) vs smoothed (aguja)', () => {

  let vm;

  beforeEach(() => {
    document.body.innerHTML = '';
    vm = createTestVoltmeter();
    vm.createElement();
  });

  it('constructor inicializa _rawValue, _rawPeak, _rawRms a 0', () => {
    const v = createTestVoltmeter();
    assert.strictEqual(v._rawValue, 0);
    assert.strictEqual(v._rawPeak, 0);
    assert.strictEqual(v._rawRms, 0);
  });

  it('_readAndUpdate establece _rawValue, _rawPeak y _rawRms', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    vm._analyser.getFloatTimeDomainData = (arr) => {
      vm._analyser._calls.getFloatTimeDomainData++;
      arr.fill(0.8); // señal constante
    };
    vm._readAndUpdate();
    assert.ok(Math.abs(vm._rawValue - 0.8) < 0.001, 'rawValue ≈ avgAbs ≈ 0.8');
    assert.ok(Math.abs(vm._rawPeak - 0.8) < 0.001, 'rawPeak ≈ 0.8');
    assert.ok(Math.abs(vm._rawRms - 0.8) < 0.001, 'rawRms ≈ 0.8 para señal constante');
    vm.disconnect();
  });

  it('_rawValue es instantáneo, _smoothedValue tiene inercia', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    vm._analyser.getFloatTimeDomainData = (arr) => {
      vm._analyser._calls.getFloatTimeDomainData++;
      arr.fill(1.0);
    };
    vm._readAndUpdate();
    // Tras un paso: rawValue = 1.0 (instantáneo), smoothed tiene inercia
    assert.strictEqual(vm._rawValue, 1.0, 'rawValue=1.0 instantáneo');
    assert.ok(vm._smoothedValue < 0.5, `smoothedValue debe tener inercia: ${vm._smoothedValue}`);
    vm.disconnect();
  });

  it('disconnect() resetea valores raw a 0', () => {
    const source = createMockSourceNode();
    vm.connect(source);
    vm._analyser.getFloatTimeDomainData = (arr) => {
      vm._analyser._calls.getFloatTimeDomainData++;
      arr.fill(0.7);
    };
    vm._readAndUpdate();
    vm.disconnect();
    assert.strictEqual(vm._rawValue, 0);
    assert.strictEqual(vm._rawPeak, 0);
    assert.strictEqual(vm._rawRms, 0);
  });

  it('toggle resetea valores raw a 0', () => {
    vm._rawValue = 0.5;
    vm._rawPeak = 0.8;
    vm._rawRms = 0.6;
    vm._toggle.toggle(); // signal → control
    assert.strictEqual(vm._rawValue, 0);
    assert.strictEqual(vm._rawPeak, 0);
    assert.strictEqual(vm._rawRms, 0);
  });

  it('getReadingInfo usa _rawValue, no _smoothedValue', () => {
    vm._rawValue = 0.9;
    vm._rawPeak = 0.9;
    vm._rawRms = 0.9;
    vm._smoothedValue = 0.1; // valor diferente
    const { scaleValue } = vm.getReadingInfo();
    // scaleValue debe ser 0.9 * 10 = 9.0, no 0.1 * 10 = 1.0
    assert.strictEqual(scaleValue, 9.0, 'tooltip usa rawValue, no smoothedValue');
  });

  it('DC mode: Web Audio ±1.0 mapea directamente sin dividir por 5', () => {
    vm._toggle.toggle(); // → control
    const source = createMockSourceNode();
    vm.connect(source);
    vm._analyser.getFloatTimeDomainData = (arr) => {
      vm._analyser._calls.getFloatTimeDomainData++;
      arr.fill(1.0); // señal DC a máximo
    };
    for (let i = 0; i < 100; i++) vm._readAndUpdate();
    // rawValue debe ser 1.0 (no 0.2 como con el antiguo /5)
    assert.strictEqual(vm._rawValue, 1.0, 'DC sin dividir: rawValue=1.0');
    // smoothed debe converger a 1.0
    assert.ok(vm._smoothedValue > 0.95, `smoothed debe converger a ~1.0, got ${vm._smoothedValue}`);
    vm.disconnect();
  });

  it('Vp-p se calcula desde _rawPeak (pico real), no desde average', () => {
    // Simular señal donde peak ≠ average (normal en señales reales)
    vm._rawValue = 0.5;  // rectified average
    vm._rawPeak = 1.0;   // peak amplitude
    vm._rawRms = 0.707;  // RMS
    const { parts } = vm.getReadingInfo();
    // Vp-p = 1.0 * 2 * 5.0 = 10.0 Vp-p (basado en peak, no average)
    assert.ok(parts.some(p => p === '10.0 Vp-p'), `Vp-p desde peak: 10.0, got ${parts}`);
  });
});
