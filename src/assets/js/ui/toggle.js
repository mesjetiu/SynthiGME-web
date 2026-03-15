// ═══════════════════════════════════════════════════════════════════════════
// Toggle - Switch de dos estados reutilizable (imágenes PNG rasterizadas)
// ═══════════════════════════════════════════════════════════════════════════
//
// Toggle visual tipo switch para alternar entre dos modos/estados.
// Usa imágenes PNG pre-rasterizadas del toggle-switch en vez de SVG inline,
// reduciendo nodos DOM y evitando re-layout en paneles con múltiples toggles.
// Usa la clase CSS .synth-toggle para estilos.
//
// ═══════════════════════════════════════════════════════════════════════════

import { flashGlow } from './glowManager.js';

/** Imágenes raster del toggle en sus dos estados */
const TOGGLE_IMG_A = 'assets/knobs/toggle-a.png';
const TOGGLE_IMG_B = 'assets/knobs/toggle-b.png';

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
    this.name = options.name || '';
    this.state = options.initial || 'a';
    this.onChange = options.onChange || null;
    this.element = null;
    /** @type {HTMLImageElement|null} */
    this._toggleImg = null;
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
        <div class="synth-toggle__svg-container"></div>
      </div>
      <span class="synth-toggle__label synth-toggle__label-b">${this.labelB}</span>
    `;
    
    root.addEventListener('click', () => this.toggle());
    
    this.element = root;

    // Crear imagen raster del toggle
    const svgContainer = root.querySelector('.synth-toggle__svg-container');
    const img = document.createElement('img');
    img.src = this.state === 'b' ? TOGGLE_IMG_B : TOGGLE_IMG_A;
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.loading = 'eager';
    img.className = 'toggle-raster-graphic';
    img.setAttribute('aria-hidden', 'true');
    svgContainer.replaceChildren(img);
    this._toggleImg = img;

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
    if ((state === 'a' || state === 'b') && state !== this.state) {
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
    this._updateImage();
    const currentLabel = this.state === 'a' ? this.labelA : this.labelB;
    this.element.title = this.name
      ? `${this.name}: ${currentLabel.trim()}`
      : currentLabel.trim();
  }

  /**
   * Actualiza la imagen del toggle según el estado actual.
   * Estado 'a' = palanca arriba (toggle-a.png).
   * Estado 'b' = palanca abajo (toggle-b.png).
   */
  _updateImage() {
    if (!this._toggleImg) return;
    this._toggleImg.src = this.state === 'b' ? TOGGLE_IMG_B : TOGGLE_IMG_A;
  }
}
