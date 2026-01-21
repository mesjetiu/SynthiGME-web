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
      scaleDecimals = 1,
      // Función opcional para generar info adicional del tooltip
      // Recibe (value, scaleValue) y retorna string o null
      getTooltipInfo = null
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
    
    // Función para info adicional en tooltip
    this.getTooltipInfo = getTooltipInfo;

    this.dragging = false;
    this.startY = 0;
    this.startValue = this.value;
    
    // Tooltip element
    this.tooltip = null;
    
    // RAF para actualizaciones visuales fluidas
    this._rafId = null;
    this._pendingValue = null;

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
   * Genera el contenido HTML del tooltip
   * @returns {string}
   */
  _generateTooltipContent() {
    const scaleValue = this._getScaleValue();
    const mainText = scaleValue.toFixed(this.scaleDecimals);
    
    // Si hay función de info adicional, usarla
    if (this.getTooltipInfo) {
      const extraInfo = this.getTooltipInfo(this.value, scaleValue);
      if (extraInfo) {
        return `<div class="knob-tooltip__main">${mainText}</div>` +
               `<div class="knob-tooltip__info">${extraInfo}</div>`;
      }
    }
    
    return mainText;
  }
  
  /**
   * Crea y muestra el tooltip
   */
  _showTooltip() {
    if (this.tooltip) return;
    
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'knob-tooltip';
    this.tooltip.innerHTML = this._generateTooltipContent();
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
      this.tooltip.innerHTML = this._generateTooltipContent();
      // Reposicionar por si cambió el tamaño
      this._positionTooltip();
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
      const newValue = Math.min(this.max, Math.max(this.min, this.startValue + dy * sens));
      
      // Programar actualización visual con RAF para fluidez
      this._pendingValue = newValue;
      if (!this._rafId) {
        this._rafId = requestAnimationFrame(() => {
          this._rafId = null;
          if (this._pendingValue !== null) {
            this.value = this._pendingValue;
            this._pendingValue = null;
            this._updateVisualFast();
            this._updateTooltip();
            if (this.onChange) this.onChange(this.value);
          }
        });
      }
    });

    const end = ev => {
      if (!this.dragging) return;
      this.dragging = false;
      
      // Aplicar valor final si hay pendiente
      if (this._pendingValue !== null) {
        this.value = this._pendingValue;
        this._pendingValue = null;
        this._updateVisualFast();
        if (this.onChange) this.onChange(this.value);
      }
      
      // Notificar interacción al soltar (no durante drag)
      document.dispatchEvent(new CustomEvent('synth:userInteraction'));
      
      try { this.rootEl.releasePointerCapture(ev.pointerId); } catch (error) {
        // ignore release errors
      }
      this._hideTooltip();
    };

    this.rootEl.addEventListener('pointerup', end);
    this.rootEl.addEventListener('pointercancel', end);
  }

  /**
   * Actualización visual rápida (solo rotación y texto)
   * Sin disparar eventos, para uso durante drag
   */
  _updateVisualFast() {
    const t = (this.value - this.min) / (this.max - this.min);
    const angle = this.minAngle + t * (this.maxAngle - this.minAngle);
    this.innerEl.style.transform = `rotate(${angle}deg)`;
    if (this.valueEl) this.valueEl.textContent = this._formatScaleValue();
  }

  _updateVisual() {
    this._updateVisualFast();
  }

  setValue(value) {
    this.value = Math.min(this.max, Math.max(this.min, value));
    this._updateVisual();
    if (this.onChange) this.onChange(this.value);
    // Notificar solo si no estamos arrastrando (evita spam de eventos)
    if (!this.dragging) {
      document.dispatchEvent(new CustomEvent('synth:userInteraction'));
    }
  }

  getValue() {
    return this.value;
  }
}
