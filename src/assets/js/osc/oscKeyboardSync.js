/**
 * OSC Keyboard Sync — Sincronización de los teclados del Synthi 100 via OSC
 *
 * Gestiona el envío y recepción de mensajes OSC para los dos teclados
 * (Upper y Lower) del Panel 4. Cada teclado tiene 3 knobs + selector
 * de retrigger sincronizables.
 *
 * Direcciones OSC:
 *   /keyboard/upper/pitchSpread    — 0 a 10  (rango de afinación)
 *   /keyboard/upper/velocityLevel  — -5 a 5  (sensibilidad velocity)
 *   /keyboard/upper/gateLevel      — -5 a 5  (nivel de envelope trigger)
 *   /keyboard/upper/retrigger      — 0 o 1   (modo retrigger)
 *   /keyboard/upper/noteOn         — [nota, velocity]  (pulsación de tecla)
 *   /keyboard/upper/noteOff        — nota             (liberación de tecla)
 *   /keyboard/lower/pitchSpread    — 0 a 10
 *   /keyboard/lower/velocityLevel  — -5 a 5
 *   /keyboard/lower/gateLevel      — -5 a 5
 *   /keyboard/lower/retrigger      — 0 o 1
 *   /keyboard/lower/noteOn         — [nota, velocity]
 *   /keyboard/lower/noteOff        — nota
 *
 * @module osc/oscKeyboardSync
 */

import { oscBridge } from './oscBridge.js';

/**
 * Mapeo de claves de parámetro a sufijos de dirección OSC
 * @type {Object<string, string>}
 */
const PARAM_SUFFIXES = {
  pitchSpread: 'pitchSpread',
  velocityLevel: 'velocityLevel',
  gateLevel: 'gateLevel',
  retrigger: 'retrigger'
};

/**
 * Mapeo de parámetros a métodos del módulo de audio
 * @type {Object<string, string>}
 */
const PARAM_TO_AUDIO_METHOD = {
  pitchSpread: 'setPitchSpread',
  velocityLevel: 'setVelocityLevel',
  gateLevel: 'setGateLevel',
  retrigger: 'setRetrigger'
};

/**
 * Genera el mapa completo de direcciones OSC para ambos teclados.
 * @returns {Object<string, string>} key 'upper/param' → OSC address
 */
function buildAddressMap() {
  const map = {};
  for (const side of ['upper', 'lower']) {
    for (const [param, suffix] of Object.entries(PARAM_SUFFIXES)) {
      map[`${side}/${param}`] = `keyboard/${side}/${suffix}`;
    }
  }
  return map;
}

const PARAM_TO_ADDRESS = buildAddressMap();

/**
 * Clase que gestiona la sincronización OSC de los teclados.
 */
class KeyboardOSCSync {
  constructor() {
    /** @type {Map<string, Function>} */
    this._unsubscribers = new Map();
    /** @type {Object|null} */
    this._app = null;
    /** @type {boolean} */
    this._ignoreOSCUpdates = false;
    /** @type {Map<string, number>} */
    this._lastSentValues = new Map();
  }

  /**
   * Inicializa la sincronización OSC para los teclados.
   * @param {Object} app - Instancia de SGMEApp
   */
  init(app) {
    this._app = app;
    this._setupListeners();
    console.log('[KeyboardOSCSync] Inicializado');
  }

  /**
   * Envía un cambio de parámetro via OSC.
   * @param {'upper'|'lower'} side - Teclado
   * @param {string} param - Clave del parámetro
   * @param {number} value - Valor del dial
   */
  sendChange(side, param, value) {
    if (!oscBridge.connected) return;

    const key = `${side}/${param}`;
    const address = PARAM_TO_ADDRESS[key];
    if (!address) return;

    const lastValue = this._lastSentValues.get(address);
    if (lastValue !== undefined && Math.abs(lastValue - value) < 0.0001) {
      return;
    }
    this._lastSentValues.set(address, value);

    oscBridge.send(address, value);
  }

  /**
   * Envía un noteOn via OSC.
   * @param {'upper'|'lower'} side - Teclado
   * @param {number} note - Nota MIDI (0-127)
   * @param {number} velocity - Velocity (1-127)
   */
  sendNoteOn(side, note, velocity) {
    if (!oscBridge.connected) return;
    oscBridge.send(`keyboard/${side}/noteOn`, [note, velocity]);
  }

  /**
   * Envía un noteOff via OSC.
   * @param {'upper'|'lower'} side - Teclado
   * @param {number} note - Nota MIDI (0-127)
   */
  sendNoteOff(side, note) {
    if (!oscBridge.connected) return;
    oscBridge.send(`keyboard/${side}/noteOff`, note);
  }

  /** @private */
  _setupListeners() {
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers.clear();

    for (const [key, address] of Object.entries(PARAM_TO_ADDRESS)) {
      const unsub = oscBridge.on(address, (value) => {
        const [side, param] = key.split('/');
        this._handleIncoming(side, param, value);
      });
      this._unsubscribers.set(key, unsub);
    }

    // Listeners para noteOn / noteOff de ambos teclados
    for (const side of ['upper', 'lower']) {
      const unsubNoteOn = oscBridge.on(`keyboard/${side}/noteOn`, (value) => {
        this._handleIncomingNote(side, 'noteOn', value);
      });
      this._unsubscribers.set(`${side}/noteOn`, unsubNoteOn);

      const unsubNoteOff = oscBridge.on(`keyboard/${side}/noteOff`, (value) => {
        this._handleIncomingNote(side, 'noteOff', value);
      });
      this._unsubscribers.set(`${side}/noteOff`, unsubNoteOff);
    }
  }

  /**
   * @param {'upper'|'lower'} side
   * @param {string} param
   * @param {number} oscValue
   * @private
   */
  _handleIncoming(side, param, oscValue) {
    if (this._ignoreOSCUpdates || !this._app) return;

    this._ignoreOSCUpdates = true;

    try {
      // Obtener módulo de audio
      const kbModules = this._app._keyboardModules;
      const audioModule = kbModules?.[side];

      // Aplicar al módulo de audio
      const audioMethod = PARAM_TO_AUDIO_METHOD[param];
      if (audioModule && audioMethod && typeof audioModule[audioMethod] === 'function') {
        audioModule[audioMethod](oscValue);
      }

      // Actualizar knob en la UI (los knobs del panel 4 del teclado)
      const knobs = this._app._keyboardKnobs?.[side];
      if (knobs?.[param]?.knobInstance) {
        const knobConfig = this._getKnobConfig(param);
        if (knobConfig) {
          // Normalizar al rango 0-1 del knob
          const normalized = (oscValue - knobConfig.min) / (knobConfig.max - knobConfig.min);
          knobs[param].knobInstance.setValue(normalized);
        }
      }
    } finally {
      setTimeout(() => {
        this._ignoreOSCUpdates = false;
      }, 10);
    }
  }

  /**
   * Maneja una nota entrante por OSC.
   * @param {'upper'|'lower'} side
   * @param {'noteOn'|'noteOff'} type
   * @param {number|number[]} value - [note, velocity] para noteOn, note para noteOff
   * @private
   */
  _handleIncomingNote(side, type, value) {
    if (this._ignoreOSCUpdates || !this._app) return;

    const kbModule = this._app._keyboardModules?.[side];
    if (!kbModule) return;

    // Lazy start
    if (!kbModule.isStarted) {
      kbModule.start();
    }

    if (type === 'noteOn') {
      const [note, velocity] = Array.isArray(value) ? value : [value, 100];
      kbModule.noteOn(note, velocity);
    } else {
      const note = Array.isArray(value) ? value[0] : value;
      kbModule.noteOff(note);
    }
  }

  /**
   * @param {string} param
   * @returns {{ min: number, max: number }|null}
   * @private
   */
  _getKnobConfig(param) {
    const ranges = {
      pitchSpread: { min: 0, max: 10 },
      velocityLevel: { min: -5, max: 5 },
      gateLevel: { min: -5, max: 5 },
      retrigger: { min: 0, max: 1 }
    };
    return ranges[param] || null;
  }

  /** @returns {boolean} */
  shouldIgnoreOSC() {
    return this._ignoreOSCUpdates;
  }

  destroy() {
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers.clear();
    this._app = null;
  }
}

// Singleton
const keyboardOSCSync = new KeyboardOSCSync();

export { keyboardOSCSync, KeyboardOSCSync, PARAM_TO_ADDRESS };
export default keyboardOSCSync;
