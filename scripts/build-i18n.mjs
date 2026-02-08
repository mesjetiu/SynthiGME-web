#!/usr/bin/env node
/**
 * Script de generación de archivos de idioma
 * 
 * Lee translations.yaml y genera los archivos locales/*.js
 * 
 * Uso: npm run build:i18n
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// yaml es una dependencia externa, pero podemos usar una versión simple inline
// o añadir la dependencia. Usamos un parser YAML minimalista:

/**
 * Parser YAML minimalista para nuestro formato específico
 * Soporta: comentarios (#), claves anidadas, strings con/sin comillas
 */
function parseYaml(text) {
  const result = {};
  let currentKey = null;
  let inMeta = false;
  let metaIndent = 0;
  
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Ignorar vacías y comentarios
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Detectar indentación
    const indent = line.search(/\S/);
    
    // Detectar _meta:
    if (trimmed === '_meta:') {
      inMeta = true;
      metaIndent = indent;
      result._meta = {};
      continue;
    }
    
    // Dentro de _meta
    if (inMeta) {
      if (indent <= metaIndent && !trimmed.startsWith(' ')) {
        inMeta = false;
      } else {
        // Parsear contenido de _meta
        if (trimmed === 'languages:') {
          result._meta.languages = {};
          continue;
        }
        if (trimmed.startsWith('defaultLocale:')) {
          result._meta.defaultLocale = trimmed.split(':')[1].trim();
          continue;
        }
        // Idiomas dentro de languages
        const langMatch = trimmed.match(/^(\w+):\s*(.+)$/);
        if (langMatch && result._meta.languages) {
          let langName = langMatch[2].trim();
          // Quitar comillas YAML si las tiene
          if ((langName.startsWith('"') && langName.endsWith('"')) ||
              (langName.startsWith("'") && langName.endsWith("'"))) {
            langName = langName.slice(1, -1);
          }
          result._meta.languages[langMatch[1]] = langName;
        }
        continue;
      }
    }
    
    // Clave de traducción (sin indentación o con indentación 0)
    if (indent === 0 && trimmed.endsWith(':') && !trimmed.includes(' ')) {
      currentKey = trimmed.slice(0, -1);
      result[currentKey] = {};
      continue;
    }
    
    // Valor de idioma (con indentación)
    if (currentKey && indent > 0) {
      const match = trimmed.match(/^(\w+):\s*(.*)$/);
      if (match) {
        let value = match[2];
        // Quitar comillas si las tiene
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        result[currentKey][match[1]] = value;
      }
    }
  }
  
  return result;
}

// Rutas
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const YAML_PATH = join(ROOT, 'src/assets/js/i18n/translations.yaml');
const LOCALES_DIR = join(ROOT, 'src/assets/js/i18n/locales');

// Leer y parsear YAML
console.log('📖 Leyendo translations.yaml...');
const yamlContent = readFileSync(YAML_PATH, 'utf8');
const translations = parseYaml(yamlContent);

// Extraer metadatos
const meta = translations._meta || {};
const defaultLocale = meta.defaultLocale || 'es';
const languageNames = meta.languages || {};
delete translations._meta;

// Obtener lista de idiomas
const languages = Object.keys(languageNames);
if (languages.length === 0) {
  console.error('❌ No se encontraron idiomas en _meta.languages');
  process.exit(1);
}

console.log(`🌍 Idiomas encontrados: ${languages.join(', ')}`);

// Asegurar que existe el directorio
mkdirSync(LOCALES_DIR, { recursive: true });

// Generar archivo por idioma
for (const lang of languages) {
  const locale = {};
  let missing = 0;
  
  // Añadir nombres de idiomas (settings.language.xx)
  for (const [code, name] of Object.entries(languageNames)) {
    locale[`settings.language.${code}`] = name;
  }
  
  // Procesar todas las traducciones
  for (const [key, values] of Object.entries(translations)) {
    if (values[lang]) {
      locale[key] = values[lang];
    } else if (values[defaultLocale]) {
      // Fallback al idioma por defecto
      locale[key] = values[defaultLocale];
      missing++;
    } else {
      // Sin traducción
      locale[key] = `[${key}]`;
      missing++;
    }
  }
  
  // Generar código JS
  const code = `// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-GENERATED from translations.yaml — DO NOT EDIT MANUALLY
// Run: npm run build:i18n
// ═══════════════════════════════════════════════════════════════════════════════

export default ${JSON.stringify(locale, null, 2)};
`;
  
  const filePath = join(LOCALES_DIR, `${lang}.js`);
  writeFileSync(filePath, code, 'utf8');
  
  const status = missing > 0 ? ` (${missing} traducciones faltantes)` : '';
  console.log(`  ✓ ${lang}.js${status}`);
}

// Generar archivo de metadatos para el sistema i18n
const metaCode = `// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-GENERATED from translations.yaml — DO NOT EDIT MANUALLY
// Run: npm run build:i18n
// ═══════════════════════════════════════════════════════════════════════════════

export const SUPPORTED_LOCALES = ${JSON.stringify(languages)};
export const DEFAULT_LOCALE = ${JSON.stringify(defaultLocale)};
export const LANGUAGE_NAMES = ${JSON.stringify(languageNames, null, 2)};
`;

writeFileSync(join(LOCALES_DIR, '_meta.js'), metaCode, 'utf8');
console.log('  ✓ _meta.js');

console.log('\n✅ Traducciones generadas correctamente');
