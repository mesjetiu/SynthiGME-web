/**
 * Tests para el blueprint del Panel 4 (voltímetros, Event Time, teclados,
 * secuenciador, slew limiters…)
 *
 * Verifica:
 * - Estructura básica (schemaVersion, panelId, showFrames)
 * - Layout: una caja absoluta por módulo, en px del panel, y que no vuelve
 *   el árbol flex anterior (padding, gap, logoArea, voltmetersRow…)
 * - Mandos de cada módulo (el montaje los cablea por índice y por nombre)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel4Blueprint from '../../src/assets/js/panelBlueprints/panel4.blueprint.js';
import { isBox, PANEL_SIZE } from '../../src/assets/js/utils/panelBox.js';

const layout = panel4Blueprint.layout;

describe('Panel 4 Blueprint - Estructura básica', () => {
  it('tiene schemaVersion 2', () => {
    assert.strictEqual(panel4Blueprint.schemaVersion, 2);
  });

  it('tiene panelId "panel-4"', () => {
    assert.strictEqual(panel4Blueprint.panelId, 'panel-4');
  });

  it('tiene showFrames como booleano', () => {
    assert.strictEqual(typeof panel4Blueprint.showFrames, 'boolean');
  });

  it('el voltímetro no enseña el recuadro de depuración', () => {
    assert.strictEqual(layout.voltmeter.window.debugBorder, false);
  });
});

describe('Panel 4 Blueprint - Layout en cajas absolutas', () => {
  // Cajas medidas en la web (tests/visual) al migrar al modelo único de
  // coordenadas: con ellas el panel queda idéntico a como estaba con el
  // árbol flex. Todas caen en la rejilla de 1/64 px.
  const EXPECTED_BOXES = {
    sequencerEventTime:    { x: 10, y: 242.40625, w: 740, h: 80 },
    pitchVoltageConverter: { x: 10, y: 326.40625, w: 103.859375, h: 140.53125 },
    envelopeFollower1:     { x: 10, y: 468.9375, w: 103.859375, h: 140.53125 },
    envelopeFollower2:     { x: 10, y: 611.46875, w: 103.859375, h: 140.53125 },
    upperKeyboard:         { x: 116.859375, y: 326.40625, w: 105.859375, h: 425.59375 },
    lowerKeyboard:         { x: 225.71875, y: 326.40625, w: 105.859375, h: 425.59375 },
    seqOutputRangeL1:      { x: 334.578125, y: 326.40625, w: 102.09375, h: 329.59375 },
    seqOutputRangeL2:      { x: 439.671875, y: 326.40625, w: 102.109375, h: 329.59375 },
    seqOutputRangeL3:      { x: 544.78125, y: 326.40625, w: 102.109375, h: 329.59375 },
    invertorBuffer:        { x: 649.890625, y: 326.40625, w: 100.109375, h: 217.734375 },
    key4:                  { x: 649.890625, y: 546.140625, w: 100.109375, h: 109.859375 },
    slewLimiter1:          { x: 334.578125, y: 659, w: 101.59375, h: 93 },
    slewLimiter2:          { x: 439.171875, y: 659, w: 101.609375, h: 93 },
    slewLimiter3:          { x: 543.78125, y: 659, w: 101.609375, h: 93 },
    option1:               { x: 648.390625, y: 659, w: 101.609375, h: 93 }
  };
  // Voltímetros: 89,875 px de ancho, uno cada 92,875
  const EXPECTED_VOLTMETER_BOXES = Array.from({ length: 8 }, (_, n) => (
    { x: 10 + n * 92.875, y: 118.40625, w: 89.875, h: 120 }
  ));

  const assertInsidePanel = (box, name) => {
    assert.ok(isBox(box), `${name} debe ser { x, y, w, h }`);
    assert.ok(box.x >= 0 && box.y >= 0, `${name} empieza dentro del panel`);
    assert.ok(box.x + box.w <= PANEL_SIZE && box.y + box.h <= PANEL_SIZE, `${name} acaba dentro del panel`);
  };

  for (const [name, expected] of Object.entries(EXPECTED_BOXES)) {
    it(`${name} tiene caja válida dentro del panel`, () => {
      assertInsidePanel(layout[name]?.box, `layout.${name}.box`);
    });

    it(`${name} conserva la caja medida`, () => {
      assert.deepStrictEqual(layout[name].box, expected);
    });
  }

  it('los 8 voltímetros tienen caja válida y conservan la medida', () => {
    const boxes = layout.voltmeters?.boxes;
    assert.ok(Array.isArray(boxes), 'layout.voltmeters.boxes debe ser array');
    assert.strictEqual(boxes.length, 8);
    boxes.forEach((box, i) => assertInsidePanel(box, `voltmeters.boxes[${i}]`));
    assert.deepStrictEqual(boxes, EXPECTED_VOLTMETER_BOXES);
  });

  it('las cajas caen en la rejilla de 1/64 px (van en left/top, sin remuestrear)', () => {
    const all = [...Object.keys(EXPECTED_BOXES).map(n => layout[n].box), ...layout.voltmeters.boxes];
    for (const box of all) {
      assert.ok(Number.isInteger(box.x * 64) && Number.isInteger(box.y * 64), JSON.stringify(box));
    }
  });

  it('ninguna caja se solapa con otra', () => {
    const all = [
      ...Object.entries(EXPECTED_BOXES).map(([n]) => [n, layout[n].box]),
      ...layout.voltmeters.boxes.map((b, i) => [`voltmeter${i + 1}`, b])
    ];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const [na, a] = all[i], [nb, b] = all[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!overlap, `${na} y ${nb} se solapan`);
      }
    }
  });

  it('no quedan claves del árbol flex antiguo', () => {
    for (const key of ['offset', 'padding', 'gap', 'logoArea', 'voltmetersRow', 'keyboardOutputRange']) {
      assert.strictEqual(layout[key], undefined, `layout.${key} ya no existe`);
    }
    for (const name of Object.keys(EXPECTED_BOXES)) {
      for (const key of ['offset', 'flex', 'height', 'id']) {
        assert.strictEqual(layout[name][key], undefined, `layout.${name}.${key} → box`);
      }
    }
  });
});

describe('Panel 4 Blueprint - Mandos', () => {
  it('los teclados: Pitch (vernier), Key Velocity, Env. Control, en ese orden', () => {
    // El montaje los cablea por índice: cambiar el orden rompe el audio.
    for (const id of ['upperKeyboard', 'lowerKeyboard']) {
      assert.deepStrictEqual(layout[id].knobs.map(k => [k.name, k.type]), [
        ['Pitch', 'vernier'], ['Key Velocity', 'bipolar'], ['Env. Control', 'bipolar']
      ]);
      assert.strictEqual(layout[id].switches[0].type, 'rotarySwitch');
    }
  });

  it('el secuenciador: los nombres por los que se enlazan sus mandos', () => {
    const names = ['seqOutputRangeL1', 'seqOutputRangeL2', 'seqOutputRangeL3', 'key4']
      .flatMap(id => layout[id].knobs.map(k => k.name));
    assert.deepStrictEqual(names, [
      'Voltage A', 'Voltage B', 'Key 1', 'Voltage C', 'Voltage D', 'Key 2',
      'Voltage E', 'Voltage F', 'Key 3', 'Key 4'
    ]);
  });

  it('el PVC tiene su vernier Range', () => {
    assert.deepStrictEqual(layout.pitchVoltageConverter.knobs, [{ name: 'Range', type: 'vernier' }]);
  });

  it('slew limiters y Option 1: un mando cada uno', () => {
    for (const id of ['slewLimiter1', 'slewLimiter2', 'slewLimiter3', 'option1']) {
      assert.strictEqual(layout[id].knobs.length, 1, id);
    }
  });
});
