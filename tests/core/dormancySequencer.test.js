/**
 * Tests de integración para Dormancy del Sequencer
 *
 * Verifica que el DormancyManager detecta correctamente el uso del
 * secuenciador en las matrices Panel 5 y Panel 6, y actualiza su
 * estado dormant/activo según corresponda.
 *
 * El secuenciador es módulo único (sin índice). Se detecta por kinds:
 *   Panel 5 source: 'sequencer' (rows 87-88)
 *   Panel 5 dest: 'sequencerControl' (cols 51-55)
 *   Panel 6 source: 'sequencer' (rows 100-110)
 *   Panel 6 dest: 'sequencerInput' (cols 60-62)
 *
 * @module tests/core/dormancySequencer.test
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DE MÓDULO Y APP
// ═══════════════════════════════════════════════════════════════════════════

function createSequencerModule() {
  return {
    id: 'sequencer',
    _isDormant: false,
    setDormant(dormant) {
      this._isDormant = dormant;
    }
  };
}

function createApp({ panel5Connections = {}, panel6Connections = {} } = {}) {
  // Panel 5 source map (rows)
  const panel5SourceMap = new Map([
    [87, { kind: 'sequencer', channel: 0 }],
    [88, { kind: 'sequencer', channel: 1 }]
  ]);

  // Panel 5 dest map (cols)
  const panel5DestMap = new Map([
    [51, { kind: 'sequencerControl', controlType: 'clock' }],
    [52, { kind: 'sequencerControl', controlType: 'reset' }],
    [53, { kind: 'sequencerControl', controlType: 'forward' }],
    [54, { kind: 'sequencerControl', controlType: 'reverse' }],
    [55, { kind: 'sequencerControl', controlType: 'stop' }]
  ]);

  // Panel 6 source map (rows)
  const panel6SourceMap = new Map([
    [100, { kind: 'sequencer', output: 'voltageA' }],
    [101, { kind: 'sequencer', output: 'voltageB' }],
    [102, { kind: 'sequencer', output: 'key1' }],
    [103, { kind: 'sequencer', output: 'voltageC' }],
    [104, { kind: 'sequencer', output: 'voltageD' }],
    [105, { kind: 'sequencer', output: 'key2' }],
    [106, { kind: 'sequencer', output: 'voltageE' }],
    [107, { kind: 'sequencer', output: 'voltageF' }],
    [108, { kind: 'sequencer', output: 'key3' }],
    [109, { kind: 'sequencer', output: 'key4' }],
    [110, { kind: 'sequencer', output: 'clockRate' }]
  ]);

  // Panel 6 dest map (cols)
  const panel6DestMap = new Map([
    [60, { kind: 'sequencerInput', inputType: 'voltageACE' }],
    [61, { kind: 'sequencerInput', inputType: 'voltageBDF' }],
    [62, { kind: 'sequencerInput', inputType: 'key' }]
  ]);

  const seqModule = createSequencerModule();

  return {
    _sequencerModule: seqModule,
    _panel3Routing: {
      connections: panel5Connections,
      sourceMap: panel5SourceMap,
      destMap: panel5DestMap
    },
    _panel6Routing: {
      connections: panel6Connections,
      sourceMap: panel6SourceMap,
      destMap: panel6DestMap
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DE DORMANCY MANAGER (lógica del sequencer)
// ═══════════════════════════════════════════════════════════════════════════

class MockDormancyManager {
  constructor(app) {
    this.app = app;
    this._moduleStates = new Map();
  }

  updateSequencerState() {
    const panel5Connections = this._getConnections(this.app._panel3Routing);
    const panel6Connections = this._getConnections(this.app._panel6Routing);

    const hasSequencerUsage =
      panel5Connections.some(e =>
        e.source?.kind === 'sequencer' ||
        e.dest?.kind === 'sequencerControl'
      ) ||
      panel6Connections.some(e =>
        e.source?.kind === 'sequencer' ||
        e.dest?.kind === 'sequencerInput'
      );

    this._setModuleDormant('sequencer', !hasSequencerUsage);
  }

  _getConnections(routing) {
    return Object.keys(routing.connections).map((key) => {
      const [rowOrColA, rowOrColB] = key.split(':').map(v => parseInt(v, 10));
      return {
        source: routing.sourceMap?.get(rowOrColA),
        dest: routing.destMap?.get(rowOrColB),
        key
      };
    });
  }

  _setModuleDormant(moduleId, dormant) {
    const module = this._findModule(moduleId);
    module?.setDormant(dormant);
    this._moduleStates.set(moduleId, { isDormant: dormant });
  }

  _findModule(moduleId) {
    if (moduleId === 'sequencer') {
      return this.app._sequencerModule;
    }
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Dormancy — Sequencer', () => {
  let app;
  let manager;

  beforeEach(() => {
    app = createApp();
    manager = new MockDormancyManager(app);
  });

  it('duerme el secuenciador sin conexiones', () => {
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, true);
  });

  // ─── Panel 5 outputs (sources) ─────────────────────────────────────────

  it('despierta si DAC 1 tiene conexión (Panel 5 source row 87)', () => {
    app._panel3Routing.connections['87:1'] = true;
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, false);
  });

  it('despierta si DAC 2 tiene conexión (Panel 5 source row 88)', () => {
    app._panel3Routing.connections['88:5'] = true;
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, false);
  });

  // ─── Panel 5 control inputs (dests) ────────────────────────────────────

  it('despierta si Clock input tiene conexión (Panel 5 dest col 51)', () => {
    app._panel3Routing.connections['10:51'] = true;
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, false);
  });

  it('despierta si Reset input tiene conexión (Panel 5 dest col 52)', () => {
    app._panel3Routing.connections['20:52'] = true;
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, false);
  });

  it('despierta si Forward input tiene conexión (Panel 5 dest col 53)', () => {
    app._panel3Routing.connections['30:53'] = true;
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, false);
  });

  // ─── Panel 6 CV outputs (sources) ─────────────────────────────────────

  it('despierta si Voltage A tiene conexión CV (Panel 6 source row 100)', () => {
    app._panel6Routing.connections['100:5'] = true;
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, false);
  });

  it('despierta si Key 1 tiene conexión CV (Panel 6 source row 102)', () => {
    app._panel6Routing.connections['102:10'] = true;
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, false);
  });

  it('despierta si Clock Rate tiene conexión CV (Panel 6 source row 110)', () => {
    app._panel6Routing.connections['110:3'] = true;
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, false);
  });

  // ─── Panel 6 CV inputs (dests) ────────────────────────────────────────

  it('despierta si Voltage ACE input tiene conexión (Panel 6 dest col 60)', () => {
    app._panel6Routing.connections['90:60'] = true;
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, false);
  });

  it('despierta si Voltage BDF input tiene conexión (Panel 6 dest col 61)', () => {
    app._panel6Routing.connections['91:61'] = true;
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, false);
  });

  it('despierta si Key input tiene conexión (Panel 6 dest col 62)', () => {
    app._panel6Routing.connections['92:62'] = true;
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, false);
  });

  // ─── Múltiples conexiones ─────────────────────────────────────────────

  it('despierta con múltiples conexiones simultáneas', () => {
    app._panel3Routing.connections['87:1'] = true;
    app._panel6Routing.connections['100:5'] = true;
    app._panel6Routing.connections['90:60'] = true;
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, false);
  });

  it('vuelve a dormir al quitar todas las conexiones', () => {
    // Primero conectar
    app._panel3Routing.connections['87:1'] = true;
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, false);

    // Quitar conexión
    delete app._panel3Routing.connections['87:1'];
    manager.updateSequencerState();
    assert.equal(app._sequencerModule._isDormant, true);
  });
});
