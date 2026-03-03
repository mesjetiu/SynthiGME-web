// ═══════════════════════════════════════════════════════════════════════════
// RotarySwitch - Selector rotativo de 2 posiciones (SVG)
// ═══════════════════════════════════════════════════════════════════════════
//
// Selector de dos estados con aspecto de interruptor rotativo pequeño.
// Basado en el hardware original EMS Synthi 100 (ej: Retrigger Key Release).
// Usa el SVG rotary-switch.svg con rotación del grupo #rotary-switch-knob.
//
// Estado 'a' → knob rotado a -45° (apunta hacia label izquierdo)
// Estado 'b' → knob rotado a +45° (apunta hacia label derecho)
//
// ═══════════════════════════════════════════════════════════════════════════

import { flashGlow } from './glowManager.js';
import { loadSvgInline } from './svgInlineLoader.js';

/** Ángulo de rotación para cada estado (grados). */
const ANGLE_A = -45;
const ANGLE_B = 45;

/** Centro del SVG (transform-origin). */
const CX = 100;
const CY = 100;

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
    this.state = options.initial || 'a';
    this.onChange = options.onChange || null;
    this.element = null;
    /** @private */ this._knobGroup = null;
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
    this._render();

    // Cargar SVG inline del selector rotativo
    const svgContainer = root.querySelector('.rotary-switch__svg-container');
    loadSvgInline('assets/knobs/rotary-switch.svg', svgContainer).then(({ svg, prefix }) => {
      if (svg) {
        this._svgPrefix = prefix;
        this._knobGroup = svg.getElementById(`${prefix}rotary-switch-knob`);
        this._updateRotation();
      }
    });

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
    this._updateRotation();
  }

  /**
   * Actualiza la rotación del grupo SVG del knob.
   * @private
   */
  _updateRotation() {
    if (!this._knobGroup) return;
    const angle = this.state === 'a' ? ANGLE_A : ANGLE_B;
    this._knobGroup.setAttribute('transform', `rotate(${angle} ${CX} ${CY})`);
  }
}
