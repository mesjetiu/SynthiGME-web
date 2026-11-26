/**
 * Dial de cámara lenta: el Clock Rate del secuenciador (panel 7).
 *
 * En el Synthi 100 el Clock Rate no es un vernier Spectrol (esfera con
 * ventana de vueltas) sino un «slow-motion potentiometer»: faldón cromado
 * cónico, escala negra con las cifras 0–9 y cien rayitas, capuchón de
 * aluminio en el centro e índice blanco arriba. La cifra que queda bajo el
 * índice es la lectura; una vuelta de la escala es todo el recorrido (0 = 10).
 *
 * Tres imágenes apiladas (las genera design/panels/Panel7/generar_mandos.py):
 * faldón e índice (fijo), escala (gira con el valor) y capuchón (fijo). Solo
 * la escala rota, por CSS transform (compositor, sin repintar).
 *
 * Usa el contenedor `.vernier-svg-container` y la clase `.knob--vernier` para
 * heredar del vernier el estilo de mando de precisión (modo PiP, knob-style-css).
 * Medidas y criterio en module_research/panel7/mandos.md.
 *
 * @module ui/slowMotionDial
 */

import { Knob } from './knob.js';

export const SLOW_MOTION_DIAL_LAYERS = {
  faldon: 'assets/panels/panel7_dial_faldon.svg',
  escala: 'assets/panels/panel7_dial_escala.svg',
  capuchon: 'assets/panels/panel7_dial_capuchon.svg'
};

/** Grados que gira la escala de un extremo a otro del recorrido */
export const SLOW_MOTION_DIAL_SWEEP = 360;

function layer(src, className) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.loading = 'eager';
  img.className = `slow-motion-dial__layer ${className}`;
  img.setAttribute('aria-hidden', 'true');
  return img;
}

/**
 * Crea el DOM del dial.
 * @param {Object} [options]
 * @param {boolean} [options.showValue=false]
 * @returns {{ wrapper: HTMLElement, knobEl: HTMLElement, svgContainer: HTMLElement, valueEl?: HTMLElement }}
 */
export function createSlowMotionDialElements(options = {}) {
  const { showValue = false } = options;

  const wrapper = document.createElement('div');
  wrapper.className = 'knob-wrapper knob-wrapper--vernier knob-wrapper--slow-motion';

  const knobEl = document.createElement('div');
  knobEl.className = 'knob knob--vernier knob--slow-motion';

  const svgContainer = document.createElement('div');
  svgContainer.className = 'vernier-svg-container';
  svgContainer.appendChild(layer(SLOW_MOTION_DIAL_LAYERS.faldon, 'slow-motion-dial__faldon'));
  svgContainer.appendChild(layer(SLOW_MOTION_DIAL_LAYERS.escala, 'slow-motion-dial__escala'));
  svgContainer.appendChild(layer(SLOW_MOTION_DIAL_LAYERS.capuchon, 'slow-motion-dial__capuchon'));

  knobEl.appendChild(svgContainer);
  wrapper.appendChild(knobEl);

  const result = { wrapper, knobEl, svgContainer };
  if (showValue) {
    const valueEl = document.createElement('div');
    valueEl.className = 'knob-value';
    wrapper.appendChild(valueEl);
    result.valueEl = valueEl;
  }
  return result;
}

/**
 * Hereda de Knob toda la interacción (arrastre, precisión, tooltips,
 * serialización); solo cambia lo que se ve: la escala gira 0°–360°.
 * @extends Knob
 */
export class SlowMotionDial extends Knob {
  constructor(rootEl, options = {}) {
    // Knob busca .knob-inner: uno temporal, como en VernierKnob
    const tempInner = document.createElement('div');
    tempInner.className = 'knob-inner';
    tempInner.style.display = 'none';
    rootEl.appendChild(tempInner);

    super(rootEl, options);

    this.minAngle = 0;
    this.maxAngle = SLOW_MOTION_DIAL_SWEEP;
    /** @type {HTMLImageElement|null} */
    this._scaleImg = rootEl.querySelector('.slow-motion-dial__escala');
    this._lastFormattedValue = '';

    tempInner.remove();
    this._updateVisual();
  }

  /** Ángulo de la escala para el valor actual (0 abajo del recorrido, 360 arriba). */
  _scaleAngle() {
    const t = (this.value - this.min) / (this.max - this.min);
    return t * SLOW_MOTION_DIAL_SWEEP;
  }

  _updateVisualFast() {
    if (this._scaleImg) {
      this._scaleImg.style.transform = `rotate(${this._scaleAngle()}deg)`;
    }
    if (this.valueEl) {
      const formatted = this._formatScaleValue();
      if (formatted !== this._lastFormattedValue) {
        this.valueEl.textContent = formatted;
        this._lastFormattedValue = formatted;
      }
    }
    if (this.modBadge && this.modBadge.classList.contains('is-active')) {
      this._positionModifierBadge();
    }
  }

  _updateVisual() {
    this._updateVisualFast();
  }

  _getRotatingEl() {
    return this._scaleImg;
  }
}
