/**
 * Tests para el blueprint del Panel 1 (Filters, Envelope Shapers,
 * Ring Modulators, Reverb & Echo — todos placeholders con knobs)
 * 
 * Verifica la configuración correcta de:
 * - Estructura básica (schemaVersion, panelId, showFrames)
 * - Layout: 3 secciones principales (filtersRow, envelopeShapers, bottomRow)
 * - Módulos declarados (16 placeholders: 8 filtros + 3 envelopes + 3 RM + reverb + echo)
 * - Definición de knobs por tipo de módulo
 * - Separación blueprint/config (ausencia de propiedades de audio, controls, matrixMapping)
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel1Blueprint from '../../src/assets/js/panelBlueprints/panel1.blueprint.js';

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
// TESTS DE LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 1 Blueprint - Layout', () => {

  it('tiene padding general del panel', () => {
    const padding = panel1Blueprint.layout.padding;
    assert.ok(padding, 'debe tener padding');
    assert.strictEqual(typeof padding.top, 'number');
    assert.strictEqual(typeof padding.right, 'number');
    assert.strictEqual(typeof padding.bottom, 'number');
    assert.strictEqual(typeof padding.left, 'number');
  });

  it('tiene gap vertical entre filas', () => {
    assert.strictEqual(typeof panel1Blueprint.layout.gap, 'number');
    assert.ok(panel1Blueprint.layout.gap >= 0, 'gap no puede ser negativo');
  });

  it('tiene offset general con x e y numéricos', () => {
    const offset = panel1Blueprint.layout.offset;
    assert.ok(offset, 'debe tener offset');
    assert.strictEqual(typeof offset.x, 'number', 'offset.x debe ser número');
    assert.strictEqual(typeof offset.y, 'number', 'offset.y debe ser número');
  });

  // ── Fila 1: Filtros ────────────────────────────────────────────────────

  describe('Sección Filters Row', () => {
    const fr = panel1Blueprint.layout.filtersRow;

    it('existe con height numérico', () => {
      assert.ok(fr, 'debe tener sección filtersRow');
      assert.strictEqual(typeof fr.height, 'number');
      assert.ok(fr.height > 0, 'height debe ser positivo');
    });

    it('tiene gap horizontal entre filtros', () => {
      assert.strictEqual(typeof fr.gap, 'number');
      assert.ok(fr.gap >= 0, 'gap no puede ser negativo');
    });

    it('tiene offset de fila con x e y numéricos', () => {
      assert.ok(fr.offset, 'debe tener offset');
      assert.strictEqual(typeof fr.offset.x, 'number');
      assert.strictEqual(typeof fr.offset.y, 'number');
    });

    it('define 3 knobs por filtro: Frequency, Response, Level', () => {
      assert.ok(Array.isArray(fr.knobs), 'knobs debe ser array');
      assert.strictEqual(fr.knobs.length, 3);
      assert.deepStrictEqual(fr.knobs, ['Frequency', 'Response', 'Level']);
    });

    it('tiene knobSize definido', () => {
      assert.ok(fr.knobSize, 'debe tener knobSize');
      assert.strictEqual(typeof fr.knobSize, 'string');
    });

    it('tiene knobInnerPct entre 0 y 100', () => {
      assert.strictEqual(typeof fr.knobInnerPct, 'number');
      assert.ok(fr.knobInnerPct > 0 && fr.knobInnerPct <= 100);
    });

    it('tiene knobGap numérico y knobsOffset válido', () => {
      assert.strictEqual(typeof fr.knobGap, 'number');
      assert.ok(fr.knobGap >= 0, 'knobGap no puede ser negativo');
      assert.ok(fr.knobsOffset, 'debe tener knobsOffset');
      assert.strictEqual(typeof fr.knobsOffset.x, 'number');
      assert.strictEqual(typeof fr.knobsOffset.y, 'number');
    });

    it('tiene knobDirection vertical', () => {
      assert.strictEqual(fr.knobDirection, 'vertical');
    });
  });

  // ── Filas 2-4: Envelope Shapers ────────────────────────────────────────

  describe('Sección Envelope Shapers', () => {
    const es = panel1Blueprint.layout.envelopeShapers;

    it('existe con height numérico', () => {
      assert.ok(es, 'debe tener sección envelopeShapers');
      assert.strictEqual(typeof es.height, 'number');
      assert.ok(es.height > 0, 'height debe ser positivo');
    });

    it('tiene gap vertical entre envelopes', () => {
      assert.strictEqual(typeof es.gap, 'number');
      assert.ok(es.gap >= 0, 'gap no puede ser negativo');
    });

    it('tiene offset de sección con x e y numéricos', () => {
      assert.ok(es.offset, 'debe tener offset');
      assert.strictEqual(typeof es.offset.x, 'number');
      assert.strictEqual(typeof es.offset.y, 'number');
    });

    it('define count = 3 (tres envelope shapers)', () => {
      assert.strictEqual(es.count, 3);
    });

    it('define 8 knobs por envelope shaper', () => {
      assert.ok(Array.isArray(es.knobs), 'knobs debe ser array');
      assert.strictEqual(es.knobs.length, 8);
    });

    it('los knobs son: Mode, Delay, Attack, Decay, Sustain, Release, Env Level, Sig Level', () => {
      assert.deepStrictEqual(es.knobs,
        ['Mode', 'Delay', 'Attack', 'Decay', 'Sustain', 'Release', 'Env Level', 'Sig Level']);
    });

    it('tiene knobSize definido', () => {
      assert.ok(es.knobSize, 'debe tener knobSize');
      assert.strictEqual(typeof es.knobSize, 'string');
    });

    it('tiene knobInnerPct, knobGap y knobsOffset válidos', () => {
      assert.strictEqual(typeof es.knobInnerPct, 'number');
      assert.ok(es.knobInnerPct > 0 && es.knobInnerPct <= 100);
      assert.strictEqual(typeof es.knobGap, 'number');
      assert.ok(es.knobGap >= 0, 'knobGap no puede ser negativo');
      assert.ok(es.knobsOffset, 'debe tener knobsOffset');
      assert.strictEqual(typeof es.knobsOffset.x, 'number');
      assert.strictEqual(typeof es.knobsOffset.y, 'number');
    });

    it('tiene knobDirection horizontal', () => {
      assert.strictEqual(es.knobDirection, 'horizontal');
    });
  });

  // ── Fila 5: Bottom Row ─────────────────────────────────────────────────

  describe('Sección Bottom Row', () => {
    const br = panel1Blueprint.layout.bottomRow;

    it('existe con height numérico', () => {
      assert.ok(br, 'debe tener sección bottomRow');
      assert.strictEqual(typeof br.height, 'number');
      assert.ok(br.height > 0, 'height debe ser positivo');
    });

    it('tiene gap horizontal entre módulos', () => {
      assert.strictEqual(typeof br.gap, 'number');
      assert.ok(br.gap >= 0, 'gap no puede ser negativo');
    });

    it('tiene offset de fila con x e y numéricos', () => {
      assert.ok(br.offset, 'debe tener offset');
      assert.strictEqual(typeof br.offset.x, 'number');
      assert.strictEqual(typeof br.offset.y, 'number');
    });

    describe('Ring Modulator config', () => {
      const rm = br.ringModulator;

      it('existe con count = 3', () => {
        assert.ok(rm, 'debe tener ringModulator');
        assert.strictEqual(rm.count, 3);
      });

      it('define 1 knob: Level', () => {
        assert.ok(Array.isArray(rm.knobs), 'knobs debe ser array');
        assert.deepStrictEqual(rm.knobs, ['Level']);
      });

      it('tiene knobSize definido', () => {
        assert.ok(rm.knobSize, 'debe tener knobSize');
      });

      it('tiene knobInnerPct, knobGap y knobsOffset válidos', () => {
        assert.strictEqual(typeof rm.knobInnerPct, 'number');
        assert.ok(rm.knobInnerPct > 0 && rm.knobInnerPct <= 100);
        assert.strictEqual(typeof rm.knobGap, 'number');
        assert.ok(rm.knobGap >= 0, 'knobGap no puede ser negativo');
        assert.ok(rm.knobsOffset, 'debe tener knobsOffset');
        assert.strictEqual(typeof rm.knobsOffset.x, 'number');
        assert.strictEqual(typeof rm.knobsOffset.y, 'number');
      });
    });

    describe('Reverberation config', () => {
      const rev = br.reverberation;

      it('existe con count = 1', () => {
        assert.ok(rev, 'debe tener reverberation');
        assert.strictEqual(rev.count, 1);
      });

      it('define 2 knobs: Mix, Level', () => {
        assert.ok(Array.isArray(rev.knobs), 'knobs debe ser array');
        assert.deepStrictEqual(rev.knobs, ['Mix', 'Level']);
      });

      it('tiene knobSize definido', () => {
        assert.ok(rev.knobSize, 'debe tener knobSize');
      });

      it('tiene knobInnerPct, knobGap y knobsOffset válidos', () => {
        assert.strictEqual(typeof rev.knobInnerPct, 'number');
        assert.ok(rev.knobInnerPct > 0 && rev.knobInnerPct <= 100);
        assert.strictEqual(typeof rev.knobGap, 'number');
        assert.ok(rev.knobGap >= 0, 'knobGap no puede ser negativo');
        assert.ok(rev.knobsOffset, 'debe tener knobsOffset');
        assert.strictEqual(typeof rev.knobsOffset.x, 'number');
        assert.strictEqual(typeof rev.knobsOffset.y, 'number');
      });
    });

    describe('Echo A.D.L. config', () => {
      const echo = br.echo;

      it('existe con count = 1', () => {
        assert.ok(echo, 'debe tener echo');
        assert.strictEqual(echo.count, 1);
      });

      it('define 4 knobs: Delay, Mix, Feedback, Level', () => {
        assert.ok(Array.isArray(echo.knobs), 'knobs debe ser array');
        assert.deepStrictEqual(echo.knobs, ['Delay', 'Mix', 'Feedback', 'Level']);
      });

      it('tiene knobSize definido', () => {
        assert.ok(echo.knobSize, 'debe tener knobSize');
      });

      it('tiene knobInnerPct, knobGap y knobsOffset válidos', () => {
        assert.strictEqual(typeof echo.knobInnerPct, 'number');
        assert.ok(echo.knobInnerPct > 0 && echo.knobInnerPct <= 100);
        assert.strictEqual(typeof echo.knobGap, 'number');
        assert.ok(echo.knobGap >= 0, 'knobGap no puede ser negativo');
        assert.ok(echo.knobsOffset, 'debe tener knobsOffset');
        assert.strictEqual(typeof echo.knobsOffset.x, 'number');
        assert.strictEqual(typeof echo.knobsOffset.y, 'number');
      });
    });
  });

  it('tiene exactamente 3 secciones principales en el layout', () => {
    const layoutSections = ['filtersRow', 'envelopeShapers', 'bottomRow'];
    for (const name of layoutSections) {
      assert.ok(panel1Blueprint.layout[name],
        `debe tener sección layout.${name}`);
    }
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
    assert.strictEqual(filterModules.length, 8,
      `debe haber 8 módulos de filtro, hay ${filterModules.length}`);
  });

  it('el count de envelopeShapers coincide con los módulos declarados', () => {
    const envCount = panel1Blueprint.layout.envelopeShapers.count;
    const envModules = Object.keys(panel1Blueprint.modules)
      .filter(k => k.startsWith('envelopeShaper'));
    assert.strictEqual(envModules.length, envCount,
      `envelopeShapers.count=${envCount} pero hay ${envModules.length} módulos`);
  });

  it('el count de ringModulators coincide con los módulos declarados', () => {
    const rmCount = panel1Blueprint.layout.bottomRow.ringModulator.count;
    const rmModules = Object.keys(panel1Blueprint.modules)
      .filter(k => k.startsWith('ringModulator'));
    assert.strictEqual(rmModules.length, rmCount,
      `ringModulator.count=${rmCount} pero hay ${rmModules.length} módulos`);
  });

  it('el count de reverberation coincide con los módulos declarados', () => {
    const revCount = panel1Blueprint.layout.bottomRow.reverberation.count;
    const revModules = Object.keys(panel1Blueprint.modules)
      .filter(k => k.startsWith('reverberation'));
    assert.strictEqual(revModules.length, revCount,
      `reverberation.count=${revCount} pero hay ${revModules.length} módulos`);
  });

  it('el count de echo coincide con los módulos declarados', () => {
    const echoCount = panel1Blueprint.layout.bottomRow.echo.count;
    const echoModules = Object.keys(panel1Blueprint.modules)
      .filter(k => k.startsWith('echo'));
    assert.strictEqual(echoModules.length, echoCount,
      `echo.count=${echoCount} pero hay ${echoModules.length} módulos`);
  });

  it('total de knobs en el panel: 8×3 + 3×8 + 3×1 + 1×2 + 1×4 = 57', () => {
    const filterKnobs = 8 * panel1Blueprint.layout.filtersRow.knobs.length;
    const envKnobs = panel1Blueprint.layout.envelopeShapers.count *
                     panel1Blueprint.layout.envelopeShapers.knobs.length;
    const rmKnobs = panel1Blueprint.layout.bottomRow.ringModulator.count *
                    panel1Blueprint.layout.bottomRow.ringModulator.knobs.length;
    const revKnobs = panel1Blueprint.layout.bottomRow.reverberation.count *
                     panel1Blueprint.layout.bottomRow.reverberation.knobs.length;
    const echoKnobs = panel1Blueprint.layout.bottomRow.echo.count *
                      panel1Blueprint.layout.bottomRow.echo.knobs.length;
    const total = filterKnobs + envKnobs + rmKnobs + revKnobs + echoKnobs;
    assert.strictEqual(total, 57,
      `total de knobs debe ser 57, calculado ${total}`);
  });
});
