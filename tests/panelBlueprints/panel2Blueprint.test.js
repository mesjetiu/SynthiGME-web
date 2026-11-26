/**
 * Tests para el blueprint del Panel 2 (Oscilloscope, Input Amplifier Level & Placeholders)
 * 
 * Verifica la configuración correcta de:
 * - Estructura básica (schemaVersion, panelId, showFrames)
 * - Layout: 5 filas (oscilloscope, frequencyMeter, octaveFilterBank,
 *   inputAmplifierLevel, extTreatmentSend + extTreatmentReturn), cada uno
 *   en su caja absoluta { x, y, w, h } en px del panel
 * - Módulos declarados (2 funcionales + 4 placeholders)
 * - Separación blueprint/config (ausencia de propiedades de audio, controls, matrixMapping)
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel2Blueprint from '../../src/assets/js/panelBlueprints/panel2.blueprint.js';
import { isBox, PANEL_SIZE } from '../../src/assets/js/utils/panelBox.js';

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

describe('Panel 2 Blueprint - Layout en cajas absolutas', () => {
  const layout = panel2Blueprint.layout;

  // Cajas medidas en la web (tests/visual) al migrar al modelo único de
  // coordenadas: con ellas el panel queda idéntico a como estaba.
  const EXPECTED_BOXES = {
    oscilloscope:        { x: 120,   y: 32,  w: 527, h: 225 },
    frequencyMeter:      { x: 8,     y: 322, w: 744, h: 143 },
    octaveFilterBank:    { x: 8,     y: 466, w: 744, h: 93 },
    inputAmplifierLevel: { x: 8,     y: 559, w: 744, h: 93 },
    extTreatmentSend:    { x: 7.5,   y: 653, w: 371, h: 94 },
    extTreatmentReturn:  { x: 380.5, y: 653, w: 371, h: 94 }
  };

  for (const [name, expected] of Object.entries(EXPECTED_BOXES)) {
    it(`${name} tiene caja válida dentro del panel`, () => {
      const box = layout[name]?.box;
      assert.ok(isBox(box), `layout.${name}.box debe ser { x, y, w, h }`);
      assert.ok(box.x >= 0 && box.y >= 0, 'la caja empieza dentro del panel');
      assert.ok(box.x + box.w <= PANEL_SIZE && box.y + box.h <= PANEL_SIZE, 'la caja acaba dentro del panel');
    });

    it(`${name} conserva la caja medida`, () => {
      assert.deepStrictEqual(layout[name].box, expected);
    });
  }

  it('no quedan claves del modelo antiguo (flujo + offsets)', () => {
    for (const key of ['offset', 'padding', 'gap', 'externalTreatmentRow']) {
      assert.strictEqual(layout[key], undefined, `layout.${key} ya no existe`);
    }
    for (const name of Object.keys(EXPECTED_BOXES)) {
      assert.strictEqual(layout[name].size, undefined, `layout.${name}.size → box`);
      assert.strictEqual(layout[name].offset, undefined, `layout.${name}.offset → box`);
    }
  });

  describe('Oscilloscope (dentro de su caja)', () => {
    const osc = layout.oscilloscope;

    it('tiene frame con borderRadius y padding', () => {
      assert.ok(osc.frame, 'debe tener frame');
      assert.strictEqual(typeof osc.frame.borderRadius, 'number');
      assert.ok(osc.frame.padding, 'frame debe tener padding');
      assert.strictEqual(typeof osc.frame.padding.top, 'number');
      assert.strictEqual(typeof osc.frame.padding.right, 'number');
      assert.strictEqual(typeof osc.frame.padding.bottom, 'number');
      assert.strictEqual(typeof osc.frame.padding.left, 'number');
    });

    it('tiene display con size (width y height) y offset', () => {
      assert.ok(osc.display, 'debe tener display');
      assert.ok(osc.display.size, 'display debe tener size');
      assert.strictEqual(typeof osc.display.size.width, 'number');
      assert.ok(osc.display.size.width > 0, 'display width debe ser positivo');
      assert.strictEqual(typeof osc.display.size.height, 'number');
      assert.ok(osc.display.size.height > 0, 'display height debe ser positivo');
      assert.ok(osc.display.offset, 'display debe tener offset');
      assert.strictEqual(typeof osc.display.offset.x, 'number');
      assert.strictEqual(typeof osc.display.offset.y, 'number');
    });
  });

  describe('Input Amplifier Level (dentro de su caja)', () => {
    const ial = layout.inputAmplifierLevel;

    it('tiene knobGap numérico', () => {
      assert.strictEqual(typeof ial.knobGap, 'number');
      assert.ok(ial.knobGap >= 0, 'knobGap no puede ser negativo');
    });

    it('tiene knobSize como string o número positivo', () => {
      const t = typeof ial.knobSize;
      assert.ok(t === 'string' || t === 'number', 'knobSize debe ser string o number');
      if (t === 'number') {
        assert.ok(ial.knobSize > 0, 'knobSize numérico debe ser positivo');
      }
    });

    it('tiene knobInnerPct entre 0 y 100', () => {
      assert.strictEqual(typeof ial.knobInnerPct, 'number');
      assert.ok(ial.knobInnerPct > 0 && ial.knobInnerPct <= 100,
        `knobInnerPct debe estar entre 0 y 100, es ${ial.knobInnerPct}`);
    });

    it('tiene knobsRowOffset con x e y numéricos', () => {
      assert.ok(ial.knobsRowOffset, 'debe tener knobsRowOffset');
      assert.strictEqual(typeof ial.knobsRowOffset.x, 'number');
      assert.strictEqual(typeof ial.knobsRowOffset.y, 'number');
    });

    it('tiene knobOffsets de 8 canales con offsets válidos', () => {
      assert.ok(Array.isArray(ial.knobOffsets), 'knobOffsets debe ser array');
      assert.strictEqual(ial.knobOffsets.length, 8,
        `knobOffsets debe tener 8 elementos, tiene ${ial.knobOffsets.length}`);
      ial.knobOffsets.forEach((o, i) => {
        assert.strictEqual(typeof o.x, 'number', `knobOffsets[${i}].x debe ser número`);
        assert.strictEqual(typeof o.y, 'number', `knobOffsets[${i}].y debe ser número`);
      });
    });
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

    it('tiene extTreatmentSend', () => {
      assert.ok('extTreatmentSend' in modules, 'debe tener módulo extTreatmentSend');
      assert.strictEqual(typeof modules.extTreatmentSend, 'object');
    });

    it('tiene extTreatmentReturn', () => {
      assert.ok('extTreatmentReturn' in modules, 'debe tener módulo extTreatmentReturn');
      assert.strictEqual(typeof modules.extTreatmentReturn, 'object');
    });
  });

  it('total de módulos: 2 funcionales + 4 placeholders = 6', () => {
    const keys = Object.keys(modules);
    assert.strictEqual(keys.length, 6, `debe haber 6 módulos, hay ${keys.length}: ${keys.join(', ')}`);
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

  it('NO tiene módulo "externalTreatmentDevices" monolítico (estructura anterior)', () => {
    assert.strictEqual(panel2Blueprint.modules.externalTreatmentDevices, undefined,
      'no debe existir el módulo monolítico "externalTreatmentDevices", usar extTreatmentSend + extTreatmentReturn');
  });

  it('NO tiene módulo "inputAmplifiers" monolítico (estructura v1)', () => {
    assert.strictEqual(panel2Blueprint.modules.inputAmplifiers, undefined,
      'no debe existir el módulo monolítico "inputAmplifiers" de la v1');
  });
});
