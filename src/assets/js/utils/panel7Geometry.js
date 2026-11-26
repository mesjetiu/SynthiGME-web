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
