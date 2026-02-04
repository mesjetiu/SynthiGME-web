/**
 * Tests para el blueprint del Panel 6 (Control Matrix)
 * 
 * Verifica la configuración correcta de:
 * - Sources (fuentes de CV): Input Amplifiers, Output Buses, Oscillators 10-12
 * - Destinations (destinos): Osc Freq CV, Output Level CV, Voltage Input, Oscilloscope
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Importar blueprint directamente
import panel6Blueprint from '../../src/assets/js/panelBlueprints/panel6.control.blueprint.js';

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE ESTRUCTURA BÁSICA
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 6 Blueprint - Estructura básica', () => {
  
  it('tiene schemaVersion definido', () => {
    assert.ok(panel6Blueprint.schemaVersion >= 1, 'schemaVersion debe ser >= 1');
  });
  
  it('tiene panelId correcto', () => {
    assert.strictEqual(panel6Blueprint.panelId, 'panel-6');
  });
  
  it('tiene matrixId "control"', () => {
    assert.strictEqual(panel6Blueprint.matrixId, 'control');
  });
  
  it('tiene configuración de grid', () => {
    assert.ok(panel6Blueprint.grid, 'debe tener grid');
    assert.strictEqual(panel6Blueprint.grid.rows, 63);
    assert.strictEqual(panel6Blueprint.grid.cols, 67);
  });
  
  it('tiene sources y destinations definidos', () => {
    assert.ok(Array.isArray(panel6Blueprint.sources), 'sources debe ser array');
    assert.ok(Array.isArray(panel6Blueprint.destinations), 'destinations debe ser array');
    assert.ok(panel6Blueprint.sources.length > 0, 'debe tener sources');
    assert.ok(panel6Blueprint.destinations.length > 0, 'debe tener destinations');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE SOURCES (FILAS)
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 6 Blueprint - Sources', () => {
  
  it('tiene 8 Input Amplifiers (filas 67-74)', () => {
    const inputAmps = panel6Blueprint.sources.filter(s => s.source.kind === 'inputAmp');
    assert.strictEqual(inputAmps.length, 8, 'debe haber 8 Input Amplifiers');
    
    // Verificar numeración correcta
    for (let i = 0; i < 8; i++) {
      const amp = inputAmps.find(s => s.source.channel === i);
      assert.ok(amp, `Input Amplifier channel ${i} debe existir`);
      assert.strictEqual(amp.rowSynth, 67 + i, `channel ${i} debe estar en fila ${67 + i}`);
    }
  });
  
  it('tiene 8 Output Buses (filas 75-82)', () => {
    const outputBuses = panel6Blueprint.sources.filter(s => s.source.kind === 'outputBus');
    assert.strictEqual(outputBuses.length, 8, 'debe haber 8 Output Buses');
    
    // Verificar numeración correcta (bus 1-8)
    for (let i = 1; i <= 8; i++) {
      const bus = outputBuses.find(s => s.source.bus === i);
      assert.ok(bus, `Output Bus ${i} debe existir`);
      assert.strictEqual(bus.rowSynth, 74 + i, `bus ${i} debe estar en fila ${74 + i}`);
    }
  });
  
  it('tiene Oscillators 10-12 (filas 83-88)', () => {
    const panel3Oscs = panel6Blueprint.sources.filter(s => s.source.kind === 'panel3Osc');
    assert.strictEqual(panel3Oscs.length, 6, 'debe haber 6 salidas de osc (3 oscs × 2 canales)');
    
    // Osc 10 (oscIndex 9)
    const osc10sineSaw = panel3Oscs.find(s => s.source.oscIndex === 9 && s.source.channelId === 'sineSaw');
    const osc10triPulse = panel3Oscs.find(s => s.source.oscIndex === 9 && s.source.channelId === 'triPulse');
    assert.ok(osc10sineSaw, 'Osc 10 sineSaw debe existir');
    assert.ok(osc10triPulse, 'Osc 10 triPulse debe existir');
    assert.strictEqual(osc10sineSaw.rowSynth, 83);
    assert.strictEqual(osc10triPulse.rowSynth, 84);
    
    // Osc 11 (oscIndex 10)
    const osc11sineSaw = panel3Oscs.find(s => s.source.oscIndex === 10 && s.source.channelId === 'sineSaw');
    assert.ok(osc11sineSaw, 'Osc 11 sineSaw debe existir');
    assert.strictEqual(osc11sineSaw.rowSynth, 85);
    
    // Osc 12 (oscIndex 11)
    const osc12sineSaw = panel3Oscs.find(s => s.source.oscIndex === 11 && s.source.channelId === 'sineSaw');
    assert.ok(osc12sineSaw, 'Osc 12 sineSaw debe existir');
    assert.strictEqual(osc12sineSaw.rowSynth, 87);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE DESTINATIONS (COLUMNAS)
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 6 Blueprint - Destinations', () => {
  
  it('tiene 12 Osc Freq CV (columnas 30-41)', () => {
    const oscFreqCVs = panel6Blueprint.destinations.filter(d => d.dest.kind === 'oscFreqCV');
    assert.strictEqual(oscFreqCVs.length, 12, 'debe haber 12 entradas de Freq CV');
    
    // Verificar que cubren osciladores 0-11
    for (let i = 0; i < 12; i++) {
      const cv = oscFreqCVs.find(d => d.dest.oscIndex === i);
      assert.ok(cv, `Osc ${i + 1} Freq CV debe existir`);
      assert.strictEqual(cv.colSynth, 30 + i, `Osc ${i + 1} debe estar en columna ${30 + i}`);
    }
  });
  
  it('tiene 4 Voltage Input para canales 1-4 (columnas 42-45)', () => {
    // Voltage Input usa kind: 'outputBus' porque conecta al mismo punto que Panel 5
    const voltageInputs = panel6Blueprint.destinations.filter(
      d => d.dest.kind === 'outputBus' && d.colSynth >= 42 && d.colSynth <= 45
    );
    
    assert.strictEqual(voltageInputs.length, 4, 'debe haber 4 Voltage Inputs');
    
    // Verificar que van a buses 1-4
    for (let bus = 1; bus <= 4; bus++) {
      const vi = voltageInputs.find(d => d.dest.bus === bus);
      assert.ok(vi, `Voltage Input para bus ${bus} debe existir`);
      assert.strictEqual(vi.colSynth, 41 + bus, `Bus ${bus} debe estar en columna ${41 + bus}`);
    }
  });
  
  it('Voltage Input conecta al mismo punto que audio (outputBus)', () => {
    // Las columnas 42-45 usan kind: 'outputBus', igual que Panel 5
    // Esto significa que la señal va ANTES del VCA, no como CV
    const col42 = panel6Blueprint.destinations.find(d => d.colSynth === 42);
    
    assert.ok(col42, 'Columna 42 debe existir');
    assert.strictEqual(col42.dest.kind, 'outputBus', 'debe usar kind outputBus');
    assert.strictEqual(col42.dest.bus, 1, 'debe ir al bus 1');
  });
  
  it('tiene 8 Output Level CV (columnas 46-53)', () => {
    const levelCVs = panel6Blueprint.destinations.filter(d => d.dest.kind === 'outputLevelCV');
    assert.strictEqual(levelCVs.length, 8, 'debe haber 8 Output Level CV');
    
    // Verificar que cubren buses 0-7 (0-indexed en busIndex)
    for (let i = 0; i < 8; i++) {
      const cv = levelCVs.find(d => d.dest.busIndex === i);
      assert.ok(cv, `Output Level CV para bus ${i + 1} debe existir`);
      assert.strictEqual(cv.colSynth, 46 + i, `Bus ${i + 1} debe estar en columna ${46 + i}`);
    }
  });
  
  it('diferencia entre Voltage Input y Output Level CV', () => {
    // Voltage Input (cols 42-45): señal PASA POR el canal
    const voltageInput = panel6Blueprint.destinations.find(d => d.colSynth === 42);
    assert.strictEqual(voltageInput.dest.kind, 'outputBus', 'Voltage Input usa outputBus');
    
    // Output Level CV (cols 46-53): señal MODULA la ganancia del VCA
    const levelCV = panel6Blueprint.destinations.find(d => d.colSynth === 46);
    assert.strictEqual(levelCV.dest.kind, 'outputLevelCV', 'Level CV usa outputLevelCV');
    
    // Ambos afectan al canal 1, pero de formas diferentes
    assert.strictEqual(voltageInput.dest.bus, 1, 'Voltage Input va al bus 1');
    assert.strictEqual(levelCV.dest.busIndex, 0, 'Level CV va al busIndex 0 (bus 1)');
  });
  
  it('tiene Oscilloscope X e Y (columnas 63-64)', () => {
    const scopeY = panel6Blueprint.destinations.find(
      d => d.dest.kind === 'oscilloscope' && d.dest.channel === 'Y'
    );
    const scopeX = panel6Blueprint.destinations.find(
      d => d.dest.kind === 'oscilloscope' && d.dest.channel === 'X'
    );
    
    assert.ok(scopeY, 'Oscilloscope Y debe existir');
    assert.ok(scopeX, 'Oscilloscope X debe existir');
    assert.strictEqual(scopeY.colSynth, 63, 'Scope Y debe estar en columna 63');
    assert.strictEqual(scopeX.colSynth, 64, 'Scope X debe estar en columna 64');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE CASO DE USO: SLEW LIMITER
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 6 Blueprint - Caso de uso: Slew Limiter', () => {
  
  it('permite configuración de slew limiter para señales de control', () => {
    // Caso de uso: usar Output Channel como filtro de control
    // 1. Osc 10 (fila 83) → Voltage Input Ch 1 (col 42)
    // 2. Output Bus 1 (fila 75) → cualquier destino (señal suavizada)
    
    // Verificar que las rutas existen
    const osc10Source = panel6Blueprint.sources.find(
      s => s.source.kind === 'panel3Osc' && s.source.oscIndex === 9
    );
    assert.ok(osc10Source, 'Osc 10 como source debe existir');
    
    const voltageInputCh1 = panel6Blueprint.destinations.find(d => d.colSynth === 42);
    assert.ok(voltageInputCh1, 'Voltage Input Ch 1 debe existir');
    
    const outputBus1Source = panel6Blueprint.sources.find(
      s => s.source.kind === 'outputBus' && s.source.bus === 1
    );
    assert.ok(outputBus1Source, 'Output Bus 1 como source (re-entry) debe existir');
  });
  
  it('re-entry del canal 1 está en fila 75 (post-fader)', () => {
    const outputBus1 = panel6Blueprint.sources.find(
      s => s.source.kind === 'outputBus' && s.source.bus === 1
    );
    assert.strictEqual(outputBus1.rowSynth, 75, 'Bus 1 debe estar en fila 75');
  });
});
