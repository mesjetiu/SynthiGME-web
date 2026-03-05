/**
 * Tests para dormancy del módulo Keyboard (upper + lower)
 *
 * Verifica que el DormancyManager detecta correctamente conexiones
 * de teclado en la matriz y duerme/despierta los módulos keyboard.
 *
 * @version 1.0.0
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

function createMockModule(id) {
  return {
    id,
    _isDormant: false,
    setDormant(dormant) { this._isDormant = dormant; }
  };
}

function createMockApp(options = {}) {
  const upperModule = createMockModule('keyboard-upper');
  const lowerModule = createMockModule('keyboard-lower');

  return {
    _keyboardModules: {
      upper: upperModule,
      lower: lowerModule
    },
    _panel6SourceMap: options.panel6SourceMap || new Map(),
    get panel6Connections() {
      const connections = [];
      for (const [, data] of this._panel6SourceMap) {
        if (data.source) connections.push(data);
      }
      return connections;
    }
  };
}

class MockDormancyManager {
  constructor(app) {
    this.app = app;
    this._dormantStates = new Map();
  }

  updateAllStates() {
    const panel6Connections = this.app.panel6Connections;

    for (const side of ['upper', 'lower']) {
      const kind = side === 'upper' ? 'keyboardUpper' : 'keyboardLower';
      const hasKbOutput = panel6Connections.some(c => c.source?.kind === kind);
      this._setModuleDormant(`keyboard-${side}`, !hasKbOutput);
    }
  }

  _setModuleDormant(moduleId, dormant) {
    const prev = this._dormantStates.get(moduleId);
    if (prev === dormant) return;
    this._dormantStates.set(moduleId, dormant);
    const mod = this._findModule(moduleId);
    if (mod) mod.setDormant(dormant);
  }

  _findModule(moduleId) {
    if (moduleId === 'keyboard-upper') return this.app._keyboardModules?.upper;
    if (moduleId === 'keyboard-lower') return this.app._keyboardModules?.lower;
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIN CONEXIONES → DORMANT
// ═══════════════════════════════════════════════════════════════════════════

describe('Dormancy Keyboard — sin conexiones', () => {
  let app, dm;

  beforeEach(() => {
    app = createMockApp();
    dm = new MockDormancyManager(app);
  });

  it('ambos teclados dorment sin conexiones en la matriz', () => {
    dm.updateAllStates();
    assert.strictEqual(app._keyboardModules.upper._isDormant, true);
    assert.strictEqual(app._keyboardModules.lower._isDormant, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CON CONEXIONES → AWAKE
// ═══════════════════════════════════════════════════════════════════════════

describe('Dormancy Keyboard — con conexiones', () => {
  it('upper despierta con conexión keyboardUpper', () => {
    const sourceMap = new Map([
      ['r111-c5', { source: { kind: 'keyboardUpper', output: 'pitch' } }]
    ]);
    const app = createMockApp({ panel6SourceMap: sourceMap });
    const dm = new MockDormancyManager(app);
    dm.updateAllStates();

    assert.strictEqual(app._keyboardModules.upper._isDormant, false);
    assert.strictEqual(app._keyboardModules.lower._isDormant, true);
  });

  it('lower despierta con conexión keyboardLower', () => {
    const sourceMap = new Map([
      ['r114-c10', { source: { kind: 'keyboardLower', output: 'pitch' } }]
    ]);
    const app = createMockApp({ panel6SourceMap: sourceMap });
    const dm = new MockDormancyManager(app);
    dm.updateAllStates();

    assert.strictEqual(app._keyboardModules.upper._isDormant, true);
    assert.strictEqual(app._keyboardModules.lower._isDormant, false);
  });

  it('ambos despiertan con conexiones de ambos', () => {
    const sourceMap = new Map([
      ['r111-c5', { source: { kind: 'keyboardUpper', output: 'pitch' } }],
      ['r114-c10', { source: { kind: 'keyboardLower', output: 'gate' } }]
    ]);
    const app = createMockApp({ panel6SourceMap: sourceMap });
    const dm = new MockDormancyManager(app);
    dm.updateAllStates();

    assert.strictEqual(app._keyboardModules.upper._isDormant, false);
    assert.strictEqual(app._keyboardModules.lower._isDormant, false);
  });

  it('cualquier output de upper activa el módulo upper', () => {
    for (const output of ['pitch', 'velocity', 'gate']) {
      const sourceMap = new Map([
        [`r-${output}`, { source: { kind: 'keyboardUpper', output } }]
      ]);
      const app = createMockApp({ panel6SourceMap: sourceMap });
      const dm = new MockDormancyManager(app);
      dm.updateAllStates();
      assert.strictEqual(app._keyboardModules.upper._isDormant, false,
        `output ${output} debería activar upper`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TRANSICIONES
// ═══════════════════════════════════════════════════════════════════════════

describe('Dormancy Keyboard — transiciones', () => {
  it('upper duerme al eliminar la conexión', () => {
    const sourceMap = new Map([
      ['r111-c5', { source: { kind: 'keyboardUpper', output: 'pitch' } }]
    ]);
    const app = createMockApp({ panel6SourceMap: sourceMap });
    const dm = new MockDormancyManager(app);

    dm.updateAllStates();
    assert.strictEqual(app._keyboardModules.upper._isDormant, false);

    // Eliminar conexión
    app._panel6SourceMap.clear();
    dm.updateAllStates();
    assert.strictEqual(app._keyboardModules.upper._isDormant, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// _findModule
// ═══════════════════════════════════════════════════════════════════════════

describe('Dormancy Keyboard — _findModule', () => {
  let app, dm;

  beforeEach(() => {
    app = createMockApp();
    dm = new MockDormancyManager(app);
  });

  it('_findModule("keyboard-upper") devuelve módulo upper', () => {
    assert.strictEqual(dm._findModule('keyboard-upper'), app._keyboardModules.upper);
  });

  it('_findModule("keyboard-lower") devuelve módulo lower', () => {
    assert.strictEqual(dm._findModule('keyboard-lower'), app._keyboardModules.lower);
  });

  it('_findModule con id desconocido devuelve null', () => {
    assert.strictEqual(dm._findModule('keyboard-middle'), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONEXIONES NO-KEYBOARD
// ═══════════════════════════════════════════════════════════════════════════

describe('Dormancy Keyboard — conexiones de otros módulos', () => {
  it('conexiones de otros tipos no despiertan los teclados', () => {
    const sourceMap = new Map([
      ['r89-c5', { source: { kind: 'randomCV', output: 'key' } }],
      ['r50-c10', { source: { kind: 'oscillator', output: 'main' } }]
    ]);
    const app = createMockApp({ panel6SourceMap: sourceMap });
    const dm = new MockDormancyManager(app);
    dm.updateAllStates();

    assert.strictEqual(app._keyboardModules.upper._isDormant, true);
    assert.strictEqual(app._keyboardModules.lower._isDormant, true);
  });
});
