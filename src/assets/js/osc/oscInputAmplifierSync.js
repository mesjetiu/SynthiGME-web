/**
 * OSC Input Amplifier Sync - Sincronización de amplificadores de entrada via OSC
 * 
 * Gestiona el envío y recepción de mensajes OSC para los 8 canales
 * de entrada del Panel 2. Convierte entre valores UI (0-1) y valores OSC (0-10).
 * 
 * @module osc/oscInputAmplifierSync
 * @see /OSC.md - Documentación del protocolo
 */

import { oscBridge } from './oscBridge.js';
import { uiToOSCValue, oscToUIValue } from './oscAddressMap.js';

/**
 * Clase que gestiona la sincronización OSC de amplificadores de entrada
 */
class InputAmplifierOSCSync {
  constructor() {
    /** @type {Map<string, Function>} Funciones para cancelar suscripciones */
    this._unsubscribers = new Map();
    
    /** @type {Object|null} Referencia a la instancia de app */
    this._app = null;
    
    /** @type {boolean} Flag para evitar loops de retroalimentación */
    this._ignoreOSCUpdates = false;
    
    /** @type {Map<string, number>} Cache de últimos valores enviados para deduplicación */
    this._lastSentValues = new Map();
  }

  /**
   * Inicializa la sincronización OSC para amplificadores de entrada
   * 
   * @param {Object} app - Instancia de SGMEApp
   */
  init(app) {
    this._app = app;
    this._setupListeners();
    console.log('[InputAmplifierOSCSync] Inicializado para 8 canales');
  }

  /**
   * Envía un cambio de nivel via OSC
   * 
   * @param {number} channel - Canal (0-based)
   * @param {number} uiValue - Valor del knob (0-1)
   */
  sendLevelChange(channel, uiValue) {
    if (!oscBridge.connected) return;
    
    const oscValue = uiToOSCValue(uiValue, 'in', 'level');
    const address = `in/${channel + 1}/level`;
    
    // Deduplicación
    const lastValue = this._lastSentValues.get(address);
    if (lastValue !== undefined && Math.abs(lastValue - oscValue) < 0.0001) {
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

    for (let ch = 1; ch <= 8; ch++) {
      const address = `in/${ch}/level`;
      const unsub = oscBridge.on(address, (value) => {
        this._handleIncomingLevel(ch - 1, value);
      });
      this._unsubscribers.set(`in-${ch}-level`, unsub);
    }
  }

  /**
   * Procesa un mensaje OSC entrante de nivel
   * 
   * @param {number} channel - Canal (0-based)
   * @param {number} oscValue - Valor en escala OSC (0-10)
   * @private
   */
  _handleIncomingLevel(channel, oscValue) {
    if (this._ignoreOSCUpdates || !this._app) return;

    const uiValue = oscToUIValue(oscValue, 'in', 'level');

    this._ignoreOSCUpdates = true;

    try {
      // Actualizar módulo de audio
      if (this._app.inputAmplifiers) {
        this._app.inputAmplifiers.setLevel(channel, uiValue);
      }
      
      // Actualizar UI
      const inputAmpUI = this._app._inputAmplifierUIs?.['input-amplifiers'];
      if (inputAmpUI && inputAmpUI.knobs?.[channel]) {
        inputAmpUI.knobs[channel].setValue(uiValue);
      }
    } finally {
      setTimeout(() => {
        this._ignoreOSCUpdates = false;
      }, 10);
    }
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

/** @type {InputAmplifierOSCSync} Instancia singleton */
const inputAmplifierOSCSync = new InputAmplifierOSCSync();

export { inputAmplifierOSCSync, InputAmplifierOSCSync };
export default inputAmplifierOSCSync;
