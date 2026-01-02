/**
 * Sistema de internacionalización (i18n) ligero
 * 
 * Carga dinámica de locales, función t() para traducir,
 * y detección automática del idioma del navegador.
 * 
 * Los archivos de locale se generan desde translations.yaml
 * con: npm run build:i18n
 */

import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from './locales/_meta.js';

const STORAGE_KEY = 'synthigme-language';

/** Cache de traducciones cargadas */
const locales = {};

/** Idioma actual */
let currentLocale = DEFAULT_LOCALE;

/** Callbacks para notificar cambios de idioma */
const changeListeners = [];

/**
 * Detecta el idioma preferido del navegador
 * @returns {string} Código de idioma soportado
 */
function detectBrowserLocale() {
  const browserLang = navigator.language?.split('-')[0] || DEFAULT_LOCALE;
  return SUPPORTED_LOCALES.includes(browserLang) ? browserLang : DEFAULT_LOCALE;
}

/**
 * Inicializa el sistema i18n
 * Carga el idioma guardado o detecta del navegador
 */
export async function initI18n() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const locale = saved && SUPPORTED_LOCALES.includes(saved) 
    ? saved 
    : detectBrowserLocale();
  
  await loadLocale(locale);
  return locale;
}

/**
 * Carga un archivo de locale
 * @param {string} lang - Código de idioma (es, en)
 */
export async function loadLocale(lang) {
  if (!SUPPORTED_LOCALES.includes(lang)) {
    console.warn(`[i18n] Idioma no soportado: ${lang}, usando ${DEFAULT_LOCALE}`);
    lang = DEFAULT_LOCALE;
  }
  
  if (!locales[lang]) {
    try {
      const module = await import(`./locales/${lang}.js`);
      locales[lang] = module.default;
    } catch (err) {
      console.error(`[i18n] Error cargando locale ${lang}:`, err);
      if (lang !== DEFAULT_LOCALE) {
        return loadLocale(DEFAULT_LOCALE);
      }
      locales[lang] = {};
    }
  }
  
  currentLocale = lang;
  document.documentElement.lang = lang;
}

/**
 * Cambia el idioma actual
 * @param {string} lang - Código de idioma
 * @param {boolean} persist - Guardar en localStorage (default: true)
 */
export async function setLocale(lang, persist = true) {
  if (lang === currentLocale) return;
  
  await loadLocale(lang);
  
  if (persist) {
    localStorage.setItem(STORAGE_KEY, lang);
  }
  
  // Notificar a los listeners
  changeListeners.forEach(fn => {
    try { fn(lang); } catch (e) { console.error('[i18n] Error en listener:', e); }
  });
}

/**
 * Obtiene el idioma actual
 * @returns {string}
 */
export function getLocale() {
  return currentLocale;
}

/**
 * Obtiene la lista de idiomas soportados
 * @returns {string[]}
 */
export function getSupportedLocales() {
  return [...SUPPORTED_LOCALES];
}

/**
 * Traduce una clave al idioma actual
 * @param {string} key - Clave de traducción (ej: 'settings.title')
 * @param {Object} params - Parámetros para interpolación
 * @returns {string} Texto traducido o la clave si no existe
 */
export function t(key, params = {}) {
  const translations = locales[currentLocale] || {};
  let value = translations[key];
  
  // Fallback al idioma por defecto
  if (value === undefined && currentLocale !== DEFAULT_LOCALE) {
    value = locales[DEFAULT_LOCALE]?.[key];
  }
  
  // Si no existe, devolver la clave
  if (value === undefined) {
    console.warn(`[i18n] Clave no encontrada: ${key}`);
    return key;
  }
  
  // Interpolación de parámetros: {nombre} → valor
  if (params && typeof value === 'string') {
    value = value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
  }
  
  return value;
}

/**
 * Registra un listener para cambios de idioma
 * @param {Function} fn - Callback(lang)
 * @returns {Function} Función para eliminar el listener
 */
export function onLocaleChange(fn) {
  changeListeners.push(fn);
  return () => {
    const idx = changeListeners.indexOf(fn);
    if (idx >= 0) changeListeners.splice(idx, 1);
  };
}
