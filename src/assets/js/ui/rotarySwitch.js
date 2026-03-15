// ═══════════════════════════════════════════════════════════════════════════
// RotarySwitch - Selector rotativo de 2 posiciones (imágenes PNG)
// ═══════════════════════════════════════════════════════════════════════════
//
// Selector de dos estados con aspecto de interruptor rotativo pequeño.
// Basado en el hardware original EMS Synthi 100 (ej: Retrigger Key Release).
// Usa imágenes PNG pre-rasterizadas en vez de SVG inline.
//
// Estado 'a' → knob rotado a -45° (apunta hacia label izquierdo) — rotary-a.png
// Estado 'b' → knob rotado a +45° (apunta hacia label derecho) — rotary-b.png
//
// ═══════════════════════════════════════════════════════════════════════════

import { flashGlow } from './glowManager.js';
import { attachControlTooltip } from './tooltipManager.js';

/** Imágenes raster del selector en sus dos estados */
const ROTARY_IMG_A = 'assets/knobs/rotary-a.png';
const ROTARY_IMG_B = 'assets/knobs/rotary-b.png';

export class RotarySwitch {
  /**
   * @param {Object} options
   * @param {string} options.id - ID único
   * @param {string} options.labelA - Label del estado A (izquierda)
   * @param {string} options.labelB - Label del estado B (derecha)
   * @param {string} [options.initial='a'] - Estado inicial ('a' o 'b')
   * @param {Function} [options.onChange] - Callback cuando cambia el estado
   */
  constructor(options = {}) {
    this.id = options.id || `rotary-switch-${Date.now()}`;
    this.labelA = options.labelA || 'A';
    this.labelB = options.labelB || 'B';
    this.name = options.name || '';
    this.state = options.initial || 'a';
    this.onChange = options.onChange || null;
    this.element = null;
    /** @type {HTMLImageElement|null} @private */
    this._switchImg = null;
    /** @type {{ update: (content: string) => void }|null} @private */
    this._tooltip = null;
  }

  /**
   * Crea el elemento DOM del selector rotativo.
   * @returns {HTMLElement}
   */
  createElement() {
    const root = document.createElement('div');
    root.className = 'rotary-switch';
    root.id = this.id;

    root.innerHTML = `
      <span class="rotary-switch__label rotary-switch__label-a">${this.labelA}</span>
      <div class="rotary-switch__body">
        <div class="rotary-switch__svg-container"></div>
      </div>
      <span class="rotary-switch__label rotary-switch__label-b">${this.labelB}</span>
    `;

    root.addEventListener('click', () => this.toggle());

    this.element = root;

    // Crear imagen raster del selector rotativo
    const svgContainer = root.querySelector('.rotary-switch__svg-container');
    const img = document.createElement('img');
    img.src = this.state === 'b' ? ROTARY_IMG_B : ROTARY_IMG_A;
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.loading = 'eager';
    img.className = 'rotary-raster-graphic';
    img.setAttribute('aria-hidden', 'true');
    svgContainer.replaceChildren(img);
    this._switchImg = img;

    this._render();

    return root;
  }

  /**
   * Alterna el estado.
   * @returns {string} El nuevo estado
   */
  toggle() {
    this.state = this.state === 'a' ? 'b' : 'a';
    this._render();
    if (this.onChange) {
      this.onChange(this.state, this.state === 'a' ? this.labelA : this.labelB);
    }
    flashGlow(this.element);
    document.dispatchEvent(new CustomEvent('synth:userInteraction'));
    return this.state;
  }

  /**
   * Establece el estado.
   * @param {string} state - 'a' o 'b'
   */
  setState(state) {
    if ((state === 'a' || state === 'b') && state !== this.state) {
      this.state = state;
      this._render();
      flashGlow(this.element);
    }
  }

  /**
   * Obtiene el estado actual.
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  /**
   * Obtiene el label del estado actual.
   * @returns {string}
   */
  getLabel() {
    return this.state === 'a' ? this.labelA : this.labelB;
  }

  /** @private */
  _render() {
    if (!this.element) return;
    this.element.classList.toggle('is-b', this.state === 'b');
    this.element.setAttribute('data-state', this.state);
    this._updateImage();
    const currentLabel = this.state === 'a' ? this.labelA : this.labelB;
    const tooltipText = this.name
      ? `${this.name}: ${currentLabel}`
      : currentLabel;
    if (this._tooltip) {
      this._tooltip.update(tooltipText);
    } else {
      this._tooltip = attachControlTooltip(this.element, tooltipText);
    }
  }

  /**
   * Actualiza la imagen del selector rotativo según el estado.
   * @private
   */
  _updateImage() {
    if (!this._switchImg) return;
    this._switchImg.src = this.state === 'b' ? ROTARY_IMG_B : ROTARY_IMG_A;
  }
}
