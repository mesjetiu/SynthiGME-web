/**
 * Tests para PVC en Panel 5 (audio input) y Panel 6 (control output)
 *
 * Panel 5: columna 50 → entrada de audio al PVC
 * Panel 6: fila 121 → salida de voltaje DC del PVC
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel5Blueprint from '../../src/assets/js/panelBlueprints/panel5.audio.blueprint.js';
import panel6Blueprint from '../../src/assets/js/panelBlueprints/panel6.control.blueprint.js';

// ═══════════════════════════════════════════════════════════════════════════
// PANEL 5 — PVC AUDIO INPUT
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 5 — PVC Audio Input (col 50)', () => {

  const pvcDest = panel5Blueprint.destinations.find(
    d => d.dest.kind === 'pitchToVoltageConverterInput'
  );

  it('existe entrada PVC en blueprint', () => {
    assert.ok(pvcDest, 'pitchToVoltageConverterInput debe existir en destinations');
  });

  it('columna 50', () => {
    assert.strictEqual(pvcDest.colSynth, 50);
  });

  it('kind es pitchToVoltageConverterInput', () => {
    assert.strictEqual(pvcDest.dest.kind, 'pitchToVoltageConverterInput');
  });

  it('solo hay 1 entrada PVC', () => {
    const count = panel5Blueprint.destinations.filter(
      d => d.dest.kind === 'pitchToVoltageConverterInput'
    ).length;
    assert.strictEqual(count, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PANEL 6 — PVC VOLTAGE OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 6 — PVC Voltage Output (row 121)', () => {

  const pvcSource = panel6Blueprint.sources.find(
    s => s.source.kind === 'pitchToVoltageConverter'
  );

  it('existe salida PVC en blueprint', () => {
    assert.ok(pvcSource, 'pitchToVoltageConverter debe existir en sources');
  });

  it('fila 121', () => {
    assert.strictEqual(pvcSource.rowSynth, 121);
  });

  it('kind es pitchToVoltageConverter', () => {
    assert.strictEqual(pvcSource.source.kind, 'pitchToVoltageConverter');
  });

  it('output es voltage', () => {
    assert.strictEqual(pvcSource.source.output, 'voltage');
  });

  it('solo hay 1 salida PVC', () => {
    const count = panel6Blueprint.sources.filter(
      s => s.source.kind === 'pitchToVoltageConverter'
    ).length;
    assert.strictEqual(count, 1);
  });
});
