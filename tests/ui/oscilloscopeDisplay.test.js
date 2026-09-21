/**
 * Tests de la clase real `OscilloscopeDisplay` (src/assets/js/ui/oscilloscopeDisplay.js).
 *
 * Hasta septiembre de 2026 este fichero probaba una copia simplificada
 * (`MockOscilloscopeDisplay`) que además describía otro diseño: beams a 1/3 y
 * 2/3 del alto, y Beam 2 oculto sin señal. La clase real los pone a 1/4 y 3/4
 * con media altura de oscilación cada uno, y dibuja Beam 2 siempre que haya
 * buffer (línea plana si es silencio), como el Synthi 100.
 *
 * El canvas se sustituye por un contexto 2D falso que registra las llamadas
 * (`moveTo`/`lineTo`/`stroke`…): lo que se comprueba son las coordenadas y
 * los colores que la clase manda pintar, no píxeles.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// Canvas 2D falso que graba las llamadas
// ═══════════════════════════════════════════════════════════════════════════

class FakeContext2D {
  constructor() {
    this.ops = [];                // [{ op, args, strokeStyle, fillStyle, lineWidth }]
    this.strokeStyle = '#000';
    this.fillStyle = '#000';
    this.lineWidth = 1;
    this.shadowBlur = 0;
    this.shadowColor = '';
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.font = '';
    this.textAlign = 'start';
  }
  _rec(op, ...args) {
    this.ops.push({ op, args, strokeStyle: this.strokeStyle, fillStyle: this.fillStyle, lineWidth: this.lineWidth, shadowBlur: this.shadowBlur });
  }
  fillRect(...a) { this._rec('fillRect', ...a); }
  clearRect(...a) { this._rec('clearRect', ...a); }
  beginPath() { this._rec('beginPath'); }
  moveTo(...a) { this._rec('moveTo', ...a); }
  lineTo(...a) { this._rec('lineTo', ...a); }
  arc(...a) { this._rec('arc', ...a); }
  stroke() { this._rec('stroke'); }
  fill() { this._rec('fill'); }
  fillText(...a) { this._rec('fillText', ...a); }

  count(op) { return this.ops.filter(o => o.op === op).length; }
  /** Trazos (grupos beginPath…stroke) con el color y los puntos de cada uno. */
  strokes() {
    const result = [];
    let current = null;
    for (const o of this.ops) {
      if (o.op === 'beginPath') current = { points: [], strokeStyle: null, lineWidth: null };
      else if (current && (o.op === 'moveTo' || o.op === 'lineTo')) current.points.push(o.args);
      else if (current && o.op === 'stroke') {
        current.strokeStyle = o.strokeStyle;
        current.lineWidth = o.lineWidth;
        result.push(current);
        current = null;
      }
    }
    return result;
  }
  reset() { this.ops = []; }
}

function fakeCanvas(width, height) {
  const ctx = new FakeContext2D();
  return { width, height, style: {}, getContext: () => ctx, _ctx: ctx };
}

// ═══════════════════════════════════════════════════════════════════════════
// Entorno DOM mínimo
// ═══════════════════════════════════════════════════════════════════════════

const saved = {};
let rafCallbacks;
let createdCanvases;

function installDom() {
  for (const k of ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame']) saved[k] = globalThis[k];
  rafCallbacks = [];
  createdCanvases = [];
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const c = fakeCanvas(0, 0);
      createdCanvases.push(c);
      return c;
    },
  };
  globalThis.requestAnimationFrame = cb => { rafCallbacks.push(cb); return rafCallbacks.length; };
  globalThis.cancelAnimationFrame = id => { rafCallbacks[id - 1] = null; };
}

function restoreDom() {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
  }
}

/** Ejecuta los callbacks rAF pendientes (un "frame" del navegador). */
function runFrame() {
  const cbs = rafCallbacks.slice();
  rafCallbacks.length = 0;
  for (const cb of cbs) if (cb) cb();
}

let OscilloscopeDisplay;

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const W = 600, H = 400;

function createDisplay(options = {}) {
  const canvas = fakeCanvas(W, H);
  const display = new OscilloscopeDisplay({ canvas, ...options });
  return { display, ctx: canvas._ctx, canvas };
}

const sine = (n, amp = 1, cycles = 4) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(2 * Math.PI * cycles * i / n));
const silence = n => new Float32Array(n);
const dc = (n, v) => new Float32Array(n).fill(v);

/** Trazos de señal: los que llevan el lineWidth de señal (la rejilla usa 1). */
const signalStrokes = (ctx, lineWidth = 2) => ctx.strokes().filter(s => s.lineWidth === lineWidth);

// ═══════════════════════════════════════════════════════════════════════════

describe('OscilloscopeDisplay (clase real)', () => {
  beforeEach(async () => {
    installDom();
    ({ OscilloscopeDisplay } = await import('../../src/assets/js/ui/oscilloscopeDisplay.js'));
  });
  afterEach(restoreDom);

  describe('Construcción', () => {
    it('sin canvas crea uno de 600×450 (resolución interna) y lo mete en el contenedor', () => {
      const appended = [];
      const container = { appendChild: c => appended.push(c) };
      const display = new OscilloscopeDisplay({ container });
      assert.equal(createdCanvases.length, 1);
      assert.equal(display.canvas, createdCanvases[0]);
      assert.equal(display.width, 600);
      assert.equal(display.height, 450);
      assert.deepEqual(appended, [display.canvas]);
      assert.match(display.canvas.style.cssText, /width: 100%/);
      assert.match(display.canvas.style.cssText, /background: #000/);
    });

    it('con devicePixelRatio 2 dobla la resolución interna; useDevicePixelRatio=false la ignora', () => {
      globalThis.window.devicePixelRatio = 2;
      const a = new OscilloscopeDisplay({});
      assert.equal(a.width, 1200);
      assert.equal(a.height, 900);
      assert.equal(a.dpr, 2);
      const b = new OscilloscopeDisplay({ useDevicePixelRatio: false, internalWidth: 300, internalHeight: 200 });
      assert.equal(b.width, 300);
      assert.equal(b.height, 200);
      assert.equal(b.dpr, 1);
    });

    it('fondo transparente: no pone background en el CSS', () => {
      const display = new OscilloscopeDisplay({ bgColor: 'transparent' });
      assert.doesNotMatch(display.canvas.style.cssText, /background/);
    });

    it('con canvas propio usa sus dimensiones y no crea otro', () => {
      const { display } = createDisplay();
      assert.equal(createdCanvases.length, 0);
      assert.equal(display.width, W);
      assert.equal(display.height, H);
    });

    it('valores por defecto: modo yt, verdes, escalas 1, glow = color de línea', () => {
      const { display } = createDisplay();
      assert.equal(display.getMode(), 'yt');
      assert.equal(display.lineColor, '#0f0');
      assert.equal(display.lineColor2, '#0f0');
      assert.equal(display.glowColor, '#0f0');
      assert.equal(display.timeScale, 1);
      assert.equal(display.ampScale, 1);
      assert.equal(display.lineWidth, 2);
      assert.equal(display.glowBlur, 0);
      assert.equal(display.showGrid, true);
      assert.equal(display.showTriggerIndicator, true);
    });

    it('colores y glow distintos por beam', () => {
      const { display } = createDisplay({ lineColor: '#0f0', lineColor2: '#0ff', glowColor2: '#8ff' });
      assert.equal(display.lineColor2, '#0ff');
      assert.equal(display.glowColor, '#0f0');
      assert.equal(display.glowColor2, '#8ff');
    });
  });

  describe('Modo y escalas', () => {
    it('setMode acepta solo yt/xy; toggleMode alterna y devuelve el nuevo', () => {
      const { display } = createDisplay();
      display.setMode('xy');
      assert.equal(display.getMode(), 'xy');
      display.setMode('polar');
      assert.equal(display.getMode(), 'xy');
      assert.equal(display.toggleMode(), 'yt');
      assert.equal(display.toggleMode(), 'xy');
    });

    it('setTimeScale clampea a 0,1..1 y setAmpScale a 0,25..4', () => {
      const { display } = createDisplay();
      display.setTimeScale(0.01); assert.equal(display.timeScale, 0.1);
      display.setTimeScale(5);    assert.equal(display.timeScale, 1);
      display.setTimeScale(0.5);  assert.equal(display.timeScale, 0.5);
      display.setAmpScale(0);     assert.equal(display.ampScale, 0.25);
      display.setAmpScale(10);    assert.equal(display.ampScale, 4);
      display.setAmpScale(2);     assert.equal(display.ampScale, 2);
    });

    it('cambiar modo o escala redibuja con los últimos datos', () => {
      const { display, ctx } = createDisplay();
      display.draw({ bufferY: sine(512), bufferX: silence(512), triggered: true });
      ctx.reset();
      display.setMode('xy');
      assert.ok(ctx.count('fillRect') === 1, 'setMode redibuja');
      ctx.reset();
      display.setAmpScale(2);
      assert.ok(ctx.count('fillRect') === 1, 'setAmpScale redibuja');
      ctx.reset();
      display.setTimeScale(0.5);
      assert.ok(ctx.count('fillRect') === 1, 'setTimeScale redibuja');
    });

    it('sin datos previos, cambiar modo o escala no dibuja nada', () => {
      const { display, ctx } = createDisplay();
      display.setMode('xy');
      display.setAmpScale(2);
      assert.equal(ctx.ops.length, 0);
    });
  });

  describe('Modo Y-T (dual beam)', () => {
    it('limpia el fondo, dibuja la rejilla 4×4 con centrales y dos trazos de señal', () => {
      const { display, ctx } = createDisplay({ gridColor: '#1a1a1a', centerColor: '#333' });
      display.draw({ bufferY: sine(512), bufferX: sine(512, 0.5), triggered: true });
      const fills = ctx.ops.filter(o => o.op === 'fillRect');
      assert.deepEqual(fills[0].args, [0, 0, W, H]);
      assert.equal(fills[0].fillStyle, '#000');
      const grid = ctx.strokes().filter(s => s.lineWidth === 1);
      assert.equal(grid.length, 12, '5 horizontales + 5 verticales + 2 centrales');
      assert.equal(grid.filter(s => s.strokeStyle === '#333').length, 2);
      assert.equal(signalStrokes(ctx).length, 2);
    });

    it('Beam 1 oscila alrededor de 1/4 del alto y Beam 2 alrededor de 3/4, cada uno con media altura', () => {
      const { display, ctx } = createDisplay();
      display.draw({ bufferY: sine(600), bufferX: sine(600), triggered: true });
      const [beam1, beam2] = signalStrokes(ctx);
      const ys1 = beam1.points.map(p => p[1]);
      const ys2 = beam2.points.map(p => p[1]);
      // Amplitud 1 → ±H/4 alrededor del centro
      assert.ok(Math.abs(Math.min(...ys1) - 0) < 2, `beam1 min ${Math.min(...ys1)}`);
      assert.ok(Math.abs(Math.max(...ys1) - H / 2) < 2, `beam1 max ${Math.max(...ys1)}`);
      assert.ok(Math.abs(Math.min(...ys2) - H / 2) < 2, `beam2 min ${Math.min(...ys2)}`);
      assert.ok(Math.abs(Math.max(...ys2) - H) < 2, `beam2 max ${Math.max(...ys2)}`);
    });

    it('silencio en un beam es una línea plana en su centro (H/4 o 3H/4), no se oculta', () => {
      const { display, ctx } = createDisplay();
      display.draw({ bufferY: silence(512), bufferX: silence(512), triggered: false });
      const [beam1, beam2] = signalStrokes(ctx);
      assert.ok(beam1.points.every(p => p[1] === H / 4));
      assert.ok(beam2.points.every(p => p[1] === 3 * H / 4));
      assert.equal(beam1.points.length, W, 'un punto por píxel');
    });

    it('el positivo va hacia arriba: DC +0,5 sube el trazo, −0,5 lo baja', () => {
      const { display, ctx } = createDisplay();
      display.draw({ bufferY: dc(512, 0.5), bufferX: dc(512, -0.5), triggered: true });
      const [beam1, beam2] = signalStrokes(ctx);
      assert.ok(beam1.points.every(p => p[1] === H / 4 - 0.5 * H / 4));
      assert.ok(beam2.points.every(p => p[1] === 3 * H / 4 + 0.5 * H / 4));
    });

    it('cada beam lleva su color y su glow', () => {
      const { display, ctx } = createDisplay({ lineColor: '#0f0', lineColor2: '#0ff', glowBlur: 4, glowColor2: '#8ff' });
      display.draw({ bufferY: sine(512), bufferX: sine(512), triggered: true });
      const [beam1, beam2] = signalStrokes(ctx);
      assert.equal(beam1.strokeStyle, '#0f0');
      assert.equal(beam2.strokeStyle, '#0ff');
      // El glow se activa para la señal y se apaga después
      const moveOps = ctx.ops.filter(o => o.op === 'moveTo' && o.lineWidth === 2);
      assert.ok(moveOps.every(o => o.shadowBlur === 4));
      assert.equal(ctx.shadowBlur, 0);
      assert.equal(ctx.shadowColor, 'transparent');
    });

    it('beam1OffsetY/beam2OffsetY desplazan cada beam (escalados por dpr)', () => {
      globalThis.window.devicePixelRatio = 2;
      const { display, ctx } = createDisplay({ beam1OffsetY: 10, beam2OffsetY: -5 });
      display.draw({ bufferY: silence(512), bufferX: silence(512), triggered: false });
      const [beam1, beam2] = signalStrokes(ctx);
      assert.equal(beam1.points[0][1], H / 4 + 20);
      assert.equal(beam2.points[0][1], 3 * H / 4 - 10);
    });

    it('ampScale 2 dobla la excursión; con 0,25 la reduce', () => {
      const { display, ctx } = createDisplay();
      display.setAmpScale(2);
      display.draw({ bufferY: dc(512, 0.25), bufferX: silence(512), triggered: true });
      assert.equal(signalStrokes(ctx)[0].points[0][1], H / 4 - 0.5 * H / 4);
      ctx.reset();
      display.setAmpScale(0.25);
      assert.equal(signalStrokes(ctx)[0].points[0][1], H / 4 - 0.0625 * H / 4);
    });

    it('timeScale 0,5 muestra la primera mitad del buffer estirada a todo el ancho', () => {
      // Rampa 0→1: con timeScale 0,5 el último píxel debe quedar en ~0,5
      const ramp = Float32Array.from({ length: 1200 }, (_, i) => i / 1199);
      const { display, ctx } = createDisplay();
      display.draw({ bufferY: ramp, bufferX: silence(1200), triggered: true });
      const fullLast = signalStrokes(ctx)[0].points.at(-1)[1];
      ctx.reset();
      display.setTimeScale(0.5);
      const halfLast = signalStrokes(ctx)[0].points.at(-1)[1];
      assert.ok(Math.abs(fullLast - (H / 4 - 1 * H / 4)) < 1, `todo el buffer: y=${fullLast}`);
      assert.ok(Math.abs(halfLast - (H / 4 - 0.5 * H / 4)) < 1, `mitad: y=${halfLast}`);
    });

    it('validLength recorta a ciclos completos: solo se dibujan esos samples', () => {
      const buf = new Float32Array(1000);
      buf.fill(1, 0, 500);          // primera mitad +1
      buf.fill(-1, 500);            // segunda mitad −1
      const { display, ctx } = createDisplay();
      display.draw({ bufferY: buf, bufferX: silence(1000), triggered: true, validLength: 500 });
      const ys = signalStrokes(ctx)[0].points.map(p => p[1]);
      assert.ok(ys.every(y => y === 0), 'todo a +1 → arriba del todo');
    });

    it('min/max por píxel: un buffer más largo que el ancho pinta la excursión vertical', () => {
      // 6000 samples alternando ±1 → cada píxel cubre 10 samples con min −1 y max +1
      const buf = Float32Array.from({ length: 6000 }, (_, i) => (i % 2 ? 1 : -1));
      const { display, ctx } = createDisplay();
      display.draw({ bufferY: buf, bufferX: silence(6000), triggered: true });
      const pts = signalStrokes(ctx)[0].points;
      assert.equal(pts.length, 2 * W, 'dos puntos por píxel (yMin y yMax)');
      assert.equal(pts[0][1], 0);
      assert.equal(pts[1][1], H / 2);
    });

    it('sin bufferX no hay Beam 2; QUIRK: sin bufferY no se dibuja nada, porque la longitud la fija bufferY', () => {
      const { display, ctx } = createDisplay();
      display.draw({ bufferY: sine(512), triggered: true });
      assert.equal(signalStrokes(ctx).length, 1);
      ctx.reset();
      display.draw({ bufferX: sine(512), triggered: true });
      assert.equal(signalStrokes(ctx).length, 0, 'baseLength = bufferY.length = 0 → Beam 2 tampoco');
      ctx.reset();
      display.draw({ bufferX: sine(512), triggered: true, validLength: 512 });
      assert.equal(signalStrokes(ctx).length, 1, 'con validLength sí sale Beam 2');
    });
  });

  describe('Indicador de trigger', () => {
    const indicator = ctx => {
      const arcs = ctx.ops.filter(o => o.op === 'arc');
      const fills = ctx.ops.filter(o => o.op === 'fill');
      const texts = ctx.ops.filter(o => o.op === 'fillText');
      return { arcs, fills, texts, last: texts.at(-1) };
    };

    it('TRIG verde con trigger, rojo oscuro sin él, AUTO naranja', () => {
      const { display, ctx } = createDisplay();
      display.draw({ bufferY: sine(512), bufferX: silence(512), triggered: true });
      assert.equal(indicator(ctx).last.args[0], 'TRIG');
      assert.equal(indicator(ctx).last.fillStyle, '#0f0');
      ctx.reset();
      display.draw({ bufferY: sine(512), bufferX: silence(512), triggered: false });
      assert.equal(indicator(ctx).last.fillStyle, '#600');
      ctx.reset();
      display.draw({ bufferY: sine(512), bufferX: silence(512), triggered: false, isAuto: true });
      assert.equal(indicator(ctx).last.args[0], 'AUTO');
      assert.equal(indicator(ctx).last.fillStyle, '#f90');
    });

    it('el LED va en la esquina superior derecha', () => {
      const { display, ctx } = createDisplay();
      display.draw({ bufferY: sine(512), bufferX: silence(512), triggered: true });
      const [x, y, r] = indicator(ctx).arcs[0].args;
      assert.equal(r, 5);
      assert.equal(x, W - 10);
      assert.equal(y, 10);
    });

    it('showTriggerIndicator=false no dibuja LED ni texto', () => {
      const { display, ctx } = createDisplay({ showTriggerIndicator: false });
      display.draw({ bufferY: sine(512), bufferX: silence(512), triggered: true });
      assert.equal(ctx.count('arc'), 0);
      assert.equal(ctx.count('fillText'), 0);
    });

    it('QUIRK: en Y-T el indicador se pinta dos veces (dentro de _drawYT y en _drawInternal); manda el último, que sí conoce isAuto', () => {
      const { display, ctx } = createDisplay();
      display.draw({ bufferY: sine(512), bufferX: silence(512), triggered: false, isAuto: true });
      const { texts } = indicator(ctx);
      assert.equal(texts.length, 2);
      assert.equal(texts[0].args[0], 'TRIG');
      assert.equal(texts[1].args[0], 'AUTO');
    });
  });

  describe('Modo X-Y (Lissajous)', () => {
    it('un solo trazo con lineColor, ~un punto por píxel de ancho', () => {
      const { display, ctx } = createDisplay({ lineColor: '#0f0', lineColor2: '#0ff', mode: 'xy' });
      display.draw({ bufferX: sine(2048), bufferY: sine(2048), triggered: true });
      const strokes = signalStrokes(ctx);
      assert.equal(strokes.length, 1);
      assert.equal(strokes[0].strokeStyle, '#0f0');
      assert.equal(strokes[0].points.length, W);
    });

    it('mapea X −1..1 → 0..ancho y Y −1..1 → alto..0 (Y invertida)', () => {
      const { display, ctx } = createDisplay({ mode: 'xy' });
      display.draw({ bufferX: dc(600, 1), bufferY: dc(600, 1), triggered: true });
      const p = signalStrokes(ctx)[0].points[0];
      assert.deepEqual(p, [W, 0]);
      ctx.reset();
      display.draw({ bufferX: dc(600, -1), bufferY: dc(600, -1), triggered: true });
      assert.deepEqual(signalStrokes(ctx)[0].points[0], [0, H]);
      ctx.reset();
      display.draw({ bufferX: dc(600, 0), bufferY: dc(600, 0), triggered: true });
      assert.deepEqual(signalStrokes(ctx)[0].points[0], [W / 2, H / 2]);
    });

    it('centerOffsetX/Y desplazan la figura (escalados por dpr)', () => {
      globalThis.window.devicePixelRatio = 2;
      const { display, ctx } = createDisplay({ mode: 'xy', centerOffsetX: 3, centerOffsetY: -4 });
      display.draw({ bufferX: dc(600, 0), bufferY: dc(600, 0), triggered: true });
      assert.deepEqual(signalStrokes(ctx)[0].points[0], [W / 2 + 6, H / 2 - 8]);
    });

    it('decima promediando: 6000 samples → 600 puntos, y un buffer corto no se estira', () => {
      const { display, ctx } = createDisplay({ mode: 'xy' });
      display.draw({ bufferX: sine(6000), bufferY: sine(6000), triggered: true });
      assert.equal(signalStrokes(ctx)[0].points.length, W);
      ctx.reset();
      display.draw({ bufferX: sine(100), bufferY: sine(100), triggered: true });
      assert.equal(signalStrokes(ctx)[0].points.length, 100);
    });

    it('el indicador en X-Y depende de que haya señal en X (> 0,01), no del trigger', () => {
      const { display, ctx } = createDisplay({ mode: 'xy' });
      display.draw({ bufferX: silence(512), bufferY: sine(512), triggered: true });
      let texts = ctx.ops.filter(o => o.op === 'fillText');
      assert.equal(texts[0].fillStyle, '#600', 'sin X: rojo aunque triggered');
      ctx.reset();
      display.draw({ bufferX: sine(512), bufferY: sine(512), triggered: false });
      texts = ctx.ops.filter(o => o.op === 'fillText');
      assert.equal(texts[0].fillStyle, '#0f0', 'con X: verde aunque no triggered');
    });

    it('sin uno de los dos buffers no dibuja figura', () => {
      const { display, ctx } = createDisplay({ mode: 'xy' });
      display.draw({ bufferY: sine(512), triggered: true });
      assert.equal(signalStrokes(ctx).length, 0);
    });
  });

  describe('drawEmpty, noSignal y refresh', () => {
    it('drawEmpty: fondo, rejilla y dos líneas planas a H/4 y 3H/4 con sus colores', () => {
      const { display, ctx } = createDisplay({ lineColor: '#0f0', lineColor2: '#0ff' });
      display.drawEmpty();
      assert.equal(ctx.count('fillRect'), 1);
      const [b1, b2] = signalStrokes(ctx);
      assert.deepEqual(b1.points, [[0, H / 4], [W, H / 4]]);
      assert.equal(b1.strokeStyle, '#0f0');
      assert.deepEqual(b2.points, [[0, 3 * H / 4], [W, 3 * H / 4]]);
      assert.equal(b2.strokeStyle, '#0ff');
      assert.equal(ctx.count('arc'), 0, 'sin indicador de trigger');
    });

    it('con fondo transparente usa clearRect y sin rejilla no traza la cuadrícula', () => {
      const { display, ctx } = createDisplay({ bgColor: 'transparent', showGrid: false });
      display.drawEmpty();
      assert.equal(ctx.count('clearRect'), 1);
      assert.equal(ctx.count('fillRect'), 0);
      assert.equal(ctx.strokes().filter(s => s.lineWidth === 1).length, 0);
      ctx.reset();
      display.draw({ bufferY: sine(512), bufferX: silence(512), triggered: true });
      assert.equal(ctx.count('clearRect'), 1);
    });

    it('draw({noSignal}) equivale a drawEmpty y no guarda esos datos como últimos', () => {
      const { display, ctx } = createDisplay();
      display.draw({ bufferY: sine(512), bufferX: silence(512), triggered: true });
      const last = display.lastData;
      ctx.reset();
      display.draw({ noSignal: true });
      assert.equal(signalStrokes(ctx).length, 2);
      assert.equal(signalStrokes(ctx)[0].points.length, 2, 'líneas planas de drawEmpty');
      assert.equal(display.lastData, last);
    });

    it('refresh redibuja los últimos datos, o el vacío si no hay; resize hace lo mismo', () => {
      const { display, ctx } = createDisplay();
      display.refresh();
      assert.equal(signalStrokes(ctx)[0].points.length, 2, 'vacío');
      display.draw({ bufferY: sine(512), bufferX: silence(512), triggered: true });
      ctx.reset();
      display.refresh();
      assert.ok(signalStrokes(ctx)[0].points.length >= W, 'con datos');
      ctx.reset();
      display.resize(10, 10);
      assert.equal(display.width, W, 'la resolución interna no cambia');
      assert.ok(signalStrokes(ctx)[0].points.length >= W);
    });

    it('getCanvas devuelve el canvas', () => {
      const { display, canvas } = createDisplay();
      assert.equal(display.getCanvas(), canvas);
    });
  });

  describe('Render loop con requestAnimationFrame', () => {
    it('startRenderLoop encola un frame; draw() pasa a diferir y solo se pinta en el frame', () => {
      const { display, ctx } = createDisplay();
      display.startRenderLoop();
      assert.equal(rafCallbacks.length, 1);
      display.draw({ bufferY: sine(512), bufferX: silence(512), triggered: true });
      assert.equal(ctx.ops.length, 0, 'aún no se ha pintado');
      runFrame();
      assert.equal(ctx.count('fillRect'), 1);
      assert.equal(display._pendingData, null);
      assert.equal(rafCallbacks.length, 1, 'se reprograma el siguiente frame');
    });

    it('varios draw() entre frames: solo se pinta el último', () => {
      const { display, ctx } = createDisplay();
      display.startRenderLoop();
      display.draw({ bufferY: dc(512, 0.5), bufferX: silence(512), triggered: true });
      display.draw({ bufferY: dc(512, -0.5), bufferX: silence(512), triggered: true });
      runFrame();
      assert.equal(ctx.count('fillRect'), 1);
      assert.equal(signalStrokes(ctx)[0].points[0][1], H / 4 + 0.5 * H / 4, 'el último (−0,5)');
    });

    it('sin datos nuevos el frame no pinta nada', () => {
      const { display, ctx } = createDisplay();
      display.startRenderLoop();
      runFrame();
      runFrame();
      assert.equal(ctx.ops.length, 0);
    });

    it('startRenderLoop dos veces no duplica el loop', () => {
      const { display } = createDisplay();
      display.startRenderLoop();
      display.startRenderLoop();
      assert.equal(rafCallbacks.length, 1);
    });

    it('stopRenderLoop cancela el frame pendiente y draw() vuelve a pintar directo', () => {
      const { display, ctx } = createDisplay();
      display.startRenderLoop();
      display.stopRenderLoop();
      assert.equal(display._isRunning, false);
      assert.ok(rafCallbacks.every(cb => cb === null), 'rAF cancelado');
      display.draw({ bufferY: sine(512), bufferX: silence(512), triggered: true });
      assert.equal(ctx.count('fillRect'), 1);
    });

    it('QUIRK: destroy() olvida los datos pero no para el render loop (cancela animationId, que nunca se usa)', () => {
      const { display } = createDisplay();
      display.startRenderLoop();
      display.draw({ bufferY: sine(512), bufferX: silence(512), triggered: true });
      display.destroy();
      assert.equal(display.lastData, null);
      assert.equal(display._isRunning, true);
      assert.ok(rafCallbacks.some(cb => cb !== null), 'el rAF sigue programado');
    });
  });
});
