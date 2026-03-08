import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel5Blueprint from '../../src/assets/js/panelBlueprints/panel5.audio.blueprint.js';

describe('Panel 5 Blueprint — Filter sources', () => {
  const lpSources = panel5Blueprint.sources.filter((entry) => entry.source?.kind === 'filterLP');
  const hpSources = panel5Blueprint.sources.filter((entry) => entry.source?.kind === 'filterHP');

  it('expone 4 salidas low-pass en filas 110-113', () => {
    assert.equal(lpSources.length, 4);
    assert.deepEqual(lpSources.map((entry) => entry.rowSynth), [110, 111, 112, 113]);
  });

  it('expone 4 salidas high-pass en filas 114-117', () => {
    assert.equal(hpSources.length, 4);
    assert.deepEqual(hpSources.map((entry) => entry.rowSynth), [114, 115, 116, 117]);
  });

  it('conserva índices 0-3 para LP y HP', () => {
    assert.deepEqual(lpSources.map((entry) => entry.source.index), [0, 1, 2, 3]);
    assert.deepEqual(hpSources.map((entry) => entry.source.index), [0, 1, 2, 3]);
  });
});

describe('Panel 5 Blueprint — Filter destinations', () => {
  const lpInputs = panel5Blueprint.destinations.filter((entry) => entry.dest?.kind === 'filterLPInput');
  const hpInputs = panel5Blueprint.destinations.filter((entry) => entry.dest?.kind === 'filterHPInput');

  it('define 4 entradas de audio LP en columnas 15-18', () => {
    assert.equal(lpInputs.length, 4);
    assert.deepEqual(lpInputs.map((entry) => entry.colSynth), [15, 16, 17, 18]);
  });

  it('define 4 entradas de audio HP en columnas 19-22', () => {
    assert.equal(hpInputs.length, 4);
    assert.deepEqual(hpInputs.map((entry) => entry.colSynth), [19, 20, 21, 22]);
  });
});
