// Componente Knob reutilizable para parámetros continuos en la interfaz
import { shouldBlockInteraction } from '../utils/input.js';
import { registerTooltipHideCallback } from './tooltipManager.js';

// Detectar si el dispositivo tiene capacidad táctil (puede tener ambos: táctil y ratón)
const hasTouchCapability = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

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
      getTooltipInfo = null,
      // Tiempo de auto-ocultado del tooltip en móvil (ms)
      tooltipAutoHideDelay = 3000
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
    
    // Configuración de tooltip táctil
    this.tooltipAutoHideDelay = tooltipAutoHideDelay;
    this._tooltipAutoHideTimer = null;

    this.dragging = false;
    this.startY = 0;
    this.startValue = this.value;
    
    // Tooltip element
    this.tooltip = null;
    // Indicador visual de modificadores (Ctrl/Shift)
    this.modBadge = null;
    this.modifierState = 'none';
    this._modBadgeHideTimer = null;
    this.modBadgeNeutralDuration = 1000; // ms que se muestra el estado 1x
    
    // RAF para actualizaciones visuales fluidas
    this._rafId = null;
    this._pendingValue = null;

    this.minAngle = -135;
    this.maxAngle = 135;
    
    // Registrar callback de ocultación de tooltip para eventos globales (zoom/pan, tap fuera)
    this._unregisterTooltipHide = registerTooltipHideCallback(() => {
      if (!this.dragging) {
        this._hideTooltip();
      }
    });
    
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
    
    // Limpiar timer de auto-ocultado
    if (this._tooltipAutoHideTimer) {
      clearTimeout(this._tooltipAutoHideTimer);
      this._tooltipAutoHideTimer = null;
    }
    
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
  
  /**
   * Muestra el tooltip con auto-ocultado para dispositivos táctiles
   */
  _showTooltipWithAutoHide() {
    this._showTooltip();
    
    // Limpiar timer previo si existe
    if (this._tooltipAutoHideTimer) {
      clearTimeout(this._tooltipAutoHideTimer);
    }
    
    // Configurar auto-ocultado
    this._tooltipAutoHideTimer = setTimeout(() => {
      if (!this.dragging) {
        this._hideTooltip();
      }
    }, this.tooltipAutoHideDelay);
  }

  _ensureModifierBadge() {
    if (this.modBadge) return;
    const badge = document.createElement('div');
    badge.className = 'knob-mod-badge';
    badge.textContent = '1x';
    document.body.appendChild(badge);
    this.modBadge = badge;
  }

  _positionModifierBadge() {
    if (!this.modBadge) return;
    const rect = this.rootEl.getBoundingClientRect();
    const left = rect.right - 8;
    const top = rect.top + rect.height / 2;
    this.modBadge.style.left = `${left}px`;
    this.modBadge.style.top = `${top}px`;
  }

  _setModifierVisual(state) {
    this._ensureModifierBadge();
    const prevState = this.modifierState;
    
    // Si el estado no cambió, solo reposicionar
    if (this.modifierState === state) {
      this._positionModifierBadge();
      return;
    }
    
    this.modifierState = state;
    this._positionModifierBadge();
    
    // Limpiar timer previo de 1x
    if (this._modBadgeHideTimer) {
      clearTimeout(this._modBadgeHideTimer);
      this._modBadgeHideTimer = null;
    }
    
    // Quitar clases de color previas
    this.modBadge.classList.remove('is-fast', 'is-slow');
    
    if (state === 'fast') {
      this.modBadge.textContent = '10x';
      this.modBadge.classList.add('is-fast', 'is-active');
    } else if (state === 'slow') {
      this.modBadge.textContent = '0.1x';
      this.modBadge.classList.add('is-slow', 'is-active');
    } else {
      // Solo mostrar 1x si venimos de un estado rápido/lento
      if (prevState === 'fast' || prevState === 'slow') {
        this.modBadge.textContent = '1x';
        this.modBadge.classList.add('is-active');
        this._modBadgeHideTimer = setTimeout(() => {
          if (this.modifierState === 'none') {
            this.modBadge.classList.remove('is-active');
          }
          this._modBadgeHideTimer = null;
        }, this.modBadgeNeutralDuration);
      } else {
        this.modBadge.classList.remove('is-active');
      }
    }
  }

  _attach() {
    const hasTouch = hasTouchCapability();
    this._ensureModifierBadge();
    this._setModifierVisual('none');
    
    // ─────────────────────────────────────────────────────────────────────
    // Prevenir menú contextual (por ahora no tiene opciones específicas)
    // ─────────────────────────────────────────────────────────────────────
    this.rootEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    
    // ─────────────────────────────────────────────────────────────────────
    // HOVER: mostrar tooltip al pasar el ratón (siempre registrado)
    // Solo actúa si el pointer NO es touch
    // ─────────────────────────────────────────────────────────────────────
    this.rootEl.addEventListener('pointerenter', (ev) => {
      // Ignorar eventos touch - se manejan con tap
      if (ev.pointerType === 'touch') return;
      this._showTooltip();
    });
    
    this.rootEl.addEventListener('pointerleave', (ev) => {
      // Ignorar eventos touch
      if (ev.pointerType === 'touch') return;
      if (!this.dragging) {
        this._hideTooltip();
      }
    });
    
    // ─────────────────────────────────────────────────────────────────────
    // TÁCTIL: tap para mostrar tooltip con auto-hide
    // Solo se registra si el dispositivo tiene capacidad táctil
    // ─────────────────────────────────────────────────────────────────────
    if (hasTouch) {
      // Detectar tap simple (sin drag)
      let tapStartTime = 0;
      let tapStartY = 0;
      let wasTap = false;
      
      this.rootEl.addEventListener('touchstart', (ev) => {
        tapStartTime = Date.now();
        tapStartY = ev.touches[0]?.clientY ?? 0;
        wasTap = true;
      }, { passive: true });
      
      this.rootEl.addEventListener('touchmove', (ev) => {
        // Si se movió más de 10px, no es un tap
        const currentY = ev.touches[0]?.clientY ?? 0;
        if (Math.abs(currentY - tapStartY) > 10) {
          wasTap = false;
        }
      }, { passive: true });
      
      this.rootEl.addEventListener('touchend', () => {
        const tapDuration = Date.now() - tapStartTime;
        // Si fue un tap corto (< 200ms) y no hubo drag significativo
        if (wasTap && tapDuration < 200 && !this.dragging) {
          // Mostrar tooltip con autoHide
          this._showTooltipWithAutoHide();
        }
        wasTap = false;
      }, { passive: true });
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // DRAG (común para ambos)
    // ─────────────────────────────────────────────────────────────────────
    let lastPointerType = 'mouse';
    
    this.rootEl.addEventListener('pointerdown', ev => {
      if (shouldBlockInteraction(ev)) return;
      if (window._synthApp && window._synthApp.ensureAudio) {
        window._synthApp.ensureAudio();
      }
      this.dragging = true;
      this.startY = ev.clientY;
      this.startValue = this.value;
      this.rootEl.setPointerCapture(ev.pointerId);
      lastPointerType = ev.pointerType;
      
      // Mostrar tooltip durante drag
      this._showTooltip();
      // Resetear indicador de modificador al inicio del drag
      this._setModifierVisual('none');
      this._positionModifierBadge();
      
      // En táctil, limpiar el timer de autoHide durante drag
      if (ev.pointerType === 'touch' && this._tooltipAutoHideTimer) {
        clearTimeout(this._tooltipAutoHideTimer);
        this._tooltipAutoHideTimer = null;
      }
    });

    this.rootEl.addEventListener('pointermove', ev => {
      if (!this.dragging) return;
      if (shouldBlockInteraction(ev)) return;
      const dy = this.startY - ev.clientY;
      
      // Modificadores de teclado para ajustar sensibilidad:
      // Ctrl/Cmd: 10x más rápido (divide pixelsForFullRange por 10)
      // Shift: 10x más lento (multiplica pixelsForFullRange por 10)
      let effectivePixelsForFullRange = this.pixelsForFullRange;
      let modifierState = 'none';
      if (ev.ctrlKey || ev.metaKey) {
        effectivePixelsForFullRange = this.pixelsForFullRange / 10;
        modifierState = 'fast';
      } else if (ev.shiftKey) {
        effectivePixelsForFullRange = this.pixelsForFullRange * 10;
        modifierState = 'slow';
      }
      this._setModifierVisual(modifierState);
      
      const sens = (this.max - this.min) / effectivePixelsForFullRange;
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
      this._setModifierVisual('none');
      
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
      
      // En desktop ocultar inmediatamente, en táctil usar autoHide
      if (lastPointerType === 'touch') {
        // Reiniciar el timer de autoHide después del drag
        if (this._tooltipAutoHideTimer) {
          clearTimeout(this._tooltipAutoHideTimer);
        }
        this._tooltipAutoHideTimer = setTimeout(() => {
          this._hideTooltip();
        }, this.tooltipAutoHideDelay);
      } else {
        this._hideTooltip();
      }
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
    // Reposicionar badge si está visible para seguir el knob
    if (this.modBadge && this.modBadge.classList.contains('is-active')) {
      this._positionModifierBadge();
    }
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
