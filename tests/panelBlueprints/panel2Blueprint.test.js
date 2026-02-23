/**
 * Tests para el blueprint del Panel 2 (Oscilloscope, Input Amplifier Level & Placeholders)
 * 
 * Verifica la configuración correcta de:
 * - Estructura básica (schemaVersion, panelId, showFrames)
 * - Layout: 5 filas (oscilloscope, frequencyMeter, octaveFilterBank,
 *   inputAmplifierLevel, externalTreatmentRow con Send + Return)
 * - Módulos declarados (2 funcionales + 4 placeholders)
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

  it('tiene offset general con x e y numéricos', () => {
    const offset = panel2Blueprint.layout.offset;
    assert.ok(offset, 'debe tener offset');
    assert.strictEqual(typeof offset.x, 'number', 'offset.x debe ser número');
    assert.strictEqual(typeof offset.y, 'number', 'offset.y debe ser número');
  });

  describe('Sección Oscilloscope', () => {
    const osc = panel2Blueprint.layout.oscilloscope;

    it('existe con size (width y height) numéricos', () => {
      assert.ok(osc, 'debe tener sección oscilloscope');
      assert.ok(osc.size, 'debe tener size');
      assert.strictEqual(typeof osc.size.width, 'number');
      assert.ok(osc.size.width > 0, 'width debe ser positivo');
      assert.strictEqual(typeof osc.size.height, 'number');
      assert.ok(osc.size.height > 0, 'height debe ser positivo');
    });

    it('NO usa flex (tamaño fijo, no relativo)', () => {
      assert.strictEqual(osc.flex, undefined, 'no debe usar flex');
    });

    it('tiene offset con x e y numéricos', () => {
      assert.ok(osc.offset, 'debe tener offset');
      assert.strictEqual(typeof osc.offset.x, 'number', 'offset.x debe ser número');
      assert.strictEqual(typeof osc.offset.y, 'number', 'offset.y debe ser número');
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

    it('existe con size (width y height) numéricos', () => {
      assert.ok(fm, 'debe tener sección frequencyMeter');
      assert.ok(fm.size, 'debe tener size');
      assert.strictEqual(typeof fm.size.width, 'number');
      assert.ok(fm.size.width > 0, 'width debe ser positivo');
      assert.strictEqual(typeof fm.size.height, 'number');
      assert.ok(fm.size.height > 0, 'height debe ser positivo');
    });

    it('tiene offset con x e y numéricos', () => {
      assert.ok(fm.offset, 'debe tener offset');
      assert.strictEqual(typeof fm.offset.x, 'number', 'offset.x debe ser número');
      assert.strictEqual(typeof fm.offset.y, 'number', 'offset.y debe ser número');
    });
  });

  describe('Sección Octave Filter Bank (placeholder)', () => {
    const ofb = panel2Blueprint.layout.octaveFilterBank;

    it('existe con size (width y height) numéricos', () => {
      assert.ok(ofb, 'debe tener sección octaveFilterBank');
      assert.ok(ofb.size, 'debe tener size');
      assert.strictEqual(typeof ofb.size.width, 'number');
      assert.ok(ofb.size.width > 0, 'width debe ser positivo');
      assert.strictEqual(typeof ofb.size.height, 'number');
      assert.ok(ofb.size.height > 0, 'height debe ser positivo');
    });

    it('tiene offset con x e y numéricos', () => {
      assert.ok(ofb.offset, 'debe tener offset');
      assert.strictEqual(typeof ofb.offset.x, 'number', 'offset.x debe ser número');
      assert.strictEqual(typeof ofb.offset.y, 'number', 'offset.y debe ser número');
    });
  });

  describe('Sección Input Amplifier Level', () => {
    const ial = panel2Blueprint.layout.inputAmplifierLevel;

    it('existe con size (width y height) numéricos', () => {
      assert.ok(ial, 'debe tener sección inputAmplifierLevel');
      assert.ok(ial.size, 'debe tener size');
      assert.strictEqual(typeof ial.size.width, 'number');
      assert.ok(ial.size.width > 0, 'width debe ser positivo');
      assert.strictEqual(typeof ial.size.height, 'number');
      assert.ok(ial.size.height > 0, 'height debe ser positivo');
    });

    it('NO usa height auto (tamaño fijo, no relativo)', () => {
      assert.notStrictEqual(ial.height, 'auto', 'no debe usar height auto');
    });

    it('tiene offset general con x e y numéricos', () => {
      assert.ok(ial.offset, 'debe tener offset');
      assert.strictEqual(typeof ial.offset.x, 'number');
      assert.strictEqual(typeof ial.offset.y, 'number');
    });

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

  describe('Sección External Treatment Row (última fila, dos módulos)', () => {
    const row = panel2Blueprint.layout.externalTreatmentRow;

    it('existe con gap numérico', () => {
      assert.ok(row, 'debe tener sección externalTreatmentRow');
      assert.strictEqual(typeof row.gap, 'number', 'gap debe ser número');
      assert.ok(row.gap >= 0, 'gap no puede ser negativo');
    });

    describe('extTreatmentSend', () => {
      const send = row.extTreatmentSend;

      it('existe con size (width y height) numéricos', () => {
        assert.ok(send, 'debe tener extTreatmentSend');
        assert.ok(send.size, 'debe tener size');
        assert.strictEqual(typeof send.size.width, 'number');
        assert.ok(send.size.width > 0, 'width debe ser positivo');
        assert.strictEqual(typeof send.size.height, 'number');
        assert.ok(send.size.height > 0, 'height debe ser positivo');
      });

      it('tiene offset con x e y numéricos', () => {
        assert.ok(send.offset, 'debe tener offset');
        assert.strictEqual(typeof send.offset.x, 'number', 'offset.x debe ser número');
        assert.strictEqual(typeof send.offset.y, 'number', 'offset.y debe ser número');
      });
    });

    describe('extTreatmentReturn', () => {
      const ret = row.extTreatmentReturn;

      it('existe con size (width y height) numéricos', () => {
        assert.ok(ret, 'debe tener extTreatmentReturn');
        assert.ok(ret.size, 'debe tener size');
        assert.strictEqual(typeof ret.size.width, 'number');
        assert.ok(ret.size.width > 0, 'width debe ser positivo');
        assert.strictEqual(typeof ret.size.height, 'number');
        assert.ok(ret.size.height > 0, 'height debe ser positivo');
      });

      it('tiene offset con x e y numéricos', () => {
        assert.ok(ret.offset, 'debe tener offset');
        assert.strictEqual(typeof ret.offset.x, 'number', 'offset.x debe ser número');
        assert.strictEqual(typeof ret.offset.y, 'number', 'offset.y debe ser número');
      });
    });
  });

  it('tiene exactamente 5 filas de módulos en el layout', () => {
    const layoutSections = ['oscilloscope', 'frequencyMeter', 'octaveFilterBank',
      'inputAmplifierLevel', 'externalTreatmentRow'];
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
