/**
 * OSC PVC Sync — Sincronización del Pitch to Voltage Converter via OSC
 *
 * Gestiona el envío y recepción de mensajes OSC para el convertidor
 * pitch-a-voltaje del Panel 4. Módulo único (sin índice).
 *
 * Direcciones OSC:
 *   /pvc/range — 0 a 10 (spread del pitch, 7 = unity 1:1)
 *
 * @module osc/oscPitchToVoltageConverterSync
 * @see /OSC.md — Documentación del protocolo
 */

import { oscBridge } from './oscBridge.js';

/**
 * Mapeo de claves de parámetro a direcciones OSC
 * @type {Object<string, string>}
 */
const PARAM_TO_ADDRESS = {
  range: 'pvc/range'
};

/**
 * Mapeo de parámetros a métodos del módulo de audio
 * @type {Object<string, string>}
 */
const PARAM_TO_AUDIO_METHOD = {
  range: 'setRange'
};

/**
 * Clase que gestiona la sincronización OSC del Pitch to Voltage Converter
 */
class PitchToVoltageConverterOSCSync {
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
   * Inicializa la sincronización OSC para el PVC.
   * @param {Object} app - Instancia de SGMEApp
   */
  init(app) {
    this._app = app;
    this._setupListeners();
    console.log('[PVCOSCSync] Inicializado');
  }

  /**
   * Envía un cambio de parámetro via OSC.
   *
   * @param {string} param - Clave del parámetro ('range')
   * @param {number} dialValue - Valor del dial
   */
  sendChange(param, dialValue) {
    if (!oscBridge.connected) return;

    const address = PARAM_TO_ADDRESS[param];
    if (!address) return;

    // Deduplicación: no enviar si el valor no cambió
    const lastValue = this._lastSentValues.get(address);
    if (lastValue !== undefined && Math.abs(lastValue - dialValue) < 0.0001) {
      return;
    }
    this._lastSentValues.set(address, dialValue);

    oscBridge.send(address, dialValue);
  }

  /**
   * Configura los listeners para recibir mensajes OSC.
   * @private
   */
  _setupListeners() {
    // Limpiar suscripciones anteriores
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers.clear();

    for (const [param, address] of Object.entries(PARAM_TO_ADDRESS)) {
      const unsub = oscBridge.on(address, (value) => {
        this._handleIncoming(param, value);
      });
      this._unsubscribers.set(param, unsub);
    }
  }

  /**
   * Procesa un mensaje OSC entrante.
   *
   * @param {string} param - Clave del parámetro
   * @param {number} oscValue - Valor recibido via OSC
   * @private
   */
  _handleIncoming(param, oscValue) {
    if (this._ignoreOSCUpdates || !this._app) return;

    this._ignoreOSCUpdates = true;

    try {
      // Obtener módulo de audio
      const audioModule = this._app._panel4LayoutData?.pvcAudio;

      // Obtener UI
      const pvcUI = this._app._pvcUI;

      // Aplicar al módulo de audio
      const audioMethod = PARAM_TO_AUDIO_METHOD[param];
      if (audioModule && audioMethod && typeof audioModule[audioMethod] === 'function') {
        audioModule[audioMethod](oscValue);
      }

      // Actualizar knob en la UI
      if (pvcUI?.knobs?.[param]) {
        pvcUI.knobs[param].setValue(oscValue);
      }
    } finally {
      setTimeout(() => {
        this._ignoreOSCUpdates = false;
      }, 10);
    }
  }

  /**
   * Verifica si debe ignorar actualizaciones OSC (anti-feedback).
   * @returns {boolean}
   */
  get isIgnoring() {
    return this._ignoreOSCUpdates;
  }

  /**
   * Destruye todas las suscripciones.
   */
  destroy() {
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers.clear();
    this._lastSentValues.clear();
    this._app = null;
    this._ignoreOSCUpdates = false;
  }
}

// Singleton y exportación
const pvcOSCSync = new PitchToVoltageConverterOSCSync();

export { pvcOSCSync, PitchToVoltageConverterOSCSync, PARAM_TO_ADDRESS };
export default pvcOSCSync;
