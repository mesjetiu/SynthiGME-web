/**
 * Knob multivuelta Spectrol Vernier Dial.
 * 
 * Extiende Knob para representar un dial de 10 vueltas completas con:
 * - Parte giratoria (disco negro + hexágono central) que rota con CSS transform
 * - Parte fija (anillo plateado, ventana contador, indicador, freno)
 * - Contador digital (0-10) en la ventana que indica la vuelta actual
 * 
 * El SVG se inserta inline para acceso directo al DOM interno.
 * 
 * @module ui/vernierKnob
 */

import { Knob } from './knob.js';

/** Ruta al SVG optimizado del dial Vernier */
const VERNIER_SVG_SRC = 'assets/knobs/vernier-dial.svg';

/** Número total de vueltas (0 a 10) */
const TOTAL_TURNS = 10;

/** Grados por vuelta completa */
const DEG_PER_TURN = 360;

/** Caché del SVG descargado (compartido entre instancias) */
let svgCache = null;
let svgFetchPromise = null;

/**
 * Descarga y cachea el SVG del dial Vernier.
 * @returns {Promise<string>} Contenido SVG como string
 */
async function fetchVernierSvg() {
  if (svgCache) return svgCache;
  if (!svgFetchPromise) {
    svgFetchPromise = fetch(VERNIER_SVG_SRC)
      .then(r => r.text())
      .then(text => {
        svgCache = text;
        return text;
      });
  }
  return svgFetchPromise;
}

/**
 * Crea los elementos DOM para un knob Vernier.
 * Se inserta el SVG inline y se referencian los grupos clave por ID.
 * 
 * @param {Object} [options] - Opciones de configuración
 * @param {string} [options.label] - Texto del label
 * @param {boolean} [options.showValue=true] - Mostrar elemento de valor
 * @returns {Object} { wrapper, knobEl, rotor, counter, valueEl? }
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

  // Contenedor para el SVG inline (se llenará con el fetch)
  const svgContainer = document.createElement('div');
  svgContainer.className = 'vernier-svg-container';
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
 * Knob multivuelta Spectrol Vernier Dial.
 * 
 * Hereda toda la lógica de interacción de Knob (drag, tooltips, precisión
 * progresiva, modificadores, serialización) pero reemplaza la representación
 * visual con el SVG inline del dial Spectrol de 10 vueltas.
 * 
 * Diferencias clave con Knob normal:
 * - 10 vueltas completas (3600° de rotación total)
 * - innerEl es el grupo SVG #vd-rotor (no un div con img)
 * - Actualiza el texto del contador #vd-counter con la vuelta actual (0-10)
 * - No tiene knob-center (el hexágono central es parte del SVG)
 * 
 * @extends Knob
 */
export class VernierKnob extends Knob {
  /**
   * @param {HTMLElement} rootEl - Elemento root (.knob--vernier)
   * @param {Object} options - Opciones (mismas que Knob + extensiones)
   */
  constructor(rootEl, options = {}) {
    // Para el vernier el ángulo cubre 10 vueltas completas (3600°)
    // En la orientación del SVG, 0° = indicador arriba (posición 0 del dial)
    // Override de ángulos para multivuelta
    const vernierOptions = {
      ...options,
      // Temporalmente usamos innerEl falso; lo conectamos tras fetch
    };

    // Crear un innerEl temporal para que el constructor de Knob no falle
    let innerEl = rootEl.querySelector('.vernier-svg-container');
    if (!innerEl) {
      innerEl = document.createElement('div');
      rootEl.appendChild(innerEl);
    }

    // Hack: setear innerEl manualmente antes de super
    // Knob busca .knob-inner, así que creamos uno temporal
    const tempInner = document.createElement('div');
    tempInner.className = 'knob-inner';
    tempInner.style.display = 'none';
    rootEl.appendChild(tempInner);

    super(rootEl, vernierOptions);

    // Ángulos multivuelta: 0° a 3600° (10 vueltas × 360°)
    this.minAngle = 0;
    this.maxAngle = TOTAL_TURNS * DEG_PER_TURN;
    this.totalTurns = TOTAL_TURNS;

    /** @type {SVGGElement|null} Grupo SVG giratorio */
    this._svgRotor = null;
    /** @type {SVGTextElement|null} Texto del contador de vueltas */
    this._svgCounter = null;
    /** @type {HTMLDivElement} Contenedor del SVG inline */
    this._svgContainer = rootEl.querySelector('.vernier-svg-container');

    // Cargar y montar el SVG inline
    this._loadSvg();
  }

  /**
   * Carga el SVG y lo monta inline en el contenedor.
   * @private
   */
  async _loadSvg() {
    const svgText = await fetchVernierSvg();
    if (!this._svgContainer) return;

    this._svgContainer.innerHTML = svgText;

    // Localizar elementos clave por ID
    const svg = this._svgContainer.querySelector('svg');
    if (svg) {
      this._svgRotor = svg.querySelector('#vd-rotor');
      this._svgCounter = svg.querySelector('#vd-counter');

      // Configurar transform-origin en el rotor
      if (this._svgRotor) {
        this._svgRotor.style.transformOrigin = '150px 150px';
      }
    }

    // Eliminar el innerEl temporal
    const tempInner = this.rootEl.querySelector('.knob-inner');
    if (tempInner) {
      tempInner.remove();
    }

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
   */
  _updateVisualFast() {
    const { angle, counterDigit } = this._calcVisualState();

    // Rotar el grupo giratorio del SVG
    if (this._svgRotor) {
      this._svgRotor.style.transform = `rotate(${angle}deg)`;
    }

    // Actualizar el dígito del contador en la ventana
    if (this._svgCounter) {
      this._svgCounter.textContent = String(counterDigit);
    }

    // Actualizar el valor de texto bajo el knob (escala de display)
    if (this.valueEl) {
      this.valueEl.textContent = this._formatScaleValue();
    }

    // Reposicionar badge si está visible
    if (this.modBadge && this.modBadge.classList.contains('is-active')) {
      this._positionModifierBadge();
    }
  }

  _updateVisual() {
    this._updateVisualFast();
  }
}
