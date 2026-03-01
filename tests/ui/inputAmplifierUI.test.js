/**
 * Tests para InputAmplifierUI
 *
 * Cobertura de layout fino:
 * - knobGap (incluyendo fallback legacy knobsGap)
 * - knobSize string/numérico
 * - knobInnerPct
 * - knobsRowOffset y knobOffsets por canal
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

const { InputAmplifierUI } = await import('../../src/assets/js/ui/inputAmplifierUI.js');

describe('InputAmplifierUI - layout fino', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('usa knobGap y knobsRowOffset en la fila de knobs', () => {
    const ui = new InputAmplifierUI({
      layout: {
        knobGap: 12,
        knobsRowOffset: { x: 4, y: -3 }
      }
    });

    const el = ui.createElement();
    document.body.appendChild(el);

    const row = el.querySelector('.input-amplifier__knobs-row');
    assert.ok(row, 'debe existir fila de knobs');
    assert.strictEqual(row.style.gap, '12px');
    assert.strictEqual(row.style.transform, 'translate(4px, -3px)');
  });

  it('acepta fallback legacy knobsGap cuando knobGap no está', () => {
    const ui = new InputAmplifierUI({
      layout: {
        knobsGap: 9
      }
    });

    const el = ui.createElement();
    document.body.appendChild(el);

    const row = el.querySelector('.input-amplifier__knobs-row');
    assert.ok(row, 'debe existir fila de knobs');
    assert.strictEqual(row.style.gap, '9px');
  });

  it('aplica knobSize numérico a todos los knobs', () => {
    const ui = new InputAmplifierUI({
      layout: {
        knobSize: 44,
        knobInnerPct: 61
      }
    });

    const el = ui.createElement();
    document.body.appendChild(el);

    const knobs = [...el.querySelectorAll('.input-amplifier__knob')];
    assert.strictEqual(knobs.length, 8, 'debe crear 8 knobs');

    knobs.forEach((knob) => {
      assert.strictEqual(knob.style.width, '44px');
      assert.strictEqual(knob.style.height, '44px');
      const inner = knob.querySelector('.knob-inner');
      assert.ok(inner, 'cada knob debe tener inner');
      // knobInnerPct se aplica via CSS custom property, no como estilo inline
    });

    // knobInnerPct se almacena en el layout para uso por CSS
    assert.strictEqual(ui.layout.knobInnerPct, 61);
  });

  it('aplica knobOffsets por canal cuando se proporcionan', () => {
    const ui = new InputAmplifierUI({
      layout: {
        knobOffsets: [
          { x: 5, y: 1 },
          { x: -2, y: 3 }
        ]
      }
    });

    const el = ui.createElement();
    document.body.appendChild(el);

    const channels = [...el.querySelectorAll('.input-amplifier__channel')];
    assert.strictEqual(channels.length, 8, 'debe crear 8 canales');
    assert.strictEqual(channels[0].style.transform, 'translate(5px, 1px)');
    assert.strictEqual(channels[1].style.transform, 'translate(-2px, 3px)');
    assert.strictEqual(channels[2].style.transform, '', 'canales sin offset no deben transformarse');
  });
});
