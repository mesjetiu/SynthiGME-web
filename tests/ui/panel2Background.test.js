/**
 * Fondo vectorial del panel 2 (osciloscopio, frecuencímetro, banco de
 * octavas, Input Amplifier Level y External Treatment Devices).
 *
 * Fija lo que se dio por bueno al pasar el panel 2 de la foto al dibujo:
 * - la web inyecta panel2_bg.svg en línea y ya no pinta la foto de fondo;
 * - el service worker lo precachea y ya no precachea la foto;
 * - el SVG está en px del panel (760×760), con clases e ids propios (p2…),
 *   porque al ir en línea su <style> y sus ids son globales en la página;
 * - las tres filas de ▼ son una dibujada y siete clones al paso de los
 *   mandos del blueprint: si se mueven los mandos sin el dibujo, falla;
 * - los mandos sin audio (FUNCTION, RANGE y los ocho de los envíos y
 *   retornos) existen en la web: el dibujo no los pinta y sin ellos
 *   desaparecerían con la foto.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import panel2Blueprint from '../../src/assets/js/panelBlueprints/panel2.blueprint.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const leer = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const svg = leer('src/assets/panels/panel2_bg.svg');
const { layout, modules } = panel2Blueprint;

/** Centro x (px del panel) del mando i de una fila de 8 del blueprint. */
function centroFila(fila, i) {
  const ancho = 8 * fila.knobSize + 7 * fila.knobGap;
  const x0 = fila.box.x + (fila.box.w - ancho) / 2 + (fila.knobsRowOffset?.x ?? 0);
  return x0 + fila.knobSize / 2 + i * (fila.knobSize + fila.knobGap);
}

describe('Panel 2 - fondo vectorial', () => {

  it('la web lo inyecta en línea y ya no usa la foto', () => {
    const app = leer('src/assets/js/app.js');
    assert.match(app, /^\s*injectInlinePanelSvgBackground\('panel-2', '\.\/assets\/panels\/panel2_bg\.svg'\)/m);
    assert.doesNotMatch(app, /setPanelImageBackground\('panel-2'/);
    assert.ok(!existsSync(path.join(ROOT, 'src/assets/panels/panel_2.jpg')),
      'la foto se queda en design/, no en la web');
  });

  it('el service worker lo precachea y no la foto', () => {
    const sw = leer('src/sw.js');
    assert.match(sw, /'\.\/assets\/panels\/panel2_bg\.svg'/);
    assert.doesNotMatch(sw, /panel_2\.jpg/);
  });

  it('el CSS lo coloca debajo de los mandos, ocupando el panel', () => {
    const css = leer('src/assets/css/main.css');
    assert.match(css, /#panel-2 > \.panel-inline-bg[^{]*\{[^}]*position: absolute;[^}]*inset: 0;[^}]*z-index: 0;/);
  });

  it('está en px del panel: 760×760', () => {
    assert.match(svg, /^<svg width="760" height="760" viewBox="0 0 760 760"/);
  });

  it('clases e ids con prefijo propio (van en línea en la página)', () => {
    const clases = [...svg.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/));
    assert.ok(clases.length > 0);
    for (const c of clases) assert.match(c, /^p2c\d+$/);
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    assert.ok(ids.length > 0);
    for (const id of ids) assert.match(id, /^p2-/);
  });

  it('sin imágenes incrustadas y solo con la fuente que carga la web', () => {
    assert.doesNotMatch(svg, /<image/);
    const familias = new Set([...svg.matchAll(/font-family:([^;}]+)/g)].map(m => m[1].trim()));
    assert.deepEqual([...familias], ["'Microgramma Extended'"]);
  });

  for (const [fila, clave] of [['octavas', 'octaveFilterBank'], ['entradas', 'inputAmplifierLevel'], ['envios', 'inputAmplifierLevel']]) {
    it(`▼ de ${fila}: uno dibujado y siete clones al paso de los mandos`, () => {
      const f = layout[clave];
      const clones = [...svg.matchAll(new RegExp(`<use href="#p2-tri-${fila}" transform="translate\\(([\\d.]+),0\\)"`, 'g'))]
        .map(m => Number(m[1]));
      assert.equal(clones.length, 7);
      clones.sort((a, b) => a - b).forEach((dx, i) => {
        const paso = centroFila(f, i + 1) - centroFila(f, 0);
        assert.ok(Math.abs(dx - paso) < 1e-9, `clon ${i + 2}: ${dx} px; el mando está a ${paso}`);
      });
    });
  }

  it('los mandos de envíos y retornos van en las columnas de Input Amplifier Level', () => {
    const ia = layout.inputAmplifierLevel;
    const centros = ['extTreatmentSend', 'extTreatmentReturn']
      .flatMap(k => layout[k].knobs.map(c => layout[k].box.x + c.x));
    assert.equal(centros.length, 8);
    centros.forEach((x, i) => assert.ok(Math.abs(x - centroFila(ia, i)) < 1e-9,
      `mando ${i + 1}: x=${x}; la columna está en ${centroFila(ia, i)}`));
    for (const k of ['frequencyMeter', 'extTreatmentSend', 'extTreatmentReturn']) {
      assert.equal(modules[k].visible, true, `${k} tiene que verse: el dibujo no pinta sus mandos`);
    }
  });

  it('los selectores del frecuencímetro: seis funciones y cuatro rangos', () => {
    const { function: fn, range } = layout.frequencyMeter.selectors;
    assert.equal(fn.labels.length, 6);
    assert.equal(range.labels.length, 4);
    for (const s of [fn, range]) {
      assert.ok(s.minAngle < 360 && s.maxAngle > 360, 'el arco pasa por las 12');
      assert.ok(s.initial >= 0 && s.initial < s.labels.length);
    }
  });
});
