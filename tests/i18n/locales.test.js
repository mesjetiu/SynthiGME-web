/**
 * Tests para i18n/locales
 * 
 * Verifica la estructura y consistencia de las traducciones.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LANGUAGE_NAMES
} from '../../src/assets/js/i18n/locales/_meta.js';

import en from '../../src/assets/js/i18n/locales/en.js';
import es from '../../src/assets/js/i18n/locales/es.js';

// ─────────────────────────────────────────────────────────────────────────────
// _meta.js
// ─────────────────────────────────────────────────────────────────────────────

describe('i18n _meta', () => {
  it('SUPPORTED_LOCALES es un array no vacío', () => {
    assert.ok(Array.isArray(SUPPORTED_LOCALES));
    assert.ok(SUPPORTED_LOCALES.length > 0);
  });

  it('incluye inglés y español', () => {
    assert.ok(SUPPORTED_LOCALES.includes('en'));
    assert.ok(SUPPORTED_LOCALES.includes('es'));
  });

  it('DEFAULT_LOCALE está en SUPPORTED_LOCALES', () => {
    assert.ok(SUPPORTED_LOCALES.includes(DEFAULT_LOCALE));
  });

  it('LANGUAGE_NAMES tiene entrada para cada locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      assert.ok(
        locale in LANGUAGE_NAMES,
        `Falta nombre para locale: ${locale}`
      );
    }
  });

  it('LANGUAGE_NAMES tiene valores no vacíos', () => {
    for (const [locale, name] of Object.entries(LANGUAGE_NAMES)) {
      assert.ok(typeof name === 'string');
      assert.ok(name.length > 0, `Nombre vacío para ${locale}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Traducciones
// ─────────────────────────────────────────────────────────────────────────────

describe('Traducciones', () => {
  const locales = { en, es };

  it('todas las locales exportan objetos', () => {
    for (const [name, translations] of Object.entries(locales)) {
      assert.ok(
        typeof translations === 'object' && translations !== null,
        `${name} no exporta un objeto`
      );
    }
  });

  it('todas las locales tienen claves', () => {
    for (const [name, translations] of Object.entries(locales)) {
      const keys = Object.keys(translations);
      assert.ok(keys.length > 0, `${name} no tiene traducciones`);
    }
  });

  it('todas las traducciones son strings', () => {
    for (const [locale, translations] of Object.entries(locales)) {
      for (const [key, value] of Object.entries(translations)) {
        assert.ok(
          typeof value === 'string',
          `${locale}.${key} no es string`
        );
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Paridad entre locales
// ─────────────────────────────────────────────────────────────────────────────

describe('Paridad entre en y es', () => {
  const enKeys = Object.keys(en);
  const esKeys = Object.keys(es);

  it('ambas locales tienen el mismo número de claves', () => {
    assert.strictEqual(
      enKeys.length,
      esKeys.length,
      `en tiene ${enKeys.length} claves, es tiene ${esKeys.length}`
    );
  });

  it('todas las claves de en existen en es', () => {
    const missing = enKeys.filter(k => !(k in es));
    assert.strictEqual(
      missing.length,
      0,
      `Claves en en que faltan en es: ${missing.slice(0, 5).join(', ')}...`
    );
  });

  it('todas las claves de es existen en en', () => {
    const missing = esKeys.filter(k => !(k in en));
    assert.strictEqual(
      missing.length,
      0,
      `Claves en es que faltan en en: ${missing.slice(0, 5).join(', ')}...`
    );
  });

  it('ninguna traducción está vacía', () => {
    for (const [key, value] of Object.entries(en)) {
      assert.ok(value.length > 0, `en.${key} está vacía`);
    }
    for (const [key, value] of Object.entries(es)) {
      assert.ok(value.length > 0, `es.${key} está vacía`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Claves esenciales
// ─────────────────────────────────────────────────────────────────────────────

describe('Claves esenciales de i18n', () => {
  const essentialKeys = [
    'common.yes',
    'common.no',
    'common.cancel',
    'common.ok',
    'common.dontAskAgain',
    'settings.title',
    'settings.close',
    'synth.reset.confirm',
    'settings.synth.confirmReset'
  ];

  for (const key of essentialKeys) {
    it(`"${key}" existe en ambas locales`, () => {
      assert.ok(key in en, `Falta en inglés: ${key}`);
      assert.ok(key in es, `Falta en español: ${key}`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Formato de claves
// ─────────────────────────────────────────────────────────────────────────────

describe('Formato de claves de traducción', () => {
  const allKeys = Object.keys(en);

  it('todas las claves usan notación con puntos', () => {
    for (const key of allKeys) {
      assert.ok(
        key.includes('.'),
        `"${key}" debería usar namespace (ej: common.yes)`
      );
    }
  });

  it('todas las claves son minúsculas con puntos', () => {
    for (const key of allKeys) {
      // Permitimos camelCase dentro de segmentos
      assert.ok(
        /^[a-zA-Z]+(\.[a-zA-Z0-9]+)*$/.test(key),
        `"${key}" tiene formato inválido`
      );
    }
  });
});
