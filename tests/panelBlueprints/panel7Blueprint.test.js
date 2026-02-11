/**
 * Tests para el blueprint del Panel 7 (Output Channels + Joysticks + Sequencer)
 * 
 * Verifica la configuración correcta de:
 * - Estructura básica (schemaVersion, panelId, showFrames)
 * - Layout: fila superior (joysticks con knobs + sequencer con switches/botones)
 *   e inferior (output channels)
 * - Defaults visuales de output channels (outputChannelUI)
 * - Módulos declarados (3 placeholders y output channels 1-8)
 * - Separación blueprint/config (ausencia de propiedades de audio)
 * 
 * @version 2.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel7Blueprint from '../../src/assets/js/panelBlueprints/panel7.blueprint.js';

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE ESTRUCTURA BÁSICA
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 7 Blueprint - Estructura básica', () => {

  it('tiene schemaVersion 2', () => {
    assert.strictEqual(panel7Blueprint.schemaVersion, 2);
  });

  it('tiene panelId "panel-7"', () => {
    assert.strictEqual(panel7Blueprint.panelId, 'panel-7');
  });

  it('tiene showFrames como booleano', () => {
    assert.strictEqual(typeof panel7Blueprint.showFrames, 'boolean');
  });

  it('tiene layout definido', () => {
    assert.ok(panel7Blueprint.layout, 'debe tener layout');
    assert.ok(typeof panel7Blueprint.layout === 'object', 'layout debe ser objeto');
  });

  it('tiene outputChannelUI definido', () => {
    assert.ok(panel7Blueprint.outputChannelUI, 'debe tener outputChannelUI');
    assert.ok(typeof panel7Blueprint.outputChannelUI === 'object', 'outputChannelUI debe ser objeto');
  });

  it('tiene modules definido', () => {
    assert.ok(panel7Blueprint.modules, 'debe tener modules');
    assert.ok(typeof panel7Blueprint.modules === 'object', 'modules debe ser objeto');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 7 Blueprint - Layout', () => {

  it('tiene padding general del panel', () => {
    const padding = panel7Blueprint.layout.padding;
    assert.ok(padding, 'debe tener padding');
    assert.strictEqual(typeof padding.top, 'number');
    assert.strictEqual(typeof padding.right, 'number');
    assert.strictEqual(typeof padding.bottom, 'number');
    assert.strictEqual(typeof padding.left, 'number');
  });

  it('tiene offset general con x e y numéricos', () => {
    const offset = panel7Blueprint.layout.offset;
    assert.ok(offset, 'debe tener offset');
    assert.strictEqual(typeof offset.x, 'number', 'offset.x debe ser número');
    assert.strictEqual(typeof offset.y, 'number', 'offset.y debe ser número');
  });

  describe('Fila superior (upperRow)', () => {
    const upperRow = panel7Blueprint.layout.upperRow;

    it('existe con gap numérico', () => {
      assert.ok(upperRow, 'debe tener upperRow');
      assert.strictEqual(typeof upperRow.gap, 'number');
      assert.ok(upperRow.gap >= 0, 'gap no puede ser negativo');
    });

    it('tiene padding', () => {
      assert.ok(upperRow.padding, 'debe tener padding');
      assert.strictEqual(typeof upperRow.padding.top, 'number');
      assert.strictEqual(typeof upperRow.padding.left, 'number');
    });

    it('tiene joystickSize con width y height', () => {
      const js = upperRow.joystickSize;
      assert.ok(js, 'debe tener joystickSize');
      assert.strictEqual(typeof js.width, 'number');
      assert.strictEqual(typeof js.height, 'number');
      assert.ok(js.width > 0, 'width debe ser positivo');
      assert.ok(js.height > 0, 'height debe ser positivo');
    });

    it('tiene sequencerSize con width y height', () => {
      const ss = upperRow.sequencerSize;
      assert.ok(ss, 'debe tener sequencerSize');
      assert.strictEqual(typeof ss.width, 'number');
      assert.strictEqual(typeof ss.height, 'number');
      assert.ok(ss.width > 0, 'width debe ser positivo');
      assert.ok(ss.height > 0, 'height debe ser positivo');
    });

    it('sequencer es más ancho que joystick', () => {
      assert.ok(
        upperRow.sequencerSize.width > upperRow.joystickSize.width,
        'el sequencer debe ser más ancho que un joystick'
      );
    });

    it('joystick y sequencer tienen la misma altura', () => {
      assert.strictEqual(
        upperRow.joystickSize.height,
        upperRow.sequencerSize.height,
        'todos los módulos de la fila superior deben tener la misma altura'
      );
    });

    describe('Joystick config', () => {
      const joy = upperRow.joystick;

      it('existe con knobs array', () => {
        assert.ok(joy, 'debe tener joystick config');
        assert.ok(Array.isArray(joy.knobs), 'knobs debe ser array');
      });

      it('define 2 knobs: Range Horizontal, Range Vertical', () => {
        assert.strictEqual(joy.knobs.length, 2);
        assert.deepStrictEqual(joy.knobs, ['Range Horizontal', 'Range Vertical']);
      });

      it('tiene knobSize definido', () => {
        assert.ok(joy.knobSize, 'debe tener knobSize');
        assert.strictEqual(typeof joy.knobSize, 'string');
      });
    });

    describe('Sequencer config', () => {
      const seq = upperRow.sequencer;

      it('existe con switches y buttons arrays', () => {
        assert.ok(seq, 'debe tener sequencer config');
        assert.ok(Array.isArray(seq.switches), 'switches debe ser array');
        assert.ok(Array.isArray(seq.buttons), 'buttons debe ser array');
      });

      it('define 8 switches', () => {
        assert.strictEqual(seq.switches.length, 8);
      });

      it('los switches son: A/B+ Dey 1, B, C+ Key 2, D, E+ Key 3, F, Key 4, Stop Clock', () => {
        assert.deepStrictEqual(seq.switches, [
          'A/B+ Dey 1', 'B', 'C+ Key 2', 'D',
          'E+ Key 3', 'F', 'Key 4', 'Stop Clock'
        ]);
      });

      it('define 8 botones', () => {
        assert.strictEqual(seq.buttons.length, 8);
      });

      it('los botones son: Master Reset, Run Forward, Run Reverse, Stop, Reset Sequence, Step Forward, Step Reverse, Test O/P', () => {
        assert.deepStrictEqual(seq.buttons, [
          'Master Reset', 'Run Forward', 'Run Reverse', 'Stop',
          'Reset Sequence', 'Step Forward', 'Step Reverse', 'Test O/P'
        ]);
      });
    });
  });

  describe('Fila inferior (lowerRow)', () => {
    const lowerRow = panel7Blueprint.layout.lowerRow;

    it('existe con gap numérico', () => {
      assert.ok(lowerRow, 'debe tener lowerRow');
      assert.strictEqual(typeof lowerRow.gap, 'number');
      assert.ok(lowerRow.gap >= 0, 'gap no puede ser negativo');
    });

    it('tiene padding', () => {
      assert.ok(lowerRow.padding, 'debe tener padding');
      assert.strictEqual(typeof lowerRow.padding.top, 'number');
      assert.strictEqual(typeof lowerRow.padding.bottom, 'number');
    });

    it('tiene channelSize con width y height', () => {
      const cs = lowerRow.channelSize;
      assert.ok(cs, 'debe tener channelSize');
      assert.strictEqual(typeof cs.width, 'number');
      assert.strictEqual(typeof cs.height, 'number');
      assert.ok(cs.width > 0, 'width debe ser positivo');
      assert.ok(cs.height > 0, 'height debe ser positivo');
    });

    it('tiene configuración de slider', () => {
      const slider = lowerRow.slider;
      assert.ok(slider, 'debe tener slider');
      assert.strictEqual(typeof slider.shellHeight, 'number');
      assert.strictEqual(typeof slider.height, 'number');
      assert.strictEqual(typeof slider.width, 'number');
    });

    it('slider height ≤ shellHeight (slider cabe dentro del shell)', () => {
      assert.ok(
        lowerRow.slider.height <= lowerRow.slider.shellHeight,
        'height del slider no puede superar shellHeight'
      );
    });

    it('slider shellHeight < channelSize.height (cabe en el canal)', () => {
      assert.ok(
        lowerRow.slider.shellHeight < lowerRow.channelSize.height,
        'el shell del slider debe caber dentro del canal'
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE outputChannelUI (DEFAULTS VISUALES)
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 7 Blueprint - outputChannelUI', () => {
  const ui = panel7Blueprint.outputChannelUI;

  it('tiene knobSize numérico y positivo', () => {
    assert.strictEqual(typeof ui.knobSize, 'number');
    assert.ok(ui.knobSize > 0, 'knobSize debe ser positivo');
  });

  it('tiene knobInnerPct entre 0 y 100', () => {
    assert.strictEqual(typeof ui.knobInnerPct, 'number');
    assert.ok(ui.knobInnerPct > 0 && ui.knobInnerPct <= 100,
      `knobInnerPct debe estar entre 0 y 100, es ${ui.knobInnerPct}`);
  });

  it('knobGap es array de números', () => {
    assert.ok(Array.isArray(ui.knobGap), 'knobGap debe ser array');
    assert.ok(ui.knobGap.length > 0, 'knobGap debe tener al menos un elemento');
    ui.knobGap.forEach((g, i) => {
      assert.strictEqual(typeof g, 'number', `knobGap[${i}] debe ser número`);
    });
  });

  it('knobRowOffsetX y knobRowOffsetY son números', () => {
    assert.strictEqual(typeof ui.knobRowOffsetX, 'number');
    assert.strictEqual(typeof ui.knobRowOffsetY, 'number');
  });

  it('tiene contentPadding con top/right/bottom/left', () => {
    const cp = ui.contentPadding;
    assert.ok(cp, 'debe tener contentPadding');
    assert.strictEqual(typeof cp.top, 'number');
    assert.strictEqual(typeof cp.right, 'number');
    assert.strictEqual(typeof cp.bottom, 'number');
    assert.strictEqual(typeof cp.left, 'number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE MÓDULOS
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 7 Blueprint - Módulos', () => {
  const modules = panel7Blueprint.modules;

  describe('Placeholders fila superior', () => {
    it('tiene joystickLeft', () => {
      assert.ok('joystickLeft' in modules, 'debe tener módulo joystickLeft');
      assert.strictEqual(typeof modules.joystickLeft, 'object');
    });

    it('tiene sequencer', () => {
      assert.ok('sequencer' in modules, 'debe tener módulo sequencer');
      assert.strictEqual(typeof modules.sequencer, 'object');
    });

    it('tiene joystickRight', () => {
      assert.ok('joystickRight' in modules, 'debe tener módulo joystickRight');
      assert.strictEqual(typeof modules.joystickRight, 'object');
    });

    it('naming: usa Left/Right (no numérico)', () => {
      assert.ok(!('joystick1' in modules), 'no debe existir joystick1 (usar joystickLeft)');
      assert.ok(!('joystick2' in modules), 'no debe existir joystick2 (usar joystickRight)');
    });
  });

  describe('Output Channels 1-8', () => {
    for (let i = 1; i <= 8; i++) {
      it(`tiene oc${i}`, () => {
        assert.ok(`oc${i}` in modules, `debe tener módulo oc${i}`);
        assert.strictEqual(typeof modules[`oc${i}`], 'object');
      });
    }

    it('tiene exactamente 8 output channels (oc1-oc8)', () => {
      const ocKeys = Object.keys(modules).filter(k => k.startsWith('oc'));
      assert.strictEqual(ocKeys.length, 8, 'debe haber exactamente 8 OCs');
    });
  });

  it('total de módulos: 3 placeholders + 8 output channels = 11', () => {
    const keys = Object.keys(modules);
    assert.strictEqual(keys.length, 11, `debe haber 11 módulos, hay ${keys.length}: ${keys.join(', ')}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE SEPARACIÓN BLUEPRINT / CONFIG
// ─────────────────────────────────────────────────────────────────────────────
//
// El blueprint NO debe contener propiedades que pertenecen al config
// (outputChannel.config.js). Estas propiedades se eliminaron en el
// refactoring schemaVersion 1 → 2.
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 7 Blueprint - Separación blueprint/config', () => {

  it('NO tiene channelCount (pertenece al config)', () => {
    // channelCount está en outputChannel.config.js como count:8
    assert.strictEqual(panel7Blueprint.channelCount, undefined);
    // Tampoco anidado en modules
    if (panel7Blueprint.modules.outputChannels) {
      assert.strictEqual(panel7Blueprint.modules.outputChannels.channelCount, undefined);
    }
  });

  it('NO tiene routing (pertenece al config/blueprints de matriz)', () => {
    assert.strictEqual(panel7Blueprint.routing, undefined);
  });

  it('NO tiene sources ni destinations (no es un matrix blueprint)', () => {
    assert.strictEqual(panel7Blueprint.sources, undefined);
    assert.strictEqual(panel7Blueprint.destinations, undefined);
  });

  it('NO tiene grid (eso es de matrix blueprints)', () => {
    assert.strictEqual(panel7Blueprint.grid, undefined);
  });

  it('NO tiene matrixId (no es un matrix blueprint)', () => {
    assert.strictEqual(panel7Blueprint.matrixId, undefined);
  });

  it('ningún módulo tiene controls array (pertenece al config)', () => {
    for (const [key, mod] of Object.entries(panel7Blueprint.modules)) {
      assert.strictEqual(mod.controls, undefined,
        `modules.${key} no debe tener controls`);
    }
  });

  it('ningún módulo tiene channelLayout (eliminado en v2)', () => {
    for (const [key, mod] of Object.entries(panel7Blueprint.modules)) {
      assert.strictEqual(mod.channelLayout, undefined,
        `modules.${key} no debe tener channelLayout`);
    }
  });

  it('NO tiene módulo "outputChannels" monolítico (estructura v1)', () => {
    // En v1 existía modules.outputChannels con type, channelCount, frame, etc.
    // En v2 se reemplaza por oc1-oc8 individuales + outputChannelUI defaults
    assert.strictEqual(panel7Blueprint.modules.outputChannels, undefined,
      'no debe existir el módulo monolítico "outputChannels" de la v1');
  });
});
