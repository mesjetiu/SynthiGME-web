/**
 * Tests para core/matrix.js
 * 
 * Verifica:
 * - constructor(): inicialización de matriz
 * - build(): construcción de DOM de la matriz
 * - getPortNode(): obtención de nodos de puerto
 * - createConnection(): creación de conexiones audio/CV
 * - removeConnection(): desconexión de nodos
 * - toggleConnection(): toggle de estado de pines
 * - connections: estructura de datos de conexiones activas
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createMockAudioContext } from '../mocks/audioContext.mock.js';

// Mock de DOM para Node.js
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.CustomEvent = dom.window.CustomEvent;

import { Matrix } from '../../src/assets/js/core/matrix.js';

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mock de AudioEngine
 */
function createMockEngine(ctx) {
  const modules = [];
  const outputBuses = [];
  
  // Crear 8 buses de output
  for (let i = 0; i < 8; i++) {
    outputBuses.push(ctx.createGain());
  }
  
  return {
    audioCtx: ctx,
    masterL: ctx.createGain(),
    masterR: ctx.createGain(),
    modules,
    outputBuses,
    findModule(id) {
      return modules.find(m => m.id === id);
    },
    registerModule(module) {
      modules.push(module);
    },
    getOutputBusNode(index) {
      return outputBuses[index] || null;
    }
  };
}

/**
 * Mock de módulo con outputs
 */
function createSourceModule(id, ctx) {
  return {
    id,
    outputs: [
      { id: `${id}_out`, node: ctx.createGain() }
    ],
    inputs: []
  };
}

/**
 * Mock de módulo con inputs (con AudioParam)
 */
function createDestModule(id, ctx) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  return {
    id,
    outputs: [],
    inputs: [
      { id: `${id}_freq`, param: osc.frequency },
      { id: `${id}_amp`, param: gain.gain }
    ]
  };
}

/**
 * Configura sourcePorts y destPorts típicos
 */
function createTypicalPorts() {
  const sourcePorts = [
    { label: 'Osc 1', moduleId: 'osc1', portId: 'osc1_out' },
    { label: 'Osc 2', moduleId: 'osc2', portId: 'osc2_out' },
    { label: 'Noise', moduleId: 'noise1', portId: 'noise1_out' }
  ];
  
  const destPorts = [
    { label: 'Filter Freq', type: 'freq', moduleId: 'filter1', portId: 'filter1_freq' },
    { label: 'Filter Amp', type: 'amp', moduleId: 'filter1', portId: 'filter1_amp' },
    { label: 'Output Bus 1', type: 'output', busIndex: 0 }
  ];
  
  return { sourcePorts, destPorts };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: CONSTRUCCIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('Matrix constructor', () => {

  it('crea instancia con parámetros obligatorios', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    
    assert.ok(matrix);
    assert.equal(matrix.engine, engine);
    assert.equal(matrix.tableEl, tableEl);
    assert.equal(matrix.sourcePorts, sourcePorts);
    assert.equal(matrix.destPorts, destPorts);
  });

  it('inicializa connections como array vacío', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    
    assert.ok(Array.isArray(matrix.connections));
    assert.equal(matrix.connections.length, 0);
  });

  it('aplica opciones por defecto', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    
    assert.equal(matrix.options.freqDepth, 80);
    assert.equal(matrix.options.ampDepth, 0.5);
    assert.equal(matrix.options.outputGain, 1.0);
  });

  it('permite sobrescribir opciones', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts, {
      freqDepth: 100,
      ampDepth: 0.8
    });
    
    assert.equal(matrix.options.freqDepth, 100);
    assert.equal(matrix.options.ampDepth, 0.8);
  });

});

describe('Matrix.build()', () => {

  it('construye DOM de tabla con headers', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    matrix.build();
    
    // Verificar thead
    const thead = tableEl.querySelector('thead');
    assert.ok(thead);
    
    const headers = thead.querySelectorAll('th');
    assert.equal(headers.length, destPorts.length + 1); // +1 por esquina superior izquierda
  });

  it('crea botones de pin para cada combinación source/dest', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    matrix.build();
    
    const buttons = tableEl.querySelectorAll('.pin-btn');
    assert.equal(buttons.length, sourcePorts.length * destPorts.length);
  });

  it('asigna dataset row/col correctamente a botones', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    matrix.build();
    
    const firstBtn = tableEl.querySelector('[data-row="0"][data-col="0"]');
    const lastBtn = tableEl.querySelector(`[data-row="${sourcePorts.length - 1}"][data-col="${destPorts.length - 1}"]`);
    
    assert.ok(firstBtn);
    assert.ok(lastBtn);
  });

  it('inicializa matriz de connections como null', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    matrix.build();
    
    assert.equal(matrix.connections.length, sourcePorts.length);
    assert.equal(matrix.connections[0].length, destPorts.length);
    assert.equal(matrix.connections[0][0], null);
  });

  it('limpia contenido anterior de tableEl', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const tableEl = document.createElement('table');
    tableEl.innerHTML = '<tr><td>Old content</td></tr>';
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    matrix.build();
    
    // No debe contener "Old content"
    assert.ok(!tableEl.innerHTML.includes('Old content'));
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: OBTENCIÓN DE NODOS
// ═══════════════════════════════════════════════════════════════════════════

describe('Matrix.getPortNode()', () => {

  it('retorna null si portInfo es null', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    
    const node = matrix.getPortNode(null, true);
    assert.equal(node, null);
  });

  it('retorna null si módulo no existe', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    
    const portInfo = { moduleId: 'nonexistent', portId: 'out' };
    const node = matrix.getPortNode(portInfo, true);
    
    assert.equal(node, null);
  });

  it('obtiene nodo de output correctamente (source)', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const osc1 = createSourceModule('osc1', ctx);
    engine.registerModule(osc1);
    
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    
    const portInfo = { moduleId: 'osc1', portId: 'osc1_out' };
    const node = matrix.getPortNode(portInfo, true);
    
    assert.ok(node);
    assert.equal(node, osc1.outputs[0].node);
  });

  it('obtiene puerto de input correctamente (dest)', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const filter = createDestModule('filter1', ctx);
    engine.registerModule(filter);
    
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    
    const portInfo = { moduleId: 'filter1', portId: 'filter1_freq' };
    const port = matrix.getPortNode(portInfo, false);
    
    assert.ok(port);
    assert.equal(port, filter.inputs[0]);
  });

  it('retorna null si portId no existe en módulo', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const osc1 = createSourceModule('osc1', ctx);
    engine.registerModule(osc1);
    
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    
    const portInfo = { moduleId: 'osc1', portId: 'nonexistent_port' };
    const node = matrix.getPortNode(portInfo, true);
    
    assert.equal(node, null);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: CREACIÓN DE CONEXIONES
// ═══════════════════════════════════════════════════════════════════════════

describe('Matrix.createConnection()', () => {

  let ctx, engine, matrix, tableEl;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = createMockEngine(ctx);
    
    // Registrar módulos
    engine.registerModule(createSourceModule('osc1', ctx));
    engine.registerModule(createSourceModule('osc2', ctx));
    engine.registerModule(createDestModule('filter1', ctx));
    
    tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    matrix.build();
  });

  it('crea conexión de modulación de frecuencia (CV)', () => {
    // osc1 → filter1 freq
    matrix.createConnection(0, 0);
    
    const conn = matrix.connections[0][0];
    assert.ok(conn);
    assert.ok(conn.gain); // Tiene propiedad gain (es GainNode-like)
    assert.equal(conn.gain.value, 80); // freqDepth
  });

  it('crea conexión de modulación de amplitud', () => {
    // osc1 → filter1 amp
    matrix.createConnection(0, 1);
    
    const conn = matrix.connections[0][1];
    assert.ok(conn);
    assert.equal(conn.gain.value, 0.5); // ampDepth
  });

  it('crea conexión a output bus', () => {
    // osc1 → Output Bus 1
    matrix.createConnection(0, 2);
    
    const conn = matrix.connections[0][2];
    assert.ok(conn);
    assert.equal(conn.gain.value, 1.0); // outputGain
  });

  it('conecta a masterL si no hay bus disponible', () => {
    const destPorts = [
      { label: 'Master Out', type: 'output' } // sin busIndex
    ];
    const sourcePorts = [
      { label: 'Osc 1', moduleId: 'osc1', portId: 'osc1_out' }
    ];
    
    const matrix2 = new Matrix(engine, document.createElement('table'), sourcePorts, destPorts);
    matrix2.build();
    matrix2.createConnection(0, 0);
    
    const conn = matrix2.connections[0][0];
    assert.ok(conn);
  });

  it('no crea conexión si source no existe', () => {
    // Intentar conectar módulo no registrado
    const invalidSourcePorts = [
      { label: 'Invalid', moduleId: 'invalid', portId: 'out' }
    ];
    const destPorts = [
      { label: 'Filter', type: 'freq', moduleId: 'filter1', portId: 'filter1_freq' }
    ];
    
    const matrix2 = new Matrix(engine, document.createElement('table'), invalidSourcePorts, destPorts);
    matrix2.build();
    matrix2.createConnection(0, 0);
    
    assert.equal(matrix2.connections[0][0], null);
  });

  it('no crea conexión si dest no existe', () => {
    const sourcePorts = [
      { label: 'Osc 1', moduleId: 'osc1', portId: 'osc1_out' }
    ];
    const invalidDestPorts = [
      { label: 'Invalid', type: 'freq', moduleId: 'invalid', portId: 'freq' }
    ];
    
    const matrix2 = new Matrix(engine, document.createElement('table'), sourcePorts, invalidDestPorts);
    matrix2.build();
    matrix2.createConnection(0, 0);
    
    assert.equal(matrix2.connections[0][0], null);
  });

  it('usa opciones personalizadas para freqDepth', () => {
    const matrix2 = new Matrix(engine, tableEl, matrix.sourcePorts, matrix.destPorts, {
      freqDepth: 120
    });
    matrix2.build();
    matrix2.createConnection(0, 0);
    
    const conn = matrix2.connections[0][0];
    assert.equal(conn.gain.value, 120);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: ELIMINACIÓN DE CONEXIONES
// ═══════════════════════════════════════════════════════════════════════════

describe('Matrix.removeConnection()', () => {

  let ctx, engine, matrix;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = createMockEngine(ctx);
    engine.registerModule(createSourceModule('osc1', ctx));
    engine.registerModule(createDestModule('filter1', ctx));
    
    const tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    matrix.build();
  });

  it('elimina conexión existente', () => {
    matrix.createConnection(0, 0);
    assert.ok(matrix.connections[0][0]);
    
    matrix.removeConnection(0, 0);
    
    assert.equal(matrix.connections[0][0], null);
  });

  it('no lanza error al eliminar conexión inexistente', () => {
    matrix.removeConnection(0, 0); // No existe
    
    assert.equal(matrix.connections[0][0], null);
  });

  it('desconecta nodo correctamente', () => {
    matrix.createConnection(0, 0);
    const conn = matrix.connections[0][0];
    
    // Verificar que tiene conexiones
    assert.ok(conn);
    
    matrix.removeConnection(0, 0);
    
    // Después de removeConnection, debería estar desconectado
    // (verificación indirecta, el mock lo registra)
    assert.equal(matrix.connections[0][0], null);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: TOGGLE DE CONEXIONES
// ═══════════════════════════════════════════════════════════════════════════

describe('Matrix.toggleConnection()', () => {

  let ctx, engine, matrix, tableEl;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = createMockEngine(ctx);
    engine.registerModule(createSourceModule('osc1', ctx));
    engine.registerModule(createDestModule('filter1', ctx));
    
    tableEl = document.createElement('table');
    const { sourcePorts, destPorts } = createTypicalPorts();
    
    matrix = new Matrix(engine, tableEl, sourcePorts, destPorts);
    matrix.build();
  });

  it('activa botón y crea conexión cuando está inactivo', () => {
    const btn = tableEl.querySelector('[data-row="0"][data-col="0"]');
    
    matrix.toggleConnection(btn, 0, 0);
    
    assert.ok(btn.classList.contains('active'));
    assert.ok(matrix.connections[0][0]);
  });

  it('desactiva botón y elimina conexión cuando está activo', () => {
    const btn = tableEl.querySelector('[data-row="0"][data-col="0"]');
    
    // Activar primero
    matrix.toggleConnection(btn, 0, 0);
    assert.ok(btn.classList.contains('active'));
    
    // Desactivar
    matrix.toggleConnection(btn, 0, 0);
    
    assert.ok(!btn.classList.contains('active'));
    assert.equal(matrix.connections[0][0], null);
  });

  it('emite evento synth:userInteraction', () => {
    let eventFired = false;
    document.addEventListener('synth:userInteraction', () => {
      eventFired = true;
    }, { once: true });
    
    const btn = tableEl.querySelector('[data-row="0"][data-col="0"]');
    matrix.toggleConnection(btn, 0, 0);
    
    assert.ok(eventFired);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: CASOS EDGE
// ═══════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {

  it('maneja matriz vacía (0 sources, 0 dests)', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const tableEl = document.createElement('table');
    
    const matrix = new Matrix(engine, tableEl, [], []);
    matrix.build();
    
    assert.equal(matrix.connections.length, 0);
  });

  it('maneja matriz con solo sources', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    const tableEl = document.createElement('table');
    const sourcePorts = [
      { label: 'Osc 1', moduleId: 'osc1', portId: 'out' }
    ];
    
    const matrix = new Matrix(engine, tableEl, sourcePorts, []);
    matrix.build();
    
    assert.equal(matrix.connections.length, 1);
    assert.equal(matrix.connections[0].length, 0);
  });

  it('maneja conexión a bus inexistente', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    engine.registerModule(createSourceModule('osc1', ctx));
    
    const sourcePorts = [{ label: 'Osc', moduleId: 'osc1', portId: 'osc1_out' }];
    const destPorts = [{ label: 'Bus 99', type: 'output', busIndex: 99 }]; // No existe
    
    const matrix = new Matrix(engine, document.createElement('table'), sourcePorts, destPorts);
    matrix.build();
    matrix.createConnection(0, 0);
    
    // Debería conectar a masterL como fallback
    const conn = matrix.connections[0][0];
    assert.ok(conn);
  });

  it('maneja destPort sin param en input', () => {
    const ctx = createMockAudioContext();
    const engine = createMockEngine(ctx);
    
    const moduleWithoutParam = {
      id: 'noparam',
      outputs: [],
      inputs: [
        { id: 'in', param: null } // Sin AudioParam
      ]
    };
    engine.registerModule(moduleWithoutParam);
    engine.registerModule(createSourceModule('osc1', ctx));
    
    const sourcePorts = [{ label: 'Osc', moduleId: 'osc1', portId: 'osc1_out' }];
    const destPorts = [{ label: 'No Param', type: 'freq', moduleId: 'noparam', portId: 'in' }];
    
    const matrix = new Matrix(engine, document.createElement('table'), sourcePorts, destPorts);
    matrix.build();
    matrix.createConnection(0, 0);
    
    // No debe crear conexión
    assert.equal(matrix.connections[0][0], null);
  });

});
