/**
 * Tests para el detach/return por doble click/tap en paneles del canvas principal.
 *
 * Tras la reestructuración PiP-first, `setupPanelDoubleTapZoom()` ya no hace
 * zoom del canvas: alterna detach/return vía `window.__synthToggleRememberedPip`.
 *
 * Método: análisis estático del código fuente de viewportNavigation.js.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const navSource = readFileSync(resolve(ROOT, 'src/assets/js/navigation/viewportNavigation.js'), 'utf-8');
const doubleTapSection = navSource.substring(navSource.indexOf('export function setupPanelDoubleTapZoom()'));

function extractInteractiveSelectors() {
  const selectorMatch = doubleTapSection.match(/INTERACTIVE_SELECTORS\s*=\s*\[([\s\S]*?)\]\.join/);
  if (!selectorMatch) return [];
  const selectors = [];
  const regex = /'([^']+)'/g;
  let match;
  while ((match = regex.exec(selectorMatch[1])) !== null) {
    selectors.push(match[1]);
  }
  return selectors;
}

let interactiveSelectors;

before(() => {
  interactiveSelectors = extractInteractiveSelectors();
});

describe('Selectores interactivos para prevenir detach accidental', () => {
  it('se extraen correctamente del código', () => {
    assert.ok(interactiveSelectors.length > 10,
      `Se esperan >10 selectores, encontrados: ${interactiveSelectors.length}`);
  });

  it('incluye formularios y controles HTML nativos', () => {
    ['button', 'input', 'select', 'textarea', 'a'].forEach(selector => {
      assert.ok(interactiveSelectors.includes(selector), `Falta ${selector}`);
    });
  });

  it('incluye controles del sintetizador y de la matriz', () => {
    [
      '.knob', '.knob-inner', '.knob-cap', '.knob-wrap',
      '.slider', '.switch', '.toggle', '.fader',
      '.output-fader', '.output-channel__slider', '.output-channel__switch',
      '.synth-toggle', '.pin-btn', '.matrix-cell'
    ].forEach(selector => {
      assert.ok(interactiveSelectors.includes(selector), `Falta ${selector}`);
    });
  });

  it('incluye joysticks, secuenciador y controles específicos de módulos', () => {
    [
      '.joystick-pad', '.joystick-handle', '.panel7-joystick-pad',
      '.panel7-seq-switch', '.panel7-seq-button',
      '.sgme-osc__knob', '.noise-generator__knob', '.random-voltage__knob'
    ].forEach(selector => {
      assert.ok(interactiveSelectors.includes(selector), `Falta ${selector}`);
    });
  });
});

describe('Doble click de ratón en el canvas principal', () => {
  it('usa dblclick nativo en vez de reconstruir el doble click con click manual', () => {
    assert.match(doubleTapSection, /panel\.addEventListener\('dblclick'/);
    assert.doesNotMatch(doubleTapSection, /panel\.addEventListener\('click'/);
  });

  it('registra el dblclick en fase de captura', () => {
    assert.match(doubleTapSection, /\},\s*\{\s*capture:\s*true\s*\}\)/);
  });

  it('ignora paneles ya detached y elementos interactivos', () => {
    assert.match(doubleTapSection, /dblclick[\s\S]*?panel--pipped[\s\S]*?return/);
    assert.match(doubleTapSection, /dblclick[\s\S]*?isInteractiveElement\(ev\.target\)[\s\S]*?return/);
  });

  it('descarta dblclick sintético inmediatamente posterior a touch', () => {
    assert.match(doubleTapSection, /dblclick[\s\S]*?lastTouchEndTime[\s\S]*?<\s*500[\s\S]*?return/);
  });

  it('llama al toggle PiP recordado y bloquea el comportamiento nativo', () => {
    assert.match(doubleTapSection, /function handleZoomToggle\(\) \{[\s\S]*?window\.__synthToggleRememberedPip\?\.\(panelId\);/);
    assert.match(doubleTapSection, /dblclick[\s\S]*?handleZoomToggle\(\)[\s\S]*?ev\.preventDefault\(\)[\s\S]*?ev\.stopPropagation\(\)/);
  });
});

describe('Doble tap táctil en el canvas principal', () => {
  it('mantiene handler touchend dedicado', () => {
    assert.match(doubleTapSection, /panel\.addEventListener\('touchend'/);
    assert.match(doubleTapSection, /passive:\s*false/);
  });

  it('mantiene estado separado para touch y registra lastTouchEndTime', () => {
    assert.match(doubleTapSection, /let touchTime = 0;/);
    assert.match(doubleTapSection, /let touchX = 0;/);
    assert.match(doubleTapSection, /let touchY = 0;/);
    assert.match(doubleTapSection, /lastTouchEndTime\s*=\s*Date\.now\(\)/);
  });

  it('ignora paneles detached, elementos interactivos y gestos multitáctiles activos', () => {
    assert.match(doubleTapSection, /touchend[\s\S]*?panel--pipped[\s\S]*?return/);
    assert.match(doubleTapSection, /touchend[\s\S]*?isInteractiveElement\(ev\.target\)[\s\S]*?return/);
    assert.match(doubleTapSection, /touchend[\s\S]*?__synthNavGestureActive/);
  });

  it('usa DOUBLE_TAP_DELAY y MAX_DBLCLICK_DISTANCE para validar el gesto', () => {
    assert.match(doubleTapSection, /DOUBLE_TAP_DELAY\s*=\s*300/);
    assert.match(doubleTapSection, /MAX_DBLCLICK_DISTANCE\s*=\s*50/);
    assert.match(doubleTapSection, /timeSinceLastTap\s*<\s*DOUBLE_TAP_DELAY/);
    assert.match(doubleTapSection, /dist\s*<\s*MAX_DBLCLICK_DISTANCE/);
  });

  it('usa changedTouches[0] y alterna detach/return al validar el doble tap', () => {
    assert.match(doubleTapSection, /const touch = ev\.changedTouches\[0\]/);
    assert.match(doubleTapSection, /touchend[\s\S]*?handleZoomToggle\(\)/);
  });
});

describe('Cobertura de paneles soportados', () => {
  it('incluye los 7 paneles del sistema', () => {
    const panelIds = doubleTapSection.match(/PANEL_IDS\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(panelIds, 'Debe definir PANEL_IDS');

    ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6', 'panel-output'].forEach(id => {
      assert.ok(panelIds[1].includes(`'${id}'`), `Falta ${id} en PANEL_IDS`);
    });
  });
});
