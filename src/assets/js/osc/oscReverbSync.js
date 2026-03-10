/**
 * OSC Reverberation Sync — Sincronización del módulo de reverberación via OSC
 *
 * Gestiona el envío y recepción de mensajes OSC para el módulo de reverb
 * de muelle del Panel 1. Módulo único (sin índice).
 *
 * Direcciones OSC (definidas en OSC.md):
 *   /reverb/mix    — 0 a 10 (mezcla dry/wet, crossfader lineal)
 *   /reverb/level  — 0 a 10 (nivel de salida, curva LOG base 100)
 *
 * @module osc/oscReverbSync
 * @see /OSC.md — Documentación del protocolo
 */

import { oscBridge } from './oscBridge.js';

/**
 * Mapeo de claves de parámetro a direcciones OSC
 * @type {Object<string, string>}
 */
const PARAM_TO_ADDRESS = {
  mix: 'reverb/mix',
  level: 'reverb/level'
};

/**
 * Mapeo de parámetros a métodos del módulo de audio
 * @type {Object<string, string>}
 */
const PARAM_TO_AUDIO_METHOD = {
  mix: 'setMix',
  level: 'setLevel'
};

/**
 * Clase que gestiona la sincronización OSC del módulo Reverberation
 */
class ReverbOSCSync {
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
   * Inicializa la sincronización OSC para la reverberación.
   * @param {Object} app - Instancia de SGMEApp
   */
  init(app) {
    this._app = app;
    this._setupListeners();
    console.log('[ReverbOSCSync] Inicializado');
  }

  /**
   * Envía un cambio de parámetro via OSC.
   *
   * @param {string} param - Clave del parámetro ('mix', 'level')
   * @param {number} dialValue - Valor del dial (0-10)
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
   * @param {number} oscValue - Valor recibido via OSC (0-10)
   * @private
   */
  _handleIncoming(param, oscValue) {
    if (this._ignoreOSCUpdates || !this._app) return;

    this._ignoreOSCUpdates = true;

    try {
      // Obtener módulo de audio
      const audioModule = this._app._panel1ReverbModule;

      // Obtener UI
      const reverbUI = this._app._panel1ReverbUI;

      // Aplicar al módulo de audio
      const audioMethod = PARAM_TO_AUDIO_METHOD[param];
      if (audioModule && audioMethod && typeof audioModule[audioMethod] === 'function') {
        audioModule[audioMethod](oscValue);
      }

      // Actualizar knob en la UI
      if (reverbUI?.knobs?.[param]) {
        reverbUI.knobs[param].setValue(oscValue);
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
  shouldIgnoreOSC() {
    return this._ignoreOSCUpdates;
  }

  /**
   * Desconecta todos los listeners.
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

/** @type {ReverbOSCSync} Instancia singleton */
const reverbOSCSync = new ReverbOSCSync();

export { reverbOSCSync, ReverbOSCSync, PARAM_TO_ADDRESS };
export default reverbOSCSync;
