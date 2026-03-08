/**
 * Knob multivuelta Spectrol Vernier Dial — versión raster.
 * 
 * Extiende Knob para representar un dial de 10 vueltas completas con:
 * - Imagen raster del rotor (disco negro + hexágono) que rota con CSS transform
 * - Imagen raster del anillo fijo (plateado, ventana, indicador, freno)
 * - Contador digital (0-10) como texto DOM superpuesto en la ventana
 * 
 * Sustituye el SVG inline (~150 nodos por instancia) por dos <img> PNG
 * pre-rasterizadas, reduciendo drásticamente el conteo de nodos DOM y
 * evitando el coste de re-layout SVG en paneles con múltiples verniers.
 * 
 * @module ui/vernierKnob
 */

import { Knob } from './knob.js';

/** Imágenes raster del dial Vernier */
const VERNIER_ROTOR_SRC = 'assets/knobs/vernier-rotor.png';
const VERNIER_RING_SRC = 'assets/knobs/vernier-ring.png';

/** Número total de vueltas (0 a 10) */
const TOTAL_TURNS = 10;

/** Grados por vuelta completa */
const DEG_PER_TURN = 360;

/**
 * Crea los elementos DOM para un knob Vernier.
 * Estructura: rotor <img> (gira) + ring <img> (fijo) + counter <span> (texto).
 * 
 * @param {Object} [options] - Opciones de configuración
 * @param {string} [options.label] - Texto del label
 * @param {boolean} [options.showValue=true] - Mostrar elemento de valor
 * @returns {Object} { wrapper, knobEl, svgContainer, valueEl? }
 */
export function createVernierElements(options = {}) {
  const {
    label = '',
    showValue = true
  } = options;

  const wrapper = document.createElement('div');
  wrapper.className = 'knob-wrapper knob-wrapper--vernier';

  const knobEl = document.createElement('div');
  knobEl.className = 'knob knob--vernier';

  // Contenedor que sustituye al antiguo vernier-svg-container
  const svgContainer = document.createElement('div');
  svgContainer.className = 'vernier-svg-container';

  // Rotor (gira con CSS transform)
  const rotorImg = document.createElement('img');
  rotorImg.src = VERNIER_ROTOR_SRC;
  rotorImg.alt = '';
  rotorImg.draggable = false;
  rotorImg.decoding = 'async';
  rotorImg.loading = 'eager';
  rotorImg.className = 'vernier-rotor';
  rotorImg.setAttribute('aria-hidden', 'true');

  // Anillo fijo (no gira)
  const ringImg = document.createElement('img');
  ringImg.src = VERNIER_RING_SRC;
  ringImg.alt = '';
  ringImg.draggable = false;
  ringImg.decoding = 'async';
  ringImg.loading = 'eager';
  ringImg.className = 'vernier-ring';
  ringImg.setAttribute('aria-hidden', 'true');

  // Contador de vueltas (texto DOM superpuesto)
  const counter = document.createElement('span');
  counter.className = 'vernier-counter';
  counter.textContent = '0';

  svgContainer.appendChild(rotorImg);
  svgContainer.appendChild(ringImg);
  svgContainer.appendChild(counter);
  knobEl.appendChild(svgContainer);
  wrapper.appendChild(knobEl);

  const result = { wrapper, knobEl, svgContainer };

  if (label) {
    const labelEl = document.createElement('div');
    labelEl.className = 'knob-label';
    labelEl.textContent = label;
    wrapper.appendChild(labelEl);
    result.labelEl = labelEl;
  }

  if (showValue) {
    const valueEl = document.createElement('div');
    valueEl.className = 'knob-value';
    wrapper.appendChild(valueEl);
    result.valueEl = valueEl;
  }

  return result;
}

/**
 * Puebla un contenedor `.vernier-svg-container` con rotor img, ring img
 * y counter span si están ausentes.  Esto cubre los paths de creación
 * que montan el DOM manualmente (ej. sgmeOscillator.js) sin pasar por
 * `createVernierElements()`.
 *
 * @param {HTMLElement} rootEl - Elemento root (.knob--vernier)
 * @private
 */
function _ensureVernierContent(rootEl) {
  const container = rootEl.querySelector('.vernier-svg-container');
  if (!container) return;                      // Sin contenedor, nada que hacer
  if (container.querySelector('.vernier-rotor')) return; // Ya poblado

  // Rotor (gira)
  const rotorImg = document.createElement('img');
  rotorImg.src = VERNIER_ROTOR_SRC;
  rotorImg.alt = '';
  rotorImg.draggable = false;
  rotorImg.decoding = 'async';
  rotorImg.loading = 'eager';
  rotorImg.className = 'vernier-rotor';
  rotorImg.setAttribute('aria-hidden', 'true');

  // Anillo fijo
  const ringImg = document.createElement('img');
  ringImg.src = VERNIER_RING_SRC;
  ringImg.alt = '';
  ringImg.draggable = false;
  ringImg.decoding = 'async';
  ringImg.loading = 'eager';
  ringImg.className = 'vernier-ring';
  ringImg.setAttribute('aria-hidden', 'true');

  // Contador de vueltas
  const counter = document.createElement('span');
  counter.className = 'vernier-counter';
  counter.textContent = '0';

  container.appendChild(rotorImg);
  container.appendChild(ringImg);
  container.appendChild(counter);
}

/**
 * Knob multivuelta Spectrol Vernier Dial — versión raster.
 * 
 * Hereda toda la lógica de interacción de Knob (drag, tooltips, precisión
 * progresiva, modificadores, serialización) pero usa imágenes PNG en vez
 * de SVG inline. El rotor rota vía CSS transform (compositor-only).
 * 
 * Diferencias clave con Knob normal:
 * - 10 vueltas completas (3600° de rotación total)
 * - innerEl es la <img> del rotor (no un div con SVG)
 * - Actualiza el texto del contador DOM con la vuelta actual (0-10)
 * - No tiene knob-center (el hexágono central es parte de la imagen)
 * 
 * @extends Knob
 */
export class VernierKnob extends Knob {
  /**
   * @param {HTMLElement} rootEl - Elemento root (.knob--vernier)
   * @param {Object} options - Opciones (mismas que Knob + extensiones)
   */
  constructor(rootEl, options = {}) {
    const vernierOptions = { ...options };

    // Knob busca .knob-inner — crear uno temporal que envuelve al rotor
    const tempInner = document.createElement('div');
    tempInner.className = 'knob-inner';
    tempInner.style.display = 'none';
    rootEl.appendChild(tempInner);

    super(rootEl, vernierOptions);

    // Ángulos multivuelta: 0° a 3600° (10 vueltas × 360°)
    this.minAngle = 0;
    this.maxAngle = TOTAL_TURNS * DEG_PER_TURN;
    this.totalTurns = TOTAL_TURNS;

    // Asegurar que el contenedor tiene las imágenes raster.
    // Si el DOM fue creado externamente (ej. sgmeOscillator) sin poblar
    // el contenedor, lo hacemos aquí para que todos los paths funcionen.
    _ensureVernierContent(rootEl);

    /** @type {HTMLImageElement|null} Imagen raster del rotor (gira) */
    this._rotorImg = rootEl.querySelector('.vernier-rotor') || null;
    /** @type {HTMLSpanElement|null} Texto del contador de vueltas */
    this._counterEl = rootEl.querySelector('.vernier-counter') || null;
    /** @type {number} Último dígito del contador (para evitar writes redundantes) */
    this._lastCounterDigit = -1;
    /** @type {string} Último valor formateado (para evitar writes redundantes) */
    this._lastFormattedValue = '';

    // Eliminar el innerEl temporal
    tempInner.remove();

    // Aplicar estado visual inicial
    this._updateVisual();
  }

  /**
   * Calcula el ángulo de rotación y el dígito del contador
   * a partir del valor actual.
   * @returns {{ angle: number, counterDigit: number }}
   * @private
   */
  _calcVisualState() {
    const t = (this.value - this.min) / (this.max - this.min);
    const totalAngle = t * this.totalTurns * DEG_PER_TURN;
    const counterDigit = Math.min(this.totalTurns, Math.floor(t * this.totalTurns));
    return { angle: totalAngle, counterDigit };
  }

  /**
   * Actualización visual rápida (solo rotación y texto).
   * Override de Knob._updateVisualFast()
   * 
   * Optimizado para rendimiento durante drag:
   * - Solo escribe textContent cuando el valor realmente cambia
   * - CSS transform en <img> es compositor-only (sin layout)
   */
  _updateVisualFast() {
    const { angle, counterDigit } = this._calcVisualState();

    // Rotar la imagen del rotor
    if (this._rotorImg) {
      this._rotorImg.style.transform = `rotate(${angle}deg)`;
    }

    // Actualizar el dígito del contador solo si cambió
    if (this._counterEl && counterDigit !== this._lastCounterDigit) {
      this._counterEl.textContent = String(counterDigit);
      this._lastCounterDigit = counterDigit;
    }

    // Actualizar el valor de texto solo si cambió
    if (this.valueEl) {
      const formatted = this._formatScaleValue();
      if (formatted !== this._lastFormattedValue) {
        this.valueEl.textContent = formatted;
        this._lastFormattedValue = formatted;
      }
    }

    // Reposicionar badge si está visible
    if (this.modBadge && this.modBadge.classList.contains('is-active')) {
      this._positionModifierBadge();
    }
  }

  _updateVisual() {
    this._updateVisualFast();
  }

  /**
   * Override: el elemento que rota en VernierKnob es la imagen del rotor.
   * @returns {HTMLImageElement|null}
   */
  _getRotatingEl() {
    return this._rotorImg;
  }
}
