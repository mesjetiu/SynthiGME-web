/**
 * Tests para el blueprint del Panel 3 (Oscillators + Noise + Random CV)
 * 
 * Verifica la configuración correcta de:
 * - Estructura básica (schemaVersion, panelId, showFrames)
 * - Cajas absolutas { x, y, w, h } en px del panel: 12 osciladores
 *   (oscillatorSlots[].box) y la fila inferior (layout.noise1/noise2/randomCV)
 * - Defaults visuales de osciladores (oscillatorUI)
 * - Defaults visuales de módulos de ruido (noiseUI) y random CV (randomCVUI)
 * - Slots de osciladores (12 slots, uno por oscilador)
 * - Módulos declarados (noise1, noise2, randomCV)
 * - Separación blueprint/config (ausencia de propiedades de audio)
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel3Blueprint from '../../src/assets/js/panelBlueprints/panel3.blueprint.js';
import { isBox, PANEL_SIZE } from '../../src/assets/js/utils/panelBox.js';

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE ESTRUCTURA BÁSICA
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - Estructura básica', () => {

  it('tiene schemaVersion 2 (cajas absolutas)', () => {
    assert.strictEqual(panel3Blueprint.schemaVersion, 2);
  });

  it('tiene panelId "panel-3"', () => {
    assert.strictEqual(panel3Blueprint.panelId, 'panel-3');
  });

  it('tiene showFrames como booleano', () => {
    assert.strictEqual(typeof panel3Blueprint.showFrames, 'boolean');
  });

  it('tiene layout definido', () => {
    assert.ok(panel3Blueprint.layout, 'debe tener layout');
  });

  it('tiene oscillatorUI definido', () => {
    assert.ok(panel3Blueprint.oscillatorUI, 'debe tener oscillatorUI');
  });

  it('tiene noiseUI definido', () => {
    assert.ok(panel3Blueprint.noiseUI, 'debe tener noiseUI');
  });

  it('tiene randomCVUI definido', () => {
    assert.ok(panel3Blueprint.randomCVUI, 'debe tener randomCVUI');
  });

  it('tiene oscillatorSlots definido', () => {
    assert.ok(Array.isArray(panel3Blueprint.oscillatorSlots), 'oscillatorSlots debe ser array');
  });

  it('tiene modules definido', () => {
    assert.ok(panel3Blueprint.modules, 'debe tener modules');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE LAYOUT - CAJAS ABSOLUTAS
// ─────────────────────────────────────────────────────────────────────────────

// Cajas medidas en la web (tests/visual) al migrar al modelo único de
// coordenadas: con ellas el panel queda donde estaba. Osciladores: dos
// columnas (x 5 y 380) de 375×103, filas a 103,3 px de paso desde 18,3.
const OSC_Y = [18.3, 121.6, 224.9, 328.2, 431.5, 534.8];
const EXPECTED_OSC_BOXES = Array.from({ length: 12 }, (_, i) => ({
  x: i < 6 ? 5 : 380, y: OSC_Y[i % 6], w: 375, h: 103
}));
const EXPECTED_BOTTOM_BOXES = {
  noise1:   { x: 5,     y: 638.1, w: 169.5, h: 110 },
  noise2:   { x: 174.5, y: 638.1, w: 169.5, h: 110 },
  randomCV: { x: 344,   y: 638.1, w: 411,   h: 110 }
};

const insidePanel = box =>
  box.x >= 0 && box.y >= 0 && box.x + box.w <= PANEL_SIZE && box.y + box.h <= PANEL_SIZE;

describe('Panel 3 Blueprint - Layout en cajas absolutas', () => {
  const layout = panel3Blueprint.layout;
  const slots = panel3Blueprint.oscillatorSlots;

  for (let i = 0; i < 12; i++) {
    it(`oscilador ${i + 1} conserva la caja medida`, () => {
      const slot = slots.find(s => s.oscIndex === i);
      assert.ok(slot, `falta el slot de oscIndex ${i}`);
      assert.ok(isBox(slot.box), `oscillatorSlots[${i}].box debe ser { x, y, w, h }`);
      assert.ok(insidePanel(slot.box), 'la caja cabe en el panel');
      assert.deepStrictEqual(slot.box, EXPECTED_OSC_BOXES[i]);
    });
  }

  for (const [name, expected] of Object.entries(EXPECTED_BOTTOM_BOXES)) {
    it(`${name} conserva la caja medida`, () => {
      const box = layout[name]?.box;
      assert.ok(isBox(box), `layout.${name}.box debe ser { x, y, w, h }`);
      assert.ok(insidePanel(box), 'la caja cabe en el panel');
      assert.deepStrictEqual(box, expected);
    });
  }

  it('los módulos no se solapan', () => {
    const boxes = [...slots.map(s => s.box), ...Object.keys(EXPECTED_BOTTOM_BOXES).map(k => layout[k].box)];
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a], B = boxes[b];
        const overlap = A.x < B.x + B.w - 1e-9 && B.x < A.x + A.w - 1e-9 &&
                        A.y < B.y + B.h - 1e-9 && B.y < A.y + A.h - 1e-9;
        assert.ok(!overlap, `se solapan ${JSON.stringify(A)} y ${JSON.stringify(B)}`);
      }
    }
  });

  it('no quedan claves del modelo antiguo (rejilla centrada + fila flex)', () => {
    assert.deepStrictEqual(Object.keys(layout).sort(), ['noise1', 'noise2', 'randomCV']);
    for (const key of ['offset', 'oscillators', 'modulesRow']) {
      assert.strictEqual(layout[key], undefined, `layout.${key} ya no existe`);
    }
    for (const slot of slots) {
      assert.strictEqual(slot.col, undefined, 'slot.col → box');
      assert.strictEqual(slot.row, undefined, 'slot.row → box');
    }
    assert.strictEqual(panel3Blueprint.oscillatorUI.slotOffset, undefined, 'slotOffset → box');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE oscillatorUI (DEFAULTS VISUALES)
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - oscillatorUI', () => {
  const ui = panel3Blueprint.oscillatorUI;

  it('tiene knobSize numérico positivo', () => {
    assert.strictEqual(typeof ui.knobSize, 'number');
    assert.ok(ui.knobSize > 0);
  });

  it('tiene knobInnerPct entre 0 y 100', () => {
    assert.ok(ui.knobInnerPct > 0 && ui.knobInnerPct <= 100);
  });

  it('knobGap es array de 6 elementos (huecos entre 7 knobs)', () => {
    assert.ok(Array.isArray(ui.knobGap), 'knobGap debe ser array');
    assert.strictEqual(ui.knobGap.length, 6,
      `knobGap debe tener 6 elementos (7 knobs - 1), tiene ${ui.knobGap.length}`);
    ui.knobGap.forEach((g, i) => {
      assert.strictEqual(typeof g, 'number', `knobGap[${i}] debe ser número`);
    });
  });

  it('knobOffsets es array de 7 elementos (1 por knob)', () => {
    assert.ok(Array.isArray(ui.knobOffsets), 'knobOffsets debe ser array');
    assert.strictEqual(ui.knobOffsets.length, 7,
      `knobOffsets debe tener 7 elementos, tiene ${ui.knobOffsets.length}`);
  });

  it('tiene knobRowOffsetX y knobRowOffsetY numéricos', () => {
    assert.strictEqual(typeof ui.knobRowOffsetX, 'number');
    assert.strictEqual(typeof ui.knobRowOffsetY, 'number');
  });

  it('tiene switchOffset con leftPercent y topPx', () => {
    assert.ok(ui.switchOffset, 'debe tener switchOffset');
    assert.strictEqual(typeof ui.switchOffset.leftPercent, 'number');
    assert.strictEqual(typeof ui.switchOffset.topPx, 'number');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE noiseUI Y randomCVUI
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - noiseUI', () => {
  const ui = panel3Blueprint.noiseUI;

  it('tiene knobSize numérico positivo', () => {
    assert.ok(ui.knobSize > 0);
  });

  it('knobGap es array (1 hueco para 2 knobs)', () => {
    assert.ok(Array.isArray(ui.knobGap));
    assert.strictEqual(ui.knobGap.length, 1,
      'Noise tiene 2 knobs → 1 hueco');
  });

  it('knobOffsets es array de 2 (1 por knob)', () => {
    assert.ok(Array.isArray(ui.knobOffsets));
    assert.strictEqual(ui.knobOffsets.length, 2);
  });

  it('tiene knobRowOffsetX y knobRowOffsetY', () => {
    assert.strictEqual(typeof ui.knobRowOffsetX, 'number');
    assert.strictEqual(typeof ui.knobRowOffsetY, 'number');
  });

  it('knobTypes es array de 2 con tipos correctos', () => {
    assert.ok(Array.isArray(ui.knobTypes));
    assert.strictEqual(ui.knobTypes.length, 2);
    // Colour es unipolar (0-10), Level también
    assert.strictEqual(ui.knobTypes[0], 'normal', 'Colour debe ser normal (0-10)');
    assert.strictEqual(ui.knobTypes[1], 'normal', 'Level debe ser normal (0-10)');
  });

  it('knobColors es array de 2', () => {
    assert.ok(Array.isArray(ui.knobColors));
    assert.strictEqual(ui.knobColors.length, 2);
  });

  it('padding interior del marco: 4 px a los lados', () => {
    assert.deepStrictEqual(ui.padding, { top: 0, right: 4, bottom: 0, left: 4 });
  });
});

describe('Panel 3 Blueprint - randomCVUI', () => {
  const ui = panel3Blueprint.randomCVUI;

  it('tiene knobSize numérico positivo', () => {
    assert.ok(ui.knobSize > 0);
  });

  it('knobGap es array de 4 (huecos entre 5 knobs)', () => {
    assert.ok(Array.isArray(ui.knobGap));
    assert.strictEqual(ui.knobGap.length, 4,
      'Random CV tiene 5 knobs → 4 huecos');
  });

  it('knobOffsets es array de 5 (1 por knob)', () => {
    assert.ok(Array.isArray(ui.knobOffsets));
    assert.strictEqual(ui.knobOffsets.length, 5);
  });

  it('tiene knobRowOffsetX y knobRowOffsetY', () => {
    assert.strictEqual(typeof ui.knobRowOffsetX, 'number');
    assert.strictEqual(typeof ui.knobRowOffsetY, 'number');
  });

  it('knobTypes es array de 5 con tipos correctos', () => {
    assert.ok(Array.isArray(ui.knobTypes));
    assert.strictEqual(ui.knobTypes.length, 5);
    // Mean, Variance y Key son bipolares (-5 a +5), Voltage 1/2 unipolares (0-10)
    assert.strictEqual(ui.knobTypes[0], 'bipolar', 'Mean debe ser bipolar (-5 a +5)');
    assert.strictEqual(ui.knobTypes[1], 'bipolar', 'Variance debe ser bipolar (-5 a +5)');
    assert.strictEqual(ui.knobTypes[2], 'normal', 'Voltage 1 debe ser normal (0-10)');
    assert.strictEqual(ui.knobTypes[3], 'normal', 'Voltage 2 debe ser normal (0-10)');
    assert.strictEqual(ui.knobTypes[4], 'bipolar', 'Key debe ser bipolar (-5 a +5)');
  });

  it('knobColors es array de 5', () => {
    assert.ok(Array.isArray(ui.knobColors));
    assert.strictEqual(ui.knobColors.length, 5);
  });

  it('padding interior del marco: 4 px a los lados', () => {
    assert.deepStrictEqual(ui.padding, { top: 0, right: 4, bottom: 0, left: 4 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE SLOTS DE OSCILADORES
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - oscillatorSlots', () => {
  const slots = panel3Blueprint.oscillatorSlots;

  it('tiene 12 slots (osciladores 1-12)', () => {
    assert.strictEqual(slots.length, 12);
  });

  it('cada slot tiene oscIndex y caja', () => {
    slots.forEach((slot, i) => {
      assert.strictEqual(typeof slot.oscIndex, 'number', `slot[${i}].oscIndex debe ser número`);
      assert.ok(isBox(slot.box), `slot[${i}].box debe ser { x, y, w, h }`);
    });
  });

  it('oscIndex cubre 0-11 sin repetir', () => {
    const indices = slots.map(s => s.oscIndex).sort((a, b) => a - b);
    assert.deepStrictEqual(indices, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('distribución: 1-6 a la izquierda, 7-12 a la derecha, de arriba abajo', () => {
    const left = slots.filter(s => s.box.x < 380).sort((a, b) => a.box.y - b.box.y);
    const right = slots.filter(s => s.box.x >= 380).sort((a, b) => a.box.y - b.box.y);
    assert.deepStrictEqual(left.map(s => s.oscIndex), [0, 1, 2, 3, 4, 5], 'izquierda: osciladores 1-6');
    assert.deepStrictEqual(right.map(s => s.oscIndex), [6, 7, 8, 9, 10, 11], 'derecha: osciladores 7-12');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE MÓDULOS
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - Módulos', () => {
  const modules = panel3Blueprint.modules;

  it('tiene noise1', () => {
    assert.ok('noise1' in modules, 'debe tener módulo noise1');
  });

  it('tiene noise2', () => {
    assert.ok('noise2' in modules, 'debe tener módulo noise2');
  });

  it('tiene randomCV', () => {
    assert.ok('randomCV' in modules, 'debe tener módulo randomCV');
  });

  it('tiene exactamente 3 módulos', () => {
    const keys = Object.keys(modules);
    assert.strictEqual(keys.length, 3,
      `debe haber 3 módulos, hay ${keys.length}: ${keys.join(', ')}`);
  });

  it('cada módulo es un objeto (puede tener ui overrides)', () => {
    for (const [key, mod] of Object.entries(modules)) {
      assert.strictEqual(typeof mod, 'object', `modules.${key} debe ser objeto`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE SEPARACIÓN BLUEPRINT / CONFIG
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - Separación blueprint/config', () => {

  it('NO tiene sources ni destinations (no es matrix blueprint)', () => {
    assert.strictEqual(panel3Blueprint.sources, undefined);
    assert.strictEqual(panel3Blueprint.destinations, undefined);
  });

  it('NO tiene grid (eso es de matrix blueprints)', () => {
    assert.strictEqual(panel3Blueprint.grid, undefined);
  });

  it('NO tiene matrixId (no es matrix blueprint)', () => {
    assert.strictEqual(panel3Blueprint.matrixId, undefined);
  });

  it('NO tiene routing', () => {
    assert.strictEqual(panel3Blueprint.routing, undefined);
  });

  it('NO tiene parámetros de audio en oscillatorUI', () => {
    const ui = panel3Blueprint.oscillatorUI;
    // Estos pertenecen a oscillator.config.js
    assert.strictEqual(ui.frequency, undefined, 'no debe tener frequency');
    assert.strictEqual(ui.range, undefined, 'no debe tener range');
    assert.strictEqual(ui.waveform, undefined, 'no debe tener waveform');
  });

  it('NO tiene matrixMapping (eliminado en refactoring)', () => {
    assert.strictEqual(panel3Blueprint.matrixMapping, undefined);
  });
});
