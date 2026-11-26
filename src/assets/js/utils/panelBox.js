// ═══════════════════════════════════════════════════════════════════════════
// Cajas absolutas sobre la imagen del panel
// ═══════════════════════════════════════════════════════════════════════════
//
// Modelo único de coordenadas de los paneles (ver REVISION-VISUAL-2026-09.md):
// cada módulo se coloca con una caja { x, y, w, h } en px del panel, que mide
// 760×760 y lleva la imagen de fondo estirada al 100 %. Así 1 px de caja es
// 1/760 de la imagen, y mover un módulo no mueve ningún otro: nada depende de
// flujo, centrado, márgenes ni del alto de otro módulo.
//
// La caja se aplica con position:absolute respecto al contenedor de layout
// del panel, que ocupa el panel entero (0, 0, 760, 760).

export const PANEL_SIZE = 760;

const KEYS = ['x', 'y', 'w', 'h'];

/**
 * ¿Es una caja válida? Cuatro números finitos, ancho y alto positivos.
 * @param {*} box
 * @returns {boolean}
 */
export function isBox(box) {
  if (!box || typeof box !== 'object') return false;
  if (!KEYS.every(k => typeof box[k] === 'number' && Number.isFinite(box[k]))) return false;
  return box.w > 0 && box.h > 0;
}

/**
 * Comprueba la caja y la devuelve; lanza un error con el nombre del módulo
 * si falta o está mal escrita (mejor romper al cargar que colocar a ciegas).
 * @param {*} box
 * @param {string} name  módulo, para el mensaje de error
 * @returns {{x:number,y:number,w:number,h:number}}
 */
export function requireBox(box, name) {
  if (!isBox(box)) {
    throw new Error(`[panelBox] ${name}: caja { x, y, w, h } ausente o inválida: ${JSON.stringify(box)}`);
  }
  return box;
}

/**
 * Declaraciones CSS de la caja, para concatenar a un cssText.
 * @param {{x:number,y:number,w:number,h:number}} box
 * @returns {string}
 */
export function boxCss(box) {
  return `position: absolute; left: ${box.x}px; top: ${box.y}px; ` +
    `width: ${box.w}px; height: ${box.h}px; box-sizing: border-box;`;
}

/**
 * Coloca un elemento en su caja (sin borrar el resto de su estilo inline).
 * @param {HTMLElement} el
 * @param {{x:number,y:number,w:number,h:number}} box
 */
export function applyBox(el, box) {
  el.style.position = 'absolute';
  el.style.left = `${box.x}px`;
  el.style.top = `${box.y}px`;
  el.style.width = `${box.w}px`;
  el.style.height = `${box.h}px`;
  el.style.boxSizing = 'border-box';
}
