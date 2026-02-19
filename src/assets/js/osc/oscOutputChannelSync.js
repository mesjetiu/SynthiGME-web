/**
 * OSC Output Channel Sync - Sincronización de canales de salida via OSC
 * 
 * Gestiona el envío y recepción de mensajes OSC para los 8 canales
 * de salida del Panel 7. Convierte entre valores UI y valores OSC.
 * 
 * Parámetros:
 * - level: 0-10 (fader, escala directa)
 * - filter: -5 a 5 (knob bipolar)
 * - pan: 0-10 (knob, mapeado internamente -1..+1)
 * - on: 0 | 1 (switch de encendido)
 * 
 * @module osc/oscOutputChannelSync
 * @see /OSC.md - Documentación del protocolo
 */

import { oscBridge } from './oscBridge.js';
import {
  vcaCalculateGain,
  vcaCalculateGainLinear,
  sliderToDialLinear,
  isFaderLinearResponseEnabled
} from '../utils/voltageConstants.js';
import { flashGlow } from '../ui/glowManager.js';

/**
 * Clase que gestiona la sincronización OSC de canales de salida
 */
class OutputChannelOSCSync {
  constructor() {
    /** @type {Map<string, Function>} Funciones para cancelar suscripciones */
    this._unsubscribers = new Map();
    
    /** @type {Object|null} Referencia a la instancia de app */
    this._app = null;
    
    /** @type {boolean} Flag para evitar loops de retroalimentación */
    this._ignoreOSCUpdates = false;
    
    /** @type {Map<string, *>} Cache de últimos valores enviados para deduplicación */
    this._lastSentValues = new Map();
  }

  /**
   * Inicializa la sincronización OSC para canales de salida
   * 
   * @param {Object} app - Instancia de SGMEApp
   */
  init(app) {
    this._app = app;
    this._setupListeners();
    console.log('[OutputChannelOSCSync] Inicializado para 8 canales');
  }

  /**
   * Envía un cambio de nivel (fader) via OSC
   * 
   * @param {number} channel - Canal (0-based)
   * @param {number} dialValue - Valor del fader (0-10)
   */
  sendLevelChange(channel, dialValue) {
    if (!oscBridge.connected) return;
    
    const address = `out/${channel + 1}/level`;
    
    const lastValue = this._lastSentValues.get(address);
    if (lastValue !== undefined && Math.abs(lastValue - dialValue) < 0.0001) {
      return;
    }
    this._lastSentValues.set(address, dialValue);
    
    oscBridge.send(address, dialValue);
  }

  /**
   * Envía un cambio de filtro via OSC
   * 
   * @param {number} channel - Canal (0-based)
   * @param {number} value - Valor bipolar (-5 a 5)
   */
  sendFilterChange(channel, value) {
    if (!oscBridge.connected) return;
    
    const address = `out/${channel + 1}/filter`;
    
    const lastValue = this._lastSentValues.get(address);
    if (lastValue !== undefined && Math.abs(lastValue - value) < 0.0001) {
      return;
    }
    this._lastSentValues.set(address, value);
    
    oscBridge.send(address, value);
  }

  /**
   * Envía un cambio de pan via OSC
   * 
   * @param {number} channel - Canal (0-based)
   * @param {number} value - Valor interno del pan (-1 a 1)
   */
  sendPanChange(channel, value) {
    if (!oscBridge.connected) return;
    
    // Convertir de rango interno (-1..+1) a escala OSC (0-10)
    // -1 = 0, 0 = 5, +1 = 10
    const oscValue = (value + 1) * 5;
    const address = `out/${channel + 1}/pan`;
    
    const lastValue = this._lastSentValues.get(address);
    if (lastValue !== undefined && Math.abs(lastValue - oscValue) < 0.0001) {
      return;
    }
    this._lastSentValues.set(address, oscValue);
    
    oscBridge.send(address, oscValue);
  }

  /**
   * Envía un cambio de switch on/off via OSC
   * 
   * @param {number} channel - Canal (0-based)
   * @param {boolean} isOn - Estado del switch
   */
  sendPowerChange(channel, isOn) {
    if (!oscBridge.connected) return;
    
    const oscValue = isOn ? 1 : 0;
    const address = `out/${channel + 1}/on`;
    
    if (this._lastSentValues.get(address) === oscValue) {
      return;
    }
    this._lastSentValues.set(address, oscValue);
    
    oscBridge.send(address, oscValue);
  }

  /**
   * Configura los listeners para recibir mensajes OSC
   * @private
   */
  _setupListeners() {
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers.clear();

    const params = ['level', 'filter', 'pan', 'on'];
    
    for (let ch = 1; ch <= 8; ch++) {
      for (const param of params) {
        const address = `out/${ch}/${param}`;
        const unsub = oscBridge.on(address, (value) => {
          this._handleIncoming(ch - 1, param, value);
        });
        this._unsubscribers.set(`out-${ch}-${param}`, unsub);
      }
    }
  }

  /**
   * Procesa un mensaje OSC entrante
   * 
   * @param {number} channel - Canal (0-based)
   * @param {string} param - Nombre del parámetro
   * @param {*} oscValue - Valor OSC
   * @private
   */
  _handleIncoming(channel, param, oscValue) {
    if (this._ignoreOSCUpdates || !this._app) return;

    this._ignoreOSCUpdates = true;

    try {
      const outputChannel = this._app._outputChannelsPanel?.getChannel(channel);
      if (!outputChannel) return;

      switch (param) {
        case 'level':
          // OSC value = dial (0-10), aplicar directamente al slider
          outputChannel.values.level = oscValue;
          if (outputChannel.slider) {
            outputChannel.slider.value = String(oscValue);
          }
          if (outputChannel.valueDisplay) {
            outputChannel.valueDisplay.textContent = oscValue.toFixed(2);
          }
          // Aplicar al motor de audio (necesita ganancia, no dial)
          this._applyLevel(outputChannel, oscValue);
          // Flash de glow en el slider wrap
          if (outputChannel._sliderWrapEl) {
            flashGlow(outputChannel._sliderWrapEl);
          }
          break;
          
        case 'filter':
          // OSC value = bipolar (-5 a 5)
          outputChannel.values.filter = oscValue;
          if (outputChannel.filterKnobUI) {
            outputChannel.filterKnobUI.setValue(oscValue);
          }
          outputChannel.engine.setOutputFilter(channel, oscValue, { ramp: 0.2 });
          break;
          
        case 'pan':
          // OSC value 0-10, convertir a interno -1..+1
          const panInternal = (oscValue / 5) - 1;
          outputChannel.values.pan = panInternal;
          if (outputChannel.panKnobUI) {
            outputChannel.panKnobUI.setValue(panInternal);
          }
          outputChannel.engine.setOutputPan(channel, panInternal, { ramp: 0.2 });
          break;
          
        case 'on':
          const isOn = oscValue === 1 || oscValue === true;
          outputChannel.values.power = isOn;
          if (outputChannel.powerSwitch) {
            outputChannel.powerSwitch.classList.toggle('is-on', isOn);
            outputChannel.powerSwitch.setAttribute('aria-pressed', String(isOn));
            flashGlow(outputChannel.powerSwitch);
          }
          outputChannel.engine.setOutputMute(channel, !isOn);
          break;
      }
    } finally {
      setTimeout(() => {
        this._ignoreOSCUpdates = false;
      }, 10);
    }
  }

  /**
   * Aplica el nivel de dial al motor de audio, calculando la ganancia
   * según el modo activo (lineal o logarítmico)
   * 
   * @param {Object} outputChannel - Instancia de OutputChannel
   * @param {number} dialValue - Valor de dial (0-10)
   * @private
   */
  _applyLevel(outputChannel, dialValue) {
    const cv = outputChannel.values.externalCV || 0;
    const gain = isFaderLinearResponseEnabled()
      ? vcaCalculateGainLinear(dialValue, cv)
      : vcaCalculateGain(dialValue, cv);
    const ramp = 0.06;
    outputChannel.engine.setOutputLevel(outputChannel.channelIndex, gain, { ramp });
  }

  /**
   * Verifica si debe ignorar actualizaciones OSC
   * @returns {boolean}
   */
  shouldIgnoreOSC() {
    return this._ignoreOSCUpdates;
  }

  /**
   * Desconecta todos los listeners
   */
  destroy() {
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers.clear();
    this._app = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton y exportación
// ─────────────────────────────────────────────────────────────────────────────

/** @type {OutputChannelOSCSync} Instancia singleton */
const outputChannelOSCSync = new OutputChannelOSCSync();

export { outputChannelOSCSync, OutputChannelOSCSync };
export default outputChannelOSCSync;
