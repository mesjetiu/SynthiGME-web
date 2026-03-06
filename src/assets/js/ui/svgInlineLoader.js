/**
 * Utilidad para cargar SVGs inline con IDs únicos por instancia.
 * 
 * Cuando un mismo SVG se inserta múltiples veces en el DOM, los IDs
 * internos (gradientes, defs, use href) colisionan. Este módulo:
 * 1. Cachea el texto SVG descargado
 * 2. Prefixa todos los IDs con un contador único por instancia
 * 3. Actualiza las referencias internas (href, url(#...))
 * 
 * @module ui/svgInlineLoader
 */

/** Caché de SVG: ruta → texto descargado */
const svgTextCache = new Map();

/** Promesas de fetch en curso: ruta → Promise<string> */
const fetchPromises = new Map();

/** Contador global para prefijar IDs de cada instancia */
let instanceCounter = 0;

/**
 * Reasigna IDs y referencias internas dentro de un subárbol SVG ya insertado en el DOM.
 * Útil al clonar controles con SVG inline para evitar colisiones con la instancia original.
 *
 * @param {Element} root - Nodo raíz que contiene uno o varios SVG inline
 * @returns {Element|null} El mismo nodo recibido
 */
export function uniquifySvgTree(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return root;

  const svgRoots = [];
  if (root instanceof SVGElement) {
    svgRoots.push(root);
  }
  svgRoots.push(...root.querySelectorAll('svg'));

  for (const svg of svgRoots) {
    const prefix = `k${instanceCounter++}_`;
    const idMap = new Map();

    svg.querySelectorAll('[id]').forEach(node => {
      const oldId = node.getAttribute('id');
      if (!oldId) return;
      const newId = `${prefix}${oldId}`;
      idMap.set(oldId, newId);
      node.setAttribute('id', newId);
    });

    if (idMap.size === 0) continue;

    const rewriteValue = (value) => {
      if (!value) return value;

      let nextValue = value;
      for (const [oldId, newId] of idMap) {
        if (nextValue === `#${oldId}`) {
          nextValue = `#${newId}`;
          continue;
        }
        nextValue = nextValue.replaceAll(`url(#${oldId})`, `url(#${newId})`);
        nextValue = nextValue.replaceAll(`href="#${oldId}"`, `href="#${newId}"`);
      }
      return nextValue;
    };

    svg.querySelectorAll('*').forEach(node => {
      for (const attr of node.getAttributeNames()) {
        const value = node.getAttribute(attr);
        const rewritten = rewriteValue(value);
        if (rewritten !== value) {
          node.setAttribute(attr, rewritten);
        }
      }
    });
  }

  return root;
}

/**
 * Descarga y cachea el texto de un SVG.
 * @param {string} src - Ruta al SVG
 * @returns {Promise<string>} Texto SVG
 */
export async function fetchSvgText(src) {
  if (svgTextCache.has(src)) return svgTextCache.get(src);
  if (!fetchPromises.has(src)) {
    fetchPromises.set(src,
      fetch(src)
        .then(r => r.text())
        .then(text => {
          svgTextCache.set(src, text);
          fetchPromises.delete(src);
          return text;
        })
        .catch(err => {
          fetchPromises.delete(src);
          throw err;
        })
    );
  }
  return fetchPromises.get(src);
}

/**
 * Prefixa todos los IDs internos de un SVG para hacerlos únicos.
 * Actualiza también las referencias href="#id" y url(#id).
 * 
 * @param {string} svgText - Texto SVG original
 * @returns {{ html: string, prefix: string }} SVG con IDs únicos y el prefijo usado
 */
export function makeIdsUnique(svgText) {
  const prefix = `k${instanceCounter++}_`;
  const html = svgText
    .replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`)
    .replace(/\bhref="#([^"]+)"/g, `href="#${prefix}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`);
  return { html, prefix };
}

/**
 * Carga un SVG inline en un contenedor con IDs únicos.
 * Si la carga falla (ej: en entorno de tests sin servidor), retorna svg=null.
 * 
 * @param {string} src - Ruta al SVG
 * @param {HTMLElement} container - Elemento donde insertar el SVG
 * @returns {Promise<{ svg: SVGElement|null, prefix: string }>} El SVG insertado y su prefijo
 */
export async function loadSvgInline(src, container) {
  try {
    const text = await fetchSvgText(src);
    const { html, prefix } = makeIdsUnique(text);
    container.innerHTML = html;
    const svg = container.querySelector('svg');
    if (container?.dispatchEvent) {
      container.dispatchEvent(new CustomEvent('synth:svgInlineLoaded', {
        bubbles: true,
        detail: { src, prefix, svg, container }
      }));
    }
    return { svg, prefix };
  } catch {
    return { svg: null, prefix: '' };
  }
}
