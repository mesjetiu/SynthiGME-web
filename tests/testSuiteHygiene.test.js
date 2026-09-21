/**
 * Higiene de la propia batería de tests.
 *
 * En la auditoría de septiembre de 2026 aparecieron dos formas de test que
 * dan verde sin proteger nada, y este fichero impide que vuelvan:
 *
 * 1. **Tests espejo**: ficheros que reescribían la lógica del módulo dentro
 *    del test y la probaban contra sí misma, sin cargar nunca el código real
 *    (llegó a haber 20, ~1.000 tests). Un test de verdad carga su sujeto:
 *    importa algo de `src/assets/…` o `electron/…`, lee su fuente con
 *    `readFile`, o lo importa dinámicamente (`import(`/`require(`). Los
 *    tests de `tests/audio/` quedan fuera porque son Playwright y cargan la
 *    app entera en un navegador.
 *
 * 2. **Tests que `npm test` no ejecutaba**: el glob de `package.json` lista
 *    las subcarpetas de `tests/` una a una; una carpeta nueva que no se añada
 *    tiene tests que nadie corre (pasó con 12 ficheros, 322 tests). Aquí se
 *    comprueba que cada fichero de test está cubierto por ese glob, salvo
 *    los excluidos a sabiendas, que se listan con su motivo.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative, join, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TESTS_DIR = resolve(ROOT, 'tests');

/** Marcas de que un test carga su sujeto real. */
const REAL_SUBJECT_MARKERS = [
  /src\/assets/,
  /electron\//,
  /scripts\//,
  /readFile/,
  /import\(/,
  /require\(/,
];

/**
 * Ficheros que `npm test` no corre a propósito. Cada uno con su porqué; si
 * se arregla, se quita de aquí y se vuelve a meter en el glob.
 */
const KNOWN_EXCLUSIONS = {
  'tests/electron/electronMenuContracts.test.js':
    'Falla en 4 puntos documentados en AUDITORIA-2026-09.md (menu.panels.keyboards sin traducir, case toggleKeyboard muerto, 2 falsos positivos del extractor); se corre a mano con node --test',
};

function walkTests(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules') continue;
      walkTests(full, out);
    } else if (name.endsWith('.test.js')) {
      out.push(relative(ROOT, full).split(sep).join('/'));
    }
  }
  return out.sort();
}

const isPlaywright = file => file.startsWith('tests/audio/');

/** ¿Referencia el fichero a código real, o es un espejo? */
export function loadsRealSubject(source) {
  return REAL_SUBJECT_MARKERS.some(re => re.test(source));
}

/**
 * Traduce el script `test` de package.json a predicados sobre rutas
 * relativas. Entiende justo las formas que usa este repo:
 *   'tests/*.test.js', 'tests/{a,b}/**\/*.test.js' y ficheros sueltos.
 */
export function parseNpmTestGlob(script) {
  const patterns = [...script.matchAll(/'([^']+)'|(\S+\.test\.js)/g)]
    .map(m => m[1] || m[2]);
  return patterns.map(p => {
    if (p === 'tests/*.test.js') return f => /^tests\/[^/]+\.test\.js$/.test(f);
    const braces = p.match(/^tests\/\{([^}]+)\}\/\*\*\/\*\.test\.js$/);
    if (braces) {
      const dirs = braces[1].split(',');
      return f => dirs.some(d => f.startsWith(`tests/${d}/`));
    }
    return f => f === p;
  });
}

const allTests = walkTests(TESTS_DIR);
const unitTests = allTests.filter(f => !isPlaywright(f));

describe('Higiene de la batería de tests', () => {
  it('hay tests que examinar', () => {
    assert.ok(unitTests.length > 100, `solo ${unitTests.length} ficheros`);
    assert.ok(unitTests.includes('tests/testSuiteHygiene.test.js'));
  });

  describe('Ningún test es un espejo', () => {
    it('el detector reconoce un espejo y un test real', () => {
      assert.equal(loadsRealSubject(`
        import { describe, it } from 'node:test';
        function clamp(v) { return Math.max(0, Math.min(1, v)); }
        it('clampea', () => assert.equal(clamp(2), 1));
      `), false);
      assert.equal(loadsRealSubject("import { X } from '../../src/assets/js/x.js';"), true);
      assert.equal(loadsRealSubject("const src = readFileSync(resolve(ROOT, 'electron/main.cjs'));"), true);
      assert.equal(loadsRealSubject("await import(`../../src/assets/js/worklets/x.worklet.js?t=${Date.now()}`);"), true);
    });

    it('todos los tests fuera de tests/audio/ cargan código real', () => {
      const mirrors = unitTests.filter(f => !loadsRealSubject(readFileSync(resolve(ROOT, f), 'utf8')));
      assert.deepEqual(mirrors, [],
        'Tests que no cargan su sujeto (reescriben la lógica dentro del test): ' + mirrors.join(', ')
        + '. Importa el módulo real de src/assets o lee su fuente.');
    });
  });

  describe('npm test corre todos los tests', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    const matchers = parseNpmTestGlob(pkg.scripts.test);
    const runByNpmTest = f => matchers.some(m => m(f));

    it('el parser entiende el script actual', () => {
      assert.ok(matchers.length >= 3, pkg.scripts.test);
      assert.equal(runByNpmTest('tests/testSuiteHygiene.test.js'), true);
      assert.equal(runByNpmTest('tests/worklets/dcBlocker.worklet.test.js'), true);
      assert.equal(runByNpmTest('tests/electron/multichannelActivation.test.js'), true);
      assert.equal(runByNpmTest('tests/audio/worklets/pwm.audio.test.js'), false);
      assert.equal(runByNpmTest('tests/nuevaCarpeta/algo.test.js'), false);
    });

    it('cada fichero de test está en el glob o en la lista de exclusiones con motivo', () => {
      const orphans = unitTests.filter(f => !runByNpmTest(f) && !(f in KNOWN_EXCLUSIONS));
      assert.deepEqual(orphans, [],
        'Tests que npm test no ejecuta: ' + orphans.join(', ')
        + '. Añade la carpeta al glob de "test" en package.json (ver DEVELOPMENT.md).');
    });

    it('las exclusiones siguen existiendo y siguen fuera del glob (si no, sobran de la lista)', () => {
      for (const [file, reason] of Object.entries(KNOWN_EXCLUSIONS)) {
        assert.ok(reason.length > 20, `${file}: motivo demasiado corto`);
        assert.ok(allTests.includes(file), `${file} ya no existe: quítalo de KNOWN_EXCLUSIONS`);
        assert.equal(runByNpmTest(file), false, `${file} ya corre en npm test: quítalo de KNOWN_EXCLUSIONS`);
      }
    });
  });
});
