/**
 * OutputChannel - Módulo individual de canal de salida
 * 
 * Cada instancia representa un canal de salida con:
 * - Knob Filter (control bipolar LP/HP)
 * - Knob Pan (control bipolar L/R)
 * - Switch On/Off (mute/unmute)
 * - Slider Level (control de nivel de salida)
 * 
 * Usa ModuleFrame para el panel visual estilo Panel 2/3.
 * Configuración desde panel7.config.js.
 * 
 * @module modules/outputChannel
 */

import { Module } from '../core/engine.js';
import { ModuleFrame } from '../ui/moduleFrame.js';
import { Knob } from '../ui/knob.js';
import { createKnobElements } from '../ui/knobFactory.js';
import { shouldBlockInteraction, isNavGestureActive } from '../utils/input.js';
import { outputChannelConfig } from '../configs/index.js';
import { 
  vcaCalculateGain, 
  vcaDialToVoltage, 
  vcaCalculateGainLinear,
  sliderToDialLinear,
  isFaderLinearResponseEnabled 
} from '../utils/voltageConstants.js';
import { registerTooltipHideCallback, hideOtherTooltips } from '../ui/tooltipManager.js';
import { getVCATooltipInfo } from '../utils/tooltipUtils.js';
import { outputChannelOSCSync } from '../osc/oscOutputChannelSync.js';
import { flashGlow } from '../ui/glowManager.js';

// Detectar si el dispositivo tiene capacidad táctil
const hasTouchCapability = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Extraer configuración del outputChannel.config.js
const knobsConfig = outputChannelConfig.knobs || {};
const fadersConfig = outputChannelConfig.faders || {};
const switchesConfig = outputChannelConfig.switches || {};
const audioConfig = outputChannelConfig.audio || {};
const rampsConfig = audioConfig.ramps || {};

export class OutputChannel extends Module {
  /**
   * @param {Object} engine - AudioEngine instance
   * @param {number} channelIndex - 0-based index del canal (0-7)
   * @param {Object} [options] - Opciones de configuración
   * @param {string} [options.title] - Título del canal (default: "Out N")
   */
  constructor(engine, channelIndex, options = {}) {
    const id = `output-channel-${channelIndex + 1}`;
    const title = options.title || `Out ${channelIndex + 1}`;
    super(engine, id, title);
    
    this.channelIndex = channelIndex;
    this.options = options;
    
    // Referencias a elementos UI
    this.frame = null;
    this.slider = null;
    this.valueDisplay = null;
    this.filterKnobEl = null;   // Elemento DOM del knob filter
    this.filterKnobUI = null;   // Instancia de clase Knob para filter
    this.panKnobEl = null;      // Elemento DOM del knob pan
    this.panKnobUI = null;      // Instancia de clase Knob para pan
    this.powerSwitch = null;
    
    // Tooltip del slider
    this._sliderTooltip = null;
    this._sliderTooltipAutoHideTimer = null;
    this._sliderTooltipDelayTimer = null;
    this._sliderTooltipAutoHideDelay = 3000;
    this._unregisterTooltipHide = null;
    
    // Estado - usar valores iniciales desde config
    const filterCfg = knobsConfig.filter || {};
    const panCfg = knobsConfig.pan || {};
    const levelCfg = fadersConfig.level || {};
    const powerCfg = switchesConfig.power || {};
    
    this.values = {
      level: engine.getOutputLevel(channelIndex) ?? (levelCfg.initial ?? 0),
      filter: engine.getOutputFilter ? (engine.getOutputFilter(channelIndex) ?? (filterCfg.initial ?? 0)) : (filterCfg.initial ?? 0),
      pan: engine.outputPans?.[channelIndex] ?? (panCfg.initial ?? 0),
      power: powerCfg.initial ?? true,
      // ─────────────────────────────────────────────────────────────────────
      // CV externo desde matriz de control (columnas 42-49 del Panel 6)
      // ─────────────────────────────────────────────────────────────────────
      // El CV externo se suma algebraicamente al voltaje del fader antes de
      // convertir a ganancia. Valor en voltios (típicamente -4V a +4V).
      // Si el fader está en posición 0, el CV se ignora (corte mecánico).
      // ─────────────────────────────────────────────────────────────────────
      externalCV: 0
    };
  }
  
  /**
   * Crea el panel visual del canal dentro del contenedor dado.
   * @param {HTMLElement} container - Elemento contenedor
   * @returns {HTMLElement} El elemento raíz del módulo
   */
  createPanel(container) {
    // Crear frame usando ModuleFrame para consistencia visual
    this.frame = new ModuleFrame({
      id: this.id,
      title: this.name,
      className: 'output-channel-module'
    });
    
    const element = this.frame.createElement();
    
    // Contenido principal: Knobs + Switch + Slider
    const content = this._createContent();
    this.frame.appendToContent(content);
    
    // Añadir al DOM primero
    container.appendChild(element);
    
    // Inicializar Knobs DESPUÉS de que el elemento esté en el DOM
    // (necesario para que setPointerCapture funcione correctamente)
    this._initKnobs();
    
    return element;
  }
  
  /**
   * Crea el contenido interno del canal.
   * @returns {HTMLElement}
   */
  _createContent() {
    const wrapper = document.createElement('div');
    wrapper.className = 'output-channel__content';
    
    // 1. Filter Knob (arriba) - funcional
    const filterWrap = this._createFilterKnob();
    wrapper.appendChild(filterWrap);
    
    // 2. Pan Knob - funcional
    const panWrap = this._createPanKnob();
    wrapper.appendChild(panWrap);
    
    // 3. Switch On/Off
    const switchWrap = this._createSwitch();
    wrapper.appendChild(switchWrap);
    
    // 4. Slider Level (abajo)
    const sliderWrap = this._createSlider();
    wrapper.appendChild(sliderWrap);
    
    return wrapper;
  }
  
  /**
   * Crea el knob de Filter (funcional, control bipolar LP/HP).
   * 
   * Rango bipolar -1 a +1:
   *   -1: Lowpass activo (solo graves)
   *    0: Sin filtrado (centro)
   *   +1: Highpass activo (solo agudos)
   * 
   * @returns {HTMLElement}
   */
  _createFilterKnob() {
    const { wrapper, knobEl, valueEl } = createKnobElements({
      label: 'Filter',
      size: 'sm',
      className: 'output-channel__knob-wrap',
      showValue: true
    });
    
    wrapper.dataset.knob = 'filter';
    knobEl.dataset.preventPan = 'true';
    
    // Guardar referencia para inicialización posterior
    this.filterKnobEl = knobEl;
    this.filterValueEl = valueEl;
    
    return wrapper;
  }
  
  /**
   * Crea el knob de Pan (funcional, control bipolar L/R).
   * 
   * Rango bipolar -1 a +1:
   *   -1: Full izquierda
   *    0: Centro
   *   +1: Full derecha
   * 
   * Afecta tanto al routing legacy como a los stereo buses (Pan 1-4, Pan 5-8).
   * 
   * @returns {HTMLElement}
   */
  _createPanKnob() {
    const { wrapper, knobEl, valueEl } = createKnobElements({
      label: 'Pan',
      size: 'sm',
      className: 'output-channel__knob-wrap',
      showValue: true
    });
    
    wrapper.dataset.knob = 'pan';
    knobEl.dataset.preventPan = 'true';
    
    // Guardar referencia para inicialización posterior
    this.panKnobEl = knobEl;
    this.panValueEl = valueEl;
    
    return wrapper;
  }
  
  /**
   * Inicializa los componentes Knob interactivos.
   * 
   * IMPORTANTE: Este método debe llamarse DESPUÉS de que los elementos
   * estén en el DOM, para que setPointerCapture funcione correctamente
   * en dispositivos táctiles.
   * 
   * @private
   */
  _initKnobs() {
    const filterCfg = knobsConfig.filter || {};
    const panCfg = knobsConfig.pan || {};
    
    // Inicializar Filter Knob
    if (this.filterKnobEl && !this.filterKnobUI) {
      this.filterKnobUI = new Knob(this.filterKnobEl, {
        min: filterCfg.min ?? -5,
        max: filterCfg.max ?? 5,
        initial: this.values.filter,
        pixelsForFullRange: filterCfg.pixelsForFullRange ?? 900,
        // Escala dial Synthi 100: -5 a +5 (bipolar)
        scaleMin: -5,
        scaleMax: 5,
        scaleDecimals: 1,
        valueElement: this.filterValueEl,
        onChange: (value) => {
          this.values.filter = value;
          // Rampa desde config para suavizar cambios manuales
          const ramp = rampsConfig.filter ?? 0.2;
          this.engine.setOutputFilter(this.channelIndex, value, { ramp });
          if (!outputChannelOSCSync.shouldIgnoreOSC()) {
            outputChannelOSCSync.sendFilterChange(this.channelIndex, value);
          }
        }
      });
    }
    
    // Inicializar Pan Knob
    if (this.panKnobEl && !this.panKnobUI) {
      this.panKnobUI = new Knob(this.panKnobEl, {
        min: panCfg.min ?? -1,
        max: panCfg.max ?? 1,
        initial: this.values.pan,
        pixelsForFullRange: panCfg.pixelsForFullRange ?? 900,
        // Escala Synthi 100: -5 a +5 para controles bipolares
        scaleMin: -5,
        scaleMax: 5,
        scaleDecimals: 1,
        valueElement: this.panValueEl,
        onChange: (value) => {
          this.values.pan = value;
          // Rampa desde config para suavizar cambios manuales
          const ramp = rampsConfig.pan ?? 0.2;
          this.engine.setOutputPan(this.channelIndex, value, { ramp });
          if (!outputChannelOSCSync.shouldIgnoreOSC()) {
            outputChannelOSCSync.sendPanChange(this.channelIndex, value);
          }
        }
      });
    }
  }
  
  /**
   * Crea el switch on/off visual.
   * @returns {HTMLElement}
   */
  _createSwitch() {
    const wrap = document.createElement('div');
    wrap.className = 'output-channel__switch-wrap';
    
    const switchEl = document.createElement('button');
    switchEl.type = 'button';
    switchEl.className = 'output-channel__switch';
    switchEl.classList.toggle('is-on', this.values.power);
    switchEl.setAttribute('aria-pressed', String(this.values.power));
    switchEl.setAttribute('aria-label', `Channel ${this.channelIndex + 1} power`);
    
    // Indicador visual
    const indicator = document.createElement('span');
    indicator.className = 'output-channel__switch-indicator';
    switchEl.appendChild(indicator);
    
    // Toggle power/mute del canal
    switchEl.addEventListener('click', () => {
      this.values.power = !this.values.power;
      switchEl.classList.toggle('is-on', this.values.power);
      switchEl.setAttribute('aria-pressed', String(this.values.power));
      // Mutear/desmutear el canal (power=true → muted=false)
      this.engine.setOutputMute(this.channelIndex, !this.values.power);
      if (!outputChannelOSCSync.shouldIgnoreOSC()) {
        outputChannelOSCSync.sendPowerChange(this.channelIndex, this.values.power);
      }
      flashGlow(switchEl);
      document.dispatchEvent(new CustomEvent('synth:userInteraction'));
    });
    
    this.powerSwitch = switchEl;
    wrap.appendChild(switchEl);
    
    return wrap;
  }
  
  /**
   * Crea el slider de nivel (funcional).
   * @returns {HTMLElement}
   */
  _createSlider() {
    const levelCfg = fadersConfig.level || {};
    
    const wrap = document.createElement('div');
    wrap.className = 'output-channel__slider-wrap';
    
    // Guardar referencia al wrap para glow de cambios programáticos
    this._sliderWrapEl = wrap;
    
    const shell = document.createElement('div');
    shell.className = 'output-channel__slider-shell';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(levelCfg.min ?? 0);
    slider.max = String(levelCfg.max ?? 1);
    slider.step = String(levelCfg.step ?? 0.001);
    slider.value = String(this.values.level);
    slider.className = 'output-channel__slider';
    slider.setAttribute('aria-label', `Level ${this.channelIndex + 1}`);
    slider.dataset.preventPan = 'true';
    
    this.slider = slider;
    
    // Value display (escala 0-10 del dial Synthi 100)
    const valueDisplay = document.createElement('div');
    valueDisplay.className = 'output-channel__value';
    valueDisplay.textContent = this.values.level.toFixed(2);
    this.valueDisplay = valueDisplay;
    
    // ─────────────────────────────────────────────────────────────────────
    // Tooltip con info técnica (voltaje VCA, ganancia, dB)
    // ─────────────────────────────────────────────────────────────────────
    // Registrar callback para ocultar tooltip en gestos de navegación
    this._tooltipHideCallback = () => {
      this._hideSliderTooltip();
    };
    this._unregisterTooltipHide = registerTooltipHideCallback(this._tooltipHideCallback);
    
    // Función generadora de contenido del tooltip
    // Usa funciones dinámicas que seleccionan el cálculo según el modo activo
    // En modo lineal: slider 5 → dial equivalente ~9.5 → voltaje ~-0.6V → ganancia ~0.5
    // En modo log: slider 5 → dial 5 → voltaje -6V → ganancia ~0.001
    const getTooltipInfo = getVCATooltipInfo(
      (sliderValue) => {
        // Calcular el dial efectivo según el modo
        const dialValue = isFaderLinearResponseEnabled() 
          ? sliderToDialLinear(sliderValue) 
          : sliderValue;
        return vcaDialToVoltage(dialValue);
      },
      (sliderValue, cv) => isFaderLinearResponseEnabled() 
        ? vcaCalculateGainLinear(sliderValue, cv) 
        : vcaCalculateGain(sliderValue, cv),
      () => this.values.externalCV
    );
    
    let lastCommittedValue = this.values.level;
    let rafId = null;
    let pendingValue = null;
    
    // ─────────────────────────────────────────────────────────────────────
    // Thumb-only drag: solo permitir arrastre si el pointer toca el thumb.
    // Si se toca el track (fuera del thumb), el slider no se mueve.
    // El thumb es vertical (writing-mode: vertical-lr, direction: rtl).
    // ─────────────────────────────────────────────────────────────────────
    let thumbGrabbed = false;
    const THUMB_HIT_MARGIN = 14; // px extra alrededor del thumb (10px alto + margen)
    
    const flushValue = () => {
      rafId = null;
      if (pendingValue == null) return;
      const dialValue = pendingValue;
      pendingValue = null;
      if (dialValue === lastCommittedValue) return;
      lastCommittedValue = dialValue;
      this.values.level = dialValue;
      
      // ─────────────────────────────────────────────────────────────────────
      // Calcular ganancia según el modo activo (lineal o logarítmico)
      // ─────────────────────────────────────────────────────────────────────
      // Modo lineal: el slider controla ganancia directamente (más intuitivo)
      // Modo logarítmico: curva auténtica del VCA CEM 3330 (10 dB/V)
      // ─────────────────────────────────────────────────────────────────────
      const gain = isFaderLinearResponseEnabled()
        ? vcaCalculateGainLinear(dialValue, this.values.externalCV)
        : vcaCalculateGain(dialValue, this.values.externalCV);
      
      // Rampa desde config para suavizar cambios manuales
      const ramp = rampsConfig.level ?? 0.06;
      this.engine.setOutputLevel(this.channelIndex, gain, { ramp });
      
      // Mostrar valor del dial (escala 0-10 del Synthi 100)
      valueDisplay.textContent = dialValue.toFixed(2);
      if (!outputChannelOSCSync.shouldIgnoreOSC()) {
        outputChannelOSCSync.sendLevelChange(this.channelIndex, dialValue);
      }
    };
    
    // ─────────────────────────────────────────────────────────────────────
    // Tooltip: mostrar al interactuar, ocultar al soltar
    // ─────────────────────────────────────────────────────────────────────
    slider.addEventListener('pointerdown', (ev) => {
      if (shouldBlockInteraction(ev)) return;
      // Thumb-only: comprobar si el pointer está sobre el thumb
      // El slider es vertical (writing-mode: vertical-lr, direction: rtl)
      // top = max value (10), bottom = min value (0)
      const sliderRect = slider.getBoundingClientRect();
      const currentVal = Number(slider.value);
      const minVal = Number(slider.min);
      const maxVal = Number(slider.max);
      const ratio = (currentVal - minVal) / (maxVal - minVal);
      // En vertical-lr + rtl: ratio 0 = bottom, ratio 1 = top
      const thumbY = sliderRect.bottom - ratio * sliderRect.height;
      const pointerY = ev.clientY;
      thumbGrabbed = Math.abs(pointerY - thumbY) <= THUMB_HIT_MARGIN;
      if (window._synthApp && window._synthApp.ensureAudio) {
        window._synthApp.ensureAudio();
      }
      if (ev.pointerType === 'touch') {
        // En táctil, retrasar tooltip para evitar flash durante gestos de pan/zoom
        if (this._sliderTooltipDelayTimer) clearTimeout(this._sliderTooltipDelayTimer);
        this._sliderTooltipDelayTimer = setTimeout(() => {
          this._sliderTooltipDelayTimer = null;
          if (!isNavGestureActive()) {
            this._showSliderTooltip(wrap, getTooltipInfo);
          }
        }, 80);
      } else {
        this._showSliderTooltip(wrap, getTooltipInfo);
      }
    });
    
    slider.addEventListener('pointerup', () => {
      // Notificar interacción al soltar (una vez por gesto, no durante drag)
      document.dispatchEvent(new CustomEvent('synth:userInteraction'));
      // Si el timer de tooltip estaba pendiente (tap rápido), mostrar ahora
      const tooltipWasPending = !!this._sliderTooltipDelayTimer;
      if (this._sliderTooltipDelayTimer) {
        clearTimeout(this._sliderTooltipDelayTimer);
        this._sliderTooltipDelayTimer = null;
      }
      if (tooltipWasPending && !isNavGestureActive()) {
        // El tap fue tan rápido que el tooltip no llegó a mostrarse
        this._showSliderTooltip(wrap, getTooltipInfo);
      }
      // En táctil, auto-ocultar después de un delay
      if (hasTouchCapability()) {
        this._scheduleTooltipAutoHide();
      } else {
        // En desktop, ocultar inmediatamente al soltar
        this._hideSliderTooltip();
      }
    });
    
    slider.addEventListener('pointercancel', () => {
      if (this._sliderTooltipDelayTimer) {
        clearTimeout(this._sliderTooltipDelayTimer);
        this._sliderTooltipDelayTimer = null;
      }
      this._hideSliderTooltip();
    });
    
    // En desktop: mostrar en hover, ocultar al salir
    slider.addEventListener('mouseenter', () => {
      if (!hasTouchCapability()) {
        this._showSliderTooltip(wrap, getTooltipInfo);
      }
    });
    
    slider.addEventListener('mouseleave', () => {
      if (!hasTouchCapability() && !slider.matches(':active')) {
        this._hideSliderTooltip();
      }
    });

    // Forzar cierre del tooltip cuando el viewport se anima (zoom a panel vía teclado)
    document.addEventListener('synth:dismissTooltips', () => {
      this._hideSliderTooltip();
    });
    
    slider.addEventListener('input', () => {
      if (isNavGestureActive() || !thumbGrabbed) {
        // Bloquear: gesto de navegación activo o no se agarró el thumb
        slider.value = String(lastCommittedValue);
        return;
      }
      pendingValue = Number(slider.value);
      if (!rafId) {
        rafId = requestAnimationFrame(flushValue);
      }
      // Actualizar tooltip mientras se arrastra (usar valor actual del slider, no el diferido)
      this._updateSliderTooltip(getTooltipInfo, pendingValue);
    });
    
    shell.appendChild(slider);
    wrap.appendChild(shell);
    wrap.appendChild(valueDisplay);
    
    return wrap;
  }
  
  /**
   * Genera el contenido HTML del tooltip del slider.
   * @param {function} getTooltipInfo - Función que genera la info técnica
   * @param {number} [currentValue] - Valor actual (usa this.values.level si no se pasa)
   * @returns {string}
   */
  _generateSliderTooltipContent(getTooltipInfo, currentValue) {
    const dialValue = currentValue ?? this.values.level;
    const mainText = dialValue.toFixed(2);
    const extraInfo = getTooltipInfo(dialValue);
    
    if (extraInfo) {
      return `<div class="knob-tooltip__main">${mainText}</div>` +
             `<div class="knob-tooltip__info">${extraInfo}</div>`;
    }
    return mainText;
  }
  
  /**
   * Muestra el tooltip del slider.
   * @param {HTMLElement} wrapEl - Elemento contenedor del slider
   * @param {function} getTooltipInfo - Función que genera la info técnica
   */
  _showSliderTooltip(wrapEl, getTooltipInfo) {
    // Ocultar otros tooltips (knobs, matrix) para evitar superposición
    hideOtherTooltips(this._tooltipHideCallback);
    
    // Cancelar auto-hide pendiente
    if (this._sliderTooltipAutoHideTimer) {
      clearTimeout(this._sliderTooltipAutoHideTimer);
      this._sliderTooltipAutoHideTimer = null;
    }
    
    if (this._sliderTooltip) {
      // Ya existe, solo actualizar
      this._updateSliderTooltip(getTooltipInfo);
      return;
    }
    
    // Guardar referencia para poder quitar la clase después
    this._sliderWrapEl = wrapEl;
    
    this._sliderTooltip = document.createElement('div');
    this._sliderTooltip.className = 'knob-tooltip';  // Reutilizar estilos de knob
    this._sliderTooltip.innerHTML = this._generateSliderTooltipContent(getTooltipInfo);
    document.body.appendChild(this._sliderTooltip);
    this._positionSliderTooltip(wrapEl);
    
    // Forzar reflow para activar transición
    this._sliderTooltip.offsetHeight;
    this._sliderTooltip.classList.add('is-visible');
    
    // Añadir clase de iluminación al slider wrap
    wrapEl.classList.add('is-tooltip-active');
  }
  
  /**
   * Posiciona el tooltip encima del slider.
   * @param {HTMLElement} wrapEl - Elemento contenedor del slider
   */
  _positionSliderTooltip(wrapEl) {
    if (!this._sliderTooltip) return;
    
    const rect = wrapEl.getBoundingClientRect();
    const tooltipRect = this._sliderTooltip.getBoundingClientRect();
    
    // Posicionar a la izquierda del slider (porque es vertical)
    let left = rect.left - tooltipRect.width - 8;
    let top = rect.top + rect.height / 2 - tooltipRect.height / 2;
    
    // Ajustar si sale de la pantalla
    if (left < 4) {
      // Poner a la derecha si no cabe a la izquierda
      left = rect.right + 8;
    }
    if (top < 4) top = 4;
    if (top + tooltipRect.height > window.innerHeight - 4) {
      top = window.innerHeight - tooltipRect.height - 4;
    }
    
    this._sliderTooltip.style.left = `${left}px`;
    this._sliderTooltip.style.top = `${top}px`;
  }
  
  /**
   * Actualiza el contenido del tooltip.
   * @param {function} getTooltipInfo - Función que genera la info técnica
   * @param {number} [currentValue] - Valor actual del slider
   */
  _updateSliderTooltip(getTooltipInfo, currentValue) {
    if (this._sliderTooltip) {
      this._sliderTooltip.innerHTML = this._generateSliderTooltipContent(getTooltipInfo, currentValue);
    }
  }
  
  /**
   * Oculta y elimina el tooltip del slider.
   */
  _hideSliderTooltip() {
    // Limpiar timer de tooltip retrasado (táctil)
    if (this._sliderTooltipDelayTimer) {
      clearTimeout(this._sliderTooltipDelayTimer);
      this._sliderTooltipDelayTimer = null;
    }
    
    if (this._sliderTooltipAutoHideTimer) {
      clearTimeout(this._sliderTooltipAutoHideTimer);
      this._sliderTooltipAutoHideTimer = null;
    }
    
    if (!this._sliderTooltip) return;
    
    this._sliderTooltip.classList.remove('is-visible');
    const tooltip = this._sliderTooltip;
    this._sliderTooltip = null;
    
    // Quitar clase de iluminación del slider wrap
    if (this._sliderWrapEl) {
      this._sliderWrapEl.classList.remove('is-tooltip-active');
    }
    
    // Eliminar después de la transición
    setTimeout(() => {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    }, 150);
  }
  
  /**
   * Programa el auto-ocultado del tooltip (para táctil).
   */
  _scheduleTooltipAutoHide() {
    if (this._sliderTooltipAutoHideTimer) {
      clearTimeout(this._sliderTooltipAutoHideTimer);
    }
    this._sliderTooltipAutoHideTimer = setTimeout(() => {
      this._hideSliderTooltip();
    }, this._sliderTooltipAutoHideDelay);
  }
  
  /**
   * Serializa el estado del canal para guardarlo.
   * @returns {Object} Estado serializado
   */
  serialize() {
    return {
      level: this.values.level,
      filter: this.values.filter,
      pan: this.values.pan,
      power: this.values.power
    };
  }
  
  /**
   * Restaura el estado del canal desde datos guardados.
   * @param {Object} data - Estado serializado
   */
  deserialize(data) {
    if (!data) return;
    
    if (typeof data.level === 'number') {
      this.values.level = data.level;
      if (this.slider) {
        this.slider.value = String(data.level);
      }
      if (this.valueDisplay) {
        this.valueDisplay.textContent = data.level.toFixed(2);
      }
      // VCA CEM 3330: convertir dial + CV externo a ganancia
      // Usar función según modo de respuesta del fader
      const gain = isFaderLinearResponseEnabled()
        ? vcaCalculateGainLinear(data.level, this.values.externalCV)
        : vcaCalculateGain(data.level, this.values.externalCV);
      this.engine.setOutputLevel(this.channelIndex, gain, { ramp: 0.06 });
      // Flash de glow en el slider wrap
      if (this._sliderWrapEl) {
        flashGlow(this._sliderWrapEl);
      }
    }
    
    // Filtro: actualizar valor y visual del knob
    if (typeof data.filter === 'number') {
      this.values.filter = data.filter;
      this.engine.setOutputFilter(this.channelIndex, data.filter);
      if (this.filterKnobUI) {
        this.filterKnobUI.setValue(data.filter);
      }
    }
    
    if (typeof data.pan === 'number') {
      this.values.pan = data.pan;
      this.engine.setOutputPan(this.channelIndex, data.pan);
      if (this.panKnobUI) {
        this.panKnobUI.setValue(data.pan);
      }
    }
    
    if (typeof data.power === 'boolean') {
      this.values.power = data.power;
      if (this.powerSwitch) {
        this.powerSwitch.classList.toggle('is-on', data.power);
        this.powerSwitch.setAttribute('aria-pressed', String(data.power));
        flashGlow(this.powerSwitch);
      }
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONTROL POR VOLTAJE EXTERNO (CV desde matriz Panel 6)
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Establece el voltaje de control externo (CV) desde la matriz.
   * 
   * En el hardware Synthi 100 (Cuenca 1982), el CV de las columnas 42-49
   * del Panel 6 se suma algebraicamente al voltaje del fader antes de
   * alimentar el VCA CEM 3330.
   * 
   * COMPORTAMIENTO:
   * - El CV se suma al voltaje del fader (-12V a 0V)
   * - La ganancia se recalcula con vcaCalculateGain()
   * - Si el fader está en posición 0, el CV se IGNORA (corte mecánico)
   * - CV positivo puede aumentar ganancia más allá de 0dB (saturación)
   * - CV negativo reduce la ganancia (atenuación adicional)
   * 
   * ESCALA DE VOLTAJE:
   * - La matriz genera señales de -1 a +1 (normalizado)
   * - El gain de la conexión escala esto a voltios reales
   * - Típicamente el rango efectivo es ±4V a ±6V
   * 
   * @param {number} voltage - Voltaje de control en voltios (típico: -4V a +4V)
   * @param {Object} [options] - Opciones de aplicación
   * @param {number} [options.ramp=0.01] - Tiempo de rampa en segundos
   */
  setExternalCV(voltage, { ramp = 0.01 } = {}) {
    // Almacenar el CV para uso posterior (cuando cambie el fader)
    this.values.externalCV = voltage;
    
    // ─────────────────────────────────────────────────────────────────────
    // Recalcular ganancia con el nuevo CV
    // ─────────────────────────────────────────────────────────────────────
    // Usa el modo de respuesta configurado (lineal o logarítmico)
    // ─────────────────────────────────────────────────────────────────────
    const gain = isFaderLinearResponseEnabled()
      ? vcaCalculateGainLinear(this.values.level, voltage)
      : vcaCalculateGain(this.values.level, voltage);
    
    // Aplicar la ganancia al engine con rampa suave
    this.engine.setOutputLevel(this.channelIndex, gain, { ramp });
  }
  
  /**
   * Obtiene el voltaje de control externo actual.
   * @returns {number} Voltaje en voltios
   */
  getExternalCV() {
    return this.values.externalCV;
  }
}

/**
 * Contenedor para los 8 output channels del Panel 7.
 * Gestiona la creación y serialización de todos los canales.
 * Usa configuración de panel7.config.js.
 */
export class OutputChannelsPanel {
  /**
   * @param {Object} engine - AudioEngine instance
   * @param {number} [channelCount] - Número de canales (default desde config)
   */
  constructor(engine, channelCount) {
    this.engine = engine;
    // Usar el count del config si no se especifica
    this.channelCount = channelCount ?? outputChannelConfig.count ?? 8;
    this.channels = [];
  }
  
  /**
   * Crea todos los canales dentro del contenedor.
   * @param {HTMLElement} container - Elemento contenedor (row flex)
   */
  createPanel(container) {
    container.classList.add('output-channels-row');
    
    for (let i = 0; i < this.channelCount; i++) {
      const channel = new OutputChannel(this.engine, i);
      channel.createPanel(container);
      this.channels.push(channel);
    }
  }
  
  /**
   * Serializa el estado de todos los canales.
   * @returns {Object} Estado serializado
   */
  serialize() {
    return {
      channels: this.channels.map(ch => ch.serialize())
    };
  }
  
  /**
   * Restaura el estado de todos los canales.
   * Compatible con formato antiguo { levels: [...] } y nuevo { channels: [...] }.
   * @param {Object} data - Estado serializado
   */
  deserialize(data) {
    if (!data) return;
    
    // Formato nuevo: { channels: [{ level, filter, pan, power }, ...] }
    if (Array.isArray(data.channels)) {
      data.channels.forEach((chData, idx) => {
        if (this.channels[idx]) {
          this.channels[idx].deserialize(chData);
        }
      });
      return;
    }
    
    // Formato antiguo: { levels: [0.5, 0.3, ...] }
    if (Array.isArray(data.levels)) {
      data.levels.forEach((level, idx) => {
        if (this.channels[idx] && typeof level === 'number') {
          this.channels[idx].deserialize({ level });
        }
      });
    }
  }
  
  /**
   * Obtiene un canal individual por su índice.
   * 
   * Usado por app.js para enviar CV desde la matriz al canal correspondiente.
   * 
   * @param {number} channelIndex - Índice del canal (0-7)
   * @returns {OutputChannel|null} El canal o null si no existe
   */
  getChannel(channelIndex) {
    return this.channels[channelIndex] ?? null;
  }
}
