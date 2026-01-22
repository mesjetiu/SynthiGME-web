/**
 * Tests para la clase Knob
 * 
 * Verifica el comportamiento de los knobs: conversión de valores,
 * escala de display estilo Synthi 100, y formateo.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Configurar entorno DOM
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// Mock para shouldBlockInteraction
const mockInput = {
  shouldBlockInteraction: () => false
};

// Importar después de configurar el entorno
const { Knob } = await import('../../src/assets/js/ui/knob.js');

describe('Knob - Conversión de escala', () => {
  let container, knobEl, innerEl;

  beforeEach(() => {
    container = document.createElement('div');
    knobEl = document.createElement('div');
    knobEl.className = 'knob';
    innerEl = document.createElement('div');
    innerEl.className = 'knob-inner';
    knobEl.appendChild(innerEl);
    container.appendChild(knobEl);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('escala unipolar 0-10 por defecto', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5
    });
    
    // Valor interno 0.5 → escala 5.0
    const scaleValue = knob._getScaleValue();
    assert.strictEqual(scaleValue, 5.0);
  });

  it('escala bipolar -5 a +5', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5,
      scaleMin: -5,
      scaleMax: 5
    });
    
    // Valor interno 0.5 → escala 0.0 (centro)
    assert.strictEqual(knob._getScaleValue(), 0.0);
    
    // Valor interno 0 → escala -5
    knob.value = 0;
    assert.strictEqual(knob._getScaleValue(), -5.0);
    
    // Valor interno 1 → escala +5
    knob.value = 1;
    assert.strictEqual(knob._getScaleValue(), 5.0);
  });

  it('escala con rango interno diferente', () => {
    const knob = new Knob(knobEl, {
      min: -1,
      max: 1,
      initial: 0,
      scaleMin: -5,
      scaleMax: 5
    });
    
    // Valor interno 0 → escala 0 (centro)
    assert.strictEqual(knob._getScaleValue(), 0.0);
    
    // Valor interno -1 → escala -5
    knob.value = -1;
    assert.strictEqual(knob._getScaleValue(), -5.0);
    
    // Valor interno 1 → escala +5
    knob.value = 1;
    assert.strictEqual(knob._getScaleValue(), 5.0);
  });

  it('formateo con decimales configurables', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.333,
      scaleMin: 0,
      scaleMax: 10,
      scaleDecimals: 2
    });
    
    // 0.333 → 3.33 (2 decimales)
    assert.strictEqual(knob._formatScaleValue(), '3.33');
  });

  it('formateo sin decimales', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.7,
      scaleMin: 0,
      scaleMax: 10,
      scaleDecimals: 0
    });
    
    // 0.7 → 7 (sin decimales)
    assert.strictEqual(knob._formatScaleValue(), '7');
  });
});

describe('Knob - Elemento de valor', () => {
  let container, knobEl, innerEl, valueEl;

  beforeEach(() => {
    container = document.createElement('div');
    knobEl = document.createElement('div');
    knobEl.className = 'knob';
    innerEl = document.createElement('div');
    innerEl.className = 'knob-inner';
    knobEl.appendChild(innerEl);
    
    valueEl = document.createElement('div');
    valueEl.className = 'knob-value';
    
    container.appendChild(knobEl);
    container.appendChild(valueEl);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('actualiza el elemento de valor con la escala', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.8,
      scaleMin: 0,
      scaleMax: 10,
      scaleDecimals: 1,
      valueElement: valueEl
    });
    
    // El valor inicial debe mostrarse
    assert.strictEqual(valueEl.textContent, '8.0');
    
    // Cambiar valor
    knob.setValue(0.3);
    assert.strictEqual(valueEl.textContent, '3.0');
  });

  it('muestra valores bipolares correctamente', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.2,
      scaleMin: -5,
      scaleMax: 5,
      scaleDecimals: 1,
      valueElement: valueEl
    });
    
    // 0.2 → -3.0
    assert.strictEqual(valueEl.textContent, '-3.0');
    
    knob.setValue(0.9);
    // 0.9 → 4.0
    assert.strictEqual(valueEl.textContent, '4.0');
  });
});

describe('Knob - Comportamiento básico', () => {
  let container, knobEl, innerEl;

  beforeEach(() => {
    container = document.createElement('div');
    knobEl = document.createElement('div');
    knobEl.className = 'knob';
    innerEl = document.createElement('div');
    innerEl.className = 'knob-inner';
    knobEl.appendChild(innerEl);
    container.appendChild(knobEl);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('respeta valores min/max', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5
    });
    
    // Intentar establecer valor fuera de rango
    knob.setValue(1.5);
    assert.strictEqual(knob.getValue(), 1.0);
    
    knob.setValue(-0.5);
    assert.strictEqual(knob.getValue(), 0.0);
  });

  it('llama al callback onChange', () => {
    let callbackValue = null;
    
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5,
      onChange: (value) => {
        callbackValue = value;
      }
    });
    
    knob.setValue(0.7);
    assert.strictEqual(callbackValue, 0.7);
  });

  it('el valor inicial se establece correctamente', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 100,
      initial: 42
    });
    
    assert.strictEqual(knob.getValue(), 42);
  });
});

describe('Knob - Casos especiales del Synthi 100', () => {
  let container, knobEl, innerEl;

  beforeEach(() => {
    container = document.createElement('div');
    knobEl = document.createElement('div');
    knobEl.className = 'knob';
    innerEl = document.createElement('div');
    innerEl.className = 'knob-inner';
    knobEl.appendChild(innerEl);
    container.appendChild(knobEl);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('oscilador pulse level: 0-10', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0,
      scaleMin: 0,
      scaleMax: 10
    });
    
    assert.strictEqual(knob._getScaleValue(), 0);
    knob.setValue(1);
    assert.strictEqual(knob._getScaleValue(), 10);
  });

  it('oscilador shape: -5 a +5 (bipolar)', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5,
      scaleMin: -5,
      scaleMax: 5
    });
    
    // Centro (0.5) debe mostrar 0
    assert.strictEqual(knob._getScaleValue(), 0);
    
    // Mínimo debe mostrar -5
    knob.setValue(0);
    assert.strictEqual(knob._getScaleValue(), -5);
    
    // Máximo debe mostrar +5
    knob.setValue(1);
    assert.strictEqual(knob._getScaleValue(), 5);
  });

  it('output channel filter: -5 a +5', () => {
    const knob = new Knob(knobEl, {
      min: -1,
      max: 1,
      initial: 0,
      scaleMin: -5,
      scaleMax: 5
    });
    
    // Centro en 0
    assert.strictEqual(knob._getScaleValue(), 0);
    
    // Full lowpass
    knob.setValue(-1);
    assert.strictEqual(knob._getScaleValue(), -5);
    
    // Full highpass
    knob.setValue(1);
    assert.strictEqual(knob._getScaleValue(), 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: Tooltips con info extra (getTooltipInfo callback)
// ═══════════════════════════════════════════════════════════════════════════

describe('Knob - Tooltip content con getTooltipInfo', () => {
  let container, knobEl, innerEl;

  beforeEach(() => {
    container = document.createElement('div');
    knobEl = document.createElement('div');
    knobEl.className = 'knob';
    innerEl = document.createElement('div');
    innerEl.className = 'knob-inner';
    knobEl.appendChild(innerEl);
    container.appendChild(knobEl);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('genera contenido básico sin getTooltipInfo', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5,
      scaleMin: 0,
      scaleMax: 10,
      scaleDecimals: 1
    });
    
    const content = knob._generateTooltipContent();
    assert.strictEqual(content, '5.0');
  });

  it('incluye info extra cuando getTooltipInfo retorna string', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5,
      scaleMin: 0,
      scaleMax: 10,
      scaleDecimals: 1,
      getTooltipInfo: (value, scaleValue) => `${(scaleValue * 100).toFixed(0)} Hz`
    });
    
    const content = knob._generateTooltipContent();
    assert.ok(content.includes('5.0'), 'Debe incluir valor de escala');
    assert.ok(content.includes('500 Hz'), 'Debe incluir info extra');
    assert.ok(content.includes('knob-tooltip__main'), 'Usa clase main');
    assert.ok(content.includes('knob-tooltip__info'), 'Usa clase info');
  });

  it('no incluye info extra cuando getTooltipInfo retorna null', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5,
      scaleMin: 0,
      scaleMax: 10,
      scaleDecimals: 1,
      getTooltipInfo: () => null
    });
    
    const content = knob._generateTooltipContent();
    assert.strictEqual(content, '5.0');
    assert.ok(!content.includes('knob-tooltip__info'));
  });

  it('no incluye info extra cuando getTooltipInfo retorna string vacío', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5,
      scaleMin: 0,
      scaleMax: 10,
      scaleDecimals: 1,
      getTooltipInfo: () => ''
    });
    
    const content = knob._generateTooltipContent();
    assert.strictEqual(content, '5.0');
  });

  it('getTooltipInfo recibe value y scaleValue correctos', () => {
    let receivedValue, receivedScaleValue;
    
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.3,
      scaleMin: -5,
      scaleMax: 5,
      scaleDecimals: 1,
      getTooltipInfo: (value, scaleValue) => {
        receivedValue = value;
        receivedScaleValue = scaleValue;
        return 'test';
      }
    });
    
    knob._generateTooltipContent();
    
    assert.strictEqual(receivedValue, 0.3);
    // 0.3 en rango [0,1] → escala [-5,5] → -5 + 0.3*10 = -2
    assert.strictEqual(receivedScaleValue, -2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: Indicador de modificadores (Ctrl/Shift) - Badge visual
// ═══════════════════════════════════════════════════════════════════════════

describe('Knob - Indicador de modificadores (badge)', () => {
  let container, knobEl, innerEl;

  beforeEach(() => {
    container = document.createElement('div');
    knobEl = document.createElement('div');
    knobEl.className = 'knob';
    innerEl = document.createElement('div');
    innerEl.className = 'knob-inner';
    knobEl.appendChild(innerEl);
    container.appendChild(knobEl);
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Limpiar badges del body
    document.querySelectorAll('.knob-mod-badge').forEach(el => el.remove());
    document.body.removeChild(container);
  });

  it('inicializa modifierState en "none"', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5
    });
    
    assert.strictEqual(knob.modifierState, 'none');
  });

  it('crea modBadge element', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5
    });
    
    assert.ok(knob.modBadge, 'modBadge debería existir');
    assert.ok(knob.modBadge.classList.contains('knob-mod-badge'), 'Tiene clase correcta');
  });

  it('_setModifierVisual("fast") muestra "10x" con clase is-fast', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5
    });
    
    knob._setModifierVisual('fast');
    
    assert.strictEqual(knob.modifierState, 'fast');
    assert.strictEqual(knob.modBadge.textContent, '10x');
    assert.ok(knob.modBadge.classList.contains('is-fast'));
    assert.ok(knob.modBadge.classList.contains('is-active'));
  });

  it('_setModifierVisual("slow") muestra "0.1x" con clase is-slow', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5
    });
    
    knob._setModifierVisual('slow');
    
    assert.strictEqual(knob.modifierState, 'slow');
    assert.strictEqual(knob.modBadge.textContent, '0.1x');
    assert.ok(knob.modBadge.classList.contains('is-slow'));
    assert.ok(knob.modBadge.classList.contains('is-active'));
  });

  it('transición fast → none muestra "1x" temporalmente', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5
    });
    
    knob._setModifierVisual('fast');
    knob._setModifierVisual('none');
    
    assert.strictEqual(knob.modifierState, 'none');
    assert.strictEqual(knob.modBadge.textContent, '1x');
    // Debería tener is-active por el timer
    assert.ok(knob.modBadge.classList.contains('is-active'));
    // No debería tener clases de color
    assert.ok(!knob.modBadge.classList.contains('is-fast'));
    assert.ok(!knob.modBadge.classList.contains('is-slow'));
  });

  it('transición slow → none muestra "1x" temporalmente', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5
    });
    
    knob._setModifierVisual('slow');
    knob._setModifierVisual('none');
    
    assert.strictEqual(knob.modBadge.textContent, '1x');
  });

  it('transición none → none no activa el badge', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5
    });
    
    // El estado inicial es none, así que esto no debería activar el badge
    knob._setModifierVisual('none');
    
    assert.ok(!knob.modBadge.classList.contains('is-active'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: Auto-hide de tooltip táctil
// ═══════════════════════════════════════════════════════════════════════════

describe('Knob - Tooltip auto-hide', () => {
  let container, knobEl, innerEl;

  beforeEach(() => {
    container = document.createElement('div');
    knobEl = document.createElement('div');
    knobEl.className = 'knob';
    innerEl = document.createElement('div');
    innerEl.className = 'knob-inner';
    knobEl.appendChild(innerEl);
    container.appendChild(knobEl);
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Limpiar tooltips y badges
    document.querySelectorAll('.knob-tooltip, .knob-mod-badge').forEach(el => el.remove());
    document.body.removeChild(container);
  });

  it('tooltipAutoHideDelay tiene valor por defecto de 3000ms', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5
    });
    
    assert.strictEqual(knob.tooltipAutoHideDelay, 3000);
  });

  it('tooltipAutoHideDelay es configurable', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5,
      tooltipAutoHideDelay: 5000
    });
    
    assert.strictEqual(knob.tooltipAutoHideDelay, 5000);
  });

  it('_showTooltip crea elemento tooltip', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5
    });
    
    knob._showTooltip();
    
    assert.ok(knob.tooltip, 'tooltip debería existir');
    assert.ok(knob.tooltip.classList.contains('knob-tooltip'));
  });

  it('_hideTooltip elimina el tooltip', (t, done) => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5
    });
    
    knob._showTooltip();
    assert.ok(knob.tooltip);
    
    knob._hideTooltip();
    
    // El tooltip se elimina después de la transición (150ms)
    setTimeout(() => {
      assert.strictEqual(knob.tooltip, null);
      done();
    }, 200);
  });

  it('_showTooltip no crea duplicados', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5
    });
    
    knob._showTooltip();
    const firstTooltip = knob.tooltip;
    
    knob._showTooltip(); // Segunda llamada
    
    assert.strictEqual(knob.tooltip, firstTooltip, 'No debería crear nuevo tooltip');
  });

  it('_updateTooltip actualiza contenido', () => {
    const knob = new Knob(knobEl, {
      min: 0,
      max: 1,
      initial: 0.5,
      scaleMin: 0,
      scaleMax: 10,
      scaleDecimals: 1
    });
    
    knob._showTooltip();
    assert.ok(knob.tooltip.innerHTML.includes('5.0'));
    
    knob.value = 0.8;
    knob._updateTooltip();
    
    assert.ok(knob.tooltip.innerHTML.includes('8.0'));
  });
});
