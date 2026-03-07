/**
 * Tests para el nuevo contrato PiP-first de locks y foco.
 *
 * El canvas principal queda bloqueado/fijo y los locks visibles se aplican al
 * PiP enfocado, sincronizados entre `pipManager`, `quickbar` y Electron.
 *
 * Método: análisis estático del código fuente.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const pipSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/pipManager.js'), 'utf-8');
const quickbarSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/quickbar.js'), 'utf-8');
const bridgeSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/electronMenuBridge.js'), 'utf-8');
const navSource = readFileSync(resolve(ROOT, 'src/assets/js/navigation/viewportNavigation.js'), 'utf-8');

describe('Canvas principal fijo', () => {
  it('inicializa el viewport con paneo y zoom bloqueados', () => {
    assert.match(navSource, /window\.__synthNavLocks = window\.__synthNavLocks \|\| \{ zoomLocked: true, panLocked: true \}/);
    assert.match(navSource, /navLocks\.zoomLocked = true;/);
    assert.match(navSource, /navLocks\.panLocked = true;/);
  });

  it('restaurar viewportState vuelve siempre a overview', () => {
    assert.match(navSource, /window\.__synthRestoreViewportState = \(state\) => \{/);
    assert.match(navSource, /focusedPanelId = null;/);
    assert.match(navSource, /userHasAdjustedView = false;/);
    assert.match(navSource, /fitContentToViewport\(\);/);
  });
});

describe('pipManager expone foco y locks del PiP', () => {
  it('despacha eventos pip:focuschange y pip:lockchange', () => {
    assert.match(pipSource, /new CustomEvent\('pip:focuschange'/);
    assert.match(pipSource, /new CustomEvent\('pip:lockchange'/);
  });

  it('expone helpers de estado para el PiP enfocado', () => {
    assert.match(pipSource, /export function getFocusedPipLockState\(\)/);
    assert.match(pipSource, /export function setFocusedPipPanLocked\(enabled\)/);
    assert.match(pipSource, /export function setFocusedPipZoomLocked\(enabled\)/);
  });

  it('publica toggleRememberedPip y getFocusedPipLockState en window', () => {
    assert.match(pipSource, /window\.__synthToggleRememberedPip = toggleRememberedPip;/);
    assert.match(pipSource, /window\.__synthGetFocusedPipLockState = getFocusedPipLockState;/);
  });
});

describe('Quickbar ligado al PiP enfocado', () => {
  it('usa helpers del PiP enfocado en vez de locks globales del canvas', () => {
    assert.match(quickbarSource, /getFocusedPipLockState/);
    assert.match(quickbarSource, /setFocusedPipPanLocked/);
    assert.match(quickbarSource, /setFocusedPipZoomLocked/);
    assert.doesNotMatch(quickbarSource, /synth:panLockChange/);
    assert.doesNotMatch(quickbarSource, /synth:zoomLockChange/);
  });

  it('actualiza el estado visual con getFocusedPipLockState()', () => {
    assert.match(quickbarSource, /const pipLockState = getFocusedPipLockState\(\);/);
    assert.match(quickbarSource, /btnPan\.setAttribute\('aria-pressed', String\(Boolean\(pipLockState\.panLocked\)\)\)/);
    assert.match(quickbarSource, /btnZoom\.setAttribute\('aria-pressed', String\(Boolean\(pipLockState\.zoomLocked\)\)\)/);
  });

  it('deshabilita los botones de lock si no hay PiP enfocado', () => {
    assert.match(quickbarSource, /btnPan\.disabled = !pipLockState\.hasFocusedPip;/);
    assert.match(quickbarSource, /btnZoom\.disabled = !pipLockState\.hasFocusedPip;/);
  });

  it('escucha eventos PiP para resincronizar el quickbar', () => {
    ['pip:focuschange', 'pip:lockchange', 'pip:open', 'pip:close'].forEach(eventName => {
      assert.match(quickbarSource, new RegExp(`window\\.addEventListener\\('${eventName}'`));
    });
  });
});

describe('Electron bridge ligado al PiP enfocado', () => {
  it('lee lockPan/lockZoom desde getFocusedPipLockState()', () => {
    assert.match(bridgeSource, /lockPan: Boolean\(getFocusedPipLockState\(\)\.panLocked\)/);
    assert.match(bridgeSource, /lockZoom: Boolean\(getFocusedPipLockState\(\)\.zoomLocked\)/);
  });

  it('redirige setLockPan y setLockZoom al PiP enfocado', () => {
    assert.match(bridgeSource, /case 'setLockPan':[\s\S]*?setFocusedPipPanLocked\(Boolean\(data\.enabled\)\);/);
    assert.match(bridgeSource, /case 'setLockZoom':[\s\S]*?setFocusedPipZoomLocked\(Boolean\(data\.enabled\)\);/);
  });

  it('escucha pip:lockchange y pip:focuschange para sincronizar el menú', () => {
    assert.match(bridgeSource, /'pip:lockchange':/);
    assert.match(bridgeSource, /'pip:focuschange':/);
    assert.match(bridgeSource, /const state = getFocusedPipLockState\(\);/);
  });
});
