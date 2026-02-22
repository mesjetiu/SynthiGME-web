/**
 * Tests para la prevención de zoom por doble-click/tap en controles interactivos
 * 
 * Verifica que setupPanelDoubleTapZoom() filtra correctamente:
 * - Doble click/tap en área vacía del panel → zoom toggle (correcto)
 * - Doble click/tap en knobs, sliders, joystick pads, etc. → ignorado (prevención)
 * - Paneles en PiP se excluyen (tienen sus propios handlers)
 * - Los selectores INTERACTIVE_SELECTORS cubren todos los controles del synth
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

// Extraer la sección de setupPanelDoubleTapZoom
const doubleTapSection = navSource.substring(
  navSource.indexOf('function setupPanelDoubleTapZoom')
);

// Extraer los selectores de INTERACTIVE_SELECTORS
function extractInteractiveSelectors() {
  const selectorMatch = doubleTapSection.match(
    /INTERACTIVE_SELECTORS\s*=\s*\[([\s\S]*?)\]\.join/
  );
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

// ═══════════════════════════════════════════════════════════════════════════
// 1. SELECTORES INTERACTIVOS REQUERIDOS
// ═══════════════════════════════════════════════════════════════════════════

describe('Selectores interactivos para prevención de zoom', () => {

  it('se extraen correctamente del código', () => {
    assert.ok(interactiveSelectors.length > 10, 
      `Se esperan >10 selectores, encontrados: ${interactiveSelectors.length}`);
  });

  // Controles HTML nativos
  it('incluye elementos de formulario nativos (button, input, select, textarea)', () => {
    assert.ok(interactiveSelectors.includes('button'), 'Falta button');
    assert.ok(interactiveSelectors.includes('input'), 'Falta input');
    assert.ok(interactiveSelectors.includes('select'), 'Falta select');
    assert.ok(interactiveSelectors.includes('textarea'), 'Falta textarea');
  });

  // Controles del sintetizador
  it('incluye knobs y sus partes internas', () => {
    assert.ok(interactiveSelectors.includes('.knob'), 'Falta .knob');
    assert.ok(interactiveSelectors.includes('.knob-inner'), 'Falta .knob-inner');
    assert.ok(interactiveSelectors.includes('.knob-cap'), 'Falta .knob-cap');
    assert.ok(interactiveSelectors.includes('.knob-wrap'), 'Falta .knob-wrap');
  });

  it('incluye controles de slider y fader', () => {
    assert.ok(interactiveSelectors.includes('.slider'), 'Falta .slider');
    assert.ok(interactiveSelectors.includes('.fader'), 'Falta .fader');
    assert.ok(interactiveSelectors.includes('.output-fader'), 'Falta .output-fader');
    assert.ok(interactiveSelectors.includes('.output-channel__slider'), 'Falta .output-channel__slider');
  });

  it('incluye controles de joystick', () => {
    assert.ok(interactiveSelectors.includes('.joystick-pad'), 'Falta .joystick-pad');
    assert.ok(interactiveSelectors.includes('.joystick-handle'), 'Falta .joystick-handle');
    assert.ok(interactiveSelectors.includes('.panel7-joystick-pad'), 'Falta .panel7-joystick-pad');
  });

  it('incluye pines y celdas de matriz', () => {
    assert.ok(interactiveSelectors.includes('.pin-btn'), 'Falta .pin-btn');
    assert.ok(interactiveSelectors.includes('.matrix-cell'), 'Falta .matrix-cell');
  });

  it('incluye switches y toggles', () => {
    assert.ok(interactiveSelectors.includes('.switch'), 'Falta .switch');
    assert.ok(interactiveSelectors.includes('.toggle'), 'Falta .toggle');
    assert.ok(interactiveSelectors.includes('.synth-toggle'), 'Falta .synth-toggle');
    assert.ok(interactiveSelectors.includes('.output-channel__switch'), 'Falta .output-channel__switch');
  });

  it('incluye roles ARIA de interacción', () => {
    assert.ok(interactiveSelectors.includes('[role="button"]'), 'Falta [role="button"]');
    assert.ok(interactiveSelectors.includes('[role="slider"]'), 'Falta [role="slider"]');
    assert.ok(interactiveSelectors.includes('[draggable="true"]'), 'Falta [draggable="true"]');
  });

  it('incluye data-prevent-pan para elementos que bloquean paneo', () => {
    assert.ok(interactiveSelectors.includes('[data-prevent-pan="true"]'), 'Falta [data-prevent-pan="true"]');
  });

  it('incluye controles específicos de módulos del sintetizador', () => {
    assert.ok(interactiveSelectors.includes('.sgme-osc__knob'), 'Falta .sgme-osc__knob (knob de osciladores)');
    assert.ok(interactiveSelectors.includes('.noise-generator__knob'), 'Falta .noise-generator__knob');
    assert.ok(interactiveSelectors.includes('.random-voltage__knob'), 'Falta .random-voltage__knob');
  });

  it('incluye controles de sequencer del panel 7', () => {
    assert.ok(interactiveSelectors.includes('.panel7-seq-switch'), 'Falta .panel7-seq-switch');
    assert.ok(interactiveSelectors.includes('.panel7-seq-button'), 'Falta .panel7-seq-button');
  });

  it('incluye botón de zoom del panel', () => {
    assert.ok(interactiveSelectors.includes('.panel-zoom-btn'), 'Falta .panel-zoom-btn');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. LÓGICA DE DOBLE CLICK (click manual + dblclick guard)
// ═══════════════════════════════════════════════════════════════════════════

describe('Lógica de click manual para doble-click en paneles', () => {

  it('se registra click handler en cada panel', () => {
    const clickHandler = doubleTapSection.match(
      /panel\.addEventListener\('click'/
    );
    assert.ok(clickHandler, 'Debe registrar handler click en paneles');
  });

  it('filtra clicks en elementos interactivos (isInteractiveElement)', () => {
    const guard = doubleTapSection.match(
      /click[\s\S]*?isInteractiveElement\(ev\.target\)[\s\S]*?return/
    );
    assert.ok(guard, 'click debe filtrar elementos interactivos y retornar temprano');
  });

  it('ignora paneles en PiP (panel--pipped)', () => {
    const pipGuard = doubleTapSection.match(
      /click[\s\S]*?panel--pipped[\s\S]*?return/
    );
    assert.ok(pipGuard, 'click debe ignorar paneles en modo PiP');
  });

  it('descarta clicks sintéticos generados por touch (lastTouchEndTime)', () => {
    const touchGuard = doubleTapSection.match(
      /click[\s\S]*?lastTouchEndTime[\s\S]*?return/
    );
    assert.ok(touchGuard, 'click debe descartar clicks sintéticos tras un touch');
  });

  it('valida distancia entre clics (MAX_DBLCLICK_DISTANCE)', () => {
    const distConst = doubleTapSection.match(/MAX_DBLCLICK_DISTANCE\s*=\s*(\d+)/);
    assert.ok(distConst, 'Debe definir MAX_DBLCLICK_DISTANCE');
    const dist = parseInt(distConst[1]);
    assert.ok(dist >= 20 && dist <= 100,
      `MAX_DBLCLICK_DISTANCE (${dist}px) debe estar entre 20-100px`);
  });

  it('usa estado separado para click (clickX/clickY) independiente de touch', () => {
    const clickState = doubleTapSection.match(
      /ev\.clientX\s*-\s*clickX/
    );
    assert.ok(clickState, 'click debe usar clickX/clickY, no variables compartidas con touch');
  });

  it('comprueba distancia < MAX_DBLCLICK_DISTANCE para validar doble-click', () => {
    const distCheck = doubleTapSection.match(
      /dist\s*<\s*MAX_DBLCLICK_DISTANCE/
    );
    assert.ok(distCheck, 'click debe comparar distancia con MAX_DBLCLICK_DISTANCE');
  });

  it('llama a handleZoomToggle() al hacer doble click válido', () => {
    const zoomToggle = doubleTapSection.match(
      /click[\s\S]*?handleZoomToggle\(\)/
    );
    assert.ok(zoomToggle, 'click debe llamar handleZoomToggle');
  });
});

describe('Guard dblclick nativo en paneles', () => {

  it('se registra dblclick handler en cada panel', () => {
    const dblclickHandler = doubleTapSection.match(
      /panel\.addEventListener\('dblclick'/
    );
    assert.ok(dblclickHandler, 'Debe registrar handler dblclick como guard');
  });

  it('previene el comportamiento por defecto (preventDefault)', () => {
    const preventDbl = doubleTapSection.match(
      /dblclick[\s\S]*?ev\.preventDefault\(\)/
    );
    assert.ok(preventDbl, 'dblclick debe llamar preventDefault');
  });

  it('detiene la propagación (stopPropagation)', () => {
    const stopProp = doubleTapSection.match(
      /dblclick[\s\S]*?ev\.stopPropagation\(\)/
    );
    assert.ok(stopProp, 'dblclick debe llamar stopPropagation');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. LÓGICA DE DOBLE TAP TÁCTIL
// ═══════════════════════════════════════════════════════════════════════════

describe('Lógica de doble-tap táctil en paneles', () => {

  it('se registra touchend handler en cada panel', () => {
    const touchHandler = doubleTapSection.match(
      /panel\.addEventListener\('touchend'/
    );
    assert.ok(touchHandler, 'Debe registrar handler touchend en paneles');
  });

  it('filtra taps en elementos interactivos', () => {
    const guard = doubleTapSection.match(
      /touchend[\s\S]*?isInteractiveElement\(ev\.target\)[\s\S]*?return/
    );
    assert.ok(guard, 'touchend debe filtrar elementos interactivos');
  });

  it('ignora paneles en PiP', () => {
    const pipGuard = doubleTapSection.match(
      /touchend[\s\S]*?panel--pipped[\s\S]*?return/
    );
    assert.ok(pipGuard, 'touchend debe ignorar paneles en modo PiP');
  });

  it('ignora gestos multi-dedo activos (__synthNavGestureActive)', () => {
    const gestureGuard = doubleTapSection.match(
      /touchend[\s\S]*?__synthNavGestureActive/
    );
    assert.ok(gestureGuard, 'touchend debe ignorar gestos multi-dedo activos');
  });

  it('usa DOUBLE_TAP_DELAY para el intervalo de detección', () => {
    const delayConst = doubleTapSection.match(/DOUBLE_TAP_DELAY\s*=\s*(\d+)/);
    assert.ok(delayConst, 'Debe definir DOUBLE_TAP_DELAY');
    const delay = parseInt(delayConst[1]);
    assert.ok(delay >= 200 && delay <= 500,
      `DOUBLE_TAP_DELAY (${delay}ms) debe estar entre 200-500ms`);
  });

  it('marca lastTouchEndTime para que click descarte sintéticos', () => {
    const mark = doubleTapSection.match(
      /touchend[\s\S]*?lastTouchEndTime\s*=\s*Date\.now\(\)/
    );
    assert.ok(mark, 'touchend debe marcar lastTouchEndTime');
  });

  it('usa estado separado para touch (touchX/touchY) independiente de click', () => {
    const touchState = doubleTapSection.match(
      /touch\.clientX\s*-\s*touchX/
    );
    assert.ok(touchState, 'touchend debe usar touchX/touchY, no variables compartidas con click');
  });

  it('valida distancia entre taps (dist < MAX_DBLCLICK_DISTANCE)', () => {
    const distCheck = doubleTapSection.match(
      /touchend[\s\S]*?dist\s*<\s*MAX_DBLCLICK_DISTANCE/
    );
    assert.ok(distCheck, 'touchend debe comparar distancia entre taps con MAX_DBLCLICK_DISTANCE');
  });

  it('usa changedTouches[0] para obtener la posición del tap', () => {
    const touchPos = doubleTapSection.match(
      /touchend[\s\S]*?ev\.changedTouches\[0\]/
    );
    assert.ok(touchPos, 'touchend debe usar changedTouches[0] para la posición');
  });

  it('el handler es pasivo false ({ passive: false })', () => {
    const passiveFalse = doubleTapSection.match(
      /touchend[\s\S]*?passive:\s*false/
    );
    assert.ok(passiveFalse, 'touchend debe registrarse con { passive: false } para poder usar preventDefault');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. COBERTURA DE PANELES
// ═══════════════════════════════════════════════════════════════════════════

describe('Cobertura de paneles en doble-tap zoom', () => {

  it('incluye los 7 paneles del Synthi', () => {
    const panelIds = doubleTapSection.match(
      /PANEL_IDS\s*=\s*\[([\s\S]*?)\]/
    );
    assert.ok(panelIds, 'Debe definir PANEL_IDS');
    
    const expectedPanels = ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6', 'panel-output'];
    expectedPanels.forEach(id => {
      assert.ok(panelIds[1].includes(`'${id}'`), `Falta ${id} en PANEL_IDS`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. ZOOM TOGGLE BEHAVIOUR
// ═══════════════════════════════════════════════════════════════════════════

describe('Comportamiento del zoom toggle', () => {

  it('handleZoomToggle() usa __synthAnimateToPanel', () => {
    const animateFn = doubleTapSection.match(
      /handleZoomToggle[\s\S]*?__synthAnimateToPanel/
    );
    assert.ok(animateFn, 'handleZoomToggle debe usar __synthAnimateToPanel');
  });

  it('hace zoom in al panel si no está enfocado', () => {
    const zoomIn = doubleTapSection.match(
      /animateFn\(panelId\)/
    );
    assert.ok(zoomIn, 'Debe animar al panel cuando no está enfocado');
  });

  it('hace zoom out (null) si el panel ya está enfocado', () => {
    const zoomOut = doubleTapSection.match(
      /animateFn\(null\)/
    );
    assert.ok(zoomOut, 'Debe animar a null (zoom out) cuando el panel ya está enfocado');
  });

  it('comprueba __synthGetFocusedPanel para saber si está enfocado', () => {
    const getFocused = doubleTapSection.match(
      /getFocused\(\) === panelId/
    );
    assert.ok(getFocused, 'Debe comparar getFocusedPanel() con el panelId actual');
  });
});
