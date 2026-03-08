/**
 * Tests estáticos para ui/pipManager.js.
 *
 * Tras la reestructuración PiP-first, este archivo valida el contrato público
 * y las expectativas serializadas sin depender de un runtime DOM completo.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const pipSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/pipManager.js'), 'utf-8');

describe('API pública de PipManager', () => {
  it('exporta las funciones principales del modelo PiP actual', () => {
    [
      'initPipManager',
      'togglePip',
      'toggleRememberedPip',
      'getOpenPips',
      'focusPip',
      'openPip',
      'closePip',
      'closeAllPips',
      'openAllPips',
      'toggleAllRememberedPips',
      'isPipped',
      'getActivePips',
      'serializePipState',
      'restorePipState',
      'clearPipState',
      'isRememberPipsEnabled',
      'setRememberPips',
      'getFocusedPipLockState',
      'setFocusedPipPanLocked',
      'setFocusedPipZoomLocked'
    ].forEach(name => {
      assert.match(pipSource, new RegExp(`export function ${name}\\(`), `Falta export ${name}`);
    });
  });
});

describe('ALL_PANELS', () => {
  it('declara los 7 paneles visibles y panel-output como Panel 7', () => {
    ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6', 'panel-output'].forEach(id => {
      assert.match(pipSource, new RegExp(`id: '${id}'`), `Falta ${id} en ALL_PANELS`);
    });
    assert.match(pipSource, /\{ id: 'panel-output', name: \(\) => 'Panel 7' \}/);
  });
});

describe('Toggle y memoria de geometría PiP', () => {
  it('mantiene rememberedPipConfigs y reutiliza la última geometría detached', () => {
    assert.match(pipSource, /const rememberedPipConfigs = new Map\(\);/);
    assert.match(pipSource, /function rememberPipConfig\(panelId, source\)/);
    assert.match(pipSource, /function getRememberedPipConfig\(panelId\)/);
    assert.match(pipSource, /export function toggleRememberedPip\(panelId\) \{[\s\S]*?openPip\(panelId, getRememberedPipConfig\(panelId\)\);[\s\S]*?\}/);
  });

  it('openAllPips también reutiliza la geometría recordada', () => {
    assert.match(pipSource, /export function openAllPips\(\) \{[\s\S]*?openPip\(panel\.id, getRememberedPipConfig\(panel\.id\)\);/);
  });

  it('preserva un tamaño por defecto separado de la geometría restaurada', () => {
    assert.match(pipSource, /const defaultPipDims = getInitialPipDimensions\(\);/);
    assert.match(pipSource, /defaultWidth: pipConfig\?\.defaultWidth \|\| defaultPipDims\.width,/);
    assert.match(pipSource, /defaultHeight: pipConfig\?\.defaultHeight \|\| defaultPipDims\.height,/);
  });
});

describe('Límite inferior de zoom PiP', () => {
  it('usa la escala por defecto del PiP como mínimo para el zoom negativo', () => {
    assert.match(pipSource, /function getDefaultPipScale\(state\)/);
    assert.match(pipSource, /return getPipCoverScale\(defaultViewportWidth, defaultViewportHeight, panelWidth, panelHeight\);/);
    assert.match(pipSource, /return Math\.max\([\s\S]*?getDefaultPipScale\(state\),[\s\S]*?MIN_PIP_SIZE \/ Math\.max\(panelWidth, 1\),/);
  });
});

describe('Animación visual canvas ↔ PiP', () => {
  it('declara helpers de transición sobre la PiP real', () => {
    assert.match(pipSource, /const PIP_TRANSITION_DURATION_MS = \d+;/);
    assert.match(pipSource, /function resetDetachedPanelPresentation\(panelEl\)/);
    assert.match(pipSource, /function applyPipTransitionFrame\(state, rect, scale\)/);
    assert.match(pipSource, /function runPipTransition\(panelId, \{/);
    assert.match(pipSource, /mode = 'enter'/);
    assert.doesNotMatch(pipSource, /createPipTransitionClone/);
    assert.doesNotMatch(pipSource, /pipTransitionSnapshots/);
  });

  it('anima interpolando geometría y escala de la propia ventana PiP', () => {
    assert.match(pipSource, /state\.pipContainer\.classList\.add\('pip-container--animating'\)/);
    assert.match(pipSource, /const rect = \{[\s\S]*?left: startRect\.left \+ \(\(endRect\.left - startRect\.left\) \* eased\),/);
    assert.match(pipSource, /const scaleForRect = \(rect\) => getPipCoverScale\(/);
    assert.match(pipSource, /const scale = scaleForRect\(rect\);/);
    assert.match(pipSource, /rafId = requestAnimationFrame\(step\);/);
  });

  it('openPip anima desde el panel original hasta la geometría PiP', () => {
    assert.match(pipSource, /export function openPip\(panelId, restoredConfig = null\) \{[\s\S]*?const sourceRect = getElementRect\(panelEl\);[\s\S]*?const targetRect = \{ left: initX, top: initY, width: initW, height: initH \};[\s\S]*?runPipTransition\(panelId, \{[\s\S]*?state,[\s\S]*?fromRect: sourceRect,[\s\S]*?toRect: targetRect,[\s\S]*?mode: 'enter'/);
  });

  it('closePip anima desde la ventana PiP hasta su hueco en el canvas', () => {
    assert.match(pipSource, /export function closePip\(panelId\) \{[\s\S]*?const closeFromRect = getElementRect\(state\.pipContainer\);[\s\S]*?runPipTransition\(panelId, \{[\s\S]*?state,[\s\S]*?fromRect: closeFromRect,[\s\S]*?toRect: targetRect,[\s\S]*?mode: 'exit'/);
  });

  it('closePip limpia la presentación escalada al devolver el panel al canvas', () => {
    assert.match(pipSource, /export function closePip\(panelId\) \{[\s\S]*?resetDetachedPanelPresentation\(panelEl\);[\s\S]*?runPipTransition\(panelId, \{[\s\S]*?onFinish: \(\) => \{[\s\S]*?resetDetachedPanelPresentation\(panelEl\);/);
  });
});

describe('Paneo continuo de PiP con teclado', () => {
  it('declara un controlador RAF con aceleración temporal para flechas mantenidas', () => {
    assert.match(pipSource, /const PIP_KEYBOARD_PAN_BASE_SPEED = 0\.55;/);
    assert.match(pipSource, /const PIP_KEYBOARD_PAN_MAX_SPEED = 1\.8;/);
    assert.match(pipSource, /const PIP_KEYBOARD_PAN_ACCELERATION_MS = 520;/);
    assert.match(pipSource, /function stepFocusedPipKeyboardPan\(timestamp\) \{[\s\S]*?const heldMs = Math\.max\(0, timestamp - pipKeyboardPanState\.startedAt\);[\s\S]*?const speedFactor = PIP_KEYBOARD_PAN_BASE_SPEED[\s\S]*?PIP_TRANSITION_EASING\(accel\)/);
    assert.match(pipSource, /state\.pipContainer\.classList\.add\('pip-container--keyboard-panning'\)/);
    assert.match(pipSource, /pipKeyboardPanState\.rafId = requestAnimationFrame\(stepFocusedPipKeyboardPan\);/);
  });

  it('window.__synthPanFocusedPip soporta modo continuo sin romper el paso discreto existente', () => {
    assert.match(pipSource, /window\.__synthPanFocusedPip = \(dirX, dirY, \{ continuous = false \} = \{\}\) => \{/);
    assert.match(pipSource, /if \(continuous\) \{[\s\S]*?startFocusedPipKeyboardPan\(focusedPipId, dirX, dirY\);/);
    assert.match(pipSource, /const stepX = state\.width \* 0\.15;/);
    assert.match(pipSource, /const stepY = state\.height \* 0\.15;/);
  });

  it('oculta tooltips fantasma al empezar a mover o escalar una PiP', () => {
    assert.match(pipSource, /function startPipWindowDrag\(panelId, pointerEvent, dragSurface\) \{[\s\S]*?dismissPipTransientUi\(\);[\s\S]*?setPipPreviewMode\(panelId, true\);/);
    assert.match(pipSource, /function startFocusedPipKeyboardPan\(panelId, dirX, dirY\) \{[\s\S]*?dismissPipTransientUi\(\);[\s\S]*?state\.pipContainer\.classList\.add\('pip-container--keyboard-panning'\);/);
    assert.match(pipSource, /function startFocusedPipKeyboardZoom\(panelId, direction\) \{[\s\S]*?dismissPipTransientUi\(\);[\s\S]*?state\.pipContainer\.classList\.add\('pip-container--keyboard-zooming'\);/);
    assert.match(pipSource, /const startResize = \(e, edge\) => \{[\s\S]*?dismissPipTransientUi\(\);[\s\S]*?setPipPreviewMode\(panelId, true\);/);
  });

  it('declara también zoom continuo con aceleración temporal para Ctrl+ y Ctrl-', () => {
    assert.match(pipSource, /const PIP_KEYBOARD_ZOOM_BASE_RATE = 1\.35;/);
    assert.match(pipSource, /const PIP_KEYBOARD_ZOOM_MAX_RATE = 4\.2;/);
    assert.match(pipSource, /function stepFocusedPipKeyboardZoom\(timestamp\) \{[\s\S]*?const zoomRate = PIP_KEYBOARD_ZOOM_BASE_RATE[\s\S]*?Math\.exp\(zoomRate \* \(dtMs \/ 1000\)\)/);
    assert.match(pipSource, /state\.pipContainer\.classList\.add\('pip-container--keyboard-zooming'\)/);
    assert.match(pipSource, /function stopFocusedPipKeyboardZoom\(\{ scheduleSave = true, deactivatePreview = true \} = \{\}\)/);
  });

  it('window.__synthZoomFocusedPip soporta modo continuo y parada explícita', () => {
    assert.match(pipSource, /window\.__synthZoomFocusedPip = \(direction, \{ continuous = false \} = \{\}\) => \{/);
    assert.match(pipSource, /if \(continuous\) \{[\s\S]*?if \(direction === 'stop'\) \{[\s\S]*?stopFocusedPipKeyboardZoom/);
    assert.match(pipSource, /return startFocusedPipKeyboardZoom\(focusedPipId, direction\);/);
    assert.match(pipSource, /if \(direction === 'reset'\) \{[\s\S]*?nextScale = minScale;/);
  });
});

describe('Locks del PiP enfocado', () => {
  it('getFocusedPipLockState devuelve panelId, hasFocusedPip, panLocked, zoomLocked y locked', () => {
    assert.match(pipSource, /return \{[\s\S]*?panelId:[\s\S]*?hasFocusedPip:[\s\S]*?panLocked:[\s\S]*?zoomLocked:[\s\S]*?locked:/);
  });

  it('la serialización preserva panLocked y zoomLocked', () => {
    assert.match(pipSource, /export function serializePipState\(\) \{[\s\S]*?panLocked: isPipPanLocked\(state\),[\s\S]*?zoomLocked: isPipZoomLocked\(state\),/);
  });
});

describe('Serialización y restauración', () => {
  it('serializePipState fija scrollX y scrollY a 0 en el modelo sin paneo interno', () => {
    assert.match(pipSource, /scrollX: 0,/);
    assert.match(pipSource, /scrollY: 0,/);
  });

  it('restorePipState recuerda primero la configuración guardada', () => {
    assert.match(pipSource, /for \(const savedState of states\) \{[\s\S]*?rememberPipConfig\(savedState\.panelId, savedState\);/);
  });
});

describe('Persistencia en localStorage', () => {
  it('setRememberPips(false) limpia el estado guardado', () => {
    assert.match(pipSource, /export function setRememberPips\(enabled\) \{[\s\S]*?if \(!enabled\) \{[\s\S]*?clearPipState\(\);/);
  });

  it('clearPipState elimina STORAGE_KEYS.PIP_STATE', () => {
    assert.match(pipSource, /export function clearPipState\(\) \{[\s\S]*?localStorage\.removeItem\(STORAGE_KEYS\.PIP_STATE\);/);
  });

  it('isRememberPipsEnabled depende de REMEMBER_VISUAL_LAYOUT', () => {
    assert.match(pipSource, /export function isRememberPipsEnabled\(\) \{[\s\S]*?STORAGE_KEYS\.REMEMBER_VISUAL_LAYOUT/);
  });
});
