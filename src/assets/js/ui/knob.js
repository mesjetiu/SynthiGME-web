// Componente Knob reutilizable para parámetros continuos en la interfaz
import { shouldBlockInteraction } from '../utils/input.js';

export class Knob {
  constructor(rootEl, options = {}) {
    this.rootEl = rootEl;
    this.innerEl = rootEl.querySelector('.knob-inner');

    const {
      valueElement = null,
      min = 0,
      max = 1,
      initial = 0,
      onChange = null,
      format = (v => v),
      pixelsForFullRange = 150,
      // Escala de display (estilo Synthi 100)
      scaleMin = 0,
      scaleMax = 10,
      scaleDecimals = 1
    } = options;

    this.valueEl = valueElement;
    this.min = min;
    this.max = max;
    this.value = initial;
    this.onChange = onChange;
    this.format = format;
    this.pixelsForFullRange = pixelsForFullRange;
    
    // Escala de display
    this.scaleMin = scaleMin;
    this.scaleMax = scaleMax;
    this.scaleDecimals = scaleDecimals;

    this.dragging = false;
    this.startY = 0;
    this.startValue = this.value;
    
    // Tooltip element
    this.tooltip = null;

    this.minAngle = -135;
    this.maxAngle = 135;
    this._attach();
    this._updateVisual();
  }
  
  /**
   * Calcula el valor de display en la escala configurada (ej: 0-10 o -5 a +5)
   * @returns {number}
   */
  _getScaleValue() {
    const t = (this.value - this.min) / (this.max - this.min);
    return this.scaleMin + t * (this.scaleMax - this.scaleMin);
  }
  
  /**
   * Formatea el valor de escala para mostrar
   * @returns {string}
   */
  _formatScaleValue() {
    return this._getScaleValue().toFixed(this.scaleDecimals);
  }
  
  /**
   * Crea y muestra el tooltip
   */
  _showTooltip() {
    if (this.tooltip) return;
    
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'knob-tooltip';
    this.tooltip.textContent = this._formatScaleValue();
    document.body.appendChild(this.tooltip);
    this._positionTooltip();
    
    // Forzar reflow para activar transición
    this.tooltip.offsetHeight;
    this.tooltip.classList.add('is-visible');
  }
  
  /**
   * Posiciona el tooltip encima del knob
   */
  _positionTooltip() {
    if (!this.tooltip) return;
    
    const rect = this.rootEl.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.top - tooltipRect.height - 8;
    
    // Ajustar si sale de la pantalla
    if (left < 4) left = 4;
    if (left + tooltipRect.width > window.innerWidth - 4) {
      left = window.innerWidth - tooltipRect.width - 4;
    }
    if (top < 4) {
      top = rect.bottom + 8;
    }
    
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }
  
  /**
   * Actualiza el contenido del tooltip
   */
  _updateTooltip() {
    if (this.tooltip) {
      this.tooltip.textContent = this._formatScaleValue();
    }
  }
  
  /**
   * Oculta y elimina el tooltip
   */
  _hideTooltip() {
    if (!this.tooltip) return;
    
    const tooltip = this.tooltip;
    tooltip.classList.remove('is-visible');
    
    // Eliminar después de la transición
    setTimeout(() => {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    }, 150);
    
    this.tooltip = null;
  }

  _attach() {
    // Mostrar tooltip al pasar el ratón
    this.rootEl.addEventListener('pointerenter', () => {
      this._showTooltip();
    });
    
    this.rootEl.addEventListener('pointerleave', () => {
      if (!this.dragging) {
        this._hideTooltip();
      }
    });
    
    this.rootEl.addEventListener('pointerdown', ev => {
      if (shouldBlockInteraction(ev)) return;
      if (window._synthApp && window._synthApp.ensureAudio) {
        window._synthApp.ensureAudio();
      }
      this.dragging = true;
      this.startY = ev.clientY;
      this.startValue = this.value;
      this.rootEl.setPointerCapture(ev.pointerId);
      this._showTooltip();
    });

    this.rootEl.addEventListener('pointermove', ev => {
      if (!this.dragging) return;
      if (shouldBlockInteraction(ev)) return;
      const dy = this.startY - ev.clientY;
      const sens = (this.max - this.min) / this.pixelsForFullRange;
      this.setValue(this.startValue + dy * sens);
      this._updateTooltip();
    });

    const end = ev => {
      if (!this.dragging) return;
      this.dragging = false;
      try { this.rootEl.releasePointerCapture(ev.pointerId); } catch (error) {
        // ignore release errors
      }
      this._hideTooltip();
    };

    this.rootEl.addEventListener('pointerup', end);
    this.rootEl.addEventListener('pointercancel', end);
  }

  _updateVisual() {
    const t = (this.value - this.min) / (this.max - this.min);
    const angle = this.minAngle + t * (this.maxAngle - this.minAngle);
    this.innerEl.style.transform = `rotate(${angle}deg)`;
    // Mostrar valor en escala (0-10 o -5 a +5)
    if (this.valueEl) this.valueEl.textContent = this._formatScaleValue();
  }

  setValue(value) {
    this.value = Math.min(this.max, Math.max(this.min, value));
    this._updateVisual();
    if (this.onChange) this.onChange(this.value);
    // Notificar que hay cambios sin guardar
    document.dispatchEvent(new CustomEvent('synth:userInteraction'));
  }

  getValue() {
    return this.value;
  }
}
