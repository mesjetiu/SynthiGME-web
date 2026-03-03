/**
 * Tests para las entradas del Random Control Voltage Generator en el Panel 6 Blueprint
 * 
 * Verifica que el RVG tiene 3 filas fuente correctamente definidas
 * en la matriz de control (Panel 6), correspondientes a las salidas
 * key (fila 89), voltage1 (fila 90) y voltage2 (fila 91).
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel6Blueprint from '../../src/assets/js/panelBlueprints/panel6.control.blueprint.js';

// ═══════════════════════════════════════════════════════════════════════════
// RANDOM CV EN PANEL 6 — SOURCES
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 6 Blueprint — Random CV sources', () => {
  
  const rcvSources = panel6Blueprint.sources.filter(s => s.source?.kind === 'randomCV');
  
  it('tiene exactamente 3 fuentes randomCV', () => {
    assert.strictEqual(rcvSources.length, 3);
  });
  
  it('Key pulse en fila 89', () => {
    const key = rcvSources.find(s => s.source.output === 'key');
    assert.ok(key, 'Debe existir fuente randomCV/key');
    assert.strictEqual(key.rowSynth, 89);
  });
  
  it('Voltage 1 en fila 90', () => {
    const v1 = rcvSources.find(s => s.source.output === 'voltage1');
    assert.ok(v1, 'Debe existir fuente randomCV/voltage1');
    assert.strictEqual(v1.rowSynth, 90);
  });
  
  it('Voltage 2 en fila 91', () => {
    const v2 = rcvSources.find(s => s.source.output === 'voltage2');
    assert.ok(v2, 'Debe existir fuente randomCV/voltage2');
    assert.strictEqual(v2.rowSynth, 91);
  });
  
  it('filas son consecutivas: 89, 90, 91', () => {
    const rows = rcvSources.map(s => s.rowSynth).sort((a, b) => a - b);
    assert.deepStrictEqual(rows, [89, 90, 91]);
  });
  
  it('filas son posteriores a osciladores 10-12 (83-88)', () => {
    const panel3Oscs = panel6Blueprint.sources.filter(s => s.source?.kind === 'panel3Osc');
    const maxOscRow = Math.max(...panel3Oscs.map(s => s.rowSynth));
    const minRCVRow = Math.min(...rcvSources.map(s => s.rowSynth));
    assert.ok(minRCVRow > maxOscRow,
      `Fila mínima RCV (${minRCVRow}) debe ser > fila máxima osc (${maxOscRow})`);
  });
  
  it('todas las fuentes tienen kind y output', () => {
    for (const source of rcvSources) {
      assert.strictEqual(source.source.kind, 'randomCV');
      assert.ok(typeof source.source.output === 'string');
      assert.ok(source.source.output.length > 0);
    }
  });
  
  it('outputs son exactamente key, voltage1, voltage2', () => {
    const outputs = rcvSources.map(s => s.source.output).sort();
    assert.deepStrictEqual(outputs, ['key', 'voltage1', 'voltage2']);
  });
  
  it('coherencia con randomVoltage.config.js matrixRow', () => {
    // Las filas en el blueprint deben coincidir con el config
    // key=89, voltage1=90, voltage2=91
    const keySource = rcvSources.find(s => s.source.output === 'key');
    const v1Source = rcvSources.find(s => s.source.output === 'voltage1');
    const v2Source = rcvSources.find(s => s.source.output === 'voltage2');
    
    assert.strictEqual(keySource.rowSynth, 89, 'key debe estar en fila 89 (matrixRow.key)');
    assert.strictEqual(v1Source.rowSynth, 90, 'voltage1 debe estar en fila 90 (matrixRow.voltage1)');
    assert.strictEqual(v2Source.rowSynth, 91, 'voltage2 debe estar en fila 91 (matrixRow.voltage2)');
  });
  
  it('no duplican filas existentes en el blueprint', () => {
    const allRows = panel6Blueprint.sources.map(s => s.rowSynth);
    const unique = new Set(allRows);
    assert.strictEqual(allRows.length, unique.size,
      `Hay filas duplicadas: ${allRows.filter((r, i) => allRows.indexOf(r) !== i)}`);
  });
});
