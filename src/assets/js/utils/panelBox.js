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
//
// Cada eje va en left/top o en translate según quepa o no en la rejilla del
// navegador (medido en el panel 3, ver HOJA-DE-RUTA.md):
// - El layout redondea a 1/64 px. Una coordenada como 224,9 en top quedaría
//   en 224,89 y las imágenes de los mandos se remuestrearían distinto (94.000
//   píxeles cambiados). Esas van en translate, que no se redondea.
// - Una coordenada exacta en 1/64 px (enteros, ,5…) va en left/top: con
//   ,5 en translate la imagen del mando se remuestrea a medio píxel, y en
//   left/top el navegador la ajusta a píxel entero, como siempre se ha
//   pintado.
// Por eso el elemento con caja no debe usar transform para otra cosa.

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
  const p = boxPlacement(box);
  return `position: absolute; left: ${p.left}px; top: ${p.top}px; ` +
    `width: ${box.w}px; height: ${box.h}px; box-sizing: border-box;` +
    (p.transform ? ` transform: ${p.transform};` : '');
}

/** ¿Cabe v exacto en la rejilla de layout del navegador (1/64 px)? */
const onLayoutGrid = v => Number.isInteger(v * 64);

/**
 * Reparte la posición de la caja entre left/top y translate, eje a eje
 * (ver la cabecera del fichero).
 * @param {{x:number,y:number}} box
 * @returns {{left:number, top:number, transform:string}} transform '' si no hace falta
 */
export function boxPlacement(box) {
  const left = onLayoutGrid(box.x) ? box.x : 0;
  const top = onLayoutGrid(box.y) ? box.y : 0;
  const tx = box.x - left, ty = box.y - top;
  return { left, top, transform: tx || ty ? `translate(${tx}px, ${ty}px)` : '' };
}

/**
 * Coloca un elemento en su caja (sin borrar el resto de su estilo inline).
 * @param {HTMLElement} el
 * @param {{x:number,y:number,w:number,h:number}} box
 */
export function applyBox(el, box) {
  const p = boxPlacement(box);
  el.style.position = 'absolute';
  el.style.left = `${p.left}px`;
  el.style.top = `${p.top}px`;
  el.style.width = `${box.w}px`;
  el.style.height = `${box.h}px`;
  el.style.boxSizing = 'border-box';
  if (p.transform) el.style.transform = p.transform;
}

// ─── Mandos por su centro, dentro de la caja de su módulo ──────────────────
//
// Cada mando se describe por su centro { x, y } en px relativos a la caja
// del módulo (lo que se mide sobre la foto: el eje del mando y el centro de
// su escala, que están en el plano del panel). Los mandos van en una capa
// que cubre la caja entera: el marco tiene 1 px de borde, de ahí el inset
// de −1 px, para que (0, 0) sea la esquina de la caja y no la del contenido.

/**
 * Capa absoluta que cubre la caja del módulo, para colgar los mandos.
 * @param {string} className
 * @returns {HTMLElement}
 */
export function createControlsLayer(className) {
  const layer = document.createElement('div');
  layer.className = className;
  layer.style.cssText = 'position: absolute; inset: -1px;';
  return layer;
}

/**
 * Coloca un elemento de size × size px con su centro en center.
 * Lanza un error si falta el centro (mejor romper al cargar que colocar a ciegas).
 * @param {HTMLElement} el
 * @param {{x:number,y:number}} center  px relativos a la caja del módulo
 * @param {number} size
 * @param {string} name  mando, para el mensaje de error
 */
export function placeAtCenter(el, center, size, name) {
  if (!Number.isFinite(center?.x) || !Number.isFinite(center?.y)) {
    throw new Error(`[panelBox] ${name}: falta el centro { x, y } del mando: ${JSON.stringify(center)}`);
  }
  el.style.position = 'absolute';
  el.style.left = `${center.x - size / 2}px`;
  el.style.top = `${center.y - size / 2}px`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.minWidth = '0';
  el.style.flex = 'none';
}
