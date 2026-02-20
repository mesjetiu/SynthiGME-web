// ═══════════════════════════════════════════════════════════════════════════
// Toggle - Switch de dos estados reutilizable
// ═══════════════════════════════════════════════════════════════════════════
//
// Toggle visual tipo switch para alternar entre dos modos/estados.
// Usa la clase CSS .synth-toggle para estilos.
//
// ═══════════════════════════════════════════════════════════════════════════

import { flashGlow } from './glowManager.js';

export class Toggle {
  /**
   * @param {Object} options
   * @param {string} options.id - ID único
   * @param {string} options.labelA - Label del estado A (izquierda)
   * @param {string} options.labelB - Label del estado B (derecha)
   * @param {string} [options.initial='a'] - Estado inicial ('a' o 'b')
   * @param {Function} [options.onChange] - Callback cuando cambia el estado
   */
  constructor(options = {}) {
    this.id = options.id || `toggle-${Date.now()}`;
    this.labelA = options.labelA || 'A';
    this.labelB = options.labelB || 'B';
    this.state = options.initial || 'a';
    this.onChange = options.onChange || null;
    this.element = null;
  }

  /**
   * Crea el elemento DOM del toggle
   * @returns {HTMLElement}
   */
  createElement() {
    const root = document.createElement('div');
    root.className = 'synth-toggle';
    root.id = this.id;
    
    root.innerHTML = `
      <span class="synth-toggle__label synth-toggle__label-a">${this.labelA}</span>
      <div class="synth-toggle__track">
        <div class="synth-toggle__thumb"></div>
      </div>
      <span class="synth-toggle__label synth-toggle__label-b">${this.labelB}</span>
    `;
    
    root.addEventListener('click', () => this.toggle());
    
    this.element = root;
    this._render();
    return root;
  }

  /**
   * Alterna el estado
   * @returns {string} El nuevo estado
   */
  toggle() {
    this.state = this.state === 'a' ? 'b' : 'a';
    this._render();
    if (this.onChange) {
      this.onChange(this.state, this.state === 'a' ? this.labelA : this.labelB);
    }
    flashGlow(this.element);
    // Notificar que hay cambios sin guardar
    document.dispatchEvent(new CustomEvent('synth:userInteraction'));
    return this.state;
  }

  /**
   * Establece el estado
   * @param {string} state - 'a' o 'b'
   */
  setState(state) {
    if (state === 'a' || state === 'b') {
      this.state = state;
      this._render();
      flashGlow(this.element);
    }
  }

  /**
   * Obtiene el estado actual
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  /**
   * Obtiene el label del estado actual
   * @returns {string}
   */
  getLabel() {
    return this.state === 'a' ? this.labelA : this.labelB;
  }

  _render() {
    if (!this.element) return;
    this.element.classList.toggle('is-b', this.state === 'b');
    this.element.setAttribute('data-state', this.state);
  }
}
