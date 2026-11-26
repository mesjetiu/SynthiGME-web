/**
 * Fondo vectorial del panel 7 (joysticks, secuenciador y 8 canales de salida).
 *
 * Fija lo que se dio por bueno al pasar el panel 7 de la foto al dibujo:
 * - la web inyecta panel7_bg.svg en línea (como los paneles 3, 5 y 6) y ya
 *   no pinta la foto de fondo;
 * - el service worker lo precachea (si no, offline el panel sale vacío);
 * - el SVG está en px del panel (760×760), con clases e ids propios (p7…),
 *   porque al ir en línea su <style> y sus ids son globales en la página;
 * - un canal dibujado y siete clones al mismo paso que las cajas de los
 *   canales en el blueprint: si se mueven los mandos sin el dibujo, falla.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import panel7Blueprint from '../../src/assets/js/panelBlueprints/panel7.blueprint.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const leer = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const svg = leer('src/assets/panels/panel7_bg.svg');

describe('Panel 7 - fondo vectorial', () => {

  it('la web lo inyecta en línea y ya no usa la foto', () => {
    const app = leer('src/assets/js/app.js');
    assert.match(app, /injectInlinePanelSvgBackground\('panel-output', '\.\/assets\/panels\/panel7_bg\.svg'\)/);
    assert.doesNotMatch(app, /setPanelImageBackground\('panel-output'/);
  });

  it('el service worker lo precachea', () => {
    assert.match(leer('src/sw.js'), /'\.\/assets\/panels\/panel7_bg\.svg'/);
  });

  it('el CSS lo coloca debajo de los mandos, ocupando el panel', () => {
    const css = leer('src/assets/css/main.css');
    assert.match(css, /#panel-output > \.panel-inline-bg \{[^}]*position: absolute;[^}]*inset: 0;[^}]*z-index: 0;/);
  });

  it('está en px del panel: 760×760', () => {
    assert.match(svg, /^<svg width="760" height="760" viewBox="0 0 760 760"/);
  });

  it('clases e ids con prefijo propio (van en línea en la página)', () => {
    const clases = [...svg.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/));
    assert.ok(clases.length > 0);
    for (const c of clases) assert.match(c, /^p7c\d+$/);
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    for (const id of ids) assert.match(id, /^p7-/);
  });

  it('sin imágenes incrustadas y solo con la fuente que carga la web', () => {
    assert.doesNotMatch(svg, /<image/);
    const familias = new Set([...svg.matchAll(/font-family:([^;}]+)/g)].map(m => m[1].trim()));
    assert.deepEqual([...familias], ["'Microgramma Extended'"]);
  });

  it('un canal dibujado y siete clones al paso de las cajas del blueprint', () => {
    const cajas = panel7Blueprint.layout.outputChannels.boxes;
    const clones = [...svg.matchAll(/<use href="#p7-canal" transform="translate\(([\d.]+),0\)"/g)]
      .map(m => Number(m[1]));
    assert.equal(clones.length, 7);
    clones.forEach((dx, i) => {
      assert.ok(Math.abs(dx - (cajas[i + 1].x - cajas[0].x)) < 1e-9,
        `clon ${i + 2}: ${dx} px; la caja está a ${cajas[i + 1].x - cajas[0].x}`);
    });
  });

  it('un título por canal, OUTPUT CH.1 … OUTPUT CH.8', () => {
    for (let n = 1; n <= 8; n++) assert.ok(svg.includes(`>OUTPUT CH.${n}<`), `falta OUTPUT CH.${n}`);
  });

  it('el joystick derecho es un clon del izquierdo', () => {
    assert.match(svg, /<use href="#p7-joystick" transform="translate\(582,0\)"/);
  });
});
