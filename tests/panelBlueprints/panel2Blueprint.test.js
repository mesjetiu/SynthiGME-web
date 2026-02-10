/**
 * Tests para el blueprint del Panel 2 (Oscilloscope, Input Amplifier Level & Placeholders)
 * 
 * Verifica la configuración correcta de:
 * - Estructura básica (schemaVersion, panelId, showFrames)
 * - Layout: 5 secciones verticales (oscilloscope, frequencyMeter, octaveFilterBank,
 *   inputAmplifierLevel, externalTreatmentDevices)
 * - Módulos declarados (2 funcionales + 3 placeholders)
 * - Separación blueprint/config (ausencia de propiedades de audio, controls, matrixMapping)
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel2Blueprint from '../../src/assets/js/panelBlueprints/panel2.blueprint.js';

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE ESTRUCTURA BÁSICA
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 2 Blueprint - Estructura básica', () => {

  it('tiene schemaVersion 2', () => {
    assert.strictEqual(panel2Blueprint.schemaVersion, 2);
  });

  it('tiene panelId "panel-2"', () => {
    assert.strictEqual(panel2Blueprint.panelId, 'panel-2');
  });

  it('tiene showFrames como booleano', () => {
    assert.strictEqual(typeof panel2Blueprint.showFrames, 'boolean');
  });

  it('tiene layout definido', () => {
    assert.ok(panel2Blueprint.layout, 'debe tener layout');
    assert.ok(typeof panel2Blueprint.layout === 'object', 'layout debe ser objeto');
  });

  it('tiene modules definido', () => {
    assert.ok(panel2Blueprint.modules, 'debe tener modules');
    assert.ok(typeof panel2Blueprint.modules === 'object', 'modules debe ser objeto');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 2 Blueprint - Layout', () => {

  it('tiene padding general del panel', () => {
    const padding = panel2Blueprint.layout.padding;
    assert.ok(padding, 'debe tener padding');
    assert.strictEqual(typeof padding.top, 'number');
    assert.strictEqual(typeof padding.right, 'number');
    assert.strictEqual(typeof padding.bottom, 'number');
    assert.strictEqual(typeof padding.left, 'number');
  });

  it('tiene gap vertical entre secciones', () => {
    assert.strictEqual(typeof panel2Blueprint.layout.gap, 'number');
    assert.ok(panel2Blueprint.layout.gap >= 0, 'gap no puede ser negativo');
  });

  describe('Sección Oscilloscope', () => {
    const osc = panel2Blueprint.layout.oscilloscope;

    it('existe con flex numérico', () => {
      assert.ok(osc, 'debe tener sección oscilloscope');
      assert.strictEqual(typeof osc.flex, 'number');
      assert.ok(osc.flex > 0, 'flex debe ser positivo');
    });

    it('tiene frame con borderRadius y padding', () => {
      assert.ok(osc.frame, 'debe tener frame');
      assert.strictEqual(typeof osc.frame.borderRadius, 'number');
      assert.ok(osc.frame.padding, 'frame debe tener padding');
      assert.strictEqual(typeof osc.frame.padding.top, 'number');
      assert.strictEqual(typeof osc.frame.padding.right, 'number');
      assert.strictEqual(typeof osc.frame.padding.bottom, 'number');
      assert.strictEqual(typeof osc.frame.padding.left, 'number');
    });

    it('tiene display con aspectRatio numérico', () => {
      assert.ok(osc.display, 'debe tener display');
      assert.strictEqual(typeof osc.display.aspectRatio, 'number');
      assert.ok(osc.display.aspectRatio > 0, 'aspectRatio debe ser positivo');
    });
  });

  describe('Sección Frequency Meter (placeholder)', () => {
    const fm = panel2Blueprint.layout.frequencyMeter;

    it('existe con height numérico', () => {
      assert.ok(fm, 'debe tener sección frequencyMeter');
      assert.strictEqual(typeof fm.height, 'number');
      assert.ok(fm.height > 0, 'height debe ser positivo');
    });
  });

  describe('Sección Octave Filter Bank (placeholder)', () => {
    const ofb = panel2Blueprint.layout.octaveFilterBank;

    it('existe con height numérico', () => {
      assert.ok(ofb, 'debe tener sección octaveFilterBank');
      assert.strictEqual(typeof ofb.height, 'number');
      assert.ok(ofb.height > 0, 'height debe ser positivo');
    });
  });

  describe('Sección Input Amplifier Level', () => {
    const ial = panel2Blueprint.layout.inputAmplifierLevel;

    it('existe con height definido', () => {
      assert.ok(ial, 'debe tener sección inputAmplifierLevel');
      assert.ok(ial.height !== undefined, 'debe tener height');
    });
  });

  describe('Sección External Treatment Devices (placeholder)', () => {
    const etd = panel2Blueprint.layout.externalTreatmentDevices;

    it('existe con height numérico', () => {
      assert.ok(etd, 'debe tener sección externalTreatmentDevices');
      assert.strictEqual(typeof etd.height, 'number');
      assert.ok(etd.height > 0, 'height debe ser positivo');
    });
  });

  it('tiene exactamente 5 secciones de módulos en el layout', () => {
    const layoutSections = ['oscilloscope', 'frequencyMeter', 'octaveFilterBank',
      'inputAmplifierLevel', 'externalTreatmentDevices'];
    for (const name of layoutSections) {
      assert.ok(panel2Blueprint.layout[name],
        `debe tener sección layout.${name}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE MÓDULOS
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 2 Blueprint - Módulos', () => {
  const modules = panel2Blueprint.modules;

  describe('Módulos funcionales', () => {
    it('tiene oscilloscope', () => {
      assert.ok('oscilloscope' in modules, 'debe tener módulo oscilloscope');
      assert.strictEqual(typeof modules.oscilloscope, 'object');
    });

    it('tiene inputAmplifierLevel', () => {
      assert.ok('inputAmplifierLevel' in modules, 'debe tener módulo inputAmplifierLevel');
      assert.strictEqual(typeof modules.inputAmplifierLevel, 'object');
    });
  });

  describe('Placeholders', () => {
    it('tiene frequencyMeter', () => {
      assert.ok('frequencyMeter' in modules, 'debe tener módulo frequencyMeter');
      assert.strictEqual(typeof modules.frequencyMeter, 'object');
    });

    it('tiene octaveFilterBank', () => {
      assert.ok('octaveFilterBank' in modules, 'debe tener módulo octaveFilterBank');
      assert.strictEqual(typeof modules.octaveFilterBank, 'object');
    });

    it('tiene externalTreatmentDevices', () => {
      assert.ok('externalTreatmentDevices' in modules, 'debe tener módulo externalTreatmentDevices');
      assert.strictEqual(typeof modules.externalTreatmentDevices, 'object');
    });
  });

  it('total de módulos: 2 funcionales + 3 placeholders = 5', () => {
    const keys = Object.keys(modules);
    assert.strictEqual(keys.length, 5, `debe haber 5 módulos, hay ${keys.length}: ${keys.join(', ')}`);
  });

  it('naming: usa inputAmplifierLevel (no inputAmplifiers)', () => {
    assert.ok(!('inputAmplifiers' in modules),
      'no debe existir inputAmplifiers (v1), usar inputAmplifierLevel');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE SEPARACIÓN BLUEPRINT / CONFIG
// ─────────────────────────────────────────────────────────────────────────────
//
// El blueprint NO debe contener propiedades que pertenecen al config
// (oscilloscope.config.js, inputAmplifier.config.js). Estas propiedades
// se eliminaron en el refactoring schemaVersion 1 → 2.
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 2 Blueprint - Separación blueprint/config', () => {

  it('NO tiene matrixMapping (pertenece a panel5/panel6 blueprints)', () => {
    assert.strictEqual(panel2Blueprint.matrixMapping, undefined);
  });

  it('NO tiene routing (pertenece al config)', () => {
    assert.strictEqual(panel2Blueprint.routing, undefined);
  });

  it('NO tiene sources ni destinations (no es un matrix blueprint)', () => {
    assert.strictEqual(panel2Blueprint.sources, undefined);
    assert.strictEqual(panel2Blueprint.destinations, undefined);
  });

  it('NO tiene grid (eso es de matrix blueprints)', () => {
    assert.strictEqual(panel2Blueprint.grid, undefined);
  });

  it('NO tiene matrixId (no es un matrix blueprint)', () => {
    assert.strictEqual(panel2Blueprint.matrixId, undefined);
  });

  it('ningún módulo tiene controls array (pertenece al config)', () => {
    for (const [key, mod] of Object.entries(panel2Blueprint.modules)) {
      assert.strictEqual(mod.controls, undefined,
        `modules.${key} no debe tener controls`);
    }
  });

  it('ningún módulo tiene channels (pertenece al config)', () => {
    for (const [key, mod] of Object.entries(panel2Blueprint.modules)) {
      assert.strictEqual(mod.channels, undefined,
        `modules.${key} no debe tener channels`);
    }
  });

  it('ningún módulo tiene id (se define en el código de rendering)', () => {
    for (const [key, mod] of Object.entries(panel2Blueprint.modules)) {
      assert.strictEqual(mod.id, undefined,
        `modules.${key} no debe tener id`);
    }
  });

  it('ningún módulo tiene title (se define en el código de rendering)', () => {
    for (const [key, mod] of Object.entries(panel2Blueprint.modules)) {
      assert.strictEqual(mod.title, undefined,
        `modules.${key} no debe tener title`);
    }
  });

  it('ningún módulo tiene type (se infiere del nombre del módulo)', () => {
    for (const [key, mod] of Object.entries(panel2Blueprint.modules)) {
      assert.strictEqual(mod.type, undefined,
        `modules.${key} no debe tener type`);
    }
  });

  it('ningún módulo tiene section (la asociación es implícita por nombre)', () => {
    for (const [key, mod] of Object.entries(panel2Blueprint.modules)) {
      assert.strictEqual(mod.section, undefined,
        `modules.${key} no debe tener section`);
    }
  });

  it('ningún módulo tiene frame (movido a layout.*)', () => {
    for (const [key, mod] of Object.entries(panel2Blueprint.modules)) {
      assert.strictEqual(mod.frame, undefined,
        `modules.${key} no debe tener frame (movido a layout)`);
    }
  });

  it('NO tiene layout.sections (estructura v1)', () => {
    // En v1 existía layout.sections con heightRatio
    // En v2 las secciones son propiedades directas del layout
    assert.strictEqual(panel2Blueprint.layout.sections, undefined,
      'no debe existir layout.sections de la v1');
  });

  it('NO tiene módulo "inputAmplifiers" monolítico (estructura v1)', () => {
    // En v1 existía modules.inputAmplifiers con id, title, channels, controls
    // En v2 se usa inputAmplifierLevel sin datos de audio
    assert.strictEqual(panel2Blueprint.modules.inputAmplifiers, undefined,
      'no debe existir el módulo monolítico "inputAmplifiers" de la v1');
  });
});
