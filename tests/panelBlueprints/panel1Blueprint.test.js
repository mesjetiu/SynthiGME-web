/**
 * Tests para el blueprint del Panel 1 (Filters, Envelope Shapers,
 * Ring Modulators, Reverb & Echo — todos placeholders con knobs)
 * 
 * Verifica la configuración correcta de:
 * - Estructura básica (schemaVersion, panelId, showFrames)
 * - Layout: una caja absoluta por módulo, en px del panel, medida sobre la
 *   foto, y cada mando con su centro relativo a la caja; que no vuelve la
 *   columna flex anterior (offset, padding, filas con alto y gap)
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

/** Las 16 cajas medidas sobre panel_1.jpg (marcos serigrafiados) */
const MEASURED = {
  flp1: { x: 6.25, y: 50, w: 93, h: 287.25 },
  flp2: { x: 99.25, y: 50.75, w: 93.25, h: 287.25 },
  flp3: { x: 192.5, y: 51.5, w: 94, h: 287 },
  flp4: { x: 286.5, y: 52, w: 93.5, h: 287 },
  fhp1: { x: 380, y: 52.75, w: 93, h: 286.25 },
  fhp2: { x: 473, y: 53.5, w: 93.5, h: 285.5 },
  fhp3: { x: 566.5, y: 54, w: 93.5, h: 285 },
  fhp4: { x: 660, y: 54.75, w: 94.25, h: 284.25 },
  envelopeShaper1: { x: 5, y: 339, w: 749.5, h: 102.5 },
  envelopeShaper2: { x: 5, y: 441.5, w: 749.5, h: 102.5 },
  envelopeShaper3: { x: 5, y: 544, w: 749.5, h: 102 },
  ringModulator1: { x: 4, y: 646, w: 108, h: 101.75 },
  ringModulator2: { x: 112, y: 646, w: 107.5, h: 102 },
  ringModulator3: { x: 219.5, y: 646.5, w: 108, h: 102 },
  reverberation1: { x: 327.5, y: 646.75, w: 146.5, h: 102.25 },
  echoADL: { x: 474, y: 647, w: 280.5, h: 102.25 }
};

/** Secciones del layout y sus módulos */
const SECTIONS = {
  filters: ['flp1', 'flp2', 'flp3', 'flp4', 'fhp1', 'fhp2', 'fhp3', 'fhp4'],
  envelopeShapers: ['envelopeShaper1', 'envelopeShaper2', 'envelopeShaper3'],
  ringModulators: ['ringModulator1', 'ringModulator2', 'ringModulator3'],
  reverberation: ['reverberation1'],
  echo: ['echoADL']
};

/** Claves de los mandos de cada sección (las que lee el montaje) */
const CONTROL_KEYS = {
  filters: ['frequency', 'response', 'level'],
  envelopeShapers: ['mode', 'delay', 'attack', 'decay', 'sustain', 'release',
    'envelopeLevel', 'signalLevel', 'gate', 'led'],
  ringModulators: ['level'],
  reverberation: ['mix', 'level'],
  echo: ['delay', 'mix', 'feedback', 'level']
};

/** Caja y centros de un módulo, tal como los lee el ensamblador */
function moduleLayout(section, id) {
  const s = layout[section];
  return s.modules ? s.modules[id] : { box: s.box, centers: s.centers };
}

function boxesById() {
  const out = {};
  for (const [section, ids] of Object.entries(SECTIONS)) {
    for (const id of ids) out[id] = moduleLayout(section, id)?.box;
  }
  return out;
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

  it('no quedan claves de la columna flex antigua ni del reparto con flex', () => {
    for (const k of ['offset', 'padding', 'gap', 'filtersRow', 'bottomRow']) {
      assert.strictEqual(layout[k], undefined, `layout.${k}`);
    }
    for (const name of Object.keys(SECTIONS)) {
      for (const k of ['height', 'width', 'gap', 'offset', 'count', 'knobDirection', 'boxes',
        'knobGap', 'knobsOffset', 'gateOffset', 'ledOffset']) {
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
      assert.strictEqual(s.knobSize, 65);
      assert.ok(s.knobInnerPct > 0 && s.knobInnerPct <= 100);
    });
  }

  for (const [section, ids] of Object.entries(SECTIONS)) {
    for (const id of ids) {
      it(`${id}: cada mando con su centro dentro de la caja, en la rejilla de 1/4 px`, () => {
        const { box, centers } = moduleLayout(section, id);
        assert.deepStrictEqual(Object.keys(centers).sort(), [...CONTROL_KEYS[section]].sort());
        for (const [key, c] of Object.entries(centers)) {
          assert.ok(c.x > 0 && c.x < box.w && c.y > 0 && c.y < box.h, `${id}.${key} fuera de la caja`);
          assert.ok(Number.isInteger(c.x * 4) && Number.isInteger(c.y * 4), `${id}.${key}`);
        }
      });
    }
  }

  it('filtros: los tres mandos en el eje de la columna y en el mismo sitio en los ocho', () => {
    for (const id of SECTIONS.filters) {
      const { centers } = moduleLayout('filters', id);
      for (const key of CONTROL_KEYS.filters) {
        assert.ok(Math.abs(centers[key].x - 47) <= 1.25, `${id}.${key}.x = ${centers[key].x}`);
      }
      assert.ok(Math.abs(centers.frequency.y - 71) <= 1.5, `${id} frequency.y`);
      assert.ok(Math.abs(centers.response.y - 157) <= 1.5, `${id} response.y`);
      assert.ok(Math.abs(centers.level.y - 243) <= 1.5, `${id} level.y`);
    }
  });

  it('envolventes: los mandos en fila, a ~93,5 px uno de otro, igual en las tres', () => {
    const keys = ['delay', 'attack', 'decay', 'sustain', 'release', 'envelopeLevel', 'signalLevel'];
    for (const id of SECTIONS.envelopeShapers) {
      const { centers } = moduleLayout('envelopeShapers', id);
      for (let i = 1; i < keys.length; i++) {
        const dx = centers[keys[i]].x - centers[keys[i - 1]].x;
        assert.ok(Math.abs(dx - 93.5) <= 1.5, `${id}: ${keys[i - 1]}→${keys[i]} ${dx}`);
      }
      for (const k of keys) assert.ok(Math.abs(centers[k].y - 59) <= 2, `${id}.${k}.y`);
      assert.ok(centers.mode.x < centers.gate.x && centers.gate.x < centers.delay.x, `${id}: gate entre modo y delay`);
      assert.ok(centers.delay.x < centers.led.x && centers.led.x < centers.attack.x, `${id}: LED entre delay y attack`);
      assert.ok(centers.led.y < centers.delay.y && centers.gate.y > centers.mode.y, `${id}: LED arriba, gate abajo`);
    }
  });

  it('la fila inferior: todos los mandos a la misma altura', () => {
    for (const section of ['ringModulators', 'reverberation', 'echo']) {
      for (const id of SECTIONS[section]) {
        const { box, centers } = moduleLayout(section, id);
        for (const [k, c] of Object.entries(centers)) {
          assert.ok(Math.abs(box.y + c.y - 706.5) <= 1.5, `${id}.${k}: y ${box.y + c.y}`);
        }
      }
    }
  });

  it('envelope shapers: tamaño del gate y del LED', () => {
    assert.ok(layout.envelopeShapers.gateSize > 0);
    assert.ok(layout.envelopeShapers.ledSize > 0);
  });

  it('los marcos no se ven (showFrames: false): el panel está cuadrado con la foto', () => {
    assert.strictEqual(panel1Blueprint.showFrames, false);
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
    assert.deepStrictEqual(Object.keys(layout.filters.modules).sort(), filterModules.sort());
  });

  it('total de knobs en el panel: 8×3 + 3×8 + 3×1 + 1×2 + 1×4 = 57', () => {
    const n = name => Object.keys(layout[name].modules ?? { one: 1 }).length * layout[name].knobs.length;
    const total = n('filters') + n('envelopeShapers') + n('ringModulators') + n('reverberation') + n('echo');
    assert.strictEqual(total, 57, `total de knobs debe ser 57, calculado ${total}`);
  });
});
