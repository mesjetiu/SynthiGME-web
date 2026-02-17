/**
 * Tests para la eliminación del DC blocker en el Output Channel
 * 
 * Bug original: El DC blocker (AudioWorklet de 1er orden, fc=0.01Hz) en la
 * ruta de re-entry del Output Channel filtraba señales DC legítimas
 * (joystick, voltajes de control estáticos), haciéndolas tender a 0V.
 * 
 * Fix: dcBlocker es ahora un alias directo de postVcaNode, sin nodo
 * intermedio. El worklet dcBlocker.worklet.js ya no se carga ni se usa.
 * 
 * Estos tests verifican que el fix se mantiene: cualquier regresión que
 * reintroduzca un DC blocker en la cadena de señal del Output Channel
 * será detectada.
 * 
 * Con el código ANTERIOR al fix (commit 8e1dbc5), estos tests FALLAN porque:
 * - dcBlocker era un GainNode separado (no alias de postVcaNode)
 * - _initDCBlockerNodes insertaba un AudioWorkletNode dc-blocker
 * - dcBlocker.worklet.js estaba en la lista de worklets a cargar
 * - bus.dcBlockerWorklet existía como propiedad del bus
 * 
 * Con el código POSTERIOR al fix (commit c198033), estos tests PASAN.
 * 
 * Método: análisis estático del código fuente de engine.js
 * (no requiere AudioContext real ni DOM).
 * 
 * @see commit c198033 - fix(output-channel): eliminar DC blocker que destruía señales DC legítimas
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const engineSource = readFileSync(resolve(ROOT, 'src/assets/js/core/engine.js'), 'utf-8');

// ═══════════════════════════════════════════════════════════════════════════
// 1. dcBlocker DEBE SER ALIAS DIRECTO DE postVcaNode
// ═══════════════════════════════════════════════════════════════════════════

describe('Output Channel: dcBlocker es alias directo de postVcaNode', () => {

  it('dcBlocker se asigna directamente como postVcaNode (sin createGain)', () => {
    // Buscar la declaración: const dcBlocker = postVcaNode;
    const aliasPattern = /const dcBlocker\s*=\s*postVcaNode\s*;/;
    assert.ok(
      aliasPattern.test(engineSource),
      'dcBlocker debe ser un alias directo de postVcaNode (const dcBlocker = postVcaNode;)\n' +
      'Si dcBlocker es un createGain() separado, las señales DC legítimas se filtran.'
    );
  });

  it('dcBlocker NO se crea como GainNode separado', () => {
    // En el código buggy: const dcBlocker = ctx.createGain();
    const separateGainPattern = /const dcBlocker\s*=\s*ctx\.createGain\(\)/;
    assert.ok(
      !separateGainPattern.test(engineSource),
      'dcBlocker NO debe crearse como GainNode separado (ctx.createGain()).\n' +
      'Un nodo separado permite insertar un DC blocker worklet que destruye señales DC.'
    );
  });

  it('no existe conexión postVcaNode → dcBlocker (sería self-connect)', () => {
    // En el código buggy: postVcaNode.connect(dcBlocker);
    // Con el alias, esto sería conectar un nodo a sí mismo (no tiene sentido)
    const connectPattern = /postVcaNode\.connect\(dcBlocker\)/;
    assert.ok(
      !connectPattern.test(engineSource),
      'No debe existir postVcaNode.connect(dcBlocker) — si dcBlocker es alias,\n' +
      'esto sería auto-conexión. Si existe, indica que dcBlocker es un nodo separado.'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. NO DEBE EXISTIR EL WORKLET DC BLOCKER
// ═══════════════════════════════════════════════════════════════════════════

describe('Output Channel: worklet dc-blocker eliminado', () => {

  it('dcBlocker.worklet.js NO está en la lista de worklets a cargar', () => {
    // En el código buggy: './assets/js/worklets/dcBlocker.worklet.js' estaba en el array
    const workletListPattern = /dcBlocker\.worklet\.js/;
    assert.ok(
      !workletListPattern.test(engineSource),
      'dcBlocker.worklet.js NO debe estar en la lista de worklets a cargar.\n' +
      'El DC blocker destruye señales DC legítimas (joystick, CV estáticos).'
    );
  });

  it('no se crea AudioWorkletNode dc-blocker', () => {
    // En el código buggy: new AudioWorkletNode(ctx, 'dc-blocker', ...)
    const workletNodePattern = /new AudioWorkletNode\([^)]*'dc-blocker'/;
    assert.ok(
      !workletNodePattern.test(engineSource),
      'No debe crearse AudioWorkletNode dc-blocker.\n' +
      'El DC blocker filtra voltajes DC constantes haciéndolos tender a 0V.'
    );
  });

  it('no existe la función _initDCBlockerNodes', () => {
    // En el código buggy: _initDCBlockerNodes() insertaba el worklet
    const initFnPattern = /_initDCBlockerNodes/;
    assert.ok(
      !initFnPattern.test(engineSource),
      'La función _initDCBlockerNodes no debe existir.\n' +
      'Era la responsable de insertar el worklet DC blocker en la cadena de señal.'
    );
  });

  it('no se llama a _initDCBlockerNodes desde _loadWorklet', () => {
    // Doble check: incluso si existiera la función, no debe invocarse
    const callPattern = /this\._initDCBlockerNodes\(\)/;
    assert.ok(
      !callPattern.test(engineSource),
      'No debe haber llamada a this._initDCBlockerNodes() en _loadWorklet().'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. PROPIEDADES DEL BUS: dcBlockerWorklet NO DEBE EXISTIR
// ═══════════════════════════════════════════════════════════════════════════

describe('Output Channel: bus sin dcBlockerWorklet', () => {

  it('el objeto bus no tiene propiedad dcBlockerWorklet', () => {
    // En el código buggy: dcBlockerWorklet: null (luego se asignaba el AudioWorkletNode)
    const workletPropPattern = /dcBlockerWorklet/;
    assert.ok(
      !workletPropPattern.test(engineSource),
      'El objeto bus NO debe tener propiedad dcBlockerWorklet.\n' +
      'Esta propiedad se usaba para almacenar el nodo AudioWorklet dc-blocker.'
    );
  });

  it('el bus mantiene dcBlocker como propiedad (compatibilidad re-entry)', () => {
    // dcBlocker sigue existiendo como propiedad del bus (alias de postVcaNode)
    // para compatibilidad con app.js que lo usa como punto de conexión de re-entry
    const dcBlockerPropPattern = /dcBlocker,/;
    assert.ok(
      dcBlockerPropPattern.test(engineSource),
      'El bus debe mantener dcBlocker como propiedad para compatibilidad con el re-entry.'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. CADENA DE SEÑAL: RE-ENTRY DIRECTA (sin filtrado DC)
// ═══════════════════════════════════════════════════════════════════════════

describe('Output Channel: cadena de señal re-entry directa', () => {

  it('el comentario documenta que no hay DC blocker', () => {
    assert.ok(
      engineSource.includes('sin DC blocker'),
      'El código debe documentar explícitamente la ausencia del DC blocker'
    );
  });

  it('el comentario explica por qué se eliminó (señales DC legítimas)', () => {
    assert.ok(
      engineSource.includes('señales') && 
      engineSource.includes('DC') &&
      engineSource.includes('legítimas'),
      'Debe documentar que se eliminó porque destruía señales DC legítimas'
    );
  });

  it('postVcaNode sigue siendo el punto de split POST-VCA', () => {
    // postVcaNode debe existir y estar documentado como split point
    const splitComment = engineSource.match(
      /POST-VCA.*split|split.*POST-VCA|postVcaNode.*split|Punto de split/i
    );
    assert.ok(splitComment, 'postVcaNode debe seguir documentado como punto de split POST-VCA');
  });

  it('la conexión postVcaNode → filterGain existe (ruta de filtros)', () => {
    assert.ok(
      engineSource.includes('postVcaNode.connect(filterGain)'),
      'Debe existir postVcaNode.connect(filterGain) para la ruta de filtros'
    );
  });

  it('la conexión postVcaNode → bypassGain existe (ruta de bypass)', () => {
    assert.ok(
      engineSource.includes('postVcaNode.connect(bypassGain)'),
      'Debe existir postVcaNode.connect(bypassGain) para la ruta de bypass'
    );
  });

  it('no se desconecta postVcaNode de dcBlocker en ningún sitio', () => {
    // En el buggy: bus.postVcaNode.disconnect(bus.dcBlocker) para insertar el worklet
    const disconnectPattern = /postVcaNode\.disconnect\(.*dcBlocker\)/;
    assert.ok(
      !disconnectPattern.test(engineSource),
      'No debe haber disconnect de postVcaNode a dcBlocker (señal de inserción de worklet DC blocker)'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. PARÁMETROS DEL DC BLOCKER BUGGY NO DEBEN EXISTIR
// ═══════════════════════════════════════════════════════════════════════════

describe('Output Channel: sin parámetros de DC blocker', () => {

  it('no hay referencia a cutoffFrequency 0.01 en engine.js', () => {
    // En el buggy: parameterData: { cutoffFrequency: 0.01 }
    const cutoffPattern = /cutoffFrequency:\s*0\.01/;
    assert.ok(
      !cutoffPattern.test(engineSource),
      'No debe haber cutoffFrequency: 0.01 en engine.js (parámetro del DC blocker eliminado)'
    );
  });

  it('no hay referencia a silenceThreshold en engine.js', () => {
    // En el buggy: processorOptions: { silenceThreshold: 1e-6 }
    const thresholdPattern = /silenceThreshold/;
    assert.ok(
      !thresholdPattern.test(engineSource),
      'No debe haber silenceThreshold en engine.js (parámetro del DC blocker eliminado)'
    );
  });

  it('no hay referencia a silenceTimeMs en engine.js', () => {
    // En el buggy: processorOptions: { silenceTimeMs: 50 }
    const timePattern = /silenceTimeMs/;
    assert.ok(
      !timePattern.test(engineSource),
      'No debe haber silenceTimeMs en engine.js (parámetro del DC blocker eliminado)'
    );
  });
});
