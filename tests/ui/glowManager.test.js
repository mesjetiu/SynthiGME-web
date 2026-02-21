/**
 * Tests para glowManager — Sistema centralizado de halo brillante
 *
 * Cobertura:
 * 1. Presets: estructura, valores, preset por defecto
 * 2. API pública: init, get/set preset, persistencia localStorage
 * 3. flashGlow / flashPinGlow: comportamiento DOM (clases, timers)
 * 4. isGlowEnabled: lógica on/off
 * 5. CSS variables: generación correcta por _applyCSSVariables (vía presets)
 * 6. glow-disabled: clase en documentElement cuando preset=off
 * 7. Integración CSS: reglas de animación presentes en main.css
 * 8. Integración JS: todos los controles importan y usan flashGlow/flashPinGlow
 */
import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Paths ───────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const CSS_PATH = resolve(ROOT, 'src/assets/css/main.css');

// ─── JSDOM setup ─────────────────────────────────────────────────────────────
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.HTMLElement = dom.window.HTMLElement;

global.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, value) { this._data[key] = String(value); },
  removeItem(key) { delete this._data[key]; },
  clear() { this._data = {}; }
};

// ─── Import módulo bajo test ─────────────────────────────────────────────────
const {
  GLOW_PRESETS,
  initGlowManager,
  getGlowPreset,
  setGlowPreset,
  getGlowPresetIds,
  flashGlow,
  flashPinGlow,
  isGlowEnabled
} = await import('../../src/assets/js/ui/glowManager.js');

// ═══════════════════════════════════════════════════════════════════════════
// 1. PRESETS — estructura y valores
// ═══════════════════════════════════════════════════════════════════════════

describe('GlowManager — Presets', () => {

  it('tiene exactamente 4 presets: performance, standard, subtle, off', () => {
    const ids = Object.keys(GLOW_PRESETS);
    assert.deepStrictEqual(ids.sort(), ['off', 'performance', 'standard', 'subtle']);
  });

  it('cada preset tiene todas las propiedades requeridas', () => {
    const requiredKeys = ['id', 'intensity', 'spread', 'duration', 'color', 'opacity', 'pulseOnChange'];
    for (const [key, preset] of Object.entries(GLOW_PRESETS)) {
      for (const prop of requiredKeys) {
        assert.ok(prop in preset, `Preset "${key}" le falta la propiedad "${prop}"`);
      }
    }
  });

  it('color es un array RGB de 3 números entre 0-255', () => {
    for (const [key, preset] of Object.entries(GLOW_PRESETS)) {
      assert.ok(Array.isArray(preset.color), `Preset "${key}": color no es array`);
      assert.strictEqual(preset.color.length, 3, `Preset "${key}": color debe tener 3 componentes`);
      for (const c of preset.color) {
        assert.ok(typeof c === 'number' && c >= 0 && c <= 255,
          `Preset "${key}": componente de color fuera de rango: ${c}`);
      }
    }
  });

  it('intensity es un número >= 0', () => {
    for (const [key, preset] of Object.entries(GLOW_PRESETS)) {
      assert.ok(typeof preset.intensity === 'number' && preset.intensity >= 0,
        `Preset "${key}": intensity inválida: ${preset.intensity}`);
    }
  });

  it('duration es un número >= 0 (ms)', () => {
    for (const [key, preset] of Object.entries(GLOW_PRESETS)) {
      assert.ok(typeof preset.duration === 'number' && preset.duration >= 0,
        `Preset "${key}": duration inválida: ${preset.duration}`);
    }
  });

  it('opacity está entre 0 y 1', () => {
    for (const [key, preset] of Object.entries(GLOW_PRESETS)) {
      assert.ok(preset.opacity >= 0 && preset.opacity <= 1,
        `Preset "${key}": opacity fuera de rango: ${preset.opacity}`);
    }
  });

  it('preset "off" tiene intensity=0 y pulseOnChange=false', () => {
    assert.strictEqual(GLOW_PRESETS.off.intensity, 0);
    assert.strictEqual(GLOW_PRESETS.off.pulseOnChange, false);
  });

  it('presets activos (performance, standard, subtle) tienen pulseOnChange=true', () => {
    for (const id of ['performance', 'standard', 'subtle']) {
      assert.strictEqual(GLOW_PRESETS[id].pulseOnChange, true,
        `Preset "${id}" debe tener pulseOnChange=true`);
    }
  });

  it('presets activos tienen intensity > 0', () => {
    for (const id of ['performance', 'standard', 'subtle']) {
      assert.ok(GLOW_PRESETS[id].intensity > 0,
        `Preset "${id}" debe tener intensity > 0`);
    }
  });

  it('los IDs del preset coinciden con las claves del objeto', () => {
    for (const [key, preset] of Object.entries(GLOW_PRESETS)) {
      assert.strictEqual(preset.id, key,
        `Preset "${key}" tiene id="${preset.id}" que no coincide`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. API PÚBLICA — init, get/set, persistencia
// ═══════════════════════════════════════════════════════════════════════════

describe('GlowManager — API pública', () => {

  beforeEach(() => {
    localStorage.clear();
    // Reset a standard
    setGlowPreset('standard');
  });

  it('getGlowPresetIds() devuelve todos los IDs de presets', () => {
    const ids = getGlowPresetIds();
    assert.deepStrictEqual(ids.sort(), ['off', 'performance', 'standard', 'subtle']);
  });

  it('getGlowPreset() devuelve el preset activo', () => {
    assert.strictEqual(getGlowPreset(), 'standard');
  });

  it('setGlowPreset() cambia el preset activo', () => {
    setGlowPreset('performance');
    assert.strictEqual(getGlowPreset(), 'performance');
  });

  it('setGlowPreset() persiste en localStorage', () => {
    setGlowPreset('subtle');
    const stored = localStorage.getItem('synthigme-glow-preset');
    assert.strictEqual(stored, 'subtle');
  });

  it('setGlowPreset() ignora IDs inválidos', () => {
    setGlowPreset('standard');
    setGlowPreset('invalid_preset');
    assert.strictEqual(getGlowPreset(), 'standard', 'no debe cambiar con ID inválido');
  });

  it('initGlowManager() restaura preset desde localStorage', () => {
    localStorage.setItem('synthigme-glow-preset', 'performance');
    initGlowManager();
    assert.strictEqual(getGlowPreset(), 'performance');
  });

  it('initGlowManager() usa "standard" si localStorage está vacío', () => {
    localStorage.clear();
    initGlowManager();
    assert.strictEqual(getGlowPreset(), 'standard');
  });

  it('initGlowManager() ignora valores inválidos en localStorage', () => {
    localStorage.setItem('synthigme:glow-preset', 'nonexistent');
    initGlowManager();
    // Debe mantener el preset actual o standard, NO crash
    assert.ok(getGlowPresetIds().includes(getGlowPreset()),
      'preset activo debe ser uno válido');
  });

  it('isGlowEnabled() devuelve true para presets activos', () => {
    for (const id of ['performance', 'standard', 'subtle']) {
      setGlowPreset(id);
      assert.strictEqual(isGlowEnabled(), true, `isGlowEnabled() debe ser true para "${id}"`);
    }
  });

  it('isGlowEnabled() devuelve false para preset "off"', () => {
    setGlowPreset('off');
    assert.strictEqual(isGlowEnabled(), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. flashGlow — comportamiento DOM
// ═══════════════════════════════════════════════════════════════════════════

describe('GlowManager — flashGlow()', () => {

  beforeEach(() => {
    localStorage.clear();
    setGlowPreset('standard');
  });

  it('añade la clase "glow-flash" al elemento', () => {
    const el = document.createElement('div');
    flashGlow(el);
    assert.ok(el.classList.contains('glow-flash'), 'debe añadir glow-flash');
  });

  it('quita la clase "glow-flash" tras la duración del preset', async () => {
    setGlowPreset('subtle'); // duration=400ms
    const el = document.createElement('div');
    flashGlow(el);
    assert.ok(el.classList.contains('glow-flash'));
    
    await new Promise(r => setTimeout(r, 500)); // esperar > 400ms
    assert.ok(!el.classList.contains('glow-flash'), 'debe quitar glow-flash tras duración');
  });

  it('no añade clase si preset es "off"', () => {
    setGlowPreset('off');
    const el = document.createElement('div');
    flashGlow(el);
    assert.ok(!el.classList.contains('glow-flash'), 'no debe añadir glow-flash si off');
  });

  it('no hace nada si element es null', () => {
    // No debe lanzar error
    flashGlow(null);
    flashGlow(undefined);
  });

  it('no sobrepone glow si el elemento tiene is-tooltip-active', () => {
    const el = document.createElement('div');
    el.classList.add('is-tooltip-active');
    flashGlow(el);
    assert.ok(!el.classList.contains('glow-flash'),
      'no debe añadir glow-flash si ya tiene is-tooltip-active');
  });

  it('permite re-trigger rápido (reinicia animación)', () => {
    const el = document.createElement('div');
    flashGlow(el);
    assert.ok(el.classList.contains('glow-flash'));
    // Segundo trigger inmediato
    flashGlow(el);
    assert.ok(el.classList.contains('glow-flash'), 'debe seguir con glow-flash tras re-trigger');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. flashPinGlow — comportamiento DOM
// ═══════════════════════════════════════════════════════════════════════════

describe('GlowManager — flashPinGlow()', () => {

  beforeEach(() => {
    localStorage.clear();
    setGlowPreset('standard');
  });

  it('añade la clase "glow-flash-pin" al elemento', () => {
    const el = document.createElement('button');
    flashPinGlow(el);
    assert.ok(el.classList.contains('glow-flash-pin'), 'debe añadir glow-flash-pin');
  });

  it('quita la clase tras la duración', async () => {
    setGlowPreset('subtle'); // 400ms
    const el = document.createElement('button');
    flashPinGlow(el);
    assert.ok(el.classList.contains('glow-flash-pin'));
    
    await new Promise(r => setTimeout(r, 500));
    assert.ok(!el.classList.contains('glow-flash-pin'), 'debe quitar glow-flash-pin tras duración');
  });

  it('no añade clase si preset es "off"', () => {
    setGlowPreset('off');
    const el = document.createElement('button');
    flashPinGlow(el);
    assert.ok(!el.classList.contains('glow-flash-pin'));
  });

  it('no hace nada si element es null', () => {
    flashPinGlow(null);
    flashPinGlow(undefined);
  });

  it('no sobrepone si el pin tiene is-tooltip-target', () => {
    const el = document.createElement('button');
    el.classList.add('is-tooltip-target');
    flashPinGlow(el);
    assert.ok(!el.classList.contains('glow-flash-pin'),
      'no debe añadir glow-flash-pin si ya tiene is-tooltip-target');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CSS VARIABLES — generación por preset
// ═══════════════════════════════════════════════════════════════════════════

describe('GlowManager — CSS variables', () => {

  beforeEach(() => {
    // Limpiar CSS vars del root
    const root = document.documentElement;
    root.style.cssText = '';
    root.classList.remove('glow-disabled');
  });

  it('setGlowPreset aplica --glow-duration al documentElement', () => {
    setGlowPreset('performance');
    const val = document.documentElement.style.getPropertyValue('--glow-duration');
    assert.strictEqual(val, '600ms');
  });

  it('setGlowPreset aplica --glow-intensity', () => {
    setGlowPreset('standard');
    const val = document.documentElement.style.getPropertyValue('--glow-intensity');
    assert.ok(val, '--glow-intensity debe estar definida');
  });

  it('setGlowPreset aplica --glow-spread', () => {
    setGlowPreset('standard');
    const val = document.documentElement.style.getPropertyValue('--glow-spread');
    assert.ok(val.includes('px'), '--glow-spread debe tener unidad px');
  });

  it('setGlowPreset aplica --glow-knob-shadow con rgba()', () => {
    setGlowPreset('standard');
    const val = document.documentElement.style.getPropertyValue('--glow-knob-shadow');
    assert.ok(val.includes('rgba('), '--glow-knob-shadow debe usar rgba()');
  });

  it('setGlowPreset aplica --glow-flash-shadow con rgba()', () => {
    setGlowPreset('standard');
    const val = document.documentElement.style.getPropertyValue('--glow-flash-shadow');
    assert.ok(val.includes('rgba('), '--glow-flash-shadow debe usar rgba()');
  });

  it('setGlowPreset aplica --glow-slider-shadow', () => {
    setGlowPreset('performance');
    const val = document.documentElement.style.getPropertyValue('--glow-slider-shadow');
    assert.ok(val.includes('rgba('), '--glow-slider-shadow debe usar rgba()');
  });

  it('setGlowPreset aplica --glow-pad-shadow', () => {
    setGlowPreset('performance');
    const val = document.documentElement.style.getPropertyValue('--glow-pad-shadow');
    assert.ok(val.includes('rgba('), '--glow-pad-shadow debe usar rgba()');
  });

  it('setGlowPreset aplica --glow-pin-shadow', () => {
    setGlowPreset('performance');
    const val = document.documentElement.style.getPropertyValue('--glow-pin-shadow');
    assert.ok(val.includes('rgba('), '--glow-pin-shadow debe usar rgba()');
  });

  it('preset "off" añade clase glow-disabled al documentElement', () => {
    setGlowPreset('off');
    assert.ok(document.documentElement.classList.contains('glow-disabled'),
      'debe añadir glow-disabled cuando preset=off');
  });

  it('presets activos quitan clase glow-disabled', () => {
    setGlowPreset('off');
    assert.ok(document.documentElement.classList.contains('glow-disabled'));
    setGlowPreset('standard');
    assert.ok(!document.documentElement.classList.contains('glow-disabled'),
      'debe quitar glow-disabled al cambiar a preset activo');
  });

  it('las CSS variables de shadow cambian según el preset', () => {
    setGlowPreset('performance');
    const perfShadow = document.documentElement.style.getPropertyValue('--glow-knob-shadow');
    
    setGlowPreset('subtle');
    const subtleShadow = document.documentElement.style.getPropertyValue('--glow-knob-shadow');
    
    assert.notStrictEqual(perfShadow, subtleShadow,
      'el shadow debe ser diferente entre performance y subtle');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. setGlowPreset dispara evento synth:settingChanged
// ═══════════════════════════════════════════════════════════════════════════

describe('GlowManager — Evento de cambio', () => {

  it('setGlowPreset dispara synth:settingChanged con key y value', (t, done) => {
    const handler = (e) => {
      assert.strictEqual(e.detail.key, 'glowPreset');
      assert.strictEqual(e.detail.value, 'performance');
      document.removeEventListener('synth:settingChanged', handler);
      done();
    };
    document.addEventListener('synth:settingChanged', handler);
    setGlowPreset('performance');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. CSS — Reglas de animación glow en main.css (análisis estático)
// ═══════════════════════════════════════════════════════════════════════════

describe('Glow CSS — Reglas de animación en main.css', () => {
  let cssSource;

  before(() => {
    cssSource = readFileSync(CSS_PATH, 'utf-8');
  });

  // ── Keyframes requeridos ──────────────────────────────────────────────
  const requiredKeyframes = [
    'knob-tooltip-glow',
    'knob-glow-flash',
    'slider-tooltip-glow',
    'slider-glow-flash',
    'switch-glow-flash',
    'pin-glow-flash',
    'pad-glow-flash',
    'toggle-glow-flash'
  ];

  for (const name of requiredKeyframes) {
    it(`@keyframes ${name} existe`, () => {
      assert.ok(cssSource.includes(`@keyframes ${name}`),
        `Falta @keyframes ${name} en main.css`);
    });
  }

  // ── Selectores de activación glow-flash ────────────────────────────────
  const requiredSelectors = [
    '.knob.glow-flash',
    '.output-channel__slider-wrap.glow-flash',
    '.output-channel__switch.glow-flash',
    '.pin-btn.glow-flash-pin',
    '.synth-toggle.glow-flash',
  ];

  for (const sel of requiredSelectors) {
    it(`selector "${sel}" existe`, () => {
      assert.ok(cssSource.includes(sel),
        `Falta selector ${sel} en main.css`);
    });
  }

  // ── Selectores glow-disabled ────────────────────────────────────────────
  const disabledSelectors = [
    '.glow-disabled .knob.glow-flash',
    '.glow-disabled .knob.is-tooltip-active',
    '.glow-disabled .output-channel__slider-wrap.glow-flash',
    '.glow-disabled .output-channel__switch.glow-flash',
    '.glow-disabled .synth-toggle.glow-flash',
    '.glow-disabled .matrix.matrix-large .pin-btn.glow-flash-pin'
  ];

  for (const sel of disabledSelectors) {
    it(`regla de desactivación "${sel}" existe`, () => {
      assert.ok(cssSource.includes(sel),
        `Falta regla glow-disabled para ${sel}`);
    });
  }

  // ── CSS vars usadas por las animaciones ─────────────────────────────────
  const requiredCSSVars = [
    '--glow-duration',
    '--glow-knob-shadow',
    '--glow-knob-shadow-idle',
    '--glow-slider-shadow',
    '--glow-flash-shadow',
    '--glow-pad-shadow',
    '--glow-pin-shadow'
  ];

  for (const varName of requiredCSSVars) {
    it(`variable CSS ${varName} está referenciada en main.css`, () => {
      assert.ok(cssSource.includes(varName),
        `Falta referencia a ${varName} en main.css`);
    });
  }

  // ── Overflow visible en contenedores de módulos ─────────────────────────
  it('.synth-module tiene overflow: visible (no hidden, para no clipear glow)', () => {
    // Buscar la regla .synth-module { ... overflow: visible ... }
    const regex = /\.synth-module\s*\{[^}]*overflow:\s*visible/s;
    assert.ok(regex.test(cssSource),
      '.synth-module debe tener overflow: visible para que el glow no se clipee');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. INTEGRACIÓN JS — flashGlow/flashPinGlow usado en todos los controles
// ═══════════════════════════════════════════════════════════════════════════

describe('Glow integración — Archivos que importan y usan flashGlow/flashPinGlow', () => {
  
  /**
   * Verifica que un archivo importa la función y la llama al menos una vez.
   */
  function assertGlowUsage(relPath, fnName) {
    const source = readFileSync(resolve(ROOT, relPath), 'utf-8');
    const importRegex = new RegExp(`import\\s*\\{[^}]*\\b${fnName}\\b[^}]*\\}\\s*from\\s*['"].*glowManager`);
    assert.ok(importRegex.test(source),
      `${relPath} debe importar ${fnName} desde glowManager`);
    
    const callRegex = new RegExp(`\\b${fnName}\\s*\\(`);
    assert.ok(callRegex.test(source),
      `${relPath} debe llamar a ${fnName}()`);
  }

  // ── flashGlow en controles directos ────────────────────────────────────

  it('knob.js importa y usa flashGlow', () => {
    assertGlowUsage('src/assets/js/ui/knob.js', 'flashGlow');
  });

  it('toggle.js importa y usa flashGlow', () => {
    assertGlowUsage('src/assets/js/ui/toggle.js', 'flashGlow');
  });

  it('sgmeOscillator.js importa y usa flashGlow', () => {
    assertGlowUsage('src/assets/js/ui/sgmeOscillator.js', 'flashGlow');
  });

  it('outputChannel.js importa y usa flashGlow', () => {
    assertGlowUsage('src/assets/js/modules/outputChannel.js', 'flashGlow');
  });

  // ── flashPinGlow en matrices ───────────────────────────────────────────

  it('largeMatrix.js importa y usa flashPinGlow', () => {
    assertGlowUsage('src/assets/js/ui/largeMatrix.js', 'flashPinGlow');
  });

  // ── flashGlow en sincronización OSC ────────────────────────────────────

  it('oscOutputChannelSync.js importa y usa flashGlow', () => {
    assertGlowUsage('src/assets/js/osc/oscOutputChannelSync.js', 'flashGlow');
  });

  it('oscJoystickSync.js importa y usa flashGlow', () => {
    assertGlowUsage('src/assets/js/osc/oscJoystickSync.js', 'flashGlow');
  });

  it('oscOscillatorSync.js importa y usa flashGlow', () => {
    assertGlowUsage('src/assets/js/osc/oscOscillatorSync.js', 'flashGlow');
  });

  it('oscMatrixSync.js importa y usa flashPinGlow', () => {
    assertGlowUsage('src/assets/js/osc/oscMatrixSync.js', 'flashPinGlow');
  });

  // ── flashGlow en app.js (pads de joystick) ─────────────────────────────

  it('app.js importa y usa flashGlow (pads de joystick)', () => {
    assertGlowUsage('src/assets/js/app.js', 'flashGlow');
  });

  it('app.js importa initGlowManager', () => {
    const source = readFileSync(resolve(ROOT, 'src/assets/js/app.js'), 'utf-8');
    assert.ok(source.includes('initGlowManager'),
      'app.js debe importar initGlowManager');
  });

  // ── settingsModal usa get/set preset ───────────────────────────────────

  it('settingsModal.js importa getGlowPreset y setGlowPreset', () => {
    const source = readFileSync(resolve(ROOT, 'src/assets/js/ui/settingsModal.js'), 'utf-8');
    assert.ok(source.includes('getGlowPreset'), 'settingsModal debe importar getGlowPreset');
    assert.ok(source.includes('setGlowPreset'), 'settingsModal debe importar setGlowPreset');
    assert.ok(source.includes('getGlowPresetIds'), 'settingsModal debe importar getGlowPresetIds');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. PUNTOS DE ACTIVACIÓN — flashGlow en click handlers y deserialize
// ═══════════════════════════════════════════════════════════════════════════

describe('Glow integración — Puntos de activación en click y deserialize', () => {

  it('outputChannel.js llama flashGlow en el click handler del switch', () => {
    const source = readFileSync(resolve(ROOT, 'src/assets/js/modules/outputChannel.js'), 'utf-8');
    // Debe haber flashGlow dentro del bloque del addEventListener('click') del switch
    const clickBlock = source.substring(
      source.indexOf("switchEl.addEventListener('click'"),
      source.indexOf("this.powerSwitch = switchEl")
    );
    assert.ok(clickBlock.includes('flashGlow(switchEl)'),
      'El click handler del switch en outputChannel.js debe llamar flashGlow(switchEl)');
  });

  it('outputChannel.js llama flashGlow en deserialize (slider)', () => {
    const source = readFileSync(resolve(ROOT, 'src/assets/js/modules/outputChannel.js'), 'utf-8');
    assert.ok(source.includes('flashGlow(this._sliderWrapEl)'),
      'deserialize de outputChannel debe llamar flashGlow para el slider');
  });

  it('outputChannel.js llama flashGlow en deserialize (powerSwitch)', () => {
    const source = readFileSync(resolve(ROOT, 'src/assets/js/modules/outputChannel.js'), 'utf-8');
    assert.ok(source.includes('flashGlow(this.powerSwitch)'),
      'deserialize de outputChannel debe llamar flashGlow para el powerSwitch');
  });

  it('sgmeOscillator.js llama flashGlow en el click handler del range switch', () => {
    const source = readFileSync(resolve(ROOT, 'src/assets/js/ui/sgmeOscillator.js'), 'utf-8');
    const clickBlock = source.substring(
      source.indexOf("range.addEventListener('click'"),
      source.indexOf('rangeWrap.appendChild(range)')
    );
    assert.ok(clickBlock.includes('flashGlow(range)'),
      'El click handler del range en sgmeOscillator.js debe llamar flashGlow(range)');
  });

  it('sgmeOscillator.js llama flashGlow en deserialize (rangeEl)', () => {
    const source = readFileSync(resolve(ROOT, 'src/assets/js/ui/sgmeOscillator.js'), 'utf-8');
    assert.ok(source.includes('flashGlow(rangeEl)'),
      'deserialize de sgmeOscillator debe llamar flashGlow(rangeEl)');
  });

  it('toggle.js llama flashGlow en toggle() y setState()', () => {
    const source = readFileSync(resolve(ROOT, 'src/assets/js/ui/toggle.js'), 'utf-8');
    // Buscar flashGlow dentro de toggle()
    const toggleMethod = source.substring(
      source.indexOf('toggle() {'),
      source.indexOf('setState(')
    );
    assert.ok(toggleMethod.includes('flashGlow(this.element)'),
      'toggle() debe llamar flashGlow(this.element)');
    
    // Buscar flashGlow dentro de setState()
    const setStateMethod = source.substring(
      source.indexOf('setState(state)'),
      source.indexOf('getState()')
    );
    assert.ok(setStateMethod.includes('flashGlow(this.element)'),
      'setState() debe llamar flashGlow(this.element)');
  });

  it('knob.js llama flashGlow en setValue cuando no está en drag', () => {
    const source = readFileSync(resolve(ROOT, 'src/assets/js/ui/knob.js'), 'utf-8');
    assert.ok(source.includes('flashGlow(this.rootEl)'),
      'knob.js debe llamar flashGlow(this.rootEl) en setValue');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. CONSTANTES — clave de localStorage
// ═══════════════════════════════════════════════════════════════════════════

describe('Glow — Constante STORAGE_KEYS.GLOW_PRESET', () => {

  it('GLOW_PRESET existe en constants.js', () => {
    const source = readFileSync(resolve(ROOT, 'src/assets/js/utils/constants.js'), 'utf-8');
    assert.ok(source.includes('GLOW_PRESET'),
      'constants.js debe definir GLOW_PRESET en STORAGE_KEYS');
  });

  it('la clave contiene "glow"', () => {
    const source = readFileSync(resolve(ROOT, 'src/assets/js/utils/constants.js'), 'utf-8');
    const match = source.match(/GLOW_PRESET:\s*[`'"]([^`'"]+)[`'"]/);
    assert.ok(match, 'Debe encontrar la definición de GLOW_PRESET');
    assert.ok(match[1].includes('glow'), `La clave "${match[1]}" debe contener "glow"`);
  });
});
