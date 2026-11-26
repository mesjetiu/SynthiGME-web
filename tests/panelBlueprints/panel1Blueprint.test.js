/**
 * Tests para el blueprint del Panel 1 (Filters, Envelope Shapers,
 * Ring Modulators, Reverb & Echo — todos placeholders con knobs)
 * 
 * Verifica la configuración correcta de:
 * - Estructura básica (schemaVersion, panelId, showFrames)
 * - Layout: una caja absoluta por módulo, en px del panel, y que no vuelve
 *   la columna flex anterior (offset, padding, filas con alto y gap)
 * - Módulos declarados (16 placeholders: 8 filtros + 3 envelopes + 3 RM + reverb + echo)
 * - Definición de knobs por tipo de módulo
 * - Separación blueprint/config (ausencia de propiedades de audio, controls, matrixMapping)
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel1Blueprint from '../../src/assets/js/panelBlueprints/panel1.blueprint.js';
import { isBox, PANEL_SIZE } from '../../src/assets/js/utils/panelBox.js';

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE ESTRUCTURA BÁSICA
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 1 Blueprint - Estructura básica', () => {

  it('tiene schemaVersion 2', () => {
    assert.strictEqual(panel1Blueprint.schemaVersion, 2);
  });

  it('tiene panelId "panel-1"', () => {
    assert.strictEqual(panel1Blueprint.panelId, 'panel-1');
  });

  it('tiene showFrames como booleano', () => {
    assert.strictEqual(typeof panel1Blueprint.showFrames, 'boolean');
  });

  it('tiene layout definido', () => {
    assert.ok(panel1Blueprint.layout, 'debe tener layout');
    assert.ok(typeof panel1Blueprint.layout === 'object', 'layout debe ser objeto');
  });

  it('tiene modules definido', () => {
    assert.ok(panel1Blueprint.modules, 'debe tener modules');
    assert.ok(typeof panel1Blueprint.modules === 'object', 'modules debe ser objeto');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE LAYOUT: UNA CAJA ABSOLUTA POR MÓDULO
// ─────────────────────────────────────────────────────────────────────────────

const layout = panel1Blueprint.layout;

/** Las 16 cajas medidas, por id de módulo (migración sin cambio visible) */
const MEASURED = {
  flp1: { x: 5, y: 48, w: 92, h: 290 },
  flp2: { x: 99, y: 48, w: 92, h: 290 },
  flp3: { x: 193, y: 48, w: 92, h: 290 },
  flp4: { x: 287, y: 48, w: 92, h: 290 },
  fhp1: { x: 381, y: 48, w: 92, h: 290 },
  fhp2: { x: 475, y: 48, w: 92, h: 290 },
  fhp3: { x: 569, y: 48, w: 92, h: 290 },
  fhp4: { x: 663, y: 48, w: 92, h: 290 },
  envelopeShaper1: { x: 5, y: 340, w: 750, h: 100 },
  envelopeShaper2: { x: 5, y: 442, w: 750, h: 100 },
  envelopeShaper3: { x: 5, y: 544, w: 750, h: 100 },
  ringModulator1: { x: 5, y: 646, w: 107, h: 100 },
  ringModulator2: { x: 113, y: 646, w: 107, h: 100 },
  ringModulator3: { x: 221, y: 646, w: 107, h: 100 },
  reverberation1: { x: 329, y: 646, w: 143, h: 100 },
  echoADL: { x: 473, y: 646, w: 282, h: 100 }
};

/** Caja de cada módulo tal como la lee el ensamblador */
function boxesById() {
  return {
    ...layout.filters.boxes,
    ...layout.envelopeShapers.boxes,
    ...layout.ringModulators.boxes,
    reverberation1: layout.reverberation.box,
    echoADL: layout.echo.box
  };
}

describe('Panel 1 Blueprint - Layout en cajas absolutas', () => {
  const boxes = boxesById();

  it('hay una caja por módulo declarado, y ninguna más', () => {
    assert.deepStrictEqual(Object.keys(boxes).sort(), Object.keys(panel1Blueprint.modules).sort());
  });

  for (const [id, measured] of Object.entries(MEASURED)) {
    it(`${id} tiene caja válida dentro del panel`, () => {
      const b = boxes[id];
      assert.ok(isBox(b), `${id}: caja inválida`);
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= PANEL_SIZE && b.y + b.h <= PANEL_SIZE,
        `${id}: se sale del panel`);
    });
    it(`${id} conserva la caja medida`, () => {
      assert.deepStrictEqual(boxes[id], measured);
    });
  }

  it('las cajas caen en la rejilla de 1/64 px (van en left/top, sin remuestrear)', () => {
    for (const [id, b] of Object.entries(boxes)) {
      for (const k of ['x', 'y', 'w', 'h']) {
        assert.ok(Number.isInteger(b[k] * 64), `${id}.${k} = ${b[k]}`);
      }
    }
  });

  it('ninguna caja se solapa con otra', () => {
    const list = Object.entries(boxes);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [ia, a] = list[i], [ib, b] = list[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!overlap, `${ia} y ${ib} se solapan`);
      }
    }
  });

  it('no quedan claves de la columna flex antigua', () => {
    for (const k of ['offset', 'padding', 'gap', 'filtersRow', 'bottomRow']) {
      assert.strictEqual(layout[k], undefined, `layout.${k}`);
    }
    for (const name of ['filters', 'envelopeShapers', 'ringModulators', 'reverberation', 'echo']) {
      for (const k of ['height', 'width', 'gap', 'offset', 'count', 'knobDirection']) {
        assert.strictEqual(layout[name][k], undefined, `layout.${name}.${k}`);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE MANDOS
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 1 Blueprint - Mandos', () => {
  const cases = [
    ['filters', ['Frequency', 'Response', 'Level']],
    ['envelopeShapers', ['Mode', 'Delay', 'Attack', 'Decay', 'Sustain', 'Release', 'Env Level', 'Sig Level']],
    ['ringModulators', ['Level']],
    ['reverberation', ['Mix', 'Level']],
    ['echo', ['Delay', 'Mix', 'Feedback', 'Level']]
  ];
  for (const [name, knobs] of cases) {
    it(`${name}: mandos ${knobs.join(', ')}`, () => {
      const s = layout[name];
      assert.deepStrictEqual(s.knobs, knobs);
      assert.strictEqual(s.knobColors.length, knobs.length);
      assert.strictEqual(s.knobTypes.length, knobs.length);
      assert.strictEqual(typeof s.knobSize, 'number');
      assert.ok(s.knobInnerPct > 0 && s.knobInnerPct <= 100);
      assert.ok(s.knobGap >= 0);
      assert.strictEqual(typeof s.knobsOffset.x, 'number');
      assert.strictEqual(typeof s.knobsOffset.y, 'number');
    });
  }

  it('envelope shapers: gate y LED en px dentro del marco', () => {
    const es = layout.envelopeShapers;
    for (const k of ['gateOffset', 'ledOffset']) {
      assert.strictEqual(typeof es[k].x, 'number', `${k}.x`);
      assert.strictEqual(typeof es[k].y, 'number', `${k}.y`);
    }
    assert.ok(es.gateSize > 0);
    assert.ok(es.ledSize > 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE MÓDULOS
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 1 Blueprint - Módulos', () => {
  const modules = panel1Blueprint.modules;

  describe('Filtros paso bajo (FLP)', () => {
    for (let i = 1; i <= 4; i++) {
      it(`tiene flp${i}`, () => {
        assert.ok(`flp${i}` in modules, `debe tener módulo flp${i}`);
        assert.strictEqual(typeof modules[`flp${i}`], 'object');
      });
    }
  });

  describe('Filtros paso alto (FHP)', () => {
    for (let i = 1; i <= 4; i++) {
      it(`tiene fhp${i}`, () => {
        assert.ok(`fhp${i}` in modules, `debe tener módulo fhp${i}`);
        assert.strictEqual(typeof modules[`fhp${i}`], 'object');
      });
    }
  });

  describe('Envelope Shapers', () => {
    for (let i = 1; i <= 3; i++) {
      it(`tiene envelopeShaper${i}`, () => {
        assert.ok(`envelopeShaper${i}` in modules, `debe tener módulo envelopeShaper${i}`);
        assert.strictEqual(typeof modules[`envelopeShaper${i}`], 'object');
      });
    }
  });

  describe('Ring Modulators', () => {
    for (let i = 1; i <= 3; i++) {
      it(`tiene ringModulator${i}`, () => {
        assert.ok(`ringModulator${i}` in modules, `debe tener módulo ringModulator${i}`);
        assert.strictEqual(typeof modules[`ringModulator${i}`], 'object');
      });
    }
  });

  it('tiene reverberation1', () => {
    assert.ok('reverberation1' in modules, 'debe tener módulo reverberation1');
    assert.strictEqual(typeof modules.reverberation1, 'object');
  });

  it('tiene echoADL', () => {
    assert.ok('echoADL' in modules, 'debe tener módulo echoADL');
    assert.strictEqual(typeof modules.echoADL, 'object');
  });

  it('total de módulos: 8 filtros + 3 envelopes + 3 RM + 1 reverb + 1 echo = 16', () => {
    const keys = Object.keys(modules);
    assert.strictEqual(keys.length, 16,
      `debe haber 16 módulos, hay ${keys.length}: ${keys.join(', ')}`);
  });

  it('todos los módulos son placeholders (solo pueden tener visible)', () => {
    for (const [key, mod] of Object.entries(modules)) {
      const keys = Object.keys(mod).filter(k => k !== 'visible');
      assert.strictEqual(keys.length, 0,
        `modules.${key} solo puede tener la propiedad visible, tiene: ${keys.join(', ')}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE SEPARACIÓN BLUEPRINT / CONFIG
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 1 Blueprint - Separación blueprint/config', () => {

  it('NO tiene matrixMapping (pertenece a panel5/panel6 blueprints)', () => {
    assert.strictEqual(panel1Blueprint.matrixMapping, undefined);
  });

  it('NO tiene routing (pertenece al config)', () => {
    assert.strictEqual(panel1Blueprint.routing, undefined);
  });

  it('NO tiene sources ni destinations (no es un matrix blueprint)', () => {
    assert.strictEqual(panel1Blueprint.sources, undefined);
    assert.strictEqual(panel1Blueprint.destinations, undefined);
  });

  it('NO tiene grid (eso es de matrix blueprints)', () => {
    assert.strictEqual(panel1Blueprint.grid, undefined);
  });

  it('NO tiene matrixId (no es un matrix blueprint)', () => {
    assert.strictEqual(panel1Blueprint.matrixId, undefined);
  });

  it('ningún módulo tiene controls array (pertenece al config)', () => {
    for (const [key, mod] of Object.entries(panel1Blueprint.modules)) {
      assert.strictEqual(mod.controls, undefined,
        `modules.${key} no debe tener controls`);
    }
  });

  it('ningún módulo tiene channels (pertenece al config)', () => {
    for (const [key, mod] of Object.entries(panel1Blueprint.modules)) {
      assert.strictEqual(mod.channels, undefined,
        `modules.${key} no debe tener channels`);
    }
  });

  it('ningún módulo tiene id (se define en el código de rendering)', () => {
    for (const [key, mod] of Object.entries(panel1Blueprint.modules)) {
      assert.strictEqual(mod.id, undefined,
        `modules.${key} no debe tener id`);
    }
  });

  it('ningún módulo tiene title (se define en el código de rendering)', () => {
    for (const [key, mod] of Object.entries(panel1Blueprint.modules)) {
      assert.strictEqual(mod.title, undefined,
        `modules.${key} no debe tener title`);
    }
  });

  it('ningún módulo tiene type (se infiere del nombre del módulo)', () => {
    for (const [key, mod] of Object.entries(panel1Blueprint.modules)) {
      assert.strictEqual(mod.type, undefined,
        `modules.${key} no debe tener type`);
    }
  });

  it('ningún módulo tiene section (la asociación es implícita por nombre)', () => {
    for (const [key, mod] of Object.entries(panel1Blueprint.modules)) {
      assert.strictEqual(mod.section, undefined,
        `modules.${key} no debe tener section`);
    }
  });

  it('ningún módulo tiene frame (movido a layout.*)', () => {
    for (const [key, mod] of Object.entries(panel1Blueprint.modules)) {
      assert.strictEqual(mod.frame, undefined,
        `modules.${key} no debe tener frame (movido a layout)`);
    }
  });

  it('NO tiene layout.sections (estructura v1)', () => {
    assert.strictEqual(panel1Blueprint.layout.sections, undefined,
      'no debe existir layout.sections de la v1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE COHERENCIA
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 1 Blueprint - Coherencia layout/modules', () => {

  it('los 8 filtros del layout corresponden a 8 módulos (flp1-4 + fhp1-4)', () => {
    const filterModules = Object.keys(panel1Blueprint.modules)
      .filter(k => k.startsWith('flp') || k.startsWith('fhp'));
    assert.strictEqual(filterModules.length, 8);
    assert.deepStrictEqual(Object.keys(layout.filters.boxes).sort(), filterModules.sort());
  });

  it('total de knobs en el panel: 8×3 + 3×8 + 3×1 + 1×2 + 1×4 = 57', () => {
    const n = name => Object.keys(layout[name].boxes ?? { one: 1 }).length * layout[name].knobs.length;
    const total = n('filters') + n('envelopeShapers') + n('ringModulators') + n('reverberation') + n('echo');
    assert.strictEqual(total, 57, `total de knobs debe ser 57, calculado ${total}`);
  });
});
