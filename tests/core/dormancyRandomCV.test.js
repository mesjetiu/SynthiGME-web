/**
 * Tests para dormancy del Random Control Voltage Generator
 * 
 * Verifica la integración del RVG en el sistema de dormancy:
 * - Sin conexiones en Panel 6: el módulo duerme
 * - Con conexión en Panel 6 (kind='randomCV'): el módulo despierta
 * - Cualquiera de las 3 salidas activa el módulo completo
 * - _findModule('random-cv') localiza el módulo en _panel3LayoutData
 * 
 * Tests basados en la lógica real de dormancyManager.js, replicada
 * como MockDormancyManager para evitar dependencias de DOM.
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
    setDormant(dormant) {
      this._isDormant = dormant;
    }
  };
}

function createMockApp(options = {}) {
  const rcvModule = createMockModule('random-cv');
  
  // Panel 6 routing (control matrix)
  const panel6SourceMap = new Map();
  
  // Registrar fuentes RVG en el sourceMap
  panel6SourceMap.set(89, { kind: 'randomCV', output: 'key' });
  panel6SourceMap.set(90, { kind: 'randomCV', output: 'voltage1' });
  panel6SourceMap.set(91, { kind: 'randomCV', output: 'voltage2' });
  
  return {
    _panel6Routing: {
      connections: options.panel6Connections ?? {},
      sourceMap: panel6SourceMap,
      destMap: new Map([
        [30, { kind: 'oscFreqCV', oscIndex: 0 }],
        [31, { kind: 'oscFreqCV', oscIndex: 1 }],
      ])
    },
    _panel3Routing: {
      connections: {},
      sourceMap: new Map(),
      destMap: new Map()
    },
    _panel3LayoutData: {
      randomCVAudio: rcvModule,
      noiseAudioModules: {
        noise1: createMockModule('noise-1'),
        noise2: createMockModule('noise-2')
      }
    },
    _rcvModule: rcvModule // referencia directa para tests
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK de DormancyManager con soporte RVG
// ═══════════════════════════════════════════════════════════════════════════

class MockDormancyManager {
  constructor(app) {
    this.app = app;
    this._moduleStates = new Map();
    this._enabled = true;
    this._changes = [];
  }
  
  updateAllStates() {
    if (!this._enabled) return;
    
    this._changes = [];
    const panel6Connections = this._getPanel6Connections();
    
    // Random CV Generator (lógica del real)
    const hasRCVOutput = panel6Connections.some(c =>
      c.source?.kind === 'randomCV'
    );
    this._setModuleDormant('random-cv', !hasRCVOutput);
    
    return this._changes;
  }
  
  _getPanel6Connections() {
    const routing = this.app._panel6Routing;
    if (!routing?.connections) return [];
    
    const connections = [];
    for (const key of Object.keys(routing.connections)) {
      const [rowStr, colStr] = key.split(':');
      const rowIndex = parseInt(rowStr, 10);
      const colIndex = parseInt(colStr, 10);
      
      const source = routing.sourceMap?.get(rowIndex);
      const dest = routing.destMap?.get(colIndex);
      
      if (source || dest) {
        connections.push({ source, dest, key });
      }
    }
    
    return connections;
  }
  
  _setModuleDormant(moduleId, dormant) {
    const currentState = this._moduleStates.get(moduleId);
    if (currentState?.isDormant === dormant) return;
    
    this._moduleStates.set(moduleId, { isDormant: dormant });
    
    const module = this._findModule(moduleId);
    if (module?.setDormant) {
      module.setDormant(dormant);
      this._changes.push({ moduleId, dormant });
    }
  }
  
  _findModule(moduleId) {
    if (moduleId === 'random-cv') {
      return this.app._panel3LayoutData?.randomCVAudio;
    }
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('DormancyManager — Random CV Generator', () => {
  
  describe('sin conexiones en Panel 6', () => {
    let app, manager;
    
    beforeEach(() => {
      app = createMockApp({ panel6Connections: {} });
      manager = new MockDormancyManager(app);
    });
    
    it('módulo duerme sin conexiones', () => {
      manager.updateAllStates();
      assert.strictEqual(app._rcvModule._isDormant, true);
    });
    
    it('registra el cambio', () => {
      const changes = manager.updateAllStates();
      assert.ok(changes.some(c => c.moduleId === 'random-cv' && c.dormant === true));
    });
  });
  
  describe('con conexión de Key (fila 89)', () => {
    let app, manager;
    
    beforeEach(() => {
      // Conexión: key (row 89) → osc freq CV (col 30)
      app = createMockApp({ panel6Connections: { '89:30': true } });
      manager = new MockDormancyManager(app);
    });
    
    it('módulo despierta con conexión de key', () => {
      manager.updateAllStates();
      assert.strictEqual(app._rcvModule._isDormant, false);
    });
  });
  
  describe('con conexión de Voltage 1 (fila 90)', () => {
    let app, manager;
    
    beforeEach(() => {
      app = createMockApp({ panel6Connections: { '90:31': true } });
      manager = new MockDormancyManager(app);
    });
    
    it('módulo despierta con conexión de voltage1', () => {
      manager.updateAllStates();
      assert.strictEqual(app._rcvModule._isDormant, false);
    });
  });
  
  describe('con conexión de Voltage 2 (fila 91)', () => {
    let app, manager;
    
    beforeEach(() => {
      app = createMockApp({ panel6Connections: { '91:30': true } });
      manager = new MockDormancyManager(app);
    });
    
    it('módulo despierta con conexión de voltage2', () => {
      manager.updateAllStates();
      assert.strictEqual(app._rcvModule._isDormant, false);
    });
  });
  
  describe('cualquiera de las 3 salidas activa el módulo', () => {
    
    it('con solo key: despierto', () => {
      const app = createMockApp({ panel6Connections: { '89:30': true } });
      const mgr = new MockDormancyManager(app);
      mgr.updateAllStates();
      assert.strictEqual(app._rcvModule._isDormant, false);
    });
    
    it('con solo voltage1: despierto', () => {
      const app = createMockApp({ panel6Connections: { '90:30': true } });
      const mgr = new MockDormancyManager(app);
      mgr.updateAllStates();
      assert.strictEqual(app._rcvModule._isDormant, false);
    });
    
    it('con solo voltage2: despierto', () => {
      const app = createMockApp({ panel6Connections: { '91:30': true } });
      const mgr = new MockDormancyManager(app);
      mgr.updateAllStates();
      assert.strictEqual(app._rcvModule._isDormant, false);
    });
    
    it('con las 3 salidas: despierto', () => {
      const app = createMockApp({ panel6Connections: { '89:30': true, '90:30': true, '91:31': true } });
      const mgr = new MockDormancyManager(app);
      mgr.updateAllStates();
      assert.strictEqual(app._rcvModule._isDormant, false);
    });
  });
  
  describe('transiciones de estado', () => {
    let app, manager;
    
    beforeEach(() => {
      app = createMockApp({ panel6Connections: {} });
      manager = new MockDormancyManager(app);
    });
    
    it('dormir → conectar → despertar', () => {
      manager.updateAllStates();
      assert.strictEqual(app._rcvModule._isDormant, true, 'Debe dormir sin conexiones');
      
      // Añadir conexión
      app._panel6Routing.connections['89:30'] = true;
      manager.updateAllStates();
      assert.strictEqual(app._rcvModule._isDormant, false, 'Debe despertar con conexión');
    });
    
    it('despertar → desconectar → dormir', () => {
      app._panel6Routing.connections['90:30'] = true;
      manager.updateAllStates();
      assert.strictEqual(app._rcvModule._isDormant, false, 'Despierto con conexión');
      
      // Quitar conexión
      delete app._panel6Routing.connections['90:30'];
      manager.updateAllStates();
      assert.strictEqual(app._rcvModule._isDormant, true, 'Dormido sin conexiones');
    });
    
    it('no repite setDormant si el estado no cambia', () => {
      manager.updateAllStates();
      const changes1 = manager._changes.length;
      
      manager.updateAllStates();
      const changes2 = manager._changes.length;
      
      // La segunda vez no debe generar cambios (mismo estado)
      assert.strictEqual(changes2, 0, 'No debe cambiar estado si no hay diferencia');
    });
  });
  
  describe('_findModule', () => {
    
    it('localiza el módulo RVG en _panel3LayoutData.randomCVAudio', () => {
      const app = createMockApp();
      const manager = new MockDormancyManager(app);
      const module = manager._findModule('random-cv');
      assert.strictEqual(module, app._panel3LayoutData.randomCVAudio);
    });
    
    it('devuelve null para IDs no reconocidos', () => {
      const app = createMockApp();
      const manager = new MockDormancyManager(app);
      assert.strictEqual(manager._findModule('unknown'), null);
    });
    
    it('devuelve null si _panel3LayoutData no existe', () => {
      const app = createMockApp();
      app._panel3LayoutData = null;
      const manager = new MockDormancyManager(app);
      const module = manager._findModule('random-cv');
      assert.strictEqual(module, undefined); // ?. returns undefined
    });
  });
  
  describe('conexiones no-RVG no afectan al RVG', () => {
    
    it('conexión de otra fuente (inputAmp) no despierta al RVG', () => {
      const app = createMockApp({ panel6Connections: { '67:30': true } });
      // Fila 67 = inputAmp, no randomCV
      app._panel6Routing.sourceMap.set(67, { kind: 'inputAmp', channel: 0 });
      
      const mgr = new MockDormancyManager(app);
      mgr.updateAllStates();
      assert.strictEqual(app._rcvModule._isDormant, true);
    });
  });
});
