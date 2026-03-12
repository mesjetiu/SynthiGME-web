/**
 * Tests estáticos para los scripts de generación de assets raster de knobs.
 *
 * Verifican contratos recientes:
 * - preferencia por SVGs en design/
 * - nombres de salida esperados
 * - limpieza de SVGs no usados en src/
 * - script maestro que ejecuta todos los generadores
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const scripts = {
  knob: readFileSync(resolve(ROOT, 'scripts/tools/gen-knob-ring-png.py'), 'utf-8'),
  toggle: readFileSync(resolve(ROOT, 'scripts/tools/gen-toggle-png.py'), 'utf-8'),
  rotary: readFileSync(resolve(ROOT, 'scripts/tools/gen-rotary-png.py'), 'utf-8'),
  vernier: readFileSync(resolve(ROOT, 'scripts/tools/gen-vernier-png.py'), 'utf-8'),
  all: readFileSync(resolve(ROOT, 'scripts/tools/gen-all-knob-pngs.sh'), 'utf-8')
};

describe('Scripts de generación de knobs raster', () => {
  it('prefieren SVGs editables en design/ cuando existen', () => {
    assert.match(scripts.knob, /DESIGN\s+=\s+ROOT \/ 'design' \/ 'knobs'/);
    assert.match(scripts.toggle, /DESIGN_SVG = ROOT \/ 'design' \/ 'knobs' \/ 'toggle-switch\.svg'/);
    assert.match(scripts.rotary, /DESIGN_SVG = ROOT \/ 'design' \/ 'knobs' \/ 'rotary-switch\.svg'/);
    assert.match(scripts.vernier, /_design = ROOT \/ 'design' \/ 'knobs' \/ 'knob multivuelta' \/ 'spectrol-vernier-dial\.svg'/);
  });

  it('declaran las salidas PNG esperadas para cada control rasterizado', () => {
    assert.match(scripts.knob, /knob-ring\.png/);
    assert.match(scripts.knob, /knob-ring-bipolar\.png/);
    assert.match(scripts.toggle, /toggle-a\.png/);
    assert.match(scripts.toggle, /toggle-b\.png/);
    assert.match(scripts.rotary, /rotary-a\.png/);
    assert.match(scripts.rotary, /rotary-b\.png/);
    assert.match(scripts.vernier, /vernier-rotor\.png/);
    assert.match(scripts.vernier, /vernier-ring\.png/);
  });

  it('el script maestro ejecuta los cuatro generadores individuales', () => {
    assert.match(scripts.all, /python3 gen-knob-ring-png\.py/);
    assert.match(scripts.all, /python3 gen-vernier-png\.py/);
    assert.match(scripts.all, /python3 gen-toggle-png\.py/);
    assert.match(scripts.all, /python3 gen-rotary-png\.py/);
  });
});

describe('Inventario de assets de knobs tras la limpieza SVG', () => {
  it('src/assets/knobs conserva solo los SVGs que siguen siendo necesarios en runtime', () => {
    const knobDir = resolve(ROOT, 'src/assets/knobs');
    const svgs = readdirSync(knobDir).filter(name => name.endsWith('.svg')).sort();
    assert.deepEqual(svgs, ['knob-selector.svg', 'toggle-switch.svg', 'vernier-dial.svg']);
  });

  it('docs/assets/knobs refleja la misma limpieza de SVGs tras el build', () => {
    const knobDir = resolve(ROOT, 'docs/assets/knobs');
    const svgs = readdirSync(knobDir).filter(name => name.endsWith('.svg')).sort();
    assert.deepEqual(svgs, ['knob-selector.svg', 'toggle-switch.svg', 'vernier-dial.svg']);
  });

  it('design/knobs mantiene los SVGs fuente editables necesarios para regenerar PNGs', () => {
    const designDir = resolve(ROOT, 'design/knobs');
    const items = readdirSync(designDir).sort();
    assert.ok(items.includes('knob.svg'));
    assert.ok(items.includes('knob-0-center.svg'));
    assert.ok(items.includes('toggle-switch.svg'));
    assert.ok(items.includes('rotary-switch.svg'));
    assert.ok(items.includes('knob multivuelta'));
  });

  it('src/assets/knobs contiene todos los PNGs raster que la UI usa ahora', () => {
    const knobDir = resolve(ROOT, 'src/assets/knobs');
    const files = readdirSync(knobDir).sort();
    [
      'knob-ring.png',
      'knob-ring-bipolar.png',
      'toggle-a.png',
      'toggle-b.png',
      'rotary-a.png',
      'rotary-b.png',
      'vernier-rotor.png',
      'vernier-ring.png'
    ].forEach(name => assert.ok(files.includes(name), `Falta ${name}`));
  });
});