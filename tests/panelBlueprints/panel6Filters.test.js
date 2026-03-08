import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel6Blueprint from '../../src/assets/js/panelBlueprints/panel6.control.blueprint.js';

describe('Panel 6 Blueprint — Filter cutoff destinations', () => {
  const lpDestinations = panel6Blueprint.destinations.filter((entry) => entry.dest?.kind === 'filterLPCutoffCV');
  const hpDestinations = panel6Blueprint.destinations.filter((entry) => entry.dest?.kind === 'filterHPCutoffCV');

  it('define 4 entradas CV LP en columnas 22-25', () => {
    assert.equal(lpDestinations.length, 4);
    assert.deepEqual(lpDestinations.map((entry) => entry.colSynth), [22, 23, 24, 25]);
  });

  it('define 4 entradas CV HP en columnas 26-29', () => {
    assert.equal(hpDestinations.length, 4);
    assert.deepEqual(hpDestinations.map((entry) => entry.colSynth), [26, 27, 28, 29]);
  });

  it('usa índices 0-3 para cada banco', () => {
    assert.deepEqual(lpDestinations.map((entry) => entry.dest.index), [0, 1, 2, 3]);
    assert.deepEqual(hpDestinations.map((entry) => entry.dest.index), [0, 1, 2, 3]);
  });
});
