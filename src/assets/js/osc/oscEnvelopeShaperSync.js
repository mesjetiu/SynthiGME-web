/**
 * OSC Envelope Shaper Sync — Sincronización de los envelope shapers via OSC
 *
 * Gestiona el envío y recepción de mensajes OSC para los 3 envelope shapers
 * del Panel 1. Cada instancia se identifica por su índice (1-3).
 *
 * Direcciones OSC:
 *   /env/{index}/selector       — 0 a 4 (modo de operación)
 *   /env/{index}/delay          — 0 a 10 (tiempo de delay)
 *   /env/{index}/attack         — 0 a 10 (tiempo de ataque)
 *   /env/{index}/decay          — 0 a 10 (tiempo de caída)
 *   /env/{index}/sustain        — 0 a 10 (nivel de sustain)
 *   /env/{index}/release        — 0 a 10 (tiempo de release)
 *   /env/{index}/envelopeLevel  — -5 a 5 (nivel de envolvente CV, bipolar)
 *   /env/{index}/signalLevel    — 0 a 10 (nivel de audio VCA, LOG)
 *   /env/{index}/gate           — trigger (gate on/off)
 *
 * @module osc/oscEnvelopeShaperSync
 * @see /OSC.md — Documentación del protocolo
 */

import { oscBridge } from './oscBridge.js';

/**
 * Número de instancias de envelope shaper
 * @type {number}
 */
const INSTANCE_COUNT = 3;

/**
 * Parámetros de knob soportados con su dirección OSC relativa y método de audio.
 * La dirección completa será: env/{index}/{param}
 *
 * Nota: 'mode' en la UI se envía como 'selector' en OSC (nomenclatura del Synthi).
 */
const MODULE_PARAMETERS = {
  mode: {
    address: 'selector',
    audioMethod: 'setMode'
  },
  delay: {
    address: 'delay',
    audioMethod: 'setDelay'
  },
  attack: {
    address: 'attack',
    audioMethod: 'setAttack'
  },
  decay: {
    address: 'decay',
    audioMethod: 'setDecay'
  },
  sustain: {
    address: 'sustain',
    audioMethod: 'setSustain'
  },
  release: {
    address: 'release',
    audioMethod: 'setRelease'
  },
  envelopeLevel: {
    address: 'envelopeLevel',
    audioMethod: 'setEnvelopeLevel'
  },
  signalLevel: {
    address: 'signalLevel',
    audioMethod: 'setSignalLevel'
  }
};

/**
 * Parámetro especial de gate (trigger, no es un knob).
 * Gate activo (value > 0) inicia la envolvente; gate inactivo (value = 0) inicia release.
 */
const GATE_PARAMETER = {
  address: 'gate',
  audioMethod: 'setGate'
};

/**
 * Clase que gestiona la sincronización OSC de los Envelope Shapers
 */
class EnvelopeShaperOSCSync {
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
    console.log('[EnvelopeShaperOSCSync] Inicializado');
  }

  /**
   * Envía un cambio de parámetro (knob) via OSC.
   *
   * @param {number} index - Índice del envelope shaper (1-3)
   * @param {string} param - Clave del parámetro (key de MODULE_PARAMETERS)
   * @param {number} dialValue - Valor del dial
   */
  sendChange(index, param, dialValue) {
    if (!oscBridge.connected) return;

    const paramDef = MODULE_PARAMETERS[param];
    if (!paramDef) return;

    const address = `env/${index}/${paramDef.address}`;

    // Deduplicación: no enviar si el valor no cambió
    const lastValue = this._lastSentValues.get(address);
    if (lastValue !== undefined && Math.abs(lastValue - dialValue) < 0.0001) {
      return;
    }
    this._lastSentValues.set(address, dialValue);

    oscBridge.send(address, dialValue);
  }

  /**
   * Envía un cambio de gate via OSC.
   *
   * @param {number} index - Índice del envelope shaper (1-3)
   * @param {boolean} active - true = gate on, false = gate off
   */
  sendGate(index, active) {
    if (!oscBridge.connected) return;

    const address = `env/${index}/${GATE_PARAMETER.address}`;
    oscBridge.send(address, active ? 1 : 0);
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
      // Listeners para parámetros de knob
      for (const [param, paramDef] of Object.entries(MODULE_PARAMETERS)) {
        const address = `env/${i}/${paramDef.address}`;
        const unsub = oscBridge.on(address, (value) => {
          this._handleIncoming(i, param, value);
        });
        this._unsubscribers.set(`${i}-${param}`, unsub);
      }

      // Listener para gate
      const gateAddress = `env/${i}/${GATE_PARAMETER.address}`;
      const gateUnsub = oscBridge.on(gateAddress, (value) => {
        this._handleIncomingGate(i, value);
      });
      this._unsubscribers.set(`${i}-gate`, gateUnsub);
    }
  }

  /**
   * Procesa un mensaje OSC entrante para un parámetro de knob.
   *
   * @param {number} index - Índice del envelope shaper (1-3)
   * @param {string} param - Clave del parámetro (key de MODULE_PARAMETERS)
   * @param {number} oscValue - Valor recibido via OSC
   * @private
   */
  _handleIncoming(index, param, oscValue) {
    if (this._ignoreOSCUpdates || !this._app) return;

    this._ignoreOSCUpdates = true;

    try {
      // Obtener módulo de audio
      const audioModule = this._app._envelopeShaperModules?.[index - 1];

      // Obtener UI
      const esId = `envelopeShaper${index}`;
      const esUI = this._app._envelopeShaperUIs?.[esId];

      // Aplicar al módulo de audio
      const paramDef = MODULE_PARAMETERS[param];
      if (audioModule && paramDef?.audioMethod && typeof audioModule[paramDef.audioMethod] === 'function') {
        audioModule[paramDef.audioMethod](oscValue);
      }

      // Actualizar knob en la UI
      if (esUI?.knobs?.[param]) {
        esUI.knobs[param].setValue(oscValue);
      }
    } finally {
      setTimeout(() => {
        this._ignoreOSCUpdates = false;
      }, 10);
    }
  }

  /**
   * Procesa un mensaje OSC entrante de gate.
   *
   * @param {number} index - Índice del envelope shaper (1-3)
   * @param {number} value - Valor recibido (> 0 = gate on, 0 = gate off)
   * @private
   */
  _handleIncomingGate(index, value) {
    if (this._ignoreOSCUpdates || !this._app) return;

    this._ignoreOSCUpdates = true;

    try {
      const audioModule = this._app._envelopeShaperModules?.[index - 1];
      const esId = `envelopeShaper${index}`;
      const esUI = this._app._envelopeShaperUIs?.[esId];

      const active = value > 0;

      // Aplicar gate al módulo de audio
      if (audioModule && typeof audioModule.setGate === 'function') {
        audioModule.setGate(active);
      }

      // Actualizar LED en la UI
      if (esUI && typeof esUI.setLedState === 'function') {
        esUI.setLedState(active);
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

const envelopeShaperOSCSync = new EnvelopeShaperOSCSync();
export { envelopeShaperOSCSync, EnvelopeShaperOSCSync, MODULE_PARAMETERS, INSTANCE_COUNT, GATE_PARAMETER };
export default envelopeShaperOSCSync;
