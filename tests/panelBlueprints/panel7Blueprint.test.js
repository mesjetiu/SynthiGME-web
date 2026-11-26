/**
 * Tests para el blueprint del Panel 7 (Output Channels + Joysticks + Sequencer)
 * 
 * Verifica la configuración correcta de:
 * - Estructura básica (schemaVersion, panelId, showFrames)
 * - Layout: una caja absoluta por módulo (joysticks, sequencer y los 8
 *   output channels) y la configuración interior de cada uno
 * - Defaults visuales de output channels (outputChannelUI)
 * - Módulos declarados (3 placeholders y output channels 1-8)
 * - Separación blueprint/config (ausencia de propiedades de audio)
 * 
 * @version 2.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel7Blueprint from '../../src/assets/js/panelBlueprints/panel7.blueprint.js';
import { isBox, PANEL_SIZE } from '../../src/assets/js/utils/panelBox.js';

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

describe('Panel 7 Blueprint - Layout en cajas absolutas', () => {
  const layout = panel7Blueprint.layout;

  // Cajas medidas en la web (tests/visual) al migrar al modelo único de
  // coordenadas: con ellas el panel queda idéntico a como estaba.
  const EXPECTED_BOXES = {
    joystickLeft:  { x: 37,  y: 89, w: 215, h: 240 },
    sequencer:     { x: 254, y: 89, w: 252, h: 240 },
    joystickRight: { x: 508, y: 89, w: 215, h: 240 }
  };
  // Canales 1–8: 85 px de ancho, uno cada 85,5 px
  const EXPECTED_CHANNEL_BOXES = Array.from({ length: 8 }, (_, n) => (
    { x: 38.25 + n * 85.5, y: 329, w: 85, h: 425 }
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

  it('los 8 canales de salida tienen caja válida dentro del panel', () => {
    const boxes = layout.outputChannels?.boxes;
    assert.ok(Array.isArray(boxes), 'layout.outputChannels.boxes debe ser array');
    assert.strictEqual(boxes.length, 8);
    boxes.forEach((box, i) => assertInsidePanel(box, `outputChannels.boxes[${i}]`));
  });

  it('los canales de salida conservan las cajas medidas', () => {
    assert.deepStrictEqual(layout.outputChannels.boxes, EXPECTED_CHANNEL_BOXES);
  });

  it('las cajas caen en la rejilla de 1/64 px (van en left/top, sin remuestrear)', () => {
    const all = [...Object.keys(EXPECTED_BOXES).map(n => layout[n].box), ...layout.outputChannels.boxes];
    for (const box of all) {
      assert.ok(Number.isInteger(box.x * 64) && Number.isInteger(box.y * 64), JSON.stringify(box));
    }
  });

  it('no quedan claves del modelo antiguo (columna flex + offsets)', () => {
    for (const key of ['offset', 'padding', 'upperRow', 'lowerRow']) {
      assert.strictEqual(layout[key], undefined, `layout.${key} ya no existe`);
    }
    for (const name of Object.keys(EXPECTED_BOXES)) {
      assert.strictEqual(layout[name].offset, undefined, `layout.${name}.offset → box`);
    }
  });

  it('los knobs de los joysticks se siguen viendo a 60 px (knobSize 65 no tiene clase)', () => {
    // knob--65 no existe en el CSS: el knob se queda en el tamaño por
    // defecto (60). Cambiarlo movería el aspecto 5 px (REVISION-VISUAL-2026-09.md).
    assert.strictEqual(layout.joystickLeft.knobSize, 65);
    assert.strictEqual(layout.joystickRight.knobSize, 65);
  });

  describe('Joystick config (left/right independientes)', () => {
    const joyLeft = layout.joystickLeft;
    const joyRight = layout.joystickRight;

    function assertJoystickShape(joy, side) {
      assert.ok(joy, `debe tener joystick${side}`);
      assert.ok(Array.isArray(joy.knobs), `joystick${side}.knobs debe ser array`);
      assert.deepStrictEqual(joy.knobs, ['Range Horizontal', 'Range Vertical']);
      assert.strictEqual(typeof joy.knobSize, 'number', `joystick${side}.knobSize debe ser número`);
      assert.ok(joy.knobSize > 0, `joystick${side}.knobSize debe ser positivo`);
      assert.strictEqual(typeof joy.padSize, 'number', `joystick${side}.padSize debe ser número`);
      assert.ok(joy.padSize > 0, `joystick${side}.padSize debe ser positivo`);
      assert.strictEqual(typeof joy.layoutGap, 'number', `joystick${side}.layoutGap debe ser número`);
      assert.strictEqual(typeof joy.knobsGap, 'number', `joystick${side}.knobsGap debe ser número`);
      assert.strictEqual(typeof joy.knobsOffset?.x, 'number', `joystick${side}.knobsOffset.x debe ser número`);
      assert.strictEqual(typeof joy.knobsOffset?.y, 'number', `joystick${side}.knobsOffset.y debe ser número`);
      assert.strictEqual(typeof joy.padOffset?.x, 'number', `joystick${side}.padOffset.x debe ser número`);
      assert.strictEqual(typeof joy.padOffset?.y, 'number', `joystick${side}.padOffset.y debe ser número`);
      assert.ok(Array.isArray(joy.knobOffsets), `joystick${side}.knobOffsets debe ser array`);
      assert.strictEqual(joy.knobOffsets.length, 2, `joystick${side}.knobOffsets debe tener 2 elementos`);
    }

    it('joystickLeft tiene estructura completa de layout', () => {
      assertJoystickShape(joyLeft, 'Left');
    });

    it('joystickRight tiene estructura completa de layout', () => {
      assertJoystickShape(joyRight, 'Right');
    });

    it('left y right son configuraciones separadas (sin objeto compartido)', () => {
      assert.notStrictEqual(joyLeft, joyRight, 'left/right no deben compartir referencia');
      assert.notStrictEqual(joyLeft.knobOffsets, joyRight.knobOffsets,
        'left/right no deben compartir array knobOffsets');
    });
  });

  describe('Sequencer config', () => {
    const seq = layout.sequencer;

    it('existe con switches y buttons arrays', () => {
      assert.ok(seq, 'debe tener sequencer config');
      assert.ok(Array.isArray(seq.switches), 'switches debe ser array');
      assert.ok(Array.isArray(seq.buttons), 'buttons debe ser array');
    });

    it('define 8 switches', () => {
      assert.strictEqual(seq.switches.length, 8);
    });

    it('los switches son: A/B+ Key 1, B, C+ Key 2, D, E+ Key 3, F, Key 4, Run Clock / Stop Clock', () => {
      assert.deepStrictEqual(seq.switches, [
        'A/B+ Key 1', 'B', 'C+ Key 2', 'D',
        'E+ Key 3', 'F', 'Key 4', 'Run Clock / Stop Clock'
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

  describe('Output Channels (dentro de su caja)', () => {
    it('el fader cabe en la caja de cada canal (asa incluida)', () => {
      const fader = panel7Blueprint.outputChannelUI.fader;
      for (const box of layout.outputChannels.boxes) {
        assert.ok(fader.scaleTop > box.y, 'la raya del 10 queda dentro del canal');
        assert.ok(fader.scaleBottom + fader.capHeight < box.y + box.h, 'el asa a cero cabe en el canal');
        assert.ok(fader.capWidth < box.w, 'el asa cabe a lo ancho');
      }
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

  it('knobGap es número (gap vertical entre 2 knobs)', () => {
    assert.strictEqual(typeof ui.knobGap, 'number');
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

  it('tiene fader con scaleTop/scaleBottom/capWidth/capHeight numéricos', () => {
    assert.ok(ui.fader, 'debe tener fader');
    for (const k of ['scaleTop', 'scaleBottom', 'capWidth', 'capHeight']) {
      assert.strictEqual(typeof ui.fader[k], 'number', k);
    }
  });

  it('tiene el gap vertical knobButtonGap', () => {
    assert.strictEqual(typeof ui.knobButtonGap, 'number');
  });

  it('tiene buttonSize vertical con width/height/indicator', () => {
    assert.ok(ui.buttonSize, 'debe tener buttonSize');
    assert.strictEqual(typeof ui.buttonSize.width, 'number');
    assert.strictEqual(typeof ui.buttonSize.height, 'number');
    assert.strictEqual(typeof ui.buttonSize.indicator, 'number');
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
