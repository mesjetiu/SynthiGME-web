/**
 * Tests para svgInlineLoader.
 *
 * Verifica especialmente la ruta raster reciente para knobs estándar/bipolares,
 * evitando fetch de SVG y usando PNGs reutilizables.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.SVGElement = dom.window.SVGElement;

const {
  loadSvgInline,
  makeIdsUnique,
  uniquifySvgTree,
  fetchSvgText
} = await import('../../src/assets/js/ui/svgInlineLoader.js');

describe('svgInlineLoader - ruta raster para knobs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    global.fetch = async () => {
      throw new Error('fetch no debería llamarse en la ruta raster');
    };
  });

  it('convierte knob.svg en img PNG sin hacer fetch', async () => {
    const container = document.createElement('div');
    let eventDetail = null;
    container.addEventListener('synth:svgInlineLoaded', (event) => {
      eventDetail = event.detail;
    });

    const result = await loadSvgInline('assets/knobs/knob.svg', container);
    const img = container.querySelector('img.knob-raster-graphic');

    assert.equal(result.svg, null);
    assert.equal(result.prefix, '');
    assert.ok(img, 'debe crear una imagen raster');
    assert.match(img.src, /assets\/knobs\/knob-ring\.png$/);
    assert.equal(eventDetail?.src, 'assets/knobs/knob.svg');
    assert.equal(eventDetail?.svg, null);
    assert.equal(eventDetail?.img, img);
  });

  it('preserva el prefijo ./ al resolver el PNG equivalente', async () => {
    const container = document.createElement('div');
    await loadSvgInline('./assets/knobs/knob-0-center.svg', container);

    const img = container.querySelector('img.knob-raster-graphic');
    assert.ok(img);
    assert.match(img.getAttribute('src'), /^\.\/assets\/knobs\/knob-ring-bipolar\.png$/);
  });
});

describe('svgInlineLoader - ruta inline SVG', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('fetchSvgText cachea el SVG descargado', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { text: async () => '<svg><rect id="a"/></svg>' };
    };

    const first = await fetchSvgText('assets/test.svg');
    const second = await fetchSvgText('assets/test.svg');

    assert.equal(first, '<svg><rect id="a"/></svg>');
    assert.equal(second, first);
    assert.equal(calls, 1);
  });

  it('loadSvgInline inserta SVG con IDs únicos cuando no hay mapping raster', async () => {
    global.fetch = async () => ({
      text: async () => '<svg viewBox="0 0 10 10"><g id="box"></g><use href="#box"></use></svg>'
    });

    const container = document.createElement('div');
    const { svg, prefix } = await loadSvgInline('assets/test-unique.svg', container);

    assert.ok(svg);
    assert.match(prefix, /^k\d+_$/);
    assert.ok(container.innerHTML.includes(`id="${prefix}box"`));
    assert.ok(container.innerHTML.includes(`href="#${prefix}box"`));
  });

  it('uniquifySvgTree reescribe IDs y referencias existentes en un SVG ya insertado', () => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<svg><defs><linearGradient id="grad"></linearGradient></defs><rect id="box" fill="url(#grad)"></rect></svg>';

    uniquifySvgTree(wrapper);

    const svg = wrapper.querySelector('svg');
    const rect = svg.querySelector('rect');
    const grad = svg.querySelector('linearGradient');
    assert.match(grad.id, /^k\d+_grad$/);
    assert.equal(rect.getAttribute('fill'), `url(#${grad.id})`);
  });

  it('makeIdsUnique devuelve html y prefijo para referencias href/url(#id)', () => {
    const { html, prefix } = makeIdsUnique('<svg><g id="foo"></g><use href="#foo"></use><rect fill="url(#foo)"></rect></svg>');
    assert.match(prefix, /^k\d+_$/);
    assert.ok(html.includes(`id="${prefix}foo"`));
    assert.ok(html.includes(`href="#${prefix}foo"`));
    assert.ok(html.includes(`url(#${prefix}foo)`));
  });
});