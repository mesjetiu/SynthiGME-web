/**
 * OSC Sequencer Sync — Sincronización del Digital Sequencer 1000 via OSC
 *
 * Gestiona el envío y recepción de mensajes OSC para el secuenciador digital.
 * Módulo único (sin índice).
 *
 * Direcciones OSC:
 *   /seq/clockRate       — 0 a 10 (frecuencia del clock interno)
 *   /seq/voltageA..F     — 0 a 10 (nivel de salida de cada pista analógica)
 *   /seq/key1..4         — -5 a 5 (nivel de salida de cada pista digital)
 *   /seq/abKey1..runClock — 0|1 (switches de grabación)
 *   /seq/masterReset..testOP — trigger (botones de transporte)
 *
 * @module osc/oscSequencerSync
 * @see /OSC.md — Documentación del protocolo
 */

import { oscBridge } from './oscBridge.js';

/**
 * Parámetros de knob con dirección OSC y método de audio.
 * clockRate usa setClockRate; el resto usa setKnob.
 */
const KNOB_PARAMETERS = {
  clockRate: { address: 'seq/clockRate', audioMethod: 'setClockRate' },
  voltageA:  { address: 'seq/voltageA',  audioMethod: 'setKnob' },
  voltageB:  { address: 'seq/voltageB',  audioMethod: 'setKnob' },
  voltageC:  { address: 'seq/voltageC',  audioMethod: 'setKnob' },
  voltageD:  { address: 'seq/voltageD',  audioMethod: 'setKnob' },
  voltageE:  { address: 'seq/voltageE',  audioMethod: 'setKnob' },
  voltageF:  { address: 'seq/voltageF',  audioMethod: 'setKnob' },
  key1:      { address: 'seq/key1',      audioMethod: 'setKnob' },
  key2:      { address: 'seq/key2',      audioMethod: 'setKnob' },
  key3:      { address: 'seq/key3',      audioMethod: 'setKnob' },
  key4:      { address: 'seq/key4',      audioMethod: 'setKnob' }
};

/**
 * Parámetros de switch con dirección OSC y método de audio.
 * Todos usan setSwitch.
 */
const SWITCH_PARAMETERS = {
  abKey1:   { address: 'seq/abKey1',   audioMethod: 'setSwitch' },
  b:        { address: 'seq/b',        audioMethod: 'setSwitch' },
  cdKey2:   { address: 'seq/cdKey2',   audioMethod: 'setSwitch' },
  d:        { address: 'seq/d',        audioMethod: 'setSwitch' },
  efKey3:   { address: 'seq/efKey3',   audioMethod: 'setSwitch' },
  f:        { address: 'seq/f',        audioMethod: 'setSwitch' },
  key4:     { address: 'seq/key4Sw',   audioMethod: 'setSwitch' },
  runClock: { address: 'seq/runClock', audioMethod: 'setSwitch' }
};

/**
 * Parámetros de button (trigger) con dirección OSC y método de audio.
 * Todos usan pressButton.
 */
const BUTTON_PARAMETERS = {
  masterReset:   { address: 'seq/masterReset',   audioMethod: 'pressButton' },
  runForward:    { address: 'seq/runForward',    audioMethod: 'pressButton' },
  runReverse:    { address: 'seq/runReverse',    audioMethod: 'pressButton' },
  stop:          { address: 'seq/stop',          audioMethod: 'pressButton' },
  resetSequence: { address: 'seq/resetSequence', audioMethod: 'pressButton' },
  stepForward:   { address: 'seq/stepForward',   audioMethod: 'pressButton' },
  stepReverse:   { address: 'seq/stepReverse',   audioMethod: 'pressButton' },
  testOP:        { address: 'seq/testOP',        audioMethod: 'pressButton' }
};

/**
 * Clase que gestiona la sincronización OSC del Digital Sequencer 1000
 */
class SequencerOSCSync {
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
    console.log('[SequencerOSCSync] Inicializado');
  }

  /**
   * Envía un cambio de knob via OSC.
   *
   * @param {string} param - Clave del parámetro (key de KNOB_PARAMETERS)
   * @param {number} dialValue - Valor del dial
   */
  sendKnobChange(param, dialValue) {
    if (!oscBridge.connected) return;

    const paramDef = KNOB_PARAMETERS[param];
    if (!paramDef) return;

    const { address } = paramDef;

    // Deduplicación
    const lastValue = this._lastSentValues.get(address);
    if (lastValue !== undefined && Math.abs(lastValue - dialValue) < 0.0001) {
      return;
    }
    this._lastSentValues.set(address, dialValue);

    oscBridge.send(address, dialValue);
  }

  /**
   * Envía un cambio de switch via OSC.
   *
   * @param {string} switchName - Nombre del switch
   * @param {boolean} active - true = on, false = off
   */
  sendSwitchChange(switchName, active) {
    if (!oscBridge.connected) return;

    const paramDef = SWITCH_PARAMETERS[switchName];
    if (!paramDef) return;

    oscBridge.send(paramDef.address, active ? 1 : 0);
  }

  /**
   * Envía un pulso de button via OSC.
   *
   * @param {string} buttonName - Nombre del botón
   */
  sendButtonPress(buttonName) {
    if (!oscBridge.connected) return;

    const paramDef = BUTTON_PARAMETERS[buttonName];
    if (!paramDef) return;

    oscBridge.send(paramDef.address, 1);
  }

  /**
   * Configura los listeners para recibir mensajes OSC.
   * @private
   */
  _setupListeners() {
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers.clear();

    // Listeners para knobs
    for (const [param, paramDef] of Object.entries(KNOB_PARAMETERS)) {
      const unsub = oscBridge.on(paramDef.address, (value) => {
        this._handleIncomingKnob(param, value);
      });
      this._unsubscribers.set(`knob-${param}`, unsub);
    }

    // Listeners para switches
    for (const [switchName, paramDef] of Object.entries(SWITCH_PARAMETERS)) {
      const unsub = oscBridge.on(paramDef.address, (value) => {
        this._handleIncomingSwitch(switchName, value);
      });
      this._unsubscribers.set(`sw-${switchName}`, unsub);
    }

    // Listeners para buttons
    for (const [buttonName, paramDef] of Object.entries(BUTTON_PARAMETERS)) {
      const unsub = oscBridge.on(paramDef.address, (value) => {
        if (value > 0) this._handleIncomingButton(buttonName);
      });
      this._unsubscribers.set(`btn-${buttonName}`, unsub);
    }
  }

  /**
   * Procesa un mensaje OSC entrante para un knob.
   * @private
   */
  _handleIncomingKnob(param, oscValue) {
    if (this._ignoreOSCUpdates || !this._app) return;

    this._ignoreOSCUpdates = true;

    try {
      const audioModule = this._app._sequencerModule;
      const paramDef = KNOB_PARAMETERS[param];

      if (audioModule && paramDef) {
        if (param === 'clockRate') {
          audioModule.setClockRate(oscValue);
        } else {
          audioModule.setKnob(param, oscValue);
        }
      }

      // Actualizar knob en la UI
      const knobInstance = this._app._sequencerKnobs?.[param];
      if (knobInstance) {
        // Knobs normalizan el rango. clockRate y voltages: 0-10 → 0-1. Keys: -5..5 → 0-1.
        const knobCfg = KNOB_PARAMETERS[param];
        if (knobCfg) {
          // Los keys tienen rango -5 a 5, el resto 0 a 10
          const isKey = param.startsWith('key');
          const normalized = isKey ? (oscValue + 5) / 10 : oscValue / 10;
          knobInstance.setValue(normalized);
        }
      }
    } finally {
      setTimeout(() => {
        this._ignoreOSCUpdates = false;
      }, 10);
    }
  }

  /**
   * Procesa un mensaje OSC entrante para un switch.
   * @private
   */
  _handleIncomingSwitch(switchName, oscValue) {
    if (this._ignoreOSCUpdates || !this._app) return;

    this._ignoreOSCUpdates = true;

    try {
      const audioModule = this._app._sequencerModule;
      const active = oscValue > 0;

      if (audioModule) {
        audioModule.setSwitch(switchName, active);
      }
    } finally {
      setTimeout(() => {
        this._ignoreOSCUpdates = false;
      }, 10);
    }
  }

  /**
   * Procesa un mensaje OSC entrante para un button.
   * @private
   */
  _handleIncomingButton(buttonName) {
    if (this._ignoreOSCUpdates || !this._app) return;

    this._ignoreOSCUpdates = true;

    try {
      const audioModule = this._app._sequencerModule;

      if (audioModule) {
        audioModule.pressButton(buttonName);
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

/** @type {SequencerOSCSync} Instancia singleton */
const sequencerOSCSync = new SequencerOSCSync();

export {
  sequencerOSCSync,
  SequencerOSCSync,
  KNOB_PARAMETERS,
  SWITCH_PARAMETERS,
  BUTTON_PARAMETERS
};
export default sequencerOSCSync;
