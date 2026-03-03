/**
 * OSC Random CV Sync — Sincronización del Random Control Voltage Generator via OSC
 *
 * Gestiona el envío y recepción de mensajes OSC para el generador de
 * voltaje de control aleatorio del Panel 3. Módulo único (sin índice).
 *
 * Direcciones OSC (definidas en OSC.md, sección 10):
 *   /random/mean      — -5 a 5 (frecuencia del reloj, escala exponencial)
 *   /random/variance   — -5 a 5 (varianza temporal, -5=constante, +5=máxima)
 *   /random/voltage1   — 0 a 10 (nivel de salida V1, curva LOG)
 *   /random/voltage2   — 0 a 10 (nivel de salida V2, curva LOG)
 *   /random/key        — -5 a 5 (amplitud del pulso key, bipolar)
 *
 * @module osc/oscRandomCVSync
 * @see /OSC.md — Documentación del protocolo
 */

import { oscBridge } from './oscBridge.js';

/**
 * Mapeo de claves de parámetro a direcciones OSC
 * @type {Object<string, string>}
 */
const PARAM_TO_ADDRESS = {
  mean: 'random/mean',
  variance: 'random/variance',
  voltage1: 'random/voltage1',
  voltage2: 'random/voltage2',
  key: 'random/key'
};

/**
 * Mapeo de parámetros a métodos del módulo de audio
 * @type {Object<string, string>}
 */
const PARAM_TO_AUDIO_METHOD = {
  mean: 'setMean',
  variance: 'setVariance',
  voltage1: 'setVoltage1Level',
  voltage2: 'setVoltage2Level',
  key: 'setKeyLevel'
};

/**
 * Clase que gestiona la sincronización OSC del Random Control Voltage Generator
 */
class RandomCVOSCSync {
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
   * Inicializa la sincronización OSC para el Random CV Generator.
   * @param {Object} app - Instancia de SGMEApp
   */
  init(app) {
    this._app = app;
    this._setupListeners();
    console.log('[RandomCVOSCSync] Inicializado');
  }

  /**
   * Envía un cambio de parámetro via OSC.
   *
   * @param {string} param - Clave del parámetro ('mean', 'variance', 'voltage1', 'voltage2', 'key')
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
      const audioModule = this._app._panel3LayoutData?.randomCVAudio;
      
      // Obtener UI
      const randomCVUI = this._app._randomVoltageUIs?.['panel3-random-cv'];
      
      // Aplicar al módulo de audio
      const audioMethod = PARAM_TO_AUDIO_METHOD[param];
      if (audioModule && audioMethod && typeof audioModule[audioMethod] === 'function') {
        audioModule[audioMethod](oscValue);
      }
      
      // Actualizar knob en la UI
      if (randomCVUI?.knobs?.[param]) {
        randomCVUI.knobs[param].setValue(oscValue);
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

/** @type {RandomCVOSCSync} Instancia singleton */
const randomCVOSCSync = new RandomCVOSCSync();

export { randomCVOSCSync, RandomCVOSCSync, PARAM_TO_ADDRESS };
export default randomCVOSCSync;
