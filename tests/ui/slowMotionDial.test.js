/**
 * Dial de cámara lenta: el Clock Rate del secuenciador (panel 7).
 *
 * Fija lo que se dio por bueno al calcarlo de la foto
 * (module_research/panel7/mandos.md):
 * - tres capas apiladas: faldón (fijo), escala (gira) y capuchón (fijo);
 * - la escala gira 0°–360° con el valor y la cifra bajo el índice es la
 *   lectura (0–10): a medio recorrido, el 5 arriba;
 * - en la escala, las cifras crecen en sentido antihorario y llevan la
 *   cabeza hacia el centro (en la foto, el 7 de abajo se lee derecho);
 * - el panel 7 lo usa para el Clock Rate, y el service worker cachea sus
 *   imágenes.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

const { createSlowMotionDialElements, SlowMotionDial, SLOW_MOTION_DIAL_LAYERS } =
  await import('../../src/assets/js/ui/slowMotionDial.js');
const { default: panel7Blueprint } = await import('../../src/assets/js/panelBlueprints/panel7.blueprint.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const leer = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('Dial de cámara lenta - DOM', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('apila faldón, escala y capuchón, en ese orden', () => {
    const { knobEl, svgContainer } = createSlowMotionDialElements();
    assert.ok(knobEl.classList.contains('knob--slow-motion'));
    const capas = [...svgContainer.querySelectorAll('img')].map(i => i.getAttribute('src'));
    assert.deepEqual(capas, [
      SLOW_MOTION_DIAL_LAYERS.faldon, SLOW_MOTION_DIAL_LAYERS.escala, SLOW_MOTION_DIAL_LAYERS.capuchon
    ]);
  });

  it('solo gira la escala, de 0° a 360° con el valor', () => {
    const { knobEl } = createSlowMotionDialElements();
    document.body.appendChild(knobEl);
    const dial = new SlowMotionDial(knobEl, { min: 0, max: 1, initial: 0.5 });
    const escala = knobEl.querySelector('.slow-motion-dial__escala');
    assert.equal(escala.style.transform, 'rotate(180deg)');
    dial.setValue(0);
    assert.equal(escala.style.transform, 'rotate(0deg)');
    dial.setValue(1);
    assert.equal(escala.style.transform, 'rotate(360deg)');
    assert.equal(knobEl.querySelector('.slow-motion-dial__faldon').style.transform, '');
    assert.equal(knobEl.querySelector('.slow-motion-dial__capuchon').style.transform, '');
    assert.equal(dial._getRotatingEl(), escala);
  });
});

describe('Dial de cámara lenta - imágenes', () => {
  it('las tres miden lo mismo, 55 × 55, el diámetro del dial en el panel', () => {
    for (const src of Object.values(SLOW_MOTION_DIAL_LAYERS)) {
      const svg = leer(`src/${src}`);
      assert.match(svg, /^<svg [^>]*width="55" height="55" viewBox="0 0 55 55"/, src);
    }
    assert.equal(panel7Blueprint.layout.sequencer.clockRate.size, 55);
  });

  it('el índice está arriba, en el eje', () => {
    const svg = leer(`src/${SLOW_MOTION_DIAL_LAYERS.faldon}`);
    const [, x, w] = svg.match(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"[^>]*fill="#f4f2ea"/);
    assert.ok(Math.abs(Number(x) + Number(w) / 2 - 27.5) < 1e-6);
  });

  it('cien rayitas y las diez cifras a trazos (no depende de fuentes)', () => {
    const svg = leer(`src/${SLOW_MOTION_DIAL_LAYERS.escala}`);
    const rayas = svg.match(/<path d="([^"]+)" stroke=/)[1].match(/M/g).length;
    assert.equal(rayas, 100);
    assert.doesNotMatch(svg, /<text/);
  });
});

describe('Dial de cámara lenta - en el panel 7', () => {
  it('el Clock Rate del secuenciador es el dial de cámara lenta', () => {
    assert.equal(panel7Blueprint.layout.sequencer.clockRateKnobType, 'slowMotion');
    const asm = leer('src/assets/js/panelAssembler.js');
    assert.match(asm, /clockRateType === 'slowMotion'/);
    assert.match(asm, /new SlowMotionDial\(/);
  });

  it('el service worker cachea sus tres imágenes', () => {
    const sw = leer('src/sw.js');
    for (const src of Object.values(SLOW_MOTION_DIAL_LAYERS)) {
      assert.ok(sw.includes(`'./${src}'`), src);
    }
  });
});
