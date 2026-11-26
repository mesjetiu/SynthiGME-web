// ═══════════════════════════════════════════════════════════════════════════
// Panel 7: geometría de los mandos colocados en px del panel
// ═══════════════════════════════════════════════════════════════════════════
//
// Cuentas puras (sin DOM) para poner los mandos del panel 7 donde están en
// la foto; las medidas vienen de panel7.blueprint.js y su origen está en
// module_research/panel7/mandos.md.

/**
 * Sitio del fader de nivel de un canal del panel 7, como custom properties
 * del canal (px relativos a su caja; el CSS descuenta el borde del marco).
 *
 * El <input type=range> mide el recorrido más el alto del asa: así el
 * navegador lleva el canto de arriba del asa (su índice) de la raya del 10
 * (valor máximo, arriba) a la del 0, centrada en el eje del canal.
 *
 * @param {{scaleTop:number, scaleBottom:number, capWidth:number, capHeight:number}} fader
 *   medidas en px del panel (panel7.blueprint.js → outputChannelUI.fader)
 * @param {{x:number, y:number, w:number, h:number}} box caja del canal
 * @returns {Object<string,string>}
 */
export function faderVars(fader, box) {
  const capW = Number(fader.capWidth);
  const capH = Number(fader.capHeight);
  const top = Number(fader.scaleTop);
  const bottom = Number(fader.scaleBottom);
  if (![capW, capH, top, bottom].every(Number.isFinite) || !(bottom > top)) {
    throw new Error('panel 7: outputChannelUI.fader necesita scaleTop < scaleBottom, capWidth y capHeight');
  }
  const px = (v) => `${Math.round(v * 1000) / 1000}px`;
  return {
    '--oc-fader-left': px(box.w / 2 - capW / 2),
    '--oc-fader-top': px(top - box.y),
    '--oc-fader-length': px(bottom - top + capH),
    '--oc-fader-cap-w': px(capW),
    '--oc-fader-cap-h': px(capH)
  };
}

/**
 * Centro vertical del asa en pantalla. El navegador mueve el «thumb» de un
 * range vertical sin que se salga del input: a ratio 0 su borde de abajo toca
 * el del input y a ratio 1, el de arriba.
 * @param {{top:number, bottom:number, height:number}} rect rect del input en pantalla
 * @param {number} cssHeight alto del input en px CSS (offsetHeight)
 * @param {number} capHeight alto del asa en px CSS
 * @param {number} ratio 0 (mínimo, abajo) … 1 (máximo, arriba)
 */
export function faderThumbCenterY(rect, cssHeight, capHeight, ratio) {
  const scale = cssHeight > 0 ? rect.height / cssHeight : 1;
  const cap = Math.min(capHeight * scale, rect.height);
  return rect.bottom - cap / 2 - ratio * (rect.height - cap);
}

/**
 * Sitio de cada mando del secuenciador, en px del panel: una caja
 * { x, y, w, h } por interruptor, por tecla y para el dial Clock Rate.
 *
 * Interruptores y teclas van en las columnas del secuenciador (las del
 * fondo: x = x0 + step·i), centrados en su eje. Los interruptores se colocan
 * por el centro de la tuerca; las teclas, por su canto de arriba; el dial,
 * por su centro. switchOffsets/buttonOffsets, si los hay, son retoques
 * finos por mando.
 *
 * @param {Object} seq  panel7.blueprint.js → layout.sequencer
 * @returns {{switches: Object[], keys: Object[], clockRate: Object}}
 */
export function sequencerPlacement(seq) {
  const { columns, switchRow, keyRow, clockRate } = seq;
  const need = (v, name) => {
    if (!Number.isFinite(v)) throw new Error(`panel 7: falta sequencer.${name}`);
    return v;
  };
  const x0 = need(columns?.x0, 'columns.x0');
  const step = need(columns?.step, 'columns.step');
  const off = (list, i) => ({ x: Number(list?.[i]?.x) || 0, y: Number(list?.[i]?.y) || 0 });
  const col = (i) => x0 + step * i;
  const sw = { y: need(switchRow?.y, 'switchRow.y'), w: need(switchRow?.width, 'switchRow.width'), h: need(switchRow?.height, 'switchRow.height') };
  const key = { top: need(keyRow?.top, 'keyRow.top'), w: need(keyRow?.width, 'keyRow.width'), h: need(keyRow?.height, 'keyRow.height') };
  const size = need(clockRate?.size, 'clockRate.size');
  return {
    switches: seq.switches.map((_, i) => {
      const o = off(seq.switchOffsets, i);
      return { x: col(i) - sw.w / 2 + o.x, y: sw.y - sw.h / 2 + o.y, w: sw.w, h: sw.h };
    }),
    keys: seq.buttons.map((_, i) => {
      const o = off(seq.buttonOffsets, i);
      return { x: col(i) - key.w / 2 + o.x, y: key.top + o.y, w: key.w, h: key.h };
    }),
    clockRate: {
      x: need(clockRate.cx, 'clockRate.cx') - size / 2,
      y: need(clockRate.cy, 'clockRate.cy') - size / 2,
      w: size,
      h: size
    }
  };
}

/**
 * Pone un mando en su caja del panel (px del panel) dentro de un módulo cuya
 * caja es `box`, como custom properties que usa la clase .p7-placed (el CSS
 * descuenta el borde del marco del módulo).
 * @param {HTMLElement} el
 * @param {{x:number,y:number,w:number,h:number}} rect caja del mando, px del panel
 * @param {{x:number,y:number}} box caja del módulo, px del panel
 */
export function placeInModule(el, rect, box) {
  const px = (v) => `${Math.round(v * 1000) / 1000}px`;
  el.classList.add('p7-placed');
  el.style.setProperty('--p7-x', px(rect.x - box.x));
  el.style.setProperty('--p7-y', px(rect.y - box.y));
  el.style.setProperty('--p7-w', px(rect.w));
  el.style.setProperty('--p7-h', px(rect.h));
}
