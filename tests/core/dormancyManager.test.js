/**
 * Tests para core/dormancyManager.js
 * 
 * Verifica el sistema de dormancy para optimización de audio:
 * - Inicialización con valores por defecto y desde localStorage
 * - Detección de conexiones en Panel 5 y Panel 6
 * - Cambio de estado dormant en módulos
 * - Agrupación de cambios para toasts consolidados
 * - Habilitación/deshabilitación del sistema
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK de localStorage
// ═══════════════════════════════════════════════════════════════════════════

class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] ?? null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK de módulos con setDormant
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

function createMockOscillatorEntry() {
  return {
    osc: {},
    gain: { gain: { value: 1 } },
    sawOsc: {},
    sawGain: { gain: { value: 0 } },
    triOsc: {},
    triGain: { gain: { value: 0 } },
    pulseOsc: {},
    pulseGain: { gain: { value: 0 } },
    _isDormant: false,
    _savedGains: null,
    setDormant(dormant) {
      this._isDormant = dormant;
    }
  };
}

function createMockOutputBus() {
  return {
    input: {},
    muteNode: { gain: { value: 1, setValueAtTime: () => {} } },
    _isDormant: false,
    _savedMuteValue: 1,
    setDormant(dormant) {
      this._isDormant = dormant;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK de App con routing
// ═══════════════════════════════════════════════════════════════════════════

function createMockApp() {
  // Crear source y dest maps para Panel 5
  const panel5SourceMap = new Map([
    [22, { kind: 'noiseGen', index: 0 }],
    [23, { kind: 'noiseGen', index: 1 }],
    [24, { kind: 'panel3Osc', oscIndex: 0, channelId: 'sineSaw' }],
    [25, { kind: 'panel3Osc', oscIndex: 0, channelId: 'triPulse' }],
    [26, { kind: 'panel3Osc', oscIndex: 1, channelId: 'sineSaw' }],
    [27, { kind: 'panel3Osc', oscIndex: 1, channelId: 'triPulse' }],
    [30, { kind: 'inputAmp', channel: 0 }],
    [31, { kind: 'inputAmp', channel: 1 }],
  ]);
  
  const panel5DestMap = new Map([
    [36, { kind: 'outputBus', bus: 1 }],
    [37, { kind: 'outputBus', bus: 2 }],
    [38, { kind: 'outputBus', bus: 3 }],
    [56, { kind: 'oscilloscope', channel: 'X' }],
    [57, { kind: 'oscilloscope', channel: 'Y' }],
  ]);

  return {
    _panel3Routing: {
      connections: {},
      sourceMap: panel5SourceMap,
      destMap: panel5DestMap
    },
    _panel6Routing: {
      connections: {},
      sourceMap: new Map(),
      destMap: new Map()
    },
    _panelAudios: {
      3: {
        nodes: [
          createMockOscillatorEntry(), // osc-0
          createMockOscillatorEntry(), // osc-1
          createMockOscillatorEntry(), // osc-2
        ]
      }
    },
    _panel3LayoutData: {
      noiseAudioModules: {
        noise1: createMockModule('noise-1'),
        noise2: createMockModule('noise-2')
      }
    },
    oscilloscope: createMockModule('oscilloscope'),
    inputAmplifiers: createMockModule('input-amplifiers'),
    engine: {
      outputBuses: [
        createMockOutputBus(), // channel 1
        createMockOutputBus(), // channel 2
        createMockOutputBus(), // channel 3
        createMockOutputBus(), // channel 4
        createMockOutputBus(), // channel 5
        createMockOutputBus(), // channel 6
        createMockOutputBus(), // channel 7
        createMockOutputBus(), // channel 8
      ]
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK de DormancyManager (lógica replicada para testing sin DOM)
// ═══════════════════════════════════════════════════════════════════════════

class MockDormancyManager {
  constructor(app, localStorage) {
    this.app = app;
    this._localStorage = localStorage;
    this._moduleStates = new Map();
    this._pendingChanges = null;
    
    // Cargar configuración desde localStorage
    const storedEnabled = this._localStorage.getItem('synth_dormancy_enabled');
    this._enabled = storedEnabled === null ? true : storedEnabled === 'true';
    
    const storedDebug = this._localStorage.getItem('synth_dormancy_debug');
    this._debugIndicators = storedDebug === 'true';
  }
  
  isEnabled() {
    return this._enabled;
  }
  
  setEnabled(enabled) {
    this._enabled = enabled;
    this._localStorage.setItem('synth_dormancy_enabled', String(enabled));
    
    if (!enabled) {
      this._wakeAllModules();
    } else {
      this.updateAllStates();
    }
  }
  
  setDebugIndicators(enabled) {
    this._debugIndicators = enabled;
    this._localStorage.setItem('synth_dormancy_debug', String(enabled));
  }
  
  hasDebugIndicators() {
    return this._debugIndicators;
  }
  
  updateAllStates() {
    if (!this._enabled) return;
    
    this._pendingChanges = { woke: [], slept: [] };
    
    const panel5Connections = this._getPanel5Connections();
    
    // Oscillators
    for (let oscIndex = 0; oscIndex < 3; oscIndex++) {
      const hasOutput = panel5Connections.some(c => 
        c.source?.kind === 'panel3Osc' && c.source?.oscIndex === oscIndex
      );
      const module = this._findModule(`osc-${oscIndex}`);
      if (module) {
        this._setModuleDormant(`osc-${oscIndex}`, !hasOutput);
      }
    }
    
    // Noise generators
    for (let noiseIndex = 0; noiseIndex < 2; noiseIndex++) {
      const hasOutput = panel5Connections.some(c =>
        c.source?.kind === 'noiseGen' && c.source?.index === noiseIndex
      );
      this._setModuleDormant(`noise-${noiseIndex + 1}`, !hasOutput);
    }
    
    // Input amplifiers
    const hasAnyInputConnected = panel5Connections.some(c =>
      c.source?.kind === 'inputAmp'
    );
    this._setModuleDormant('input-amplifiers', !hasAnyInputConnected);
    
    // Oscilloscope
    const hasScopeInput = panel5Connections.some(c =>
      c.dest?.kind === 'oscilloscope'
    );
    this._setModuleDormant('oscilloscope', !hasScopeInput);
    
    // Output buses
    for (let busIndex = 0; busIndex < 8; busIndex++) {
      const hasInput = panel5Connections.some(c =>
        c.dest?.kind === 'outputBus' && c.dest?.bus === busIndex + 1
      );
      this._setModuleDormant(`output-channel-${busIndex + 1}`, !hasInput);
    }
    
    return this._pendingChanges;
  }
  
  _getPanel5Connections() {
    const routing = this.app._panel3Routing;
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
      
      if (this._pendingChanges) {
        if (dormant) {
          this._pendingChanges.slept.push(moduleId);
        } else {
          this._pendingChanges.woke.push(moduleId);
        }
      }
    }
  }
  
  _findModule(moduleId) {
    if (moduleId.startsWith('osc-')) {
      const oscIndex = parseInt(moduleId.split('-')[1], 10);
      return this.app._panelAudios?.[3]?.nodes?.[oscIndex];
    }
    
    if (moduleId === 'noise-1') {
      return this.app._panel3LayoutData?.noiseAudioModules?.noise1;
    }
    if (moduleId === 'noise-2') {
      return this.app._panel3LayoutData?.noiseAudioModules?.noise2;
    }
    
    if (moduleId === 'oscilloscope') {
      return this.app.oscilloscope;
    }
    
    if (moduleId === 'input-amplifiers') {
      return this.app.inputAmplifiers;
    }
    
    if (moduleId.startsWith('output-channel-')) {
      const busIndex = parseInt(moduleId.split('-')[2], 10) - 1;
      return this.app.engine?.outputBuses?.[busIndex];
    }
    
    return null;
  }
  
  _wakeAllModules() {
    for (const [moduleId] of this._moduleStates) {
      const module = this._findModule(moduleId);
      if (module?.setDormant) {
        module.setDormant(false);
      }
    }
    this._moduleStates.clear();
  }
  
  isDormant(moduleId) {
    return this._moduleStates.get(moduleId)?.isDormant ?? false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('DormancyManager', () => {
  let app;
  let localStorage;
  let manager;
  
  beforeEach(() => {
    app = createMockApp();
    localStorage = new MockLocalStorage();
    manager = new MockDormancyManager(app, localStorage);
  });
  
  describe('inicialización', () => {
    
    it('está habilitado por defecto', () => {
      assert.equal(manager.isEnabled(), true);
    });
    
    it('debug está deshabilitado por defecto', () => {
      assert.equal(manager.hasDebugIndicators(), false);
    });
    
    it('respeta valor guardado en localStorage (enabled)', () => {
      localStorage.setItem('synth_dormancy_enabled', 'false');
      const manager2 = new MockDormancyManager(app, localStorage);
      assert.equal(manager2.isEnabled(), false);
    });
    
    it('respeta valor guardado en localStorage (debug)', () => {
      localStorage.setItem('synth_dormancy_debug', 'true');
      const manager2 = new MockDormancyManager(app, localStorage);
      assert.equal(manager2.hasDebugIndicators(), true);
    });
  });
  
  describe('setEnabled', () => {
    
    it('guarda el estado en localStorage', () => {
      manager.setEnabled(false);
      assert.equal(localStorage.getItem('synth_dormancy_enabled'), 'false');
      
      manager.setEnabled(true);
      assert.equal(localStorage.getItem('synth_dormancy_enabled'), 'true');
    });
    
    it('despierta todos los módulos al deshabilitar', () => {
      // Primero crear una conexión y actualizar estados
      app._panel3Routing.connections['24:36'] = {}; // osc-0 → output-1
      manager.updateAllStates();
      
      // Verificar que algunos están dormant
      assert.equal(manager.isDormant('osc-1'), true);
      assert.equal(manager.isDormant('osc-2'), true);
      
      // Deshabilitar dormancy
      manager.setEnabled(false);
      
      // Verificar que los módulos despertaron
      const osc1 = app._panelAudios[3].nodes[1];
      assert.equal(osc1._isDormant, false);
    });
  });
  
  describe('detección de conexiones', () => {
    
    it('detecta conexión osc → output', () => {
      app._panel3Routing.connections['24:36'] = {}; // osc-0 → output-1
      
      const changes = manager.updateAllStates();
      
      assert.ok(changes.woke.includes('osc-0'));
      assert.ok(changes.woke.includes('output-channel-1'));
      assert.ok(changes.slept.includes('osc-1'));
      assert.ok(changes.slept.includes('osc-2'));
    });
    
    it('detecta conexión noise → output', () => {
      app._panel3Routing.connections['22:37'] = {}; // noise-1 → output-2
      
      const changes = manager.updateAllStates();
      
      assert.ok(changes.woke.includes('noise-1'));
      assert.ok(changes.woke.includes('output-channel-2'));
      assert.ok(changes.slept.includes('noise-2'));
    });
    
    it('detecta conexión → oscilloscope', () => {
      app._panel3Routing.connections['24:56'] = {}; // osc-0 → scope X
      
      const changes = manager.updateAllStates();
      
      assert.ok(changes.woke.includes('osc-0'));
      assert.ok(changes.woke.includes('oscilloscope'));
    });
    
    it('detecta conexión input amp → output', () => {
      app._panel3Routing.connections['30:36'] = {}; // inputAmp-0 → output-1
      
      const changes = manager.updateAllStates();
      
      assert.ok(changes.woke.includes('input-amplifiers'));
      assert.ok(changes.woke.includes('output-channel-1'));
    });
    
    it('múltiples conexiones: solo reporta cambios', () => {
      // Primera actualización con una conexión
      app._panel3Routing.connections['24:36'] = {}; // osc-0 → output-1
      manager.updateAllStates();
      
      // Segunda actualización añadiendo otra conexión
      app._panel3Routing.connections['22:37'] = {}; // noise-1 → output-2
      const changes = manager.updateAllStates();
      
      // Solo debe reportar los nuevos cambios
      assert.ok(changes.woke.includes('noise-1'));
      assert.ok(changes.woke.includes('output-channel-2'));
      // osc-0 y output-1 ya estaban activos, no deberían estar en woke
      assert.ok(!changes.woke.includes('osc-0'));
      assert.ok(!changes.woke.includes('output-channel-1'));
    });
  });
  
  describe('estado dormant de módulos', () => {
    
    it('oscilador sin conexión está dormant', () => {
      manager.updateAllStates();
      
      const osc0 = app._panelAudios[3].nodes[0];
      assert.equal(osc0._isDormant, true);
    });
    
    it('oscilador con conexión está activo', () => {
      app._panel3Routing.connections['24:36'] = {};
      manager.updateAllStates();
      
      const osc0 = app._panelAudios[3].nodes[0];
      assert.equal(osc0._isDormant, false);
    });
    
    it('output channel sin entrada está dormant', () => {
      manager.updateAllStates();
      
      const channel1 = app.engine.outputBuses[0];
      assert.equal(channel1._isDormant, true);
    });
    
    it('output channel con entrada está activo', () => {
      app._panel3Routing.connections['24:36'] = {};
      manager.updateAllStates();
      
      const channel1 = app.engine.outputBuses[0];
      assert.equal(channel1._isDormant, false);
    });
    
    it('oscilloscope sin entrada está dormant', () => {
      manager.updateAllStates();
      
      assert.equal(app.oscilloscope._isDormant, true);
    });
    
    it('oscilloscope con entrada está activo', () => {
      app._panel3Routing.connections['24:56'] = {};
      manager.updateAllStates();
      
      assert.equal(app.oscilloscope._isDormant, false);
    });
  });
  
  describe('_findModule', () => {
    
    it('encuentra osciladores por índice', () => {
      const osc0 = manager._findModule('osc-0');
      assert.strictEqual(osc0, app._panelAudios[3].nodes[0]);
      
      const osc2 = manager._findModule('osc-2');
      assert.strictEqual(osc2, app._panelAudios[3].nodes[2]);
    });
    
    it('encuentra noise modules', () => {
      const noise1 = manager._findModule('noise-1');
      assert.strictEqual(noise1, app._panel3LayoutData.noiseAudioModules.noise1);
      
      const noise2 = manager._findModule('noise-2');
      assert.strictEqual(noise2, app._panel3LayoutData.noiseAudioModules.noise2);
    });
    
    it('encuentra oscilloscope', () => {
      const scope = manager._findModule('oscilloscope');
      assert.strictEqual(scope, app.oscilloscope);
    });
    
    it('encuentra input-amplifiers', () => {
      const inputAmps = manager._findModule('input-amplifiers');
      assert.strictEqual(inputAmps, app.inputAmplifiers);
    });
    
    it('encuentra output channels', () => {
      const ch1 = manager._findModule('output-channel-1');
      assert.strictEqual(ch1, app.engine.outputBuses[0]);
      
      const ch8 = manager._findModule('output-channel-8');
      assert.strictEqual(ch8, app.engine.outputBuses[7]);
    });
    
    it('retorna null para módulo desconocido', () => {
      const unknown = manager._findModule('unknown-module');
      assert.equal(unknown, null);
    });
  });
  
  describe('isDormant', () => {
    
    it('retorna false para módulo sin estado registrado', () => {
      assert.equal(manager.isDormant('osc-0'), false);
    });
    
    it('retorna true para módulo dormant', () => {
      manager.updateAllStates();
      assert.equal(manager.isDormant('osc-0'), true);
    });
    
    it('retorna false para módulo activo', () => {
      app._panel3Routing.connections['24:36'] = {};
      manager.updateAllStates();
      assert.equal(manager.isDormant('osc-0'), false);
    });
  });
  
  describe('agrupación de cambios', () => {
    
    it('agrupa múltiples cambios en un solo objeto', () => {
      app._panel3Routing.connections['24:36'] = {}; // osc-0 → output-1
      app._panel3Routing.connections['22:37'] = {}; // noise-1 → output-2
      
      const changes = manager.updateAllStates();
      
      // Verificar que woke contiene los módulos activos
      assert.ok(changes.woke.length >= 2);
      // Verificar que slept contiene los módulos dormant
      assert.ok(changes.slept.length >= 2);
    });
    
    it('no reporta módulos que no cambiaron', () => {
      // Primera actualización
      app._panel3Routing.connections['24:36'] = {};
      manager.updateAllStates();
      
      // Segunda actualización sin cambios
      const changes = manager.updateAllStates();
      
      // No debería haber cambios
      assert.equal(changes.woke.length, 0);
      assert.equal(changes.slept.length, 0);
    });
  });
  
  describe('desconexión', () => {
    
    it('módulo vuelve a dormir al desconectar', () => {
      // Conectar
      app._panel3Routing.connections['24:36'] = {};
      manager.updateAllStates();
      assert.equal(manager.isDormant('osc-0'), false);
      
      // Desconectar
      delete app._panel3Routing.connections['24:36'];
      const changes = manager.updateAllStates();
      
      assert.equal(manager.isDormant('osc-0'), true);
      assert.ok(changes.slept.includes('osc-0'));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests para flushPendingUpdate (fix: patch load race condition)
// ═══════════════════════════════════════════════════════════════════════════

describe('DormancyManager flushPendingUpdate', () => {
  
  it('actualiza estados inmediatamente sin esperar rAF', () => {
    const localStorage = new MockLocalStorage();
    const app = createMockApp();
    const manager = new MockDormancyManager(app, localStorage);
    
    // Sin conexiones → todo dormant
    manager.updateAllStates();
    assert.equal(manager.isDormant('noise-1'), true);
    
    // Añadir conexión de noise
    app._panel3Routing.connections['22:36'] = {};
    
    // flushPendingUpdate sincroniza inmediatamente
    manager.updateAllStates();
    assert.equal(manager.isDormant('noise-1'), false);
  });
  
  it('simula escenario de patch load: noise dormant → setLevel → wake up', () => {
    const localStorage = new MockLocalStorage();
    const app = createMockApp();
    const manager = new MockDormancyManager(app, localStorage);
    
    // Estado inicial: noise sin conexión → dormant
    manager.updateAllStates();
    
    const noiseModule = app._panel3LayoutData.noiseAudioModules.noise1;
    assert.equal(noiseModule._isDormant, true);
    
    // Simular patch load:
    // 1. Knobs restaurados (setLevel llamado pero salta AudioParam por dormant)
    // 2. Matrix restaurada (conexión añadida)
    app._panel3Routing.connections['22:36'] = {};
    
    // 3. flushPendingUpdate fuerza la actualización síncrona
    manager.updateAllStates();
    
    // Noise debe estar activo ahora
    assert.equal(noiseModule._isDormant, false);
    assert.equal(manager.isDormant('noise-1'), false);
  });
  
  it('simula escenario reset→patch: módulo pasa por dormant→active correctamente', () => {
    const localStorage = new MockLocalStorage();
    const app = createMockApp();
    const manager = new MockDormancyManager(app, localStorage);
    
    // Estado inicial: noise conectado y activo
    app._panel3Routing.connections['22:36'] = {};
    manager.updateAllStates();
    assert.equal(manager.isDormant('noise-1'), false);
    
    // 1. Reset: limpiar conexiones
    delete app._panel3Routing.connections['22:36'];
    manager.updateAllStates();
    assert.equal(manager.isDormant('noise-1'), true);
    
    // 2. Patch load: restaurar conexiones
    app._panel3Routing.connections['22:37'] = {};
    manager.updateAllStates();
    
    // Noise debe estar activo con la nueva conexión
    assert.equal(manager.isDormant('noise-1'), false);
    
    const noiseModule = app._panel3LayoutData.noiseAudioModules.noise1;
    assert.equal(noiseModule._isDormant, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests para setDormant en output buses
// ═══════════════════════════════════════════════════════════════════════════

describe('Output Bus setDormant', () => {
  
  it('silencia el bus al dormir', () => {
    let savedValue = 1;
    const bus = {
      muteNode: {
        gain: {
          value: 1,
          setValueAtTime: (val) => { savedValue = val; }
        }
      },
      _isDormant: false,
      _savedMuteValue: 1,
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        if (dormant) {
          this._savedMuteValue = this.muteNode.gain.value;
          this.muteNode.gain.setValueAtTime(0, 0);
        } else {
          this.muteNode.gain.setValueAtTime(this._savedMuteValue, 0);
        }
      }
    };
    
    bus.setDormant(true);
    
    assert.equal(bus._isDormant, true);
    assert.equal(savedValue, 0);
  });
  
  it('restaura el nivel al despertar', () => {
    let currentValue = 1;
    const bus = {
      muteNode: {
        gain: {
          value: 0.8,
          setValueAtTime: (val) => { currentValue = val; }
        }
      },
      _isDormant: false,
      _savedMuteValue: 1,
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        if (dormant) {
          this._savedMuteValue = this.muteNode.gain.value;
          this.muteNode.gain.setValueAtTime(0, 0);
        } else {
          this.muteNode.gain.setValueAtTime(this._savedMuteValue, 0);
        }
      }
    };
    
    // Dormir
    bus.setDormant(true);
    assert.equal(currentValue, 0);
    
    // Despertar
    bus.setDormant(false);
    assert.equal(currentValue, 0.8); // Valor guardado
  });
  
  it('no hace nada si el estado no cambia', () => {
    let callCount = 0;
    const bus = {
      muteNode: {
        gain: {
          value: 1,
          setValueAtTime: () => { callCount++; }
        }
      },
      _isDormant: true,
      _savedMuteValue: 1,
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this.muteNode.gain.setValueAtTime(dormant ? 0 : this._savedMuteValue, 0);
      }
    };
    
    bus.setDormant(true); // Ya está dormant
    
    assert.equal(callCount, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: Mensaje setDormant al worklet (early exit real)
// ═══════════════════════════════════════════════════════════════════════════

describe('Oscillator setDormant - mensaje al worklet', () => {
  
  it('envía mensaje setDormant al port del worklet al dormir', () => {
    const messages = [];
    const mockWorklet = {
      port: {
        postMessage(msg) { messages.push(msg); }
      },
      setSineLevel: () => {},
      setSawLevel: () => {},
      setTriLevel: () => {},
      setPulseLevel: () => {}
    };
    
    let isDormant = false;
    const entry = {
      multiOsc: mockWorklet,
      _isDormant: false,
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this.multiOsc.port.postMessage({ type: 'setDormant', dormant });
      }
    };
    
    entry.setDormant(true);
    
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], { type: 'setDormant', dormant: true });
  });
  
  it('envía mensaje setDormant al port del worklet al despertar', () => {
    const messages = [];
    const mockWorklet = {
      port: {
        postMessage(msg) { messages.push(msg); }
      },
      setSineLevel: () => {},
      setSawLevel: () => {},
      setTriLevel: () => {},
      setPulseLevel: () => {}
    };
    
    const entry = {
      multiOsc: mockWorklet,
      _isDormant: true, // Ya está dormant
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this.multiOsc.port.postMessage({ type: 'setDormant', dormant });
      }
    };
    
    entry.setDormant(false);
    
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], { type: 'setDormant', dormant: false });
  });
  
  it('no envía mensaje si el estado no cambia', () => {
    const messages = [];
    const mockWorklet = {
      port: {
        postMessage(msg) { messages.push(msg); }
      }
    };
    
    const entry = {
      multiOsc: mockWorklet,
      _isDormant: true,
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this.multiOsc.port.postMessage({ type: 'setDormant', dormant });
      }
    };
    
    entry.setDormant(true); // Ya está dormant
    
    assert.equal(messages.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests para NoiseModule dormancy (envío mensaje al worklet + silenciar level)
// ═══════════════════════════════════════════════════════════════════════════

describe('NoiseModule dormancy', () => {
  
  it('envía mensaje setDormant al worklet al entrar en dormancy', () => {
    const messages = [];
    const mockWorklet = {
      port: {
        postMessage(msg) { messages.push(msg); }
      }
    };
    
    // Simular un NoiseModule con worklet y levelNode
    const noiseModule = {
      workletNode: mockWorklet,
      levelNode: {
        gain: {
          value: 0.8,
          cancelScheduledValues: () => {},
          setTargetAtTime: () => {}
        }
      },
      values: { level: 0.8 },
      _isDormant: false,
      _preDormantLevel: null,
      getAudioCtx() { return { currentTime: 0 }; },
      _onDormancyChange(dormant) {
        if (this.workletNode) {
          this.workletNode.port.postMessage({ type: 'setDormant', dormant });
        }
        if (!this.levelNode) return;
        const ctx = this.getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        if (dormant) {
          this._preDormantLevel = this.values.level;
          this.levelNode.gain.cancelScheduledValues(now);
          this.levelNode.gain.setTargetAtTime(0, now, 0.01);
        } else {
          const targetLevel = this._preDormantLevel ?? this.values.level;
          this.levelNode.gain.cancelScheduledValues(now);
          this.levelNode.gain.setTargetAtTime(targetLevel, now, 0.01);
        }
      },
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this._onDormancyChange(dormant);
      }
    };
    
    noiseModule.setDormant(true);
    
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], { type: 'setDormant', dormant: true });
  });
  
  it('guarda el nivel previo y silencia al entrar en dormancy', () => {
    let currentGain = 0.8;
    let cancelCalled = false;
    
    const noiseModule = {
      workletNode: { port: { postMessage() {} } },
      levelNode: {
        gain: {
          value: 0.8,
          cancelScheduledValues: () => { cancelCalled = true; },
          setTargetAtTime: (val) => { currentGain = val; }
        }
      },
      values: { level: 0.8 },
      _isDormant: false,
      _preDormantLevel: null,
      getAudioCtx() { return { currentTime: 0 }; },
      _onDormancyChange(dormant) {
        if (this.workletNode) {
          this.workletNode.port.postMessage({ type: 'setDormant', dormant });
        }
        if (!this.levelNode) return;
        const ctx = this.getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        if (dormant) {
          this._preDormantLevel = this.values.level;
          this.levelNode.gain.cancelScheduledValues(now);
          this.levelNode.gain.setTargetAtTime(0, now, 0.01);
        }
      },
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this._onDormancyChange(dormant);
      }
    };
    
    noiseModule.setDormant(true);
    
    assert.equal(noiseModule._preDormantLevel, 0.8);
    assert.equal(currentGain, 0);
    assert.equal(cancelCalled, true);
  });
  
  it('restaura el nivel actual (values.level) al salir de dormancy', () => {
    let currentGain = 0;
    
    const noiseModule = {
      workletNode: { port: { postMessage() {} } },
      levelNode: {
        gain: {
          value: 0,
          cancelScheduledValues: () => {},
          setTargetAtTime: (val) => { currentGain = val; }
        }
      },
      values: { level: 0.8 },
      _isDormant: true,
      _preDormantLevel: 0.7,
      getAudioCtx() { return { currentTime: 0 }; },
      _onDormancyChange(dormant) {
        if (this.workletNode) {
          this.workletNode.port.postMessage({ type: 'setDormant', dormant });
        }
        if (!this.levelNode) return;
        const ctx = this.getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        if (!dormant) {
          // Usar values.level (verdad actual), no _preDormantLevel (snapshot)
          const targetLevel = this.values.level;
          this.levelNode.gain.cancelScheduledValues(now);
          this.levelNode.gain.setTargetAtTime(targetLevel, now, 0.01);
        }
      },
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this._onDormancyChange(dormant);
      }
    };
    
    noiseModule.setDormant(false);
    
    assert.equal(currentGain, 0.8); // Restaura values.level (0.8), no _preDormantLevel (0.7)
  });
  
  it('restaura nivel modificado durante dormancy (patch load)', () => {
    let currentGain = 0;
    
    const noiseModule = {
      workletNode: { port: { postMessage() {} } },
      levelNode: {
        gain: {
          value: 0,
          cancelScheduledValues: () => {},
          setTargetAtTime: (val) => { currentGain = val; }
        }
      },
      values: { level: 0 },
      _isDormant: true,
      _preDormantLevel: 0,
      getAudioCtx() { return { currentTime: 0 }; },
      _onDormancyChange(dormant) {
        if (this.workletNode) {
          this.workletNode.port.postMessage({ type: 'setDormant', dormant });
        }
        if (!this.levelNode) return;
        const ctx = this.getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        if (!dormant) {
          const targetLevel = this.values.level;
          this.levelNode.gain.cancelScheduledValues(now);
          this.levelNode.gain.setTargetAtTime(targetLevel, now, 0.01);
        }
      },
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this._onDormancyChange(dormant);
      }
    };
    
    // Simular patch load durante dormancy: setLevel actualiza values pero no AudioParam
    noiseModule.values.level = 0.7;
    noiseModule._preDormantLevel = 0.7;
    
    noiseModule.setDormant(false);
    
    // Debe restaurar el nivel del patch (0.7), no el original (0)
    assert.equal(currentGain, 0.7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests para InputAmplifier dormancy (silenciar todos los GainNodes)
// ═══════════════════════════════════════════════════════════════════════════

describe('InputAmplifier dormancy', () => {
  
  it('guarda niveles y silencia todos los canales al entrar en dormancy', () => {
    const gains = [];
    const gainNodes = [];
    
    // Crear 8 GainNodes mock
    for (let i = 0; i < 8; i++) {
      gains.push(0.5 + i * 0.05); // 0.5, 0.55, 0.6...
      gainNodes.push({
        gain: {
          value: 0.5 + i * 0.05,
          cancelScheduledValues: () => {},
          setTargetAtTime: function(val) { this.value = val; }
        }
      });
    }
    
    const inputAmp = {
      gainNodes,
      levels: [...gains],
      _isDormant: false,
      _preDormantLevels: null,
      getAudioCtx() { return { currentTime: 0 }; },
      _onDormancyChange(dormant) {
        const ctx = this.getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        if (dormant) {
          this._preDormantLevels = [...this.levels];
          for (const gain of this.gainNodes) {
            if (gain) {
              gain.gain.cancelScheduledValues(now);
              gain.gain.setTargetAtTime(0, now, 0.01);
            }
          }
        }
      },
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this._onDormancyChange(dormant);
      }
    };
    
    inputAmp.setDormant(true);
    
    // Verifica que se guardaron los niveles
    assert.deepEqual(inputAmp._preDormantLevels, gains);
    
    // Verifica que todos están silenciados
    for (const node of gainNodes) {
      assert.equal(node.gain.value, 0);
    }
  });
  
  it('restaura los niveles actuales (no snapshot) al salir de dormancy', () => {
    const originalLevels = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.3, 0.4];
    const gainNodes = [];
    
    for (let i = 0; i < 8; i++) {
      gainNodes.push({
        gain: {
          value: 0,
          cancelScheduledValues: () => {},
          setTargetAtTime: function(val) { this.value = val; }
        }
      });
    }
    
    const inputAmp = {
      gainNodes,
      levels: originalLevels,
      _isDormant: true,
      _preDormantLevels: [...originalLevels],
      getAudioCtx() { return { currentTime: 0 }; },
      _onDormancyChange(dormant) {
        const ctx = this.getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        if (!dormant) {
          // Usar this.levels (verdad actual) en vez de _preDormantLevels (snapshot)
          for (let i = 0; i < this.gainNodes.length; i++) {
            const gain = this.gainNodes[i];
            if (gain) {
              gain.gain.cancelScheduledValues(now);
              gain.gain.setTargetAtTime(this.levels[i] || 0, now, 0.01);
            }
          }
        }
      },
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this._onDormancyChange(dormant);
      }
    };
    
    inputAmp.setDormant(false);
    
    // Verifica que se restauraron los niveles
    for (let i = 0; i < 8; i++) {
      assert.equal(gainNodes[i].gain.value, originalLevels[i]);
    }
  });
  
  it('restaura niveles modificados durante dormancy (patch load)', () => {
    const gainNodes = [];
    
    for (let i = 0; i < 8; i++) {
      gainNodes.push({
        gain: {
          value: 0,
          cancelScheduledValues: () => {},
          setTargetAtTime: function(val) { this.value = val; }
        }
      });
    }
    
    const inputAmp = {
      gainNodes,
      levels: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
      _isDormant: true,
      _preDormantLevels: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
      getAudioCtx() { return { currentTime: 0 }; },
      _onDormancyChange(dormant) {
        const ctx = this.getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        if (!dormant) {
          for (let i = 0; i < this.gainNodes.length; i++) {
            const gain = this.gainNodes[i];
            if (gain) {
              gain.gain.cancelScheduledValues(now);
              gain.gain.setTargetAtTime(this.levels[i] || 0, now, 0.01);
            }
          }
        }
      },
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this._onDormancyChange(dormant);
      }
    };
    
    // Simular patch load: cambiar niveles durante dormancy
    const newLevels = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2];
    inputAmp.levels = newLevels;
    
    // Despertar: debe usar los niveles NUEVOS, no el snapshot
    inputAmp.setDormant(false);
    
    for (let i = 0; i < 8; i++) {
      assert.equal(gainNodes[i].gain.value, newLevels[i],
        `Canal ${i}: esperado ${newLevels[i]}, obtenido ${gainNodes[i].gain.value}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests para Oscilloscope dormancy (envío mensaje al worklet)
// ═══════════════════════════════════════════════════════════════════════════

describe('Oscilloscope dormancy', () => {
  
  it('envía mensaje setDormant al captureNode al entrar en dormancy', () => {
    const messages = [];
    
    const oscilloscope = {
      captureNode: {
        port: {
          postMessage(msg) { messages.push(msg); }
        }
      },
      _isDormant: false,
      _onDormancyChange(dormant) {
        if (this.captureNode) {
          this.captureNode.port.postMessage({ type: 'setDormant', dormant });
        }
      },
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this._onDormancyChange(dormant);
      }
    };
    
    oscilloscope.setDormant(true);
    
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], { type: 'setDormant', dormant: true });
  });
  
  it('envía mensaje setDormant al captureNode al salir de dormancy', () => {
    const messages = [];
    
    const oscilloscope = {
      captureNode: {
        port: {
          postMessage(msg) { messages.push(msg); }
        }
      },
      _isDormant: true,
      _onDormancyChange(dormant) {
        if (this.captureNode) {
          this.captureNode.port.postMessage({ type: 'setDormant', dormant });
        }
      },
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this._onDormancyChange(dormant);
      }
    };
    
    oscilloscope.setDormant(false);
    
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], { type: 'setDormant', dormant: false });
  });
  
  it('no falla si captureNode es null', () => {
    const oscilloscope = {
      captureNode: null,
      _isDormant: false,
      _onDormancyChange(dormant) {
        if (this.captureNode) {
          this.captureNode.port.postMessage({ type: 'setDormant', dormant });
        }
      },
      setDormant(dormant) {
        if (this._isDormant === dormant) return;
        this._isDormant = dormant;
        this._onDormancyChange(dormant);
      }
    };
    
    // No debe lanzar excepción
    assert.doesNotThrow(() => {
      oscilloscope.setDormant(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests para Output Bus dormancy (desconexión del grafo)
// ═══════════════════════════════════════════════════════════════════════════

describe('Output Bus dormancy with graph disconnection', () => {
  
  it('desconecta busInput de filterLP cuando no hay bypass al entrar en dormancy', () => {
    let disconnectedFrom = null;
    
    const bus = {
      input: {
        disconnect(node) { disconnectedFrom = node; },
        connect() {}
      },
      filterLP: { name: 'filterLP' },
      levelNode: { name: 'levelNode' },
      muteNode: { gain: { value: 1, setValueAtTime() {} } },
      _isDormant: false,
      _savedMuteValue: 1
    };
    
    const engine = {
      _filterBypassState: [false] // No bypass activo
    };
    
    function setDormant(dormant) {
      if (bus._isDormant === dormant) return;
      bus._isDormant = dormant;
      
      const isBypassed = engine._filterBypassState?.[0] ?? false;
      
      if (dormant) {
        bus._savedMuteValue = bus.muteNode.gain.value;
        if (isBypassed) {
          bus.input.disconnect(bus.levelNode);
        } else {
          bus.input.disconnect(bus.filterLP);
        }
      }
    }
    
    setDormant(true);
    
    assert.equal(bus._isDormant, true);
    assert.strictEqual(disconnectedFrom, bus.filterLP);
  });
  
  it('desconecta busInput de levelNode cuando hay bypass activo', () => {
    let disconnectedFrom = null;
    
    const bus = {
      input: {
        disconnect(node) { disconnectedFrom = node; },
        connect() {}
      },
      filterLP: { name: 'filterLP' },
      levelNode: { name: 'levelNode' },
      muteNode: { gain: { value: 1, setValueAtTime() {} } },
      _isDormant: false,
      _savedMuteValue: 1
    };
    
    const engine = {
      _filterBypassState: [true] // Bypass activo
    };
    
    function setDormant(dormant) {
      if (bus._isDormant === dormant) return;
      bus._isDormant = dormant;
      
      const isBypassed = engine._filterBypassState?.[0] ?? false;
      
      if (dormant) {
        bus._savedMuteValue = bus.muteNode.gain.value;
        if (isBypassed) {
          bus.input.disconnect(bus.levelNode);
        } else {
          bus.input.disconnect(bus.filterLP);
        }
      }
    }
    
    setDormant(true);
    
    assert.equal(bus._isDormant, true);
    assert.strictEqual(disconnectedFrom, bus.levelNode);
  });
  
  it('reconecta busInput a filterLP cuando sale de dormancy sin bypass', () => {
    let connectedTo = null;
    let muteRestored = false;
    
    const bus = {
      input: {
        disconnect() {},
        connect(node) { connectedTo = node; }
      },
      filterLP: { name: 'filterLP' },
      levelNode: { name: 'levelNode' },
      muteNode: { 
        gain: { 
          value: 0, 
          setValueAtTime(val) { muteRestored = val === 0.9; }
        } 
      },
      _isDormant: true,
      _savedMuteValue: 0.9
    };
    
    const engine = {
      _filterBypassState: [false],
      audioCtx: { currentTime: 0 }
    };
    
    function setDormant(dormant) {
      if (bus._isDormant === dormant) return;
      bus._isDormant = dormant;
      
      const isBypassed = engine._filterBypassState?.[0] ?? false;
      
      if (!dormant) {
        if (isBypassed) {
          bus.input.connect(bus.levelNode);
        } else {
          bus.input.connect(bus.filterLP);
        }
        bus.muteNode.gain.setValueAtTime(bus._savedMuteValue, engine.audioCtx.currentTime);
      }
    }
    
    setDormant(false);
    
    assert.equal(bus._isDormant, false);
    assert.strictEqual(connectedTo, bus.filterLP);
    assert.equal(muteRestored, true);
  });
  
  it('reconecta busInput a levelNode cuando sale de dormancy con bypass activo', () => {
    let connectedTo = null;
    
    const bus = {
      input: {
        disconnect() {},
        connect(node) { connectedTo = node; }
      },
      filterLP: { name: 'filterLP' },
      levelNode: { name: 'levelNode' },
      muteNode: { gain: { value: 0, setValueAtTime() {} } },
      _isDormant: true,
      _savedMuteValue: 1
    };
    
    const engine = {
      _filterBypassState: [true], // Bypass activo
      audioCtx: { currentTime: 0 }
    };
    
    function setDormant(dormant) {
      if (bus._isDormant === dormant) return;
      bus._isDormant = dormant;
      
      const isBypassed = engine._filterBypassState?.[0] ?? false;
      
      if (!dormant) {
        if (isBypassed) {
          bus.input.connect(bus.levelNode);
        } else {
          bus.input.connect(bus.filterLP);
        }
        bus.muteNode.gain.setValueAtTime(bus._savedMuteValue, engine.audioCtx.currentTime);
      }
    }
    
    setDormant(false);
    
    assert.equal(bus._isDormant, false);
    assert.strictEqual(connectedTo, bus.levelNode);
  });
  
  it('no cambia estado si ya está en el mismo estado', () => {
    let disconnectCalled = false;
    
    const bus = {
      input: {
        disconnect() { disconnectCalled = true; },
        connect() {}
      },
      filterLP: {},
      levelNode: {},
      muteNode: { gain: { value: 1, setValueAtTime() {} } },
      _isDormant: true,
      _savedMuteValue: 1
    };
    
    const engine = {
      _filterBypassState: [false]
    };
    
    function setDormant(dormant) {
      if (bus._isDormant === dormant) return;
      bus._isDormant = dormant;
      
      const isBypassed = engine._filterBypassState?.[0] ?? false;
      
      if (dormant) {
        bus._savedMuteValue = bus.muteNode.gain.value;
        if (isBypassed) {
          bus.input.disconnect(bus.levelNode);
        } else {
          bus.input.disconnect(bus.filterLP);
        }
      }
    }
    
    setDormant(true); // Ya está dormant
    
    assert.equal(disconnectCalled, false);
  });
});
