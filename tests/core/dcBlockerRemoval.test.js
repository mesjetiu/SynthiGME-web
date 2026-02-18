/**
 * Tests de regresión: DC blocker reposicionado en el Output Channel
 * 
 * Bug original: El DC blocker (AudioWorklet de 1er orden, fc=0.01Hz) estaba
 * en la ruta de re-entry del Output Channel, filtrando señales DC legítimas
 * (joystick, voltajes de control estáticos), haciéndolas tender a 0V.
 * 
 * Fix: El DC blocker se reposicionó a la ruta de SALIDA a altavoces
 * (entre muteNode y channelGains). La re-entry (postVcaNode → matriz)
 * ya NO pasa por el DC blocker, preservando señales DC para CV.
 * 
 * Arquitectura actual:
 *   postVcaNode → filtros → muteNode → [dcBlocker] → dcBlockerOut → channelGains → 🔊
 *   postVcaNode → re-entry a matriz (SIN DC blocker, DC pasa)
 * 
 * fc = 1 Hz (configurable en outputChannel.config.js)
 * 
 * Estos tests verifican que:
 * 1. El DC blocker existe en la ruta de salida (engine.js)
 * 2. La re-entry usa postVcaNode directamente (sin DC blocker)
 * 3. app.js NO contiene dcBlocker (solo engine.js lo gestiona)
 * 4. El worklet dcBlocker.worklet.js existe
 * 5. La configuración fc está en outputChannel.config.js
 * 
 * Método: análisis estático del código fuente (no requiere AudioContext ni DOM).
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
// 1. ENGINE.JS: DC BLOCKER EN RUTA DE SALIDA A ALTAVOCES
// ═══════════════════════════════════════════════════════════════════════════

describe('Engine: DC blocker en ruta de salida (no en re-entry)', () => {

  it('existe dcBlockerOut en el objeto bus', () => {
    assert.ok(
      engineSource.includes('dcBlockerOut'),
      'El bus debe tener dcBlockerOut como nodo de salida post-DC-blocker.'
    );
  });

  it('existe dcBlockerWorklet en el objeto bus', () => {
    assert.ok(
      engineSource.includes('dcBlockerWorklet'),
      'El bus debe tener dcBlockerWorklet para el AudioWorklet de DC blocking.'
    );
  });

  it('existe la función _initDCBlockerNodes', () => {
    assert.ok(
      engineSource.includes('_initDCBlockerNodes'),
      '_initDCBlockerNodes debe existir para crear los worklets de DC blocker.'
    );
  });

  it('se crea AudioWorkletNode dc-blocker', () => {
    const workletNode = /new AudioWorkletNode\([^)]*'dc-blocker'/;
    assert.ok(
      workletNode.test(engineSource),
      'Debe crearse AudioWorkletNode dc-blocker para la ruta de salida.'
    );
  });

  it('dcBlocker.worklet.js está en la lista de worklets a cargar', () => {
    assert.ok(
      engineSource.includes('dcBlocker.worklet.js'),
      'dcBlocker.worklet.js debe estar en la lista de worklets a cargar.'
    );
  });

  it('muteNode conecta a dcBlockerOut (cadena de salida)', () => {
    assert.ok(
      engineSource.includes('muteNode.connect(dcBlockerOut)'),
      'Debe existir muteNode.connect(dcBlockerOut) en la cadena de salida.'
    );
  });

  it('dcBlockerOut conecta a channelGains (no muteNode directamente)', () => {
    assert.ok(
      engineSource.includes('dcBlockerOut.connect(gainNode)'),
      'Debe existir dcBlockerOut.connect(gainNode) para los channelGains.'
    );
  });

  it('dcBlockerOut conecta a stereoPan (no muteNode directamente)', () => {
    assert.ok(
      engineSource.includes('bus.dcBlockerOut.connect(bus.stereoPanL)'),
      'Debe existir bus.dcBlockerOut.connect(bus.stereoPanL) para stereo buses.'
    );
  });

  it('no hay fc=0.01 Hz antiguo del DC blocker original', () => {
    assert.ok(
      !/cutoffFrequency:\s*0\.01/.test(engineSource),
      'No debe haber cutoffFrequency: 0.01 (valor antiguo del DC blocker original).'
    );
  });

  it('no hay parámetros obsoletos del DC blocker v1 (silenceThreshold, silenceTimeMs)', () => {
    assert.ok(!engineSource.includes('silenceThreshold'), 'No debe haber silenceThreshold.');
    assert.ok(!engineSource.includes('silenceTimeMs'), 'No debe haber silenceTimeMs.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. ENGINE.JS: RE-ENTRY USA postVcaNode (SIN DC BLOCKER)
// ═══════════════════════════════════════════════════════════════════════════

describe('Engine: postVcaNode es el punto directo de re-entry (sin DC blocker)', () => {

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

  it('documenta que señales DC legítimas pasan por re-entry', () => {
    assert.ok(
      engineSource.includes('DC') && engineSource.includes('legítimas'),
      'Debe documentar que las señales DC legítimas pasan sin modificación por re-entry.'
    );
  });

  it('documenta que el DC blocker NO está en la re-entry', () => {
    assert.ok(
      engineSource.includes('re-entry') &&
      (engineSource.includes('sin DC blocker') || engineSource.includes('NO pasa por')),
      'Debe documentar que el DC blocker no está en la ruta de re-entry.'
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
      'La re-entry debe usar busData.postVcaNode. El DC blocker es interno a engine.js.'
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
// 4. WORKLET: ARCHIVO EXISTE
// ═══════════════════════════════════════════════════════════════════════════

describe('Worklet dcBlocker.worklet.js existe', () => {

  it('el archivo dcBlocker.worklet.js existe en src', () => {
    const workletPath = resolve(ROOT, 'src/assets/js/worklets/dcBlocker.worklet.js');
    assert.ok(
      existsSync(workletPath),
      'El archivo dcBlocker.worklet.js debe existir en src/assets/js/worklets/.\n' +
      'Es necesario para el DC blocker en la ruta de salida a altavoces.'
    );
  });

  it('el worklet registra el procesador dc-blocker', () => {
    const workletSource = readFileSync(
      resolve(ROOT, 'src/assets/js/worklets/dcBlocker.worklet.js'), 'utf-8'
    );
    assert.ok(
      workletSource.includes("registerProcessor('dc-blocker'"),
      'El worklet debe registrar el procesador como dc-blocker.'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CONFIG: fc CONFIGURABLE EN outputChannel.config.js
// ═══════════════════════════════════════════════════════════════════════════

describe('Config: DC blocker fc configurable en outputChannel.config.js', () => {

  it('outputChannel.config.js contiene sección dcBlocker', () => {
    const configSource = readFileSync(
      resolve(ROOT, 'src/assets/js/configs/modules/outputChannel.config.js'), 'utf-8'
    );
    assert.ok(
      configSource.includes('dcBlocker'),
      'outputChannel.config.js debe tener sección dcBlocker en audio.'
    );
  });

  it('outputChannel.config.js define cutoffFrequency', () => {
    const configSource = readFileSync(
      resolve(ROOT, 'src/assets/js/configs/modules/outputChannel.config.js'), 'utf-8'
    );
    assert.ok(
      configSource.includes('cutoffFrequency'),
      'outputChannel.config.js debe definir cutoffFrequency para el DC blocker.'
    );
  });

  it('engine.js lee fc del config (no hardcodeado)', () => {
    assert.ok(
      engineSource.includes('dcBlockerConfig.cutoffFrequency') ||
      engineSource.includes('outputChannelConfig.audio.dcBlocker'),
      'engine.js debe leer la fc del DC blocker desde el config, no hardcodearla.'
    );
  });
});
