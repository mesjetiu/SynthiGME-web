/**
 * OSC Ring Modulator Sync — Sincronización de los moduladores de anillo via OSC
 *
 * Gestiona el envío y recepción de mensajes OSC para los 3 ring modulators
 * del Panel 1. Cada instancia se identifica por su índice (1-3).
 *
 * Direcciones OSC:
 *   /ringmod/{index}/level  — 0 a 10 (nivel de salida, curva LOG base 100)
 *
 * @module osc/oscRingModSync
 * @see /OSC.md — Documentación del protocolo
 */

import { oscBridge } from './oscBridge.js';

/**
 * Número de instancias de ring modulator
 * @type {number}
 */
const INSTANCE_COUNT = 3;

/**
 * Parámetros soportados con su dirección OSC relativa y método de audio.
 * La dirección completa será: ringmod/{index}/{param}
 */
const MODULE_PARAMETERS = {
  level: {
    address: 'level',
    audioMethod: 'setLevel'
  }
};

/**
 * Clase que gestiona la sincronización OSC de los Ring Modulators
 */
class RingModOSCSync {
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
   * Inicializa la sincronización OSC.
   * @param {Object} app - Instancia de SGMEApp
   */
  init(app) {
    this._app = app;
    this._setupListeners();
    console.log('[RingModOSCSync] Inicializado');
  }

  /**
   * Envía un cambio de parámetro via OSC.
   *
   * @param {number} index - Índice del ring modulator (1-3)
   * @param {string} param - Clave del parámetro ('level')
   * @param {number} dialValue - Valor del dial (0-10)
   */
  sendChange(index, param, dialValue) {
    if (!oscBridge.connected) return;

    const paramDef = MODULE_PARAMETERS[param];
    if (!paramDef) return;

    const address = `ringmod/${index}/${paramDef.address}`;

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

    for (let i = 1; i <= INSTANCE_COUNT; i++) {
      for (const [param, paramDef] of Object.entries(MODULE_PARAMETERS)) {
        const address = `ringmod/${i}/${paramDef.address}`;
        const unsub = oscBridge.on(address, (value) => {
          this._handleIncoming(i, param, value);
        });
        this._unsubscribers.set(`${i}-${param}`, unsub);
      }
    }
  }

  /**
   * Procesa un mensaje OSC entrante.
   *
   * @param {number} index - Índice del ring modulator (1-3)
   * @param {string} param - Clave del parámetro
   * @param {number} oscValue - Valor recibido via OSC (0-10)
   * @private
   */
  _handleIncoming(index, param, oscValue) {
    if (this._ignoreOSCUpdates || !this._app) return;

    this._ignoreOSCUpdates = true;

    try {
      // Obtener módulo de audio
      const audioModule = this._app._panel1RingModModules?.[index - 1];

      // Obtener UI
      const rmId = `ringModulator${index}`;
      const ringModUI = this._app._panel1RingModUIs?.[rmId];

      // Aplicar al módulo de audio
      const paramDef = MODULE_PARAMETERS[param];
      if (audioModule && paramDef?.audioMethod && typeof audioModule[paramDef.audioMethod] === 'function') {
        audioModule[paramDef.audioMethod](oscValue);
      }

      // Actualizar knob en la UI
      if (ringModUI?.knobs?.[param]) {
        ringModUI.knobs[param].setValue(oscValue);
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
    this._lastSentValues.clear();
    this._app = null;
  }
}

const ringModOSCSync = new RingModOSCSync();
export { ringModOSCSync, RingModOSCSync, MODULE_PARAMETERS, INSTANCE_COUNT };
export default ringModOSCSync;
