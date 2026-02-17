/**
 * Tests de regresión: eliminación del DC blocker en el Output Channel
 * 
 * Bug original: El DC blocker (AudioWorklet de 1er orden, fc=0.01Hz) en la
 * ruta de re-entry del Output Channel filtraba señales DC legítimas
 * (joystick, voltajes de control estáticos), haciéndolas tender a 0V.
 * 
 * Fix (commit c198033): Se eliminó el DC blocker completamente.
 * Refactor: Se eliminó el alias dcBlocker → postVcaNode, el archivo
 * dcBlocker.worklet.js y todas las referencias. El punto de re-entry
 * es ahora directamente postVcaNode, sin indirección.
 * 
 * Estos tests verifican que:
 * 1. No existe ningún rastro de DC blocker en engine.js
 * 2. app.js usa postVcaNode directamente para re-entry (no dcBlocker)
 * 3. postVcaNode está correctamente conectado en la cadena de señal
 * 4. El archivo dcBlocker.worklet.js no existe
 * 
 * Método: análisis estático del código fuente (no requiere AudioContext ni DOM).
 * 
 * @see commit c198033 - fix(output-channel): eliminar DC blocker
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const engineSource = readFileSync(resolve(ROOT, 'src/assets/js/core/engine.js'), 'utf-8');
const appSource = readFileSync(resolve(ROOT, 'src/assets/js/app.js'), 'utf-8');

// ═══════════════════════════════════════════════════════════════════════════
// 1. ENGINE.JS: NO DEBE EXISTIR NINGÚN RASTRO DE DC BLOCKER
// ═══════════════════════════════════════════════════════════════════════════

describe('Engine: sin DC blocker ni alias', () => {

  it('no existe variable dcBlocker (ni alias ni nodo separado)', () => {
    const dcBlockerVar = /\bconst dcBlocker\b/;
    assert.ok(
      !dcBlockerVar.test(engineSource),
      'No debe existir ninguna variable dcBlocker en engine.js.\n' +
      'El punto de re-entry es postVcaNode directamente.'
    );
  });

  it('no existe propiedad dcBlocker en el objeto bus', () => {
    const dcBlockerProp = /\bdcBlocker[,:\s]/;
    assert.ok(
      !dcBlockerProp.test(engineSource),
      'El objeto bus no debe tener propiedad dcBlocker.\n' +
      'La re-entry usa postVcaNode directamente.'
    );
  });

  it('no existe dcBlockerWorklet en el bus', () => {
    assert.ok(
      !engineSource.includes('dcBlockerWorklet'),
      'No debe existir dcBlockerWorklet en engine.js.'
    );
  });

  it('no existe la función _initDCBlockerNodes', () => {
    assert.ok(
      !engineSource.includes('_initDCBlockerNodes'),
      '_initDCBlockerNodes no debe existir.'
    );
  });

  it('no se crea AudioWorkletNode dc-blocker', () => {
    const workletNode = /new AudioWorkletNode\([^)]*'dc-blocker'/;
    assert.ok(
      !workletNode.test(engineSource),
      'No debe crearse AudioWorkletNode dc-blocker.'
    );
  });

  it('dcBlocker.worklet.js no está en la lista de worklets a cargar', () => {
    assert.ok(
      !engineSource.includes('dcBlocker.worklet.js'),
      'dcBlocker.worklet.js no debe estar en la lista de worklets.'
    );
  });

  it('no hay parámetros del DC blocker (cutoffFrequency 0.01)', () => {
    assert.ok(
      !/cutoffFrequency:\s*0\.01/.test(engineSource),
      'No debe haber cutoffFrequency: 0.01 (parámetro del DC blocker eliminado).'
    );
  });

  it('no hay parámetros del DC blocker (silenceThreshold, silenceTimeMs)', () => {
    assert.ok(!engineSource.includes('silenceThreshold'), 'No debe haber silenceThreshold.');
    assert.ok(!engineSource.includes('silenceTimeMs'), 'No debe haber silenceTimeMs.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. ENGINE.JS: postVcaNode COMO PUNTO DIRECTO DE RE-ENTRY
// ═══════════════════════════════════════════════════════════════════════════

describe('Engine: postVcaNode es el punto directo de re-entry', () => {

  it('postVcaNode está expuesto en el objeto bus', () => {
    const busProp = /postVcaNode,?\s*\/\//;
    assert.ok(
      busProp.test(engineSource),
      'postVcaNode debe ser propiedad del bus.'
    );
  });

  it('postVcaNode está documentado como punto de re-entry', () => {
    assert.ok(
      engineSource.includes('re-entry') && engineSource.includes('postVcaNode'),
      'postVcaNode debe documentarse como punto de re-entry a la matriz.'
    );
  });

  it('postVcaNode conecta a filterGain (ruta de filtros)', () => {
    assert.ok(
      engineSource.includes('postVcaNode.connect(filterGain)'),
      'Debe existir postVcaNode.connect(filterGain).'
    );
  });

  it('postVcaNode conecta a bypassGain (ruta de bypass)', () => {
    assert.ok(
      engineSource.includes('postVcaNode.connect(bypassGain)'),
      'Debe existir postVcaNode.connect(bypassGain).'
    );
  });

  it('no existe desconexión postVcaNode → dcBlocker', () => {
    assert.ok(
      !/postVcaNode\.disconnect\(.*dcBlocker\)/.test(engineSource),
      'No debe haber disconnect de postVcaNode a dcBlocker.'
    );
  });

  it('documenta la ausencia del DC blocker', () => {
    assert.ok(
      engineSource.includes('sin DC blocker') || engineSource.includes('sin filtro DC'),
      'Debe documentar explícitamente que no hay DC blocker en la ruta.'
    );
  });

  it('documenta que señales DC legítimas deben pasar', () => {
    assert.ok(
      engineSource.includes('DC') && engineSource.includes('legítimas'),
      'Debe documentar que las señales DC legítimas pasan sin modificación.'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. APP.JS: RE-ENTRY USA postVcaNode DIRECTAMENTE
// ═══════════════════════════════════════════════════════════════════════════

describe('App: re-entry usa postVcaNode directamente (no dcBlocker)', () => {

  it('app.js no contiene la palabra dcBlocker', () => {
    assert.ok(
      !appSource.includes('dcBlocker'),
      'app.js no debe contener ninguna referencia a dcBlocker.\n' +
      'La re-entry debe usar busData.postVcaNode.'
    );
  });

  it('app.js accede a busData.postVcaNode para re-entry', () => {
    assert.ok(
      appSource.includes('busData.postVcaNode') || appSource.includes('busData?.postVcaNode'),
      'app.js debe acceder a busData.postVcaNode para la re-entry.'
    );
  });

  it('app.js verifica disponibilidad de postVcaNode antes de usarlo', () => {
    assert.ok(
      appSource.includes('busData?.postVcaNode'),
      'app.js debe verificar busData?.postVcaNode antes de usarlo.'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. WORKLET: ARCHIVO ELIMINADO
// ═══════════════════════════════════════════════════════════════════════════

describe('Worklet dcBlocker.worklet.js eliminado', () => {

  it('el archivo dcBlocker.worklet.js no existe en src', () => {
    const workletPath = resolve(ROOT, 'src/assets/js/worklets/dcBlocker.worklet.js');
    assert.ok(
      !existsSync(workletPath),
      'El archivo dcBlocker.worklet.js no debe existir en src/assets/js/worklets/.\n' +
      'Ya no se usa y debe eliminarse para evitar confusión.'
    );
  });
});
