/**
 * Panel 7: los mandos calcados de la foto (fader de nivel, teclas y
 * cuadrado del secuenciador).
 *
 * Fija lo que se dio por bueno al dibujarlos (medidas en
 * module_research/panel7/mandos.md, px del panel, 760 = ancho de la foto):
 * - el asa del fader es la de los canales sanos de la foto, la misma imagen
 *   en los 8 canales, y su canto de arriba (el índice) recorre la escala del
 *   fondo de la raya del 10 (583,7) a la del 0 (697,2), centrada en el eje;
 * - la pista amarilla de antes ya no se pinta: la ranura es del fondo.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import panel7Blueprint from '../../src/assets/js/panelBlueprints/panel7.blueprint.js';
import { faderVars, faderThumbCenterY, sequencerPlacement } from '../../src/assets/js/utils/panel7Geometry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const leer = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const css = leer('src/assets/css/main.css');
const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// Medidas de la foto (y del fondo, panel7_bg.svg)
const RAYA_10 = 583.7;
const RAYA_0 = 697.2;
const EJE_CANAL_1 = 80.75;
const PASO_CANAL = 85.5;
const FINAL_RANURA = 722.5;

describe('Panel 7 - fader de nivel', () => {
  const fader = panel7Blueprint.outputChannelUI.fader;
  const cajas = panel7Blueprint.layout.outputChannels.boxes;

  it('recorre la escala del fondo: de la raya del 10 a la del 0', () => {
    assert.equal(fader.scaleTop, RAYA_10);
    assert.equal(fader.scaleBottom, RAYA_0);
  });

  it('el tamaño del asa es el de su imagen (panel7_asa.svg)', () => {
    const svg = leer('src/assets/panels/panel7_asa.svg');
    const [, w, h] = svg.match(/^<svg [^>]*width="([\d.]+)" height="([\d.]+)"/);
    assert.equal(fader.capWidth, Number(w));
    assert.equal(fader.capHeight, Number(h));
  });

  it('el asa mide lo de la foto: 26,1 px de alto, de la raya del 0 al final de la ranura', () => {
    // A cero el pie del asa queda en 723,3 (en la foto, 723,4), justo al
    // final de la ranura (722,5): no asoma ranura por debajo.
    const svg = leer('src/assets/panels/panel7_asa.svg');
    const ys = [...svg.matchAll(/points="([^"]+)"/g)][0][1]
      .split(' ').map(p => Number(p.split(',')[1]));
    const alto = Math.max(...ys) - Math.min(...ys);
    assert.ok(cerca(alto, 26.1, 0.01), `alto del asa ${alto}`);
    assert.ok(RAYA_0 + alto >= FINAL_RANURA, 'a cero el asa tapa el final de la ranura');
  });

  it('cada canal pone su fader centrado en su eje, en px de su caja', () => {
    cajas.forEach((box, n) => {
      const v = faderVars(fader, box);
      const left = parseFloat(v['--oc-fader-left']);
      const top = parseFloat(v['--oc-fader-top']);
      const largo = parseFloat(v['--oc-fader-length']);
      assert.ok(cerca(box.x + left + fader.capWidth / 2, EJE_CANAL_1 + PASO_CANAL * n), `eje del canal ${n + 1}`);
      assert.ok(cerca(box.y + top, RAYA_10, 1e-3), `arriba del input, canal ${n + 1}`);
      // El input mide recorrido + asa: a 10 el canto del asa está en la raya
      // del 10 y a 0, en la del 0.
      assert.ok(cerca(largo - fader.capHeight, RAYA_0 - RAYA_10, 1e-3), `recorrido, canal ${n + 1}`);
    });
  });

  it('el canto del asa cae en la raya de cada valor', () => {
    const largo = RAYA_0 - RAYA_10 + fader.capHeight;
    const rect = { top: RAYA_10, bottom: RAYA_10 + largo, height: largo };
    for (let valor = 0; valor <= 10; valor++) {
      const centro = faderThumbCenterY(rect, largo, fader.capHeight, valor / 10);
      const canto = centro - fader.capHeight / 2;
      assert.ok(cerca(canto, RAYA_0 - valor * 11.35, 1e-6), `valor ${valor}: canto en ${canto}`);
    }
  });

  it('el centro del asa sigue a la escala del visor (zoom)', () => {
    const largo = RAYA_0 - RAYA_10 + fader.capHeight;
    const rect = { top: 100, bottom: 100 + 3 * largo, height: 3 * largo };
    assert.ok(cerca(faderThumbCenterY(rect, largo, fader.capHeight, 1), 100 + 3 * fader.capHeight / 2));
    assert.ok(cerca(faderThumbCenterY(rect, largo, fader.capHeight, 0), rect.bottom - 3 * fader.capHeight / 2));
  });

  it('faderVars rechaza medidas que no son', () => {
    assert.throws(() => faderVars({ scaleTop: 700, scaleBottom: 600, capWidth: 1, capHeight: 1 }, cajas[0]));
    assert.throws(() => faderVars({}, cajas[0]));
  });

  it('el CSS pinta el asa como imagen del thumb y sin pista', () => {
    for (const motor of ['-webkit-slider-thumb', '-moz-range-thumb']) {
      const re = new RegExp(`\\.output-channel__slider::${motor} \\{[^}]*url\\('\\.\\./panels/panel7_asa\\.svg'\\)`);
      assert.match(css, re, motor);
    }
    for (const motor of ['-webkit-slider-runnable-track', '-moz-range-track']) {
      const re = new RegExp(`\\.output-channel__slider::${motor} \\{[^}]*background: transparent;`);
      assert.match(css, re, motor);
    }
  });

  it('el service worker precachea el asa', () => {
    assert.match(leer('src/sw.js'), /'\.\/assets\/panels\/panel7_asa\.svg'/);
  });

  it('la imagen del asa es autónoma: sin texto, imágenes ni enlaces', () => {
    const svg = leer('src/assets/panels/panel7_asa.svg');
    assert.doesNotMatch(svg, /<text|<image|href=/);
  });
});

describe('Panel 7 - secuenciador cuadrado con la foto', () => {
  const seq = panel7Blueprint.layout.sequencer;
  const sitio = sequencerPlacement(seq);
  const centro = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  it('las columnas son las de los rótulos del fondo (generar_panel7.py)', () => {
    const gen = leer('design/panels/Panel7/generar_panel7.py');
    const [, x0, paso] = gen.match(/COL_SEQ = \[([\d.]+) \+ ([\d.]+) \* i/);
    assert.equal(seq.columns.x0, Number(x0));
    assert.equal(seq.columns.step, Number(paso));
  });

  it('cada interruptor tiene la tuerca de la foto (13 px) centrada en (columna, 152,5)', () => {
    assert.equal(sitio.switches.length, 8);
    sitio.switches.forEach((r, i) => {
      const c = centro(r);
      assert.ok(cerca(c.x, 269.3 + 31.43 * i, 1e-9), `interruptor ${i + 1}: x ${c.x}`);
      assert.ok(cerca(c.y, 152.5), `interruptor ${i + 1}: y ${c.y}`);
      assert.equal(r.w, 13);
      // proporción del dibujo (toggle-switch.svg, viewBox 104 × 186)
      assert.ok(cerca(r.h / r.w, 186 / 104, 0.01));
    });
  });

  it('el dial Clock Rate es el de la foto: 55 px centrado en (380, 289,5)', () => {
    const c = centro(sitio.clockRate);
    assert.ok(cerca(c.x, 380) && cerca(c.y, 289.5), `centro ${c.x}, ${c.y}`);
    assert.equal(sitio.clockRate.w, 55);
    assert.equal(sitio.clockRate.h, 55);
  });

  it('las teclas van centradas en su columna y en el pie de las de la foto', () => {
    assert.equal(sitio.keys.length, 8);
    sitio.keys.forEach((r, i) => {
      const c = centro(r);
      assert.ok(cerca(c.x, 269.3 + 31.43 * i, 1e-9), `tecla ${i + 1}: x ${c.x}`);
      assert.ok(cerca(c.y, (209.8 + 237.3) / 2, 1e-9), `tecla ${i + 1}: y ${c.y}`);
    });
  });

  it('los retoques por mando se suman a su sitio', () => {
    const offs = Array.from({ length: 8 }, (_, i) => ({ x: i === 2 ? 1.5 : 0, y: i === 2 ? -2 : 0 }));
    const s2 = sequencerPlacement({ ...seq, switchOffsets: offs, buttonOffsets: offs });
    assert.ok(cerca(s2.switches[2].x - sitio.switches[2].x, 1.5));
    assert.ok(cerca(s2.keys[2].y - sitio.keys[2].y, -2));
    assert.deepEqual(s2.switches[3], sitio.switches[3]);
  });

  it('sin medidas, falla en vez de colocar mal', () => {
    assert.throws(() => sequencerPlacement({ ...seq, columns: undefined }));
    assert.throws(() => sequencerPlacement({ ...seq, clockRate: { cx: 380 } }));
  });
});
