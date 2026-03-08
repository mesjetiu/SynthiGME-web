/**
 * Tests para el comportamiento actual de tamaño/escala PiP.
 *
 * El modelo vigente es frameless + cover: no hay header/borde visibles y el
 * panel debe cubrir completamente el viewport del PiP sin bandas vacías.
 *
 * Método: análisis estático del código fuente de pipManager.js.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const pipSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/pipManager.js'), 'utf-8');

function extractConstant(name) {
  const regex = new RegExp(`const ${name}\\s*=\\s*([\\d.]+)`);
  const match = pipSource.match(regex);
  return match ? parseFloat(match[1]) : null;
}

let MIN_SCALE_ABSOLUTE, MAX_SCALE, MIN_PIP_SIZE, PIP_HEADER_HEIGHT, PIP_BORDER_SIZE;

before(() => {
  MIN_SCALE_ABSOLUTE = extractConstant('MIN_SCALE_ABSOLUTE');
  MAX_SCALE = extractConstant('MAX_SCALE');
  MIN_PIP_SIZE = extractConstant('MIN_PIP_SIZE');
  PIP_HEADER_HEIGHT = extractConstant('PIP_HEADER_HEIGHT');
  PIP_BORDER_SIZE = extractConstant('PIP_BORDER_SIZE');
});

describe('Constantes PiP actuales', () => {
  it('mantiene límites de escala razonables', () => {
    assert.ok(MIN_SCALE_ABSOLUTE > 0 && MIN_SCALE_ABSOLUTE < 1);
    assert.ok(MAX_SCALE > 1 && MAX_SCALE <= 5);
    assert.ok(MIN_PIP_SIZE >= 100 && MIN_PIP_SIZE <= 200);
  });

  it('usa PiP sin header visible ni borde extra', () => {
    assert.equal(PIP_HEADER_HEIGHT, 0);
    assert.equal(PIP_BORDER_SIZE, 0);
  });
});

describe('Lógica cover para escalar paneles', () => {
  it('getPipCoverScale usa el mayor ratio entre ancho y alto', () => {
    assert.match(pipSource, /function getPipCoverScale\([\s\S]*?const scaleX = viewportWidth \/ panelWidth;[\s\S]*?const scaleY = viewportHeight \/ panelHeight;[\s\S]*?Math\.max\(MIN_SCALE_ABSOLUTE, Math\.max\(scaleX, scaleY\)\)/);
  });

  it('getMinScale ya no depende del viewport actual sino del tamaño mínimo permitido', () => {
    assert.match(pipSource, /function getMinScale\(panelId\)[\s\S]*?MIN_PIP_SIZE \/ Math\.max\(panelWidth, 1\)/);
    assert.match(pipSource, /function getMinScale\(panelId\)[\s\S]*?MIN_PIP_SIZE \/ Math\.max\(panelHeight, 1\)/);
    assert.doesNotMatch(pipSource, /Math\.min\(minScaleX,\s*minScaleY\)/);
  });

  it('aplica coverScale en maximizePip, restorePipSize y fitPanelToSquare', () => {
    assert.match(pipSource, /function maximizePip\([\s\S]*?const coverScale = getPipCoverScale\(/);
    assert.match(pipSource, /function restorePipSize\([\s\S]*?const coverScale = getPipCoverScale\(/);
    assert.match(pipSource, /function fitPanelToSquare\([\s\S]*?const coverScale = getPipCoverScale\(/);
    assert.match(pipSource, /function fitPanelToSquare\([\s\S]*?const fitScale = getPipCoverScale\(/);
  });
});

describe('Locks y resize de PiP', () => {
  it('maximizePip, restorePipSize y fitPanelToSquare respetan el pan lock del PiP', () => {
    assert.match(pipSource, /function maximizePip\([\s\S]*?!state \|\| isPipPanLocked\(state\)\) return;/);
    assert.match(pipSource, /function restorePipSize\([\s\S]*?!state \|\| isPipPanLocked\(state\)\) return;/);
    assert.match(pipSource, /function fitPanelToSquare\([\s\S]*?!state \|\| isPipPanLocked\(state\)\) return;/);
  });

  it('usa atajos +/=, -/_ y 0 sin Ctrl para el PiP enfocado', () => {
    assert.match(pipSource, /if \(focusedPipId && !e\.ctrlKey && !e\.metaKey && !e\.altKey\)/);
    assert.ok(pipSource.includes("if (e.key === '+' || e.key === '=')"));
    assert.ok(pipSource.includes('maximizePip(focusedPipId);'));
    assert.ok(pipSource.includes("} else if (e.key === '-' || e.key === '_')"));
    assert.ok(pipSource.includes('restorePipSize(focusedPipId);'));
    assert.ok(pipSource.includes("} else if (e.key === '0')"));
    assert.ok(pipSource.includes('fitPanelToSquare(focusedPipId);'));
  });
});

describe('updatePipScale', () => {
  it('aplica transform scale, transformOrigin 0 0 y redimensiona viewportInner al tamaño visual', () => {
    assert.match(pipSource, /panelEl\.style\.transform = `scale\(\$\{visualScale\}\)`;/);
    assert.match(pipSource, /panelEl\.style\.transformOrigin = '0 0';/);
    // viewportInner se redimensiona a scaledWidth × scaledHeight para que la
    // textura GPU sea proporcional al zoom (~3MB vs ~20MB en 3× DPR).
    assert.match(pipSource, /viewportInner\.style\.width = `\$\{scaledWidth\}px`;/);
    assert.match(pipSource, /viewportInner\.style\.height = `\$\{scaledHeight\}px`;/);
  });

  it('persiste el cambio de escala de forma diferida y condicional', () => {
    assert.match(pipSource, /function updatePipScale\(panelId, newScale, persist = true\)/);
    assert.match(pipSource, /if \(persist\) \{[\s\S]*?schedulePipStateSave\(\);[\s\S]*?\}/);
  });
});

describe('Gestos wheel/touchpad sobre PiP', () => {
  it('mantiene una sesión breve de wheel ligada al mismo PiP', () => {
    assert.match(pipSource, /let activeWheelGesturePanelId = null;/);
    assert.match(pipSource, /function refreshActiveWheelGesture\(panelId\)/);
    assert.match(pipSource, /document\.addEventListener\('wheel',[\s\S]*?activeWheelGesturePanelId/);
  });
});
