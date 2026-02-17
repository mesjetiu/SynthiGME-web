/**
 * Tests para el sistema de escalado contain/fit de PiP
 * 
 * Verifica:
 * - getMinScale() calcula escala contain correctamente
 * - fitPanelToSquare() ajusta PiP a cuadrado con escala contain
 * - maximizePip() respeta márgenes y proporción
 * - restorePipSize() restaura a dimensiones por defecto
 * - updatePipScale() aplica transform y dimensiones de inner
 * - Shortcuts +/-/0 para redimensionar PiP enfocado
 * - Constantes de límites (MIN_SCALE_ABSOLUTE, MAX_SCALE, MIN_PIP_SIZE)
 * 
 * Método: análisis estático del código fuente de pipManager.js
 * + tests unitarios de la lógica de escala replicada.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const pipSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/pipManager.js'), 'utf-8');

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTORES
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONSTANTES DE ESCALA
// ═══════════════════════════════════════════════════════════════════════════

describe('Constantes de escala PiP', () => {

  it('MIN_SCALE_ABSOLUTE está definido y es positivo', () => {
    assert.ok(MIN_SCALE_ABSOLUTE !== null, 'MIN_SCALE_ABSOLUTE debe existir');
    assert.ok(MIN_SCALE_ABSOLUTE > 0 && MIN_SCALE_ABSOLUTE < 1,
      `MIN_SCALE_ABSOLUTE (${MIN_SCALE_ABSOLUTE}) debe ser > 0 y < 1`);
  });

  it('MAX_SCALE está definido y permite ampliación', () => {
    assert.ok(MAX_SCALE !== null, 'MAX_SCALE debe existir');
    assert.ok(MAX_SCALE > 1 && MAX_SCALE <= 5,
      `MAX_SCALE (${MAX_SCALE}) debe estar entre 1 y 5`);
  });

  it('MIN_PIP_SIZE está definido y es usable', () => {
    assert.ok(MIN_PIP_SIZE !== null, 'MIN_PIP_SIZE debe existir');
    assert.ok(MIN_PIP_SIZE >= 100 && MIN_PIP_SIZE <= 200,
      `MIN_PIP_SIZE (${MIN_PIP_SIZE}) debe ser usable (100-200px)`);
  });

  it('PIP_HEADER_HEIGHT incluye botones + padding + borde', () => {
    assert.ok(PIP_HEADER_HEIGHT !== null, 'PIP_HEADER_HEIGHT debe existir');
    assert.ok(PIP_HEADER_HEIGHT >= 30 && PIP_HEADER_HEIGHT <= 50,
      `PIP_HEADER_HEIGHT (${PIP_HEADER_HEIGHT}) debe ser razonable`);
  });

  it('PIP_BORDER_SIZE es consistente con CSS (2px = 1px × 2 lados)', () => {
    assert.ok(PIP_BORDER_SIZE !== null, 'PIP_BORDER_SIZE debe existir');
    assert.equal(PIP_BORDER_SIZE, 2, 'PIP_BORDER_SIZE debe ser 2 (1px × 2 lados)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. LÓGICA DE getMinScale (contain)
// ═══════════════════════════════════════════════════════════════════════════

describe('Lógica de getMinScale (contain)', () => {

  // Replicar la lógica de getMinScale para test unitario
  function getMinScaleLogic(panelWidth, panelHeight, viewportWidth, viewportHeight) {
    const minScaleX = viewportWidth / panelWidth;
    const minScaleY = viewportHeight / panelHeight;
    const dynamicMin = Math.min(minScaleX, minScaleY);
    return Math.max(MIN_SCALE_ABSOLUTE, dynamicMin);
  }

  it('panel cuadrado 760x760 en viewport cuadrado 400x400 → scale ≈ 0.526', () => {
    const scale = getMinScaleLogic(760, 760, 400, 400);
    assert.ok(Math.abs(scale - 400 / 760) < 0.001,
      `Escala debe ser ${(400 / 760).toFixed(3)}, obtenida: ${scale.toFixed(3)}`);
  });

  it('panel cuadrado en viewport ancho → se limita por alto (contain)', () => {
    // Viewport 600x300: el panel cabe por el alto (eje limitante)
    const scale = getMinScaleLogic(760, 760, 600, 300);
    assert.ok(Math.abs(scale - 300 / 760) < 0.001,
      `Escala debe ser ${(300 / 760).toFixed(3)} (limitado por alto)`);
  });

  it('panel cuadrado en viewport alto → se limita por ancho (contain)', () => {
    // Viewport 300x600: el panel cabe por el ancho (eje limitante)
    const scale = getMinScaleLogic(760, 760, 300, 600);
    assert.ok(Math.abs(scale - 300 / 760) < 0.001,
      `Escala debe ser ${(300 / 760).toFixed(3)} (limitado por ancho)`);
  });

  it('viewport muy pequeño → no baja de MIN_SCALE_ABSOLUTE', () => {
    const scale = getMinScaleLogic(760, 760, 10, 10);
    assert.equal(scale, MIN_SCALE_ABSOLUTE,
      `Escala mínima no debe bajar de ${MIN_SCALE_ABSOLUTE}`);
  });

  it('viewport grande → escala puede ser > 1 (panel cabe con margen)', () => {
    const scale = getMinScaleLogic(760, 760, 1000, 1000);
    assert.ok(scale > 1, 'Con viewport grande la escala contain puede ser > 1');
  });

  it('el código fuente usa Math.min para contain (menor de los ratios)', () => {
    const containLogic = pipSource.match(
      /getMinScale[\s\S]*?Math\.min\(minScaleX,\s*minScaleY\)/
    );
    assert.ok(containLogic, 'getMinScale debe usar Math.min(minScaleX, minScaleY) para contain');
  });

  it('el código fuente usa Math.max con MIN_SCALE_ABSOLUTE como suelo', () => {
    const floor = pipSource.match(
      /getMinScale[\s\S]*?Math\.max\(MIN_SCALE_ABSOLUTE,\s*dynamicMin\)/
    );
    assert.ok(floor, 'getMinScale debe usar Math.max(MIN_SCALE_ABSOLUTE, dynamicMin)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. LÓGICA DE fitPanelToSquare
// ═══════════════════════════════════════════════════════════════════════════

describe('Lógica de fitPanelToSquare', () => {

  it('existe la función fitPanelToSquare', () => {
    assert.ok(pipSource.includes('function fitPanelToSquare('), 'Debe existir fitPanelToSquare');
  });

  it('respeta el lock del panel (state.locked)', () => {
    const lockGuard = pipSource.match(
      /fitPanelToSquare[\s\S]*?state\.locked[\s\S]*?return/
    );
    assert.ok(lockGuard, 'fitPanelToSquare debe verificar state.locked');
  });

  it('usa el eje más pequeño como referencia', () => {
    const smallestAxis = pipSource.match(
      /fitPanelToSquare[\s\S]*?smallestAxis\s*=\s*Math\.min\(viewportW,\s*viewportH\)/
    );
    assert.ok(smallestAxis, 'fitPanelToSquare debe usar Math.min(viewportW, viewportH)');
  });

  it('calcula escala contain dentro del cuadrado', () => {
    const containScale = pipSource.match(
      /fitPanelToSquare[\s\S]*?containScale\s*=\s*Math\.min/
    );
    assert.ok(containScale, 'fitPanelToSquare debe calcular containScale con Math.min');
  });

  it('centra el scroll en 0 (panel cabe completo)', () => {
    const scrollReset = pipSource.match(
      /fitPanelToSquare[\s\S]*?scrollLeft\s*=\s*0[\s\S]*?scrollTop\s*=\s*0/
    );
    assert.ok(scrollReset, 'fitPanelToSquare debe centrar scroll en 0');
  });

  it('asegura que el PiP no se sale de pantalla', () => {
    const bounds = pipSource.match(
      /fitPanelToSquare[\s\S]*?Math\.max\(0[\s\S]*?Math\.min/
    );
    assert.ok(bounds, 'fitPanelToSquare debe clampar posición a los bordes de pantalla');
  });

  it('guarda el estado tras ajustar (savePipState)', () => {
    const startIdx = pipSource.indexOf('function fitPanelToSquare');
    // Buscar hasta la siguiente función (function bringToFront o similar)
    const nextFnIdx = pipSource.indexOf('\nfunction ', startIdx + 1);
    const fitSection = pipSource.substring(startIdx, nextFnIdx > 0 ? nextFnIdx : startIdx + 3000);
    assert.ok(fitSection.includes('savePipState()'),
      'fitPanelToSquare debe llamar savePipState()');
  });

  // Test unitario de la lógica de fitPanelToSquare
  it('lógica: panel 760x760 en viewport 400x300 → cuadrado 300px con escala contain', () => {
    const panelWidth = 760;
    const panelHeight = 760;
    const viewportW = 400;
    const viewportH = 300;
    const smallestAxis = Math.min(viewportW, viewportH); // 300
    const containScale = Math.min(smallestAxis / panelWidth, smallestAxis / panelHeight);
    
    assert.equal(smallestAxis, 300, 'Eje más pequeño es 300');
    assert.ok(Math.abs(containScale - 300 / 760) < 0.001,
      `containScale debe ser ${(300 / 760).toFixed(3)}`);
    
    const scaledSize = Math.max(panelWidth, panelHeight) * containScale;
    assert.ok(scaledSize <= 300 + 1, 'El panel escalado debe caber en el cuadrado');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. LÓGICA DE maximizePip Y restorePipSize
// ═══════════════════════════════════════════════════════════════════════════

describe('Lógica de maximizePip', () => {

  it('existe la función maximizePip', () => {
    assert.ok(pipSource.includes('function maximizePip('), 'Debe existir maximizePip');
  });

  it('respeta el lock del panel', () => {
    const lockGuard = pipSource.match(
      /maximizePip[\s\S]*?state\.locked[\s\S]*?return/
    );
    assert.ok(lockGuard, 'maximizePip debe verificar state.locked');
  });

  it('usa márgenes desde los bordes de pantalla', () => {
    const margin = pipSource.match(
      /maximizePip[\s\S]*?margin\s*=\s*\d+/
    );
    assert.ok(margin, 'maximizePip debe definir un margen');
  });

  it('mantiene la proporción del viewport actual', () => {
    const ratio = pipSource.match(
      /maximizePip[\s\S]*?vpRatio\s*=/
    );
    assert.ok(ratio, 'maximizePip debe calcular vpRatio para mantener proporción');
  });
});

describe('Lógica de restorePipSize', () => {

  it('existe la función restorePipSize', () => {
    assert.ok(pipSource.includes('function restorePipSize('), 'Debe existir restorePipSize');
  });

  it('respeta el lock del panel', () => {
    const lockGuard = pipSource.match(
      /restorePipSize[\s\S]*?state\.locked[\s\S]*?return/
    );
    assert.ok(lockGuard, 'restorePipSize debe verificar state.locked');
  });

  it('usa defaultWidth/defaultHeight como referencia', () => {
    const defaults = pipSource.match(
      /restorePipSize[\s\S]*?state\.defaultWidth[\s\S]*?state\.defaultHeight/
    );
    assert.ok(defaults, 'restorePipSize debe usar defaultWidth/defaultHeight');
  });

  it('respeta MIN_PIP_SIZE como mínimo', () => {
    const minGuard = pipSource.match(
      /restorePipSize[\s\S]*?MIN_PIP_SIZE/
    );
    assert.ok(minGuard, 'restorePipSize debe respetar MIN_PIP_SIZE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. LÓGICA DE updatePipScale
// ═══════════════════════════════════════════════════════════════════════════

describe('Lógica de updatePipScale', () => {

  it('existe la función updatePipScale', () => {
    assert.ok(pipSource.includes('function updatePipScale('), 'Debe existir updatePipScale');
  });

  it('aplica transform scale al panel', () => {
    const transform = pipSource.match(
      /updatePipScale[\s\S]*?style\.transform\s*=\s*`scale\(/
    );
    assert.ok(transform, 'updatePipScale debe aplicar transform: scale()');
  });

  it('establece transformOrigin en 0 0 (esquina superior izquierda)', () => {
    const origin = pipSource.match(
      /updatePipScale[\s\S]*?transformOrigin\s*=\s*'0 0'/
    );
    assert.ok(origin, 'updatePipScale debe usar transformOrigin: 0 0');
  });

  it('actualiza dimensiones del viewport-inner', () => {
    const inner = pipSource.match(
      /updatePipScale[\s\S]*?viewportInner[\s\S]*?style\.width\s*=[\s\S]*?style\.height\s*=/
    );
    assert.ok(inner, 'updatePipScale debe actualizar width/height del viewport-inner');
  });

  it('sin padding en el viewport-inner (cover behavior)', () => {
    const noPadding = pipSource.match(
      /updatePipScale[\s\S]*?viewportInner[\s\S]*?padding.*'0'/
    );
    assert.ok(noPadding, 'updatePipScale debe establecer padding 0 (cover)');
  });

  it('guarda estado condicionalmente (persist parameter)', () => {
    const persistParam = pipSource.match(
      /updatePipScale\(panelId,\s*newScale,\s*persist\s*=\s*true\)/
    );
    assert.ok(persistParam, 'updatePipScale debe tener parámetro persist con default true');

    const persistGuard = pipSource.match(
      /updatePipScale[\s\S]*?if\s*\(persist\)[\s\S]*?savePipState/
    );
    assert.ok(persistGuard, 'updatePipScale debe condicionar savePipState a persist');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. SHORTCUTS DE TECLADO PARA REDIMENSIONAR
// ═══════════════════════════════════════════════════════════════════════════

describe('Shortcuts de teclado para PiP', () => {

  it('+ o = maximiza PiP enfocado', () => {
    const plusShortcut = pipSource.match(
      /e\.key\s*===\s*'\+'\s*\|\|\s*e\.key\s*===\s*'='[\s\S]*?maximizePip/
    );
    assert.ok(plusShortcut, '+ o = debe llamar maximizePip');
  });

  it('- o _ restaura PiP enfocado', () => {
    const minusShortcut = pipSource.match(
      /e\.key\s*===\s*'-'\s*\|\|\s*e\.key\s*===\s*'_'[\s\S]*?restorePipSize/
    );
    assert.ok(minusShortcut, '- o _ debe llamar restorePipSize');
  });

  it('0 ajusta panel a cuadrado (fitPanelToSquare)', () => {
    const zeroShortcut = pipSource.match(
      /e\.key\s*===\s*'0'[\s\S]*?fitPanelToSquare/
    );
    assert.ok(zeroShortcut, '0 debe llamar fitPanelToSquare');
  });

  it('shortcuts solo actúan con PiP enfocado (focusedPipId)', () => {
    const focusGuard = pipSource.match(
      /if\s*\(focusedPipId\s*&&\s*!e\.ctrlKey\s*&&\s*!e\.metaKey\s*&&\s*!e\.altKey\)/
    );
    assert.ok(focusGuard, 'Shortcuts solo deben actuar si hay PiP enfocado y sin teclas modificadoras');
  });

  it('shortcuts no actúan si el panel está locked', () => {
    const lockGuard = pipSource.match(
      /focusedPipId[\s\S]*?state\.locked[\s\S]*?return/
    );
    assert.ok(lockGuard, 'Shortcuts deben respetar state.locked');
  });

  it('shortcuts llaman preventDefault para evitar zoom del canvas', () => {
    const prevent = pipSource.match(
      /e\.key\s*===\s*'\+'[\s\S]*?e\.preventDefault\(\)/
    );
    assert.ok(prevent, 'Shortcuts deben llamar preventDefault');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. BOTÓN FIT EN LA CABECERA PiP
// ═══════════════════════════════════════════════════════════════════════════

describe('Botón fit en cabecera PiP', () => {

  it('la cabecera del PiP tiene botón pip-fit', () => {
    const fitButton = pipSource.match(/class="pip-fit"/);
    assert.ok(fitButton, 'Debe existir un botón con class pip-fit en la cabecera');
  });

  it('el botón fit tiene aria-label traducible', () => {
    const ariaLabel = pipSource.match(
      /pip-fit[\s\S]*?aria-label=".*\$\{t\('pip\.fitPanel/
    );
    assert.ok(ariaLabel, 'El botón fit debe tener aria-label con traducción pip.fitPanel');
  });
});
