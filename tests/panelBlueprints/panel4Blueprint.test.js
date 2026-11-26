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

  it('los marcos de los módulos no se ven (ya están en la foto)', () => {
    assert.strictEqual(panel4Blueprint.showFrames, false);
  });
});

describe('Panel 4 Blueprint - Layout en cajas absolutas', () => {
  // Cajas medidas sobre la foto (panel_4.jpg): los marcos serigrafiados,
  // por el centro de sus líneas, redondeados a 0,25 px (rejilla de 1/64).
  const EXPECTED_BOXES = {
    sequencerEventTime:    { x: 293.25, y: 299.5, w: 166.75, h: 56 },
    pitchVoltageConverter: { x: 48.5, y: 367, w: 94.25, h: 125.25 },
    envelopeFollower1:     { x: 48.5, y: 492.25, w: 94.25, h: 125.5 },
    envelopeFollower2:     { x: 48.5, y: 617.75, w: 94.25, h: 128.25 },
    upperKeyboard:         { x: 142.75, y: 379.25, w: 94, h: 366.75 },
    lowerKeyboard:         { x: 236.75, y: 379.25, w: 94, h: 366.75 },
    seqOutputRangeL1:      { x: 330.75, y: 379.25, w: 95, h: 265.5 },
    seqOutputRangeL2:      { x: 425.75, y: 379.25, w: 93.5, h: 265.5 },
    seqOutputRangeL3:      { x: 519.25, y: 379.25, w: 93.75, h: 265.5 },
    invertorBuffer:        { x: 613, y: 367, w: 94.5, h: 188.75 },
    key4:                  { x: 613, y: 555.75, w: 94.5, h: 89 },
    slewLimiter1:          { x: 330.75, y: 644.75, w: 95, h: 101.25 },
    slewLimiter2:          { x: 425.75, y: 644.75, w: 93.5, h: 101.25 },
    slewLimiter3:          { x: 519.25, y: 644.75, w: 93.75, h: 101.25 },
    option1:               { x: 613, y: 644.75, w: 94.5, h: 101.25 }
  };
  // Voltímetros: entre las líneas verticales de la serigrafía
  const EXPECTED_VOLTMETER_BOXES = [
    { x: 45.75, y: 179, w: 82.75, h: 120.25 },
    { x: 128.5, y: 179, w: 82.75, h: 120.25 },
    { x: 211.25, y: 179, w: 83, h: 120.25 },
    { x: 294.25, y: 179, w: 82.75, h: 120.25 },
    { x: 377, y: 179, w: 82, h: 120.25 },
    { x: 459, y: 179, w: 83.25, h: 120.25 },
    { x: 542.25, y: 179, w: 83.5, h: 120.25 },
    { x: 625.75, y: 179, w: 82.25, h: 120.25 }
  ];

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

  it('cada mando tiene su centro { x, y } dentro de la caja de su módulo', () => {
    for (const name of Object.keys(EXPECTED_BOXES)) {
      const { box, knobs = [], switches = [] } = layout[name];
      for (const c of [...knobs, ...switches]) {
        const label = `${name} / ${c.name ?? c.type}`;
        assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), `${label}: falta { x, y }`);
        assert.ok(c.x > 0 && c.x < box.w && c.y > 0 && c.y < box.h, `${label}: fuera de la caja`);
      }
    }
  });

  it('los mandos de una misma fila de la foto están a la misma altura', () => {
    // Pitch / Voltage A·C·E, Key Velocity / Voltage B·D·F, Env. Control / Key 1·2·3
    const ys = id => layout[id].knobs.map(k => layout[id].box.y + k.y);
    const ref = ys('upperKeyboard');
    for (const id of ['lowerKeyboard', 'seqOutputRangeL1', 'seqOutputRangeL2', 'seqOutputRangeL3']) {
      assert.deepStrictEqual(ys(id), ref, id);
    }
  });

  it('no quedan claves del árbol flex antiguo', () => {
    for (const key of ['offset', 'padding', 'gap', 'logoArea', 'voltmetersRow', 'keyboardOutputRange']) {
      assert.strictEqual(layout[key], undefined, `layout.${key} ya no existe`);
    }
    for (const name of Object.keys(EXPECTED_BOXES)) {
      for (const key of ['offset', 'flex', 'height', 'id', 'knobGap', 'switchGap']) {
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

  it('el Invertor/Buffer: Gain y Offset, los dos con capuchón azul (como en la foto)', () => {
    const knobs = panel4Blueprint.layout.invertorBuffer.knobs;
    assert.deepStrictEqual(knobs.map(k => [k.name, k.color]), [['Gain', 'blue'], ['Offset', 'blue']]);
  });

  it('el PVC tiene su vernier Range', () => {
    assert.deepStrictEqual(layout.pitchVoltageConverter.knobs.map(k => [k.name, k.type]), [['Range', 'vernier']]);
  });

  it('slew limiters y Option 1: un mando cada uno', () => {
    for (const id of ['slewLimiter1', 'slewLimiter2', 'slewLimiter3', 'option1']) {
      assert.strictEqual(layout[id].knobs.length, 1, id);
    }
  });
});
