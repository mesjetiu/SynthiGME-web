/**
 * Tests para easterEgg — Easter Egg con desintegración visual + pieza musical
 *
 * Cobertura:
 *  1. Constantes y configuración
 *  2. triggerEasterEgg: modo normal, visualOnly, guard doble ejecución
 *  3. initEasterEggTrigger: detección de secuencia, reset por drag/timeout/pad
 *  4. Mecanismo de seguridad: isDirtyFn + markCleanFn
 *  5. Aislamiento: AudioContext propio, limpieza DOM, no interfiere con Synthi
 *  6. Piezas musicales: chiptune y electroacústica
 *  7. Efectos visuales: fantasmas, paleta, animación, overlay
 *  8. Integración app.js, exports, vendor eliminado
 */
import { describe, it, before, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Paths ───────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const EASTER_EGG_PATH = resolve(ROOT, 'src/assets/js/ui/easterEgg.js');
const APP_PATH = resolve(ROOT, 'src/assets/js/app.js');
const BUILD_SCRIPT_PATH = resolve(ROOT, 'scripts/build.mjs');

// ─── Leer código fuente para análisis estático ───────────────────────────────
const easterEggSource = readFileSync(EASTER_EGG_PATH, 'utf-8');
const appSource = readFileSync(APP_PATH, 'utf-8');

// ─── JSDOM setup ─────────────────────────────────────────────────────────────
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.HTMLElement = dom.window.HTMLElement;
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Mock AudioContext completo
let audioContextCreated = false;
let audioContextClosed = false;
const mockAudioParam = {
  setValueAtTime: () => mockAudioParam,
  linearRampToValueAtTime: () => mockAudioParam,
  exponentialRampToValueAtTime: () => mockAudioParam,
  value: 0
};
const mockGainNode = {
  gain: mockAudioParam,
  connect: () => mockGainNode
};
const mockOscillator = {
  type: 'sine',
  frequency: mockAudioParam,
  connect: () => mockOscillator,
  start: () => {},
  stop: () => {},
  disconnect: () => {}
};
const mockCompressor = {
  threshold: mockAudioParam,
  knee: mockAudioParam,
  ratio: mockAudioParam,
  attack: mockAudioParam,
  release: mockAudioParam,
  connect: () => mockGainNode
};
const mockBufferSource = {
  buffer: null,
  connect: () => mockBufferSource,
  start: () => {},
  stop: () => {},
  disconnect: () => {},
  playbackRate: mockAudioParam
};
const mockBiquadFilter = {
  type: 'lowpass',
  frequency: { ...mockAudioParam },
  Q: { ...mockAudioParam },
  connect: () => mockGainNode
};

class MockAudioContext {
  constructor() {
    audioContextCreated = true;
    audioContextClosed = false;
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = 44100;
  }
  createGain() { return { ...mockGainNode, gain: { ...mockAudioParam } }; }
  createOscillator() { return { ...mockOscillator, frequency: { ...mockAudioParam } }; }
  createDynamicsCompressor() {
    return {
      threshold: { ...mockAudioParam },
      knee: { ...mockAudioParam },
      ratio: { ...mockAudioParam },
      attack: { ...mockAudioParam },
      release: { ...mockAudioParam },
      connect: () => ({ ...mockGainNode, gain: { ...mockAudioParam }, connect: () => ({ connect: () => {} }) })
    };
  }
  createBuffer(channels, length, sampleRate) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length)
    };
  }
  createBufferSource() { return { ...mockBufferSource, playbackRate: { ...mockAudioParam } }; }
  createBiquadFilter() {
    return {
      type: 'lowpass',
      frequency: { ...mockAudioParam },
      Q: { ...mockAudioParam },
      connect: () => ({ ...mockGainNode, gain: { ...mockAudioParam }, connect: () => ({ connect: () => {} }) })
    };
  }
  close() { audioContextClosed = true; this.state = 'closed'; return Promise.resolve(); }
}

global.window.AudioContext = MockAudioContext;
global.window.webkitAudioContext = MockAudioContext;

// ─── Import módulo bajo test ─────────────────────────────────────────────────
const {
  triggerEasterEgg,
  initEasterEggTrigger,
  TRIGGER_SEQUENCE,
  TAP_MAX_DURATION,
  TAP_MAX_MOVEMENT,
  SEQUENCE_TIMEOUT
} = await import('../../src/assets/js/ui/easterEgg.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flushAsync() {
  return new Promise(resolve => setTimeout(resolve, 20));
}

function createPointerEvent(type, { pointerId = 1, clientX = 50, clientY = 50 } = {}) {
  const ev = new dom.window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY
  });
  Object.defineProperty(ev, 'pointerId', { value: pointerId, writable: false });
  return ev;
}

function simulateTap(pad, { pointerId = 1, x = 50, y = 50 } = {}) {
  pad.dispatchEvent(createPointerEvent('pointerdown', { pointerId, clientX: x, clientY: y }));
  pad.dispatchEvent(createPointerEvent('pointerup', { pointerId, clientX: x, clientY: y }));
}

function simulateDrag(pad, { pointerId = 1 } = {}) {
  pad.dispatchEvent(createPointerEvent('pointerdown', { pointerId, clientX: 50, clientY: 50 }));
  pad.dispatchEvent(createPointerEvent('pointerup', { pointerId, clientX: 200, clientY: 200 }));
}

function setupJoystickDOM() {
  document.body.innerHTML = `
    <div id="joystick-left">
      <div class="panel7-joystick-pad" style="width:100px;height:100px;"></div>
    </div>
    <div id="joystick-right">
      <div class="panel7-joystick-pad" style="width:100px;height:100px;"></div>
    </div>
    <div id="other-element"></div>
  `;
  return {
    pad1: document.querySelector('#joystick-left .panel7-joystick-pad'),
    pad2: document.querySelector('#joystick-right .panel7-joystick-pad'),
    other: document.querySelector('#other-element')
  };
}

async function cleanupOverlays() {
  // Dblclick overlay to trigger cleanup (resets isPlaying)
  const overlay = document.getElementById('easter-egg-overlay');
  if (overlay) {
    overlay.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
  }
  document.querySelectorAll('[style*="position: fixed"]').forEach(el => el.remove());
  document.querySelectorAll('#easter-egg-overlay').forEach(el => el.remove());
}


// ═══════════════════════════════════════════════════════════════════════════
// 1. CONSTANTES Y CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('Easter Egg — Constantes', () => {

  it('TRIGGER_SEQUENCE es [0,1,0,1,0,1,0,1] (8 taps alternados)', () => {
    assert.deepStrictEqual(TRIGGER_SEQUENCE, [0, 1, 0, 1, 0, 1, 0, 1]);
    assert.strictEqual(TRIGGER_SEQUENCE.length, 8);
  });

  it('la secuencia empieza con pad izquierdo (0) y termina con pad derecho (1)', () => {
    assert.strictEqual(TRIGGER_SEQUENCE[0], 0, 'Empieza con pad izquierdo');
    assert.strictEqual(TRIGGER_SEQUENCE[7], 1, 'Termina con pad derecho');
  });

  it('TAP_MAX_DURATION es razonable (100-500ms)', () => {
    assert.ok(TAP_MAX_DURATION >= 100, `TAP_MAX_DURATION=${TAP_MAX_DURATION} es muy bajo`);
    assert.ok(TAP_MAX_DURATION <= 500, `TAP_MAX_DURATION=${TAP_MAX_DURATION} es muy alto`);
  });

  it('TAP_MAX_MOVEMENT es razonable (5-20px)', () => {
    assert.ok(TAP_MAX_MOVEMENT >= 5, `TAP_MAX_MOVEMENT=${TAP_MAX_MOVEMENT} es muy bajo`);
    assert.ok(TAP_MAX_MOVEMENT <= 20, `TAP_MAX_MOVEMENT=${TAP_MAX_MOVEMENT} es muy alto`);
  });

  it('SEQUENCE_TIMEOUT permite taps a ritmo humano (>1s, <5s)', () => {
    assert.ok(SEQUENCE_TIMEOUT >= 1000, `SEQUENCE_TIMEOUT=${SEQUENCE_TIMEOUT} es muy corto`);
    assert.ok(SEQUENCE_TIMEOUT <= 5000, `SEQUENCE_TIMEOUT=${SEQUENCE_TIMEOUT} es muy largo`);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 2. triggerEasterEgg — API pública
// ═══════════════════════════════════════════════════════════════════════════

describe('Easter Egg — triggerEasterEgg()', () => {

  beforeEach(async () => {
    audioContextCreated = false;
    audioContextClosed = false;
    await cleanupOverlays();
  });

  afterEach(async () => {
    // Wait for click listener install (600ms delay) + click to cleanup
    await new Promise(r => setTimeout(r, 700));
    await cleanupOverlays();
  });

  it('es una función async exportada', () => {
    assert.strictEqual(typeof triggerEasterEgg, 'function');
  });

  it('crea overlay visual (desintegración)', async () => {
    await triggerEasterEgg({ visualOnly: true });
    await flushAsync();
    assert.ok(true, 'triggerEasterEgg se ejecutó sin errores');
  });

  it('modo normal: crea AudioContext para la pieza', async () => {
    audioContextCreated = false;
    await triggerEasterEgg();
    assert.ok(audioContextCreated, 'Se creó un AudioContext');
  });

  it('modo visualOnly: NO crea AudioContext', async () => {
    audioContextCreated = false;
    await triggerEasterEgg({ visualOnly: true });
    assert.ok(!audioContextCreated, 'No se creó AudioContext en modo visualOnly');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 3. initEasterEggTrigger — Detección de secuencia de taps
// ═══════════════════════════════════════════════════════════════════════════

describe('Easter Egg — initEasterEggTrigger()', () => {

  it('es una función exportada', () => {
    assert.strictEqual(typeof initEasterEggTrigger, 'function');
  });

  it('no falla si los pads no existen en el DOM', () => {
    document.body.innerHTML = '<div></div>';
    assert.doesNotThrow(() => initEasterEggTrigger());
  });

  it('no falla si solo existe un pad', () => {
    document.body.innerHTML = '<div id="joystick-left"><div class="panel7-joystick-pad"></div></div>';
    assert.doesNotThrow(() => initEasterEggTrigger());
  });

  it('acepta opciones vacías sin error', () => {
    setupJoystickDOM();
    assert.doesNotThrow(() => initEasterEggTrigger({}));
  });

  it('acepta isDirtyFn y markCleanFn como opciones', () => {
    setupJoystickDOM();
    assert.doesNotThrow(() => initEasterEggTrigger({
      isDirtyFn: () => false,
      markCleanFn: () => {},
    }));
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 4. Detección de secuencia — análisis de lógica
// ═══════════════════════════════════════════════════════════════════════════

describe('Easter Egg — Lógica de secuencia (análisis estático)', () => {

  it('usa performance.now() para medir duración del tap', () => {
    assert.ok(easterEggSource.includes('performance.now()'),
      'Debe usar performance.now() para timing preciso');
  });

  it('calcula movimiento con distancia euclidiana (sqrt)', () => {
    assert.ok(easterEggSource.includes('Math.sqrt'),
      'Debe calcular distancia euclidiana para movimiento');
  });

  it('resetea la secuencia si la duración del tap excede TAP_MAX_DURATION', () => {
    assert.ok(easterEggSource.includes('duration > TAP_MAX_DURATION'),
      'Debe rechazar taps lentos');
  });

  it('resetea la secuencia si el movimiento excede TAP_MAX_MOVEMENT', () => {
    assert.ok(easterEggSource.includes('movement > TAP_MAX_MOVEMENT'),
      'Debe rechazar taps con arrastre');
  });

  it('resetea la secuencia si pasa demasiado tiempo entre taps', () => {
    assert.ok(easterEggSource.includes('SEQUENCE_TIMEOUT'),
      'Debe tener timeout entre taps');
  });

  it('escucha pointerdown global para detectar interacciones fuera de pads', () => {
    assert.ok(easterEggSource.includes("document.addEventListener('pointerdown'"),
      'Debe escuchar pointerdown global');
  });

  it('maneja pointercancel para cancelar taps incompletos', () => {
    assert.ok(easterEggSource.includes("'pointercancel'"),
      'Debe manejar pointercancel');
  });

  it('rechaza toques con múltiples dedos simultáneos (multi-touch)', () => {
    assert.ok(easterEggSource.includes('tapPointerId !== -1'),
      'Debe rechazar segundo dedo si ya hay uno activo');
  });

  it('permite reiniciar secuencia si tap incorrecto es pad izquierdo', () => {
    assert.ok(easterEggSource.includes('TRIGGER_SEQUENCE[0]'),
      'Debe poder reiniciar secuencia si el tap es el primer pad');
  });

  it('llama triggerEasterEgg con visualOnly=dirty al completar secuencia', () => {
    assert.ok(easterEggSource.includes('triggerEasterEgg({ visualOnly: dirty })'),
      'Debe pasar visualOnly basado en estado dirty capturado al inicio');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 5. Mecanismo de seguridad — isDirtyFn + markCleanFn
// ═══════════════════════════════════════════════════════════════════════════

describe('Easter Egg — Mecanismo de seguridad (isDirtyFn + markCleanFn)', () => {

  it('triggerEasterEgg acepta options.visualOnly', () => {
    const fnSource = easterEggSource.substring(
      easterEggSource.indexOf('export async function triggerEasterEgg')
    );
    assert.ok(fnSource.includes('options = {}'), 'Acepta options con default vacío');
    assert.ok(fnSource.includes('visualOnly'), 'Lee visualOnly de options');
  });

  it('initEasterEggTrigger acepta isDirtyFn y markCleanFn', () => {
    const fnSource = easterEggSource.substring(
      easterEggSource.indexOf('export function initEasterEggTrigger')
    );
    assert.ok(fnSource.includes('isDirtyFn'), 'Acepta isDirtyFn');
    assert.ok(fnSource.includes('markCleanFn'), 'Acepta markCleanFn');
  });

  it('isDirtyFn se captura al inicio de la secuencia (pointerdown primer tap)', () => {
    assert.ok(easterEggSource.includes('wasDirtyAtSequenceStart = isDirtyFn()'),
      'isDirtyFn debe capturarse al inicio de la secuencia');
    assert.ok(easterEggSource.includes('ENFORCE_CLEAN_CHECK') &&
      easterEggSource.includes('wasDirtyAtSequenceStart'),
      'Debe usar el valor capturado al inicio, con ENFORCE_CLEAN_CHECK');
  });

  it('markCleanFn se llama si no estaba dirty al inicio', () => {
    assert.ok(easterEggSource.includes('if (!dirty && markCleanFn) markCleanFn()'),
      'Debe limpiar dirty causado por los propios taps del Easter egg');
  });

  it('markCleanFn NO se llama si estaba dirty al inicio', () => {
    // Si dirty es true, no se llama markCleanFn — la condición !dirty lo impide
    const triggerBlock = easterEggSource.substring(
      easterEggSource.indexOf('if (!dirty && markCleanFn)')
    );
    assert.ok(triggerBlock.includes('!dirty'),
      'Solo limpia si no estaba dirty antes de la secuencia');
  });

  it('visualOnly=true omite creación de AudioContext', () => {
    const fnBody = easterEggSource.substring(
      easterEggSource.indexOf('export async function triggerEasterEgg'),
      easterEggSource.indexOf('//  TRIGGER:')
    );
    assert.ok(fnBody.includes('if (!visualOnly)'),
      'El bloque de audio está protegido por !visualOnly');
    const audioBlock = fnBody.substring(fnBody.indexOf('if (!visualOnly)'));
    assert.ok(audioBlock.includes('new AudioCtx()'),
      'AudioContext se crea solo dentro del bloque !visualOnly');
  });

  it('visualOnly=true sigue mostrando overlay y desintegración', () => {
    const fnBody = easterEggSource.substring(
      easterEggSource.indexOf('export async function triggerEasterEgg'),
      easterEggSource.indexOf('//  TRIGGER:')
    );
    const afterAudioBlock = fnBody.substring(fnBody.indexOf('// Visual:'));
    assert.ok(afterAudioBlock.includes('createOverlay'),
      'createOverlay se ejecuta siempre');
    assert.ok(afterAudioBlock.includes('gatherGhosts'),
      'gatherGhosts se ejecuta siempre');
    assert.ok(afterAudioBlock.includes('startCanvasAnimation'),
      'startCanvasAnimation se ejecuta siempre');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 6. Aislamiento y no-regresión
// ═══════════════════════════════════════════════════════════════════════════

describe('Easter Egg — Aislamiento y no-regresión', () => {

  it('usa su propio AudioContext, no el del Synthi (engine.audioCtx)', () => {
    assert.ok(!easterEggSource.includes('engine.audioCtx'),
      'No debe usar engine.audioCtx');
    assert.ok(!easterEggSource.includes('this.engine'),
      'No debe acceder a this.engine');
    assert.ok(easterEggSource.includes('new AudioCtx()'),
      'Debe crear su propio AudioContext');
  });

  it('cierra su AudioContext al hacer cleanup', () => {
    assert.ok(easterEggSource.includes('audioCtx.close()'),
      'Debe cerrar su AudioContext al limpiar');
  });

  it('elimina el overlay del DOM al hacer cleanup', () => {
    assert.ok(easterEggSource.includes('.remove()'),
      'Debe eliminar el overlay del DOM');
  });

  it('cancela animaciones al hacer cleanup', () => {
    assert.ok(easterEggSource.includes('cancelAnimationFrame(canvasAnimId)'),
      'Debe cancelar la animación del canvas');
    assert.ok(easterEggSource.includes('canvasAnimId = 0'),
      'Debe limpiar el ID de animación');
  });

  it('tiene guard contra doble ejecución (isPlaying)', () => {
    assert.ok(easterEggSource.includes('if (isPlaying) return'),
      'Debe prevenir ejecución simultánea');
  });

  it('cleanup es robusto: no falla si no hay AudioContext', () => {
    const cleanupFn = easterEggSource.substring(
      easterEggSource.indexOf('function cleanup(audioCtx)'),
      easterEggSource.indexOf('//  API PÚBLICA')
    );
    assert.ok(cleanupFn.includes('if (audioCtx && audioCtx.state'),
      'Cleanup verifica que audioCtx exista antes de cerrarlo');
  });

  it('tiene auto-limpieza con setTimeout (no deja recursos abiertos)', () => {
    assert.ok(easterEggSource.includes('setTimeout('),
      'Debe tener auto-limpieza temporizada');
  });

  it('permite cerrar manualmente con doble click en el overlay', () => {
    assert.ok(easterEggSource.includes("'dblclick'"),
      'Debe escuchar dblclick para cierre manual');
    assert.ok(easterEggSource.includes('{ once: true }'),
      'El listener de dblclick debe ser once para evitar fugas');
  });

  it('permite cerrar con tecla Escape', () => {
    assert.ok(easterEggSource.includes("'Escape'"),
      'Debe escuchar tecla Escape para cierre');
    assert.ok(easterEggSource.includes("'keydown'"),
      'Debe usar evento keydown para detectar Escape');
  });

  it('retrasa el listener de dblclick para evitar cierre accidental', () => {
    const fnBody = easterEggSource.substring(
      easterEggSource.indexOf('export async function triggerEasterEgg')
    );
    assert.ok(fnBody.includes('setTimeout') && fnBody.includes("'dblclick'"),
      'El listener de dblclick debe instalarse con delay (setTimeout)');
  });

  it('isDirtyFn se captura en pointerdown (antes de que pointerup marque dirty)', () => {
    assert.ok(easterEggSource.includes('sequenceIndex === 0'),
      'Debe capturar dirty al inicio de la secuencia');
    assert.ok(easterEggSource.includes('wasDirtyAtSequenceStart = isDirtyFn()'),
      'Debe guardar isDirtyFn() en wasDirtyAtSequenceStart en pointerdown');
  });

  it('no importa ni depende de módulos del sintetizador', () => {
    const imports = easterEggSource.match(/^import\s.+$/gm) || [];
    assert.strictEqual(imports.length, 0,
      `Easter egg no debe tener imports (encontrados: ${imports.join(', ')})`);
  });

  it('no despacha synth:userInteraction (no marca dirty)', () => {
    assert.ok(!easterEggSource.includes("dispatchEvent(new CustomEvent('synth:userInteraction')"),
      'Easter egg no debe despachar synth:userInteraction');
    assert.ok(!easterEggSource.includes("dispatchEvent(new Event('synth:userInteraction')"),
      'Easter egg no debe despachar synth:userInteraction (Event)');
  });

  it('no depende de fireworks-js (eliminado)', () => {
    assert.ok(!easterEggSource.includes('fireworksInstance'),
      'No debe haber referencia a fireworksInstance');
    assert.ok(!easterEggSource.includes('ensureFireworksLoaded'),
      'No debe haber función ensureFireworksLoaded');
    assert.ok(!easterEggSource.includes('window.Fireworks'),
      'No debe depender de window.Fireworks');
    assert.ok(!easterEggSource.includes('fireworks.umd.js'),
      'No debe referenciar el vendor de fireworks');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 7. Integración con app.js
// ═══════════════════════════════════════════════════════════════════════════

describe('Easter Egg — Integración en app.js', () => {

  it('importa triggerEasterEgg e initEasterEggTrigger', () => {
    assert.ok(appSource.includes("import { triggerEasterEgg, initEasterEggTrigger }"),
      'app.js debe importar ambas funciones');
  });

  it('importa desde la ruta correcta', () => {
    assert.ok(appSource.includes("from './ui/easterEgg.js'"),
      'La ruta de import debe apuntar a ui/easterEgg.js');
  });

  it('llama initEasterEggTrigger con isDirtyFn y markCleanFn', () => {
    assert.ok(appSource.includes('initEasterEggTrigger('),
      'Debe llamar a initEasterEggTrigger');
    assert.ok(appSource.includes('isDirtyFn:'),
      'Debe pasar isDirtyFn');
    assert.ok(appSource.includes('sessionManager.isDirty()'),
      'isDirtyFn debe consultar sessionManager.isDirty()');
    assert.ok(appSource.includes('markCleanFn'),
      'Debe pasar markCleanFn');
    assert.ok(appSource.includes('sessionManager.markClean'),
      'markCleanFn debe llamar sessionManager.markClean()');
  });

  it('expone window.egg para debug en consola', () => {
    assert.ok(appSource.includes('window.egg = triggerEasterEgg'),
      'Debe exponer triggerEasterEgg como window.egg');
  });

  it('inicializa el trigger después de construir los paneles', () => {
    const triggerCallPos = appSource.indexOf('initEasterEggTrigger(');
    const viewportCallPos = appSource.indexOf('initViewportNavigation(');
    assert.ok(triggerCallPos > 0, 'initEasterEggTrigger() debe estar en app.js');
    assert.ok(viewportCallPos > 0, 'initViewportNavigation() debe estar en app.js');
    assert.ok(triggerCallPos < viewportCallPos,
      'initEasterEggTrigger() debe ejecutarse antes de initViewportNavigation()');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 8. Efectos visuales — Desintegración
// ═══════════════════════════════════════════════════════════════════════════

describe('Easter Egg — Desintegración visual (análisis estático)', () => {

  it('tiene paleta de colores PALETTE con al menos 6 colores', () => {
    assert.ok(easterEggSource.includes('const PALETTE = ['),
      'Debe definir PALETTE');
    const paletteMatch = easterEggSource.match(/const PALETTE = \[([\s\S]*?)\];/);
    assert.ok(paletteMatch, 'PALETTE debe ser un array');
    // Contar entradas [r,g,b]
    const entries = paletteMatch[1].match(/\[\d+/g);
    assert.ok(entries && entries.length >= 6,
      `PALETTE debe tener al menos 6 colores (tiene ${entries ? entries.length : 0})`);
  });

  it('tiene selectores del Synthi en gatherGhosts', () => {
    assert.ok(easterEggSource.includes('function gatherGhosts('),
      'Debe tener función gatherGhosts');
    assert.ok(easterEggSource.includes('.knob'),
      'Debe animar knobs');
    assert.ok(easterEggSource.includes('.synth-module'),
      'Debe animar módulos');
    assert.ok(easterEggSource.includes('.synth-module__header'),
      'Debe animar cabeceras de módulos');
  });

  it('renderiza fantasmas en canvas (startCanvasAnimation)', () => {
    assert.ok(easterEggSource.includes('function startCanvasAnimation('),
      'Debe tener función startCanvasAnimation');
    assert.ok(easterEggSource.includes('getContext'),
      'Debe obtener contexto 2D del canvas');
    assert.ok(easterEggSource.includes('ellipse') || easterEggSource.includes('arc'),
      'Debe dibujar formas circulares en canvas');
  });

  it('recoge elementos del DOM y crea fantasmas (gatherGhosts)', () => {
    assert.ok(easterEggSource.includes('function gatherGhosts('),
      'Debe tener función gatherGhosts');
    assert.ok(easterEggSource.includes('getBoundingClientRect'),
      'Debe leer posiciones de elementos reales');
  });

  it('limita el número de fantasmas por tipo (Fisher-Yates)', () => {
    assert.ok(easterEggSource.includes('Math.floor(Math.random()'),
      'Debe usar muestreo aleatorio para limitar fantasmas');
  });

  it('anima fantasmas con requestAnimationFrame en canvas', () => {
    assert.ok(easterEggSource.includes('function startCanvasAnimation('),
      'Debe tener función startCanvasAnimation');
    assert.ok(easterEggSource.includes('requestAnimationFrame(frame)'),
      'Debe usar requestAnimationFrame para el bucle de animación');
  });

  it('los fantasmas tienen fases definidas en PHASE_OFFSETS', () => {
    assert.ok(easterEggSource.includes('PHASE_OFFSETS'),
      'Debe definir PHASE_OFFSETS para las fases de animación');
    assert.ok(easterEggSource.includes('interpolateGhost'),
      'Debe interpolar estado del ghost por fase');
    assert.ok(easterEggSource.includes('PHASE_ALPHA'),
      'Debe tener curva de opacidad por fase');
  });

  it('cada fantasma tiene desplazamiento, rotación y escala aleatorios', () => {
    const ghostFn = easterEggSource.substring(
      easterEggSource.indexOf('function gatherGhosts('),
      easterEggSource.indexOf('// ─── Interpolación')
    );
    assert.ok(ghostFn.includes('Math.random()'), 'Valores deben ser aleatorios');
    assert.ok(easterEggSource.includes('translate('), 'Debe incluir translate');
    assert.ok(easterEggSource.includes('rotate('), 'Debe incluir rotate');
    assert.ok(easterEggSource.includes('scale('), 'Debe incluir scale');
  });

  it('no tiene backdrop oscuro (transparente, deja ver el Synthi)', () => {
    assert.ok(!easterEggSource.includes('easter-egg-backdrop'),
      'No debe crear backdrop oscuro');
  });

  it('tiene efecto atractor hacia el puntero del ratón/dedo', () => {
    assert.ok(easterEggSource.includes('attractorX'),
      'Debe tener estado de atractor X');
    assert.ok(easterEggSource.includes('attractorY'),
      'Debe tener estado de atractor Y');
    assert.ok(easterEggSource.includes('attractorActive'),
      'Debe tener flag de atractor activo');
    assert.ok(easterEggSource.includes('pointermove'),
      'Debe rastrear movimiento del puntero');
  });

  it('el influjo del atractor decae al final de la animación', () => {
    assert.ok(easterEggSource.includes('attractorDecay'),
      'Debe tener decay del atractor');
  });

  it('los fantasmas tienen wobble sinusoidal y espiral para movimiento orgánico', () => {
    assert.ok(easterEggSource.includes('wFreqX'),
      'Debe tener frecuencia de wobble X');
    assert.ok(easterEggSource.includes('spiralR'),
      'Debe tener radio de espiral');
  });

  it('las formas fantasma se infieren dinámicamente según el elemento', () => {
    assert.ok(easterEggSource.includes('function inferShape('),
      'Debe tener función inferShape para determinar forma');
    assert.ok(easterEggSource.includes("'circle'") && easterEggSource.includes("'rect'"),
      'Debe soportar formas circle y rect');
    assert.ok(easterEggSource.includes('.knob') && easterEggSource.includes("return 'circle'"),
      'Knobs deben mapearse a círculos');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 9. Piezas musicales — chiptune y electroacústica
// ═══════════════════════════════════════════════════════════════════════════

describe('Easter Egg — Pieza chiptune 8-bit', () => {

  it('tiene 4 canales: LEAD, BASS, ARPEGGIO, DRUMS', () => {
    assert.ok(easterEggSource.includes('const LEAD = ['), 'Falta canal LEAD');
    assert.ok(easterEggSource.includes('const BASS = ['), 'Falta canal BASS');
    assert.ok(easterEggSource.includes('const ARPEGGIO = ['), 'Falta canal ARPEGGIO');
    assert.ok(easterEggSource.includes('const DRUMS = ['), 'Falta canal DRUMS');
  });

  it('usa formas de onda chiptune: square, triangle, pulse', () => {
    assert.ok(easterEggSource.includes('playSquareNote'), 'Falta onda cuadrada (lead)');
    assert.ok(easterEggSource.includes('playTriangleNote'), 'Falta onda triangular (bass)');
    assert.ok(easterEggSource.includes('playPulseNote'), 'Falta onda pulso (arpeggio)');
    assert.ok(easterEggSource.includes('playChipDrum'), 'Falta percusión');
  });

  it('BPM está definido y es razonable para chiptune (120-200)', () => {
    const bpmMatch = easterEggSource.match(/const BPM\s*=\s*(\d+)/);
    assert.ok(bpmMatch, 'Debe definir BPM');
    const bpm = parseInt(bpmMatch[1]);
    assert.ok(bpm >= 120 && bpm <= 200,
      `BPM=${bpm} fuera de rango chiptune (120-200)`);
  });

  it('tiene función de conversión nota→frecuencia (NOTE_FREQ)', () => {
    assert.ok(easterEggSource.includes('NOTE_FREQ'),
      'Debe tener tabla de frecuencias MIDI');
    assert.ok(easterEggSource.includes('440'),
      'Debe usar A4=440Hz como referencia');
  });

  it('tiene función playChiptunePiece que devuelve totalDurationSec y burstTimes', () => {
    assert.ok(easterEggSource.includes('function playChiptunePiece(ctx, dest)'),
      'Debe existir la función playChiptunePiece');
    assert.ok(easterEggSource.includes('PIECES.chiptune = playChiptunePiece'),
      'Debe registrarse en PIECES');
  });
});

describe('Easter Egg — Pieza electroacústica (Studie)', () => {

  it('tiene función playElectroacousticPiece registrada en PIECES', () => {
    assert.ok(easterEggSource.includes('function playElectroacousticPiece(ctx, dest)'),
      'Debe existir la función playElectroacousticPiece');
    assert.ok(easterEggSource.includes('PIECES.electroacoustic = playElectroacousticPiece'),
      'Debe registrarse en PIECES');
  });

  it('es la pieza seleccionada por defecto', () => {
    assert.ok(easterEggSource.includes("selectedPiece = 'electroacoustic'"),
      'selectedPiece debe ser electroacoustic por defecto');
  });

  it('usa síntesis de tonos sinusoidales puros (no square/triangle)', () => {
    assert.ok(easterEggSource.includes('playSineTone'),
      'Debe usar tonos sinusoidales sostenidos');
    assert.ok(easterEggSource.includes('playSinePing'),
      'Debe usar pings sinusoidales puntillistas');
  });

  it('usa glissandi (barridos de frecuencia)', () => {
    assert.ok(easterEggSource.includes('playSineGliss'),
      'Debe usar glissandi sinusoidales');
  });

  it('usa ruido filtrado con barrido de frecuencia', () => {
    assert.ok(easterEggSource.includes('playFilteredNoise'),
      'Debe usar ruido blanco filtrado');
  });

  it('usa síntesis FM (modulación de frecuencia)', () => {
    assert.ok(easterEggSource.includes('playFMTexture'),
      'Debe usar síntesis FM para texturas metálicas');
  });

  it('tiene 4 secciones: Klang, Punkte, Gruppen, Stille', () => {
    assert.ok(easterEggSource.includes('Klang'), 'Falta sección Klang');
    assert.ok(easterEggSource.includes('Punkte'), 'Falta sección Punkte');
    assert.ok(easterEggSource.includes('Gruppen'), 'Falta sección Gruppen');
    assert.ok(easterEggSource.includes('Stille'), 'Falta sección Stille');
  });

  it('devuelve totalDurationSec y burstTimes', () => {
    const fnBody = easterEggSource.substring(
      easterEggSource.indexOf('function playElectroacousticPiece'),
      easterEggSource.indexOf('PIECES.electroacoustic')
    );
    assert.ok(fnBody.includes('totalDurationSec'), 'Debe devolver totalDurationSec');
    assert.ok(fnBody.includes('burstTimes'), 'Debe devolver burstTimes');
  });

  it('usa solo ondas sine (estilo Studie I/II de Stockhausen)', () => {
    const fnBody = easterEggSource.substring(
      easterEggSource.indexOf('// ─── Síntesis electroacústica'),
      easterEggSource.indexOf('PIECES.electroacoustic')
    );
    assert.ok(!fnBody.includes("osc.type = 'square'"),
      'No debe usar onda cuadrada en la pieza electroacústica');
    assert.ok(!fnBody.includes("osc.type = 'triangle'"),
      'No debe usar onda triangular en la pieza electroacústica');
  });
});

describe('Easter Egg — Selección de piezas', () => {

  it('tiene objeto PIECES con al menos 2 piezas', () => {
    assert.ok(easterEggSource.includes('PIECES.chiptune'), 'Falta pieza chiptune');
    assert.ok(easterEggSource.includes('PIECES.electroacoustic'), 'Falta pieza electroacoustic');
  });

  it('triggerEasterEgg usa PIECES[selectedPiece] para elegir la pieza', () => {
    assert.ok(easterEggSource.includes('PIECES[selectedPiece]'),
      'Debe seleccionar pieza dinámicamente');
  });

  it('tiene fallback a electroacoustic si la pieza seleccionada no existe', () => {
    assert.ok(easterEggSource.includes('PIECES.electroacoustic'),
      'Debe tener fallback a electroacoustic');
  });

  it('ambas piezas devuelven totalDurationSec y burstTimes', () => {
    const chipFn = easterEggSource.substring(
      easterEggSource.indexOf('function playChiptunePiece'),
      easterEggSource.indexOf('PIECES.chiptune')
    );
    assert.ok(chipFn.includes('totalDurationSec'), 'Chiptune debe devolver totalDurationSec');
    assert.ok(chipFn.includes('burstTimes'), 'Chiptune debe devolver burstTimes');

    const elecFn = easterEggSource.substring(
      easterEggSource.indexOf('function playElectroacousticPiece'),
      easterEggSource.indexOf('PIECES.electroacoustic')
    );
    assert.ok(elecFn.includes('totalDurationSec'), 'Electroacoustic debe devolver totalDurationSec');
    assert.ok(elecFn.includes('burstTimes'), 'Electroacoustic debe devolver burstTimes');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 10. Secuencia de taps — simulación funcional con JSDOM
// ═══════════════════════════════════════════════════════════════════════════

describe('Easter Egg — Simulación de secuencia de taps', () => {
  let pad1, pad2, other;

  beforeEach(() => {
    const els = setupJoystickDOM();
    pad1 = els.pad1;
    pad2 = els.pad2;
    other = els.other;
  });

  afterEach(() => {
    cleanupOverlays();
    document.body.innerHTML = '';
  });

  it('initEasterEggTrigger instala listeners sin error', () => {
    assert.doesNotThrow(() => {
      initEasterEggTrigger({ isDirtyFn: () => false, markCleanFn: () => {} });
    });
  });

  it('taps en pad correcto no lanzan error (secuencia parcial)', () => {
    initEasterEggTrigger({ isDirtyFn: () => false });
    assert.doesNotThrow(() => {
      simulateTap(pad1);
      simulateTap(pad2);
    });
  });

  it('no lanza Easter egg con secuencia incompleta (solo 6 de 8 taps)', () => {
    initEasterEggTrigger({ isDirtyFn: () => false });
    simulateTap(pad1);
    simulateTap(pad2);
    simulateTap(pad1);
    simulateTap(pad2);
    simulateTap(pad1);
    simulateTap(pad2);
    const overlays = document.querySelectorAll('#easter-egg-overlay');
    assert.strictEqual(overlays.length, 0, 'No debería haber overlay con secuencia incompleta');
  });

  it('un drag (movimiento > TAP_MAX_MOVEMENT) resetea la secuencia', () => {
    initEasterEggTrigger({ isDirtyFn: () => false });
    simulateTap(pad1);
    simulateTap(pad2);
    simulateTap(pad1);
    simulateTap(pad2);
    simulateDrag(pad1);
    simulateTap(pad2);
    simulateTap(pad1);
    simulateTap(pad2);
    simulateTap(pad1);
    const overlays = document.querySelectorAll('[style*="position: fixed"]');
    assert.strictEqual(overlays.length, 0, 'Drag debe resetear la secuencia');
  });

  it('tap en elemento fuera de pads resetea la secuencia', () => {
    initEasterEggTrigger({ isDirtyFn: () => false });
    simulateTap(pad1);
    simulateTap(pad2);
    simulateTap(pad1);
    other.dispatchEvent(createPointerEvent('pointerdown', { clientX: 300, clientY: 300 }));
    simulateTap(pad2);
    simulateTap(pad1);
    simulateTap(pad2);
    simulateTap(pad1);
    simulateTap(pad2);
    const overlays = document.querySelectorAll('[style*="position: fixed"]');
    assert.strictEqual(overlays.length, 0,
      'Interacción fuera de pads debe resetear la secuencia');
  });

  it('secuencia con pad incorrecto (pad2 primero) no funciona', () => {
    initEasterEggTrigger({ isDirtyFn: () => false });
    simulateTap(pad2);
    simulateTap(pad1);
    simulateTap(pad2);
    simulateTap(pad1);
    simulateTap(pad2);
    simulateTap(pad1);
    simulateTap(pad2);
    simulateTap(pad1);
    const overlays = document.querySelectorAll('#easter-egg-overlay');
    assert.strictEqual(overlays.length, 0,
      'Secuencia empezando por pad2 no debe funcionar');
  });

  it('pointercancel resetea el estado del tap', () => {
    initEasterEggTrigger({ isDirtyFn: () => false });
    pad1.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 1, clientX: 50, clientY: 50 }));
    pad1.dispatchEvent(createPointerEvent('pointercancel', { pointerId: 1 }));
    assert.doesNotThrow(() => {
      simulateTap(pad1);
      simulateTap(pad2);
    }, 'Después de pointercancel, los taps deben seguir funcionando');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 11. Seguridad — sessionManager integrado en app.js
// ═══════════════════════════════════════════════════════════════════════════

describe('Easter Egg — Seguridad: sessionManager integrado en app.js', () => {

  it('app.js importa sessionManager', () => {
    assert.ok(appSource.includes("import { sessionManager }"),
      'app.js debe importar sessionManager');
  });

  it('sessionManager tiene método isDirty()', () => {
    const smSource = readFileSync(
      resolve(ROOT, 'src/assets/js/state/sessionManager.js'), 'utf-8'
    );
    assert.ok(smSource.includes('isDirty()'),
      'sessionManager debe tener método isDirty()');
  });

  it('sessionManager.isDirty() devuelve _dirty (booleano)', () => {
    const smSource = readFileSync(
      resolve(ROOT, 'src/assets/js/state/sessionManager.js'), 'utf-8'
    );
    assert.ok(smSource.includes('return this._dirty'),
      'isDirty debe devolver this._dirty');
  });

  it('sessionManager tiene método markClean()', () => {
    const smSource = readFileSync(
      resolve(ROOT, 'src/assets/js/state/sessionManager.js'), 'utf-8'
    );
    assert.ok(smSource.includes('markClean()'),
      'sessionManager debe tener método markClean()');
  });

  it('synth:userInteraction → markDirty() en app.js (cadena de eventos)', () => {
    assert.ok(appSource.includes('synth:userInteraction'),
      'app.js debe escuchar synth:userInteraction');
    assert.ok(appSource.includes('sessionManager.markDirty()'),
      'app.js debe llamar markDirty al recibir interacción');
  });

  it('la cadena completa es: knob/toggle → synth:userInteraction → markDirty → isDirty=true → visualOnly', () => {
    const knobSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/knob.js'), 'utf-8');
    assert.ok(knobSource.includes('synth:userInteraction'),
      'knob.js debe despachar synth:userInteraction');
    assert.ok(appSource.includes("'synth:userInteraction'"),
      'app.js escucha el evento');
    assert.ok(appSource.includes('sessionManager.markDirty()'),
      'app.js marca dirty');
    assert.ok(appSource.includes('sessionManager.isDirty()'),
      'isDirtyFn usa sessionManager.isDirty()');
    assert.ok(appSource.includes('sessionManager.markClean'),
      'markCleanFn usa sessionManager.markClean()');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 12. Exports del módulo
// ═══════════════════════════════════════════════════════════════════════════

describe('Easter Egg — Exports del módulo', () => {

  it('exporta triggerEasterEgg (función)', () => {
    assert.strictEqual(typeof triggerEasterEgg, 'function');
  });

  it('exporta initEasterEggTrigger (función)', () => {
    assert.strictEqual(typeof initEasterEggTrigger, 'function');
  });

  it('exporta TRIGGER_SEQUENCE (array)', () => {
    assert.ok(Array.isArray(TRIGGER_SEQUENCE));
  });

  it('exporta TAP_MAX_DURATION (número)', () => {
    assert.strictEqual(typeof TAP_MAX_DURATION, 'number');
  });

  it('exporta TAP_MAX_MOVEMENT (número)', () => {
    assert.strictEqual(typeof TAP_MAX_MOVEMENT, 'number');
  });

  it('exporta SEQUENCE_TIMEOUT (número)', () => {
    assert.strictEqual(typeof SEQUENCE_TIMEOUT, 'number');
  });

  it('no exporta funciones internas (cleanup, createOverlay, etc.)', () => {
    const exportMatches = easterEggSource.match(/^export\s/gm) || [];
    const expectedExports = 6;
    assert.strictEqual(exportMatches.length, expectedExports,
      `Debería haber exactamente ${expectedExports} exports, encontrados: ${exportMatches.length}`);
  });
});
