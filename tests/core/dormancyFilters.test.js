import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function createFilterModule(id) {
  return {
    id,
    _isDormant: false,
    setDormant(dormant) {
      this._isDormant = dormant;
    }
  };
}

function createApp({ panel5Connections = {}, panel6Connections = {} } = {}) {
  const filterModules = {
    flp1: createFilterModule('filter-lp-1'),
    flp2: createFilterModule('filter-lp-2'),
    flp3: createFilterModule('filter-lp-3'),
    flp4: createFilterModule('filter-lp-4'),
    fhp1: createFilterModule('filter-hp-1'),
    fhp2: createFilterModule('filter-hp-2'),
    fhp3: createFilterModule('filter-hp-3'),
    fhp4: createFilterModule('filter-hp-4')
  };

  const panel5SourceMap = new Map([
    [43, { kind: 'filterLP', index: 0 }],
    [44, { kind: 'filterLP', index: 1 }],
    [45, { kind: 'filterLP', index: 2 }],
    [46, { kind: 'filterLP', index: 3 }],
    [47, { kind: 'filterHP', index: 0 }],
    [48, { kind: 'filterHP', index: 1 }],
    [49, { kind: 'filterHP', index: 2 }],
    [50, { kind: 'filterHP', index: 3 }]
  ]);

  const panel5DestMap = new Map([
    [14, { kind: 'filterLPInput', index: 0 }],
    [15, { kind: 'filterLPInput', index: 1 }],
    [16, { kind: 'filterLPInput', index: 2 }],
    [17, { kind: 'filterLPInput', index: 3 }],
    [18, { kind: 'filterHPInput', index: 0 }],
    [19, { kind: 'filterHPInput', index: 1 }],
    [20, { kind: 'filterHPInput', index: 2 }],
    [21, { kind: 'filterHPInput', index: 3 }]
  ]);

  const panel6DestMap = new Map([
    [21, { kind: 'filterLPCutoffCV', index: 0 }],
    [22, { kind: 'filterLPCutoffCV', index: 1 }],
    [23, { kind: 'filterLPCutoffCV', index: 2 }],
    [24, { kind: 'filterLPCutoffCV', index: 3 }],
    [25, { kind: 'filterHPCutoffCV', index: 0 }],
    [26, { kind: 'filterHPCutoffCV', index: 1 }],
    [27, { kind: 'filterHPCutoffCV', index: 2 }],
    [28, { kind: 'filterHPCutoffCV', index: 3 }]
  ]);

  return {
    _panel1FilterModules: filterModules,
    _panel3Routing: {
      connections: panel5Connections,
      sourceMap: panel5SourceMap,
      destMap: panel5DestMap
    },
    _panel6Routing: {
      connections: panel6Connections,
      sourceMap: new Map(),
      destMap: panel6DestMap
    }
  };
}

class MockDormancyManager {
  constructor(app) {
    this.app = app;
    this._moduleStates = new Map();
  }

  updateAllStates() {
    const panel5Connections = this._getConnections(this.app._panel3Routing);
    const panel6Connections = this._getConnections(this.app._panel6Routing);

    for (let index = 0; index < 4; index++) {
      const hasLP = panel5Connections.some((entry) =>
        (entry.source?.kind === 'filterLP' && entry.source.index === index) ||
        (entry.dest?.kind === 'filterLPInput' && entry.dest.index === index)
      ) || panel6Connections.some((entry) =>
        entry.dest?.kind === 'filterLPCutoffCV' && entry.dest.index === index
      );
      this._setModuleDormant(`filter-lp-${index + 1}`, !hasLP);

      const hasHP = panel5Connections.some((entry) =>
        (entry.source?.kind === 'filterHP' && entry.source.index === index) ||
        (entry.dest?.kind === 'filterHPInput' && entry.dest.index === index)
      ) || panel6Connections.some((entry) =>
        entry.dest?.kind === 'filterHPCutoffCV' && entry.dest.index === index
      );
      this._setModuleDormant(`filter-hp-${index + 1}`, !hasHP);
    }
  }

  _getConnections(routing) {
    return Object.keys(routing.connections).map((key) => {
      const [rowOrColA, rowOrColB] = key.split(':').map((value) => parseInt(value, 10));
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
    if (moduleId.startsWith('filter-lp-')) {
      return this.app._panel1FilterModules[`flp${moduleId.split('-').pop()}`];
    }
    if (moduleId.startsWith('filter-hp-')) {
      return this.app._panel1FilterModules[`fhp${moduleId.split('-').pop()}`];
    }
    return null;
  }
}

describe('Dormancy — Panel 1 filters', () => {
  let app;
  let manager;

  beforeEach(() => {
    app = createApp();
    manager = new MockDormancyManager(app);
  });

  it('duerme todos los filtros sin conexiones', () => {
    manager.updateAllStates();
    assert.equal(app._panel1FilterModules.flp1._isDormant, true);
    assert.equal(app._panel1FilterModules.fhp4._isDormant, true);
  });

  it('despierta LP1 si su salida está conectada', () => {
    app._panel3Routing.connections['43:36'] = true;
    manager.updateAllStates();
    assert.equal(app._panel1FilterModules.flp1._isDormant, false);
    assert.equal(app._panel1FilterModules.flp2._isDormant, true);
  });

  it('despierta HP2 si su entrada de audio está conectada', () => {
    app._panel3Routing.connections['89:19'] = true;
    app._panel3Routing.sourceMap.set(89, { kind: 'noiseGen', index: 0 });
    manager.updateAllStates();
    assert.equal(app._panel1FilterModules.fhp2._isDormant, false);
  });

  it('despierta LP3 si recibe CV de cutoff', () => {
    app._panel6Routing.connections['90:23'] = true;
    manager.updateAllStates();
    assert.equal(app._panel1FilterModules.flp3._isDormant, false);
  });
});
