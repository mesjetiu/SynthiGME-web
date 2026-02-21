/**
 * Tests para ui/matrixTooltip.js
 * 
 * Verifica que getLabelForSource y getLabelForDest generan labels correctos
 * para los diferentes tipos de sources y destinations de las matrices.
 * 
 * NOTA: Estos tests importan el módulo real, lo que requiere que i18n esté
 * correctamente configurado. Los labels devueltos dependen del locale actual.
 * Para tests aislados, se podría usar --experimental-test-module-mocks.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { getLabelForSource, getLabelForDest, MatrixTooltip } from '../../src/assets/js/ui/matrixTooltip.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tooltipSource = readFileSync(resolve(__dirname, '../../src/assets/js/ui/matrixTooltip.js'), 'utf-8');

// ═══════════════════════════════════════════════════════════════════════════
// getLabelForSource
// ═══════════════════════════════════════════════════════════════════════════

describe('getLabelForSource', () => {
  it('devuelve null para source inválido', () => {
    assert.equal(getLabelForSource(null), null);
    assert.equal(getLabelForSource(undefined), null);
    assert.equal(getLabelForSource({}), null);
    assert.equal(getLabelForSource({ kind: 'unknown' }), null);
  });

  it('genera label no-vacío para inputAmp', () => {
    const label = getLabelForSource({ kind: 'inputAmp', channel: 0 });
    assert.ok(label, 'Debería devolver un label');
    assert.ok(typeof label === 'string', 'Label debe ser string');
    assert.ok(label.length > 0, 'Label no debe estar vacío');
  });

  it('genera label no-vacío para outputBus (source)', () => {
    const label = getLabelForSource({ kind: 'outputBus', bus: 1 });
    assert.ok(label, 'Debería devolver un label');
    assert.ok(typeof label === 'string', 'Label debe ser string');
  });

  it('genera label no-vacío para noiseGen', () => {
    const label = getLabelForSource({ kind: 'noiseGen', index: 0 });
    assert.ok(label, 'Debería devolver un label');
    assert.ok(typeof label === 'string', 'Label debe ser string');
  });

  it('genera label no-vacío para panel3Osc sineSaw', () => {
    const label = getLabelForSource({ kind: 'panel3Osc', oscIndex: 0, channelId: 'sineSaw' });
    assert.ok(label, 'Debería devolver un label');
    assert.ok(typeof label === 'string', 'Label debe ser string');
  });

  it('genera label no-vacío para panel3Osc triPulse', () => {
    const label = getLabelForSource({ kind: 'panel3Osc', oscIndex: 0, channelId: 'triPulse' });
    assert.ok(label, 'Debería devolver un label');
    assert.ok(typeof label === 'string', 'Label debe ser string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getLabelForDest
// ═══════════════════════════════════════════════════════════════════════════

describe('getLabelForDest', () => {
  it('devuelve null para dest inválido', () => {
    assert.equal(getLabelForDest(null), null);
    assert.equal(getLabelForDest(undefined), null);
    assert.equal(getLabelForDest({}), null);
    assert.equal(getLabelForDest({ kind: 'unknown' }), null);
  });

  it('genera label no-vacío para outputBus (dest)', () => {
    const label = getLabelForDest({ kind: 'outputBus', bus: 1 });
    assert.ok(label, 'Debería devolver un label');
    assert.ok(typeof label === 'string', 'Label debe ser string');
  });

  it('genera label no-vacío para oscilloscope Y', () => {
    const label = getLabelForDest({ kind: 'oscilloscope', channel: 'Y' });
    assert.ok(label, 'Debería devolver un label');
    assert.ok(typeof label === 'string', 'Label debe ser string');
  });

  it('genera label no-vacío para oscilloscope X', () => {
    const label = getLabelForDest({ kind: 'oscilloscope', channel: 'X' });
    assert.ok(label, 'Debería devolver un label');
    assert.ok(typeof label === 'string', 'Label debe ser string');
  });

  it('genera label no-vacío para oscFreqCV', () => {
    const label = getLabelForDest({ kind: 'oscFreqCV', oscIndex: 0 });
    assert.ok(label, 'Debería devolver un label');
    assert.ok(typeof label === 'string', 'Label debe ser string');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // HARD SYNC TESTS
  // ─────────────────────────────────────────────────────────────────────────
  // Columnas que permiten conectar señales de audio para sincronizar
  // la fase de los osciladores (hard sync).

  it('genera label no-vacío para oscSync', () => {
    const label = getLabelForDest({ kind: 'oscSync', oscIndex: 0 });
    assert.ok(label, 'Debería devolver un label para oscSync');
    assert.ok(typeof label === 'string', 'Label debe ser string');
  });

  it('oscSync label contiene número de oscilador o clave i18n', () => {
    const label0 = getLabelForDest({ kind: 'oscSync', oscIndex: 0 });
    const label11 = getLabelForDest({ kind: 'oscSync', oscIndex: 11 });
    
    // El label podría contener el número (si i18n está activo) o la clave i18n
    // Si i18n no está inicializado, devuelve la clave 'matrix.dest.oscSync'
    const isI18nKey0 = label0.includes('matrix.dest.oscSync');
    const isI18nKey11 = label11.includes('matrix.dest.oscSync');
    
    // Si es clave i18n, aceptamos eso también (significa que el switch-case funcionó)
    if (!isI18nKey0) {
      assert.ok(label0.includes('1'), `Label para oscIndex 0 debería contener "1", got: ${label0}`);
    }
    if (!isI18nKey11) {
      assert.ok(label11.includes('12'), `Label para oscIndex 11 debería contener "12", got: ${label11}`);
    }
  });

  it('oscSync label contiene "Sync" o clave i18n correcta', () => {
    const label = getLabelForDest({ kind: 'oscSync', oscIndex: 5 });
    // Puede devolver "Osc 6 Sync" o "matrix.dest.oscSync" si i18n no está activo
    const hasSync = label.toLowerCase().includes('sync');
    assert.ok(hasSync, `Label debería contener "sync", got: ${label}`);
  });

  it('genera label no-vacío para outputLevelCV', () => {
    const label = getLabelForDest({ kind: 'outputLevelCV', busIndex: 0 });
    assert.ok(label, 'Debería devolver un label');
    assert.ok(typeof label === 'string', 'Label debe ser string');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// MatrixTooltip — show() con autoHide
// ═══════════════════════════════════════════════════════════════════════════

describe('MatrixTooltip — show() autoHide', () => {

  it('MatrixTooltip es una clase exportada', () => {
    assert.strictEqual(typeof MatrixTooltip, 'function');
  });

  it('show() acepta autoHide como opción con default true', () => {
    assert.ok(tooltipSource.includes('{ autoHide = true }'),
      'show() debe tener parámetro autoHide con default true');
  });

  it('desktop hover usa autoHide: false para no desaparecer', () => {
    const start = tooltipSource.indexOf('_handleMouseEnter(ev)');
    const end = tooltipSource.indexOf('_handleMouseLeave', start);
    const mouseEnterFn = tooltipSource.substring(start, end);
    assert.ok(mouseEnterFn.includes('autoHide: false'),
      'mouseenter handler debe pasar autoHide: false para que el tooltip no desaparezca en desktop');
  });

  it('autoHide controla si se establece setTimeout para ocultar', () => {
    const showStart = tooltipSource.indexOf('show(pinBtn, content');
    const showEnd = tooltipSource.indexOf('\n  hide()', showStart);
    const showFn = tooltipSource.substring(showStart, showEnd);
    assert.ok(showFn.includes('if (autoHide)'),
      'show() debe comprobar autoHide antes de setTimeout');
    assert.ok(showFn.includes('this.autoHideDelay'),
      'El timeout debe usar autoHideDelay');
  });
});

