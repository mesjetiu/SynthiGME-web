/**
 * OutputChannel - Módulo individual de canal de salida
 * 
 * Cada instancia representa un canal de salida con:
 * - Knob Filter (visual, sin funcionalidad por ahora)
 * - Knob Pan (visual, sin funcionalidad por ahora)
 * - Switch On/Off (visual, sin funcionalidad por ahora)
 * - Slider Level (funcional, controla engine.setOutputLevel)
 * 
 * Usa ModuleFrame para el panel visual estilo Panel 2/3.
 * 
 * @module modules/outputChannel
 */

import { Module } from '../core/engine.js';
import { ModuleFrame } from '../ui/moduleFrame.js';
import { Knob } from '../ui/knob.js';
import { shouldBlockInteraction, isNavGestureActive } from '../utils/input.js';

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
    
    // Estado
    this.values = {
      level: engine.getOutputLevel(channelIndex) ?? 0,
      filter: engine.getOutputFilter ? (engine.getOutputFilter(channelIndex) ?? 0.0) : 0.0, // -1 a +1, 0 = sin filtro
      pan: engine.outputPans?.[channelIndex] ?? 0.0, // -1 = izquierda, 0 = centro, +1 = derecha
      power: true   // Solo visual por ahora
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
    const wrap = document.createElement('div');
    wrap.className = 'output-channel__knob-wrap';
    wrap.dataset.knob = 'filter';
    
    // Estructura compatible con clase Knob: .knob > .knob-inner
    const knob = document.createElement('div');
    knob.className = 'output-channel__knob knob';
    knob.dataset.preventPan = 'true';
    
    const knobInner = document.createElement('div');
    knobInner.className = 'output-channel__knob-inner knob-inner';
    knob.appendChild(knobInner);
    
    const labelEl = document.createElement('div');
    labelEl.className = 'output-channel__knob-label';
    labelEl.textContent = 'Filter';
    
    wrap.appendChild(knob);
    wrap.appendChild(labelEl);
    
    // Guardar referencia para inicialización posterior
    this.filterKnobEl = knob;
    
    return wrap;
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
    const wrap = document.createElement('div');
    wrap.className = 'output-channel__knob-wrap';
    wrap.dataset.knob = 'pan';
    
    // Estructura compatible con clase Knob: .knob > .knob-inner
    const knob = document.createElement('div');
    knob.className = 'output-channel__knob knob';
    knob.dataset.preventPan = 'true';
    
    const knobInner = document.createElement('div');
    knobInner.className = 'output-channel__knob-inner knob-inner';
    knob.appendChild(knobInner);
    
    const labelEl = document.createElement('div');
    labelEl.className = 'output-channel__knob-label';
    labelEl.textContent = 'Pan';
    
    wrap.appendChild(knob);
    wrap.appendChild(labelEl);
    
    // Guardar referencia para inicialización posterior
    this.panKnobEl = knob;
    
    return wrap;
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
    // Inicializar Filter Knob
    if (this.filterKnobEl && !this.filterKnobUI) {
      this.filterKnobUI = new Knob(this.filterKnobEl, {
        min: -1,          // Lowpass máximo
        max: 1,           // Highpass máximo
        initial: this.values.filter, // 0 = sin filtro (centro)
        pixelsForFullRange: 900,  // Alta resolución (6× para mayor precisión)
        onChange: (value) => {
          this.values.filter = value;
          this.engine.setOutputFilter(this.channelIndex, value);
          document.dispatchEvent(new CustomEvent('synth:userInteraction'));
        }
      });
    }
    
    // Inicializar Pan Knob
    if (this.panKnobEl && !this.panKnobUI) {
      this.panKnobUI = new Knob(this.panKnobEl, {
        min: -1,          // Full izquierda
        max: 1,           // Full derecha
        initial: this.values.pan, // 0 = centro
        pixelsForFullRange: 900,  // Alta resolución (6× para mayor precisión)
        onChange: (value) => {
          this.values.pan = value;
          this.engine.setOutputPan(this.channelIndex, value);
          document.dispatchEvent(new CustomEvent('synth:userInteraction'));
        }
      });
    }
  }
  
  /**
   * Crea un knob visual (sin funcionalidad por ahora).
   * @param {string} name - Nombre del knob
   * @param {string} label - Etiqueta visible
   * @param {number} initialValue - Valor inicial (0-1)
   * @returns {HTMLElement}
   */
  _createKnob(name, label, initialValue) {
    const wrap = document.createElement('div');
    wrap.className = 'output-channel__knob-wrap';
    wrap.dataset.knob = name;
    
    const knob = document.createElement('div');
    knob.className = 'output-channel__knob';
    knob.dataset.value = initialValue;
    
    // Visual del knob (círculo con indicador)
    const knobInner = document.createElement('div');
    knobInner.className = 'output-channel__knob-inner';
    
    // Calcular rotación: 0 = -135deg, 1 = 135deg
    const rotation = -135 + (initialValue * 270);
    knobInner.style.transform = `rotate(${rotation}deg)`;
    
    knob.appendChild(knobInner);
    
    const labelEl = document.createElement('div');
    labelEl.className = 'output-channel__knob-label';
    labelEl.textContent = label;
    
    wrap.appendChild(knob);
    wrap.appendChild(labelEl);
    
    return wrap;
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
    const wrap = document.createElement('div');
    wrap.className = 'output-channel__slider-wrap';
    
    const shell = document.createElement('div');
    shell.className = 'output-channel__slider-shell';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.001';
    slider.value = String(this.values.level);
    slider.className = 'output-channel__slider';
    slider.setAttribute('aria-label', `Level ${this.channelIndex + 1}`);
    slider.dataset.preventPan = 'true';
    
    this.slider = slider;
    
    // Value display
    const valueDisplay = document.createElement('div');
    valueDisplay.className = 'output-channel__value';
    valueDisplay.textContent = this.values.level.toFixed(3);
    this.valueDisplay = valueDisplay;
    
    let lastCommittedValue = this.values.level;
    let rafId = null;
    let pendingValue = null;
    
    const flushValue = () => {
      rafId = null;
      if (pendingValue == null) return;
      const numericValue = pendingValue;
      pendingValue = null;
      if (numericValue === lastCommittedValue) return;
      lastCommittedValue = numericValue;
      this.values.level = numericValue;
      this.engine.setOutputLevel(this.channelIndex, numericValue, { ramp: 0.06 });
      valueDisplay.textContent = numericValue.toFixed(3);
      document.dispatchEvent(new CustomEvent('synth:userInteraction'));
    };
    
    slider.addEventListener('pointerdown', (ev) => {
      if (shouldBlockInteraction(ev)) return;
      if (window._synthApp && window._synthApp.ensureAudio) {
        window._synthApp.ensureAudio();
      }
    });
    
    slider.addEventListener('input', () => {
      if (isNavGestureActive()) {
        slider.value = String(lastCommittedValue);
        return;
      }
      pendingValue = Number(slider.value);
      if (!rafId) {
        rafId = requestAnimationFrame(flushValue);
      }
    });
    
    shell.appendChild(slider);
    wrap.appendChild(shell);
    wrap.appendChild(valueDisplay);
    
    return wrap;
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
      this.engine.setOutputLevel(this.channelIndex, data.level, { ramp: 0.06 });
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
      }
    }
  }
}

/**
 * Contenedor para los 8 output channels del Panel 7.
 * Gestiona la creación y serialización de todos los canales.
 */
export class OutputChannelsPanel {
  /**
   * @param {Object} engine - AudioEngine instance
   * @param {number} [channelCount=8] - Número de canales a crear
   */
  constructor(engine, channelCount = 8) {
    this.engine = engine;
    this.channelCount = channelCount;
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
}
