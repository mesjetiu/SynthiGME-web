/**
 * OSC Oscillator Sync - Sincronización de osciladores via OSC
 * 
 * Gestiona el envío y recepción de mensajes OSC para los 12 osciladores
 * del Panel 3. Convierte entre valores UI (0-1) y valores OSC (0-10).
 * 
 * @module osc/oscOscillatorSync
 * @see /OSC.md - Documentación del protocolo
 */

import { oscBridge } from './oscBridge.js';
import { flashGlow } from '../ui/glowManager.js';
import { uiToOSCValue, oscToUIValue } from './oscAddressMap.js';

/**
 * Mapeo de índices de knob a claves OSC
 * Los índices corresponden al array de knobs de SGME_Oscillator
 */
const KNOB_INDEX_TO_OSC_KEY = {
  0: 'pulselevel',
  1: 'pulseshape',
  2: 'sinelevel',
  3: 'sinesymmetry',
  4: 'trianglelevel',
  5: 'sawtoothlevel',
  6: 'frequency'
};

/**
 * Mapeo inverso de clave OSC a índice de knob
 */
const OSC_KEY_TO_KNOB_INDEX = {
  'pulselevel': 0,
  'pulseshape': 1,
  'sinelevel': 2,
  'sinesymmetry': 3,
  'trianglelevel': 4,
  'sawtoothlevel': 5,
  'frequency': 6
};

/**
 * Clase que gestiona la sincronización OSC de osciladores
 */
class OscillatorOSCSync {
  constructor() {
    /** @type {Map<string, Function>} Funciones para cancelar suscripciones */
    this._unsubscribers = new Map();
    
    /** @type {Object|null} Referencia a la instancia de app (para aplicar cambios) */
    this._app = null;
    
    /** @type {boolean} Flag para evitar loops de retroalimentación */
    this._ignoreOSCUpdates = false;
    
    /** @type {Map<string, number>} Cache de últimos valores enviados para deduplicación */
    this._lastSentValues = new Map();
  }

  /**
   * Inicializa la sincronización OSC para osciladores
   * 
   * @param {Object} app - Instancia de SGMEApp para acceder a UI y callbacks
   */
  init(app) {
    this._app = app;
    this._setupListeners();
    console.log('[OscillatorOSCSync] Inicializado para 12 osciladores');
  }

  /**
   * Envía un cambio de parámetro de oscilador via OSC
   * 
   * @param {number} oscIndex - Índice del oscilador (0-based)
   * @param {number} knobIndex - Índice del knob (0-6)
   * @param {number} uiValue - Valor del knob (0-1)
   */
  sendKnobChange(oscIndex, knobIndex, uiValue) {
    if (!oscBridge.connected) return;
    
    const oscKey = KNOB_INDEX_TO_OSC_KEY[knobIndex];
    if (!oscKey) return;
    
    // Convertir de valor UI (0-1) a valor OSC (0-10 o -5 a 5)
    // Nota: frequency ya viene en escala 0-10 del knob (no 0-1)
    const oscValue = oscKey === 'frequency' ? uiValue : uiToOSCValue(uiValue, 'osc', oscKey);
    
    // Construir dirección: osc/{n}/{param} (n es 1-based)
    const address = `osc/${oscIndex + 1}/${oscKey}`;
    
    // Deduplicación: no enviar si el valor no ha cambiado
    const cacheKey = address;
    const lastValue = this._lastSentValues.get(cacheKey);
    if (lastValue !== undefined && Math.abs(lastValue - oscValue) < 0.0001) {
      return; // Valor igual al anterior, no enviar
    }
    this._lastSentValues.set(cacheKey, oscValue);
    
    oscBridge.send(address, oscValue);
  }

  /**
   * Envía un cambio de rango (HI/LO) via OSC
   * 
   * @param {number} oscIndex - Índice del oscilador (0-based)
   * @param {'hi'|'lo'} rangeState - Estado del switch
   */
  sendRangeChange(oscIndex, rangeState) {
    if (!oscBridge.connected) return;
    
    const address = `osc/${oscIndex + 1}/range`;
    
    // Deduplicación
    const cacheKey = address;
    if (this._lastSentValues.get(cacheKey) === rangeState) {
      return;
    }
    this._lastSentValues.set(cacheKey, rangeState);
    
    oscBridge.send(address, rangeState);
  }

  /**
   * Configura los listeners para recibir mensajes OSC de osciladores
   * @private
   */
  _setupListeners() {
    // Limpiar listeners previos
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers.clear();

    // Escuchar todos los parámetros de los 12 osciladores
    for (let oscNum = 1; oscNum <= 12; oscNum++) {
      // Parámetros de knobs
      Object.keys(OSC_KEY_TO_KNOB_INDEX).forEach(param => {
        const address = `osc/${oscNum}/${param}`;
        const unsub = oscBridge.on(address, (value, addr, from) => {
          this._handleIncomingKnob(oscNum - 1, param, value);
        });
        this._unsubscribers.set(`osc-${oscNum}-${param}`, unsub);
      });

      // Switch de rango
      const rangeAddress = `osc/${oscNum}/range`;
      const rangeUnsub = oscBridge.on(rangeAddress, (value, addr, from) => {
        this._handleIncomingRange(oscNum - 1, value);
      });
      this._unsubscribers.set(`osc-${oscNum}-range`, rangeUnsub);
    }
  }

  /**
   * Procesa un mensaje OSC entrante de parámetro de knob
   * 
   * @param {number} oscIndex - Índice del oscilador (0-based)
   * @param {string} param - Nombre del parámetro OSC
   * @param {number} oscValue - Valor en escala OSC (0-10 o -5 a 5)
   * @private
   */
  _handleIncomingKnob(oscIndex, param, oscValue) {
    if (this._ignoreOSCUpdates || !this._app) return;

    const knobIndex = OSC_KEY_TO_KNOB_INDEX[param];
    if (knobIndex === undefined) return;

    // Convertir de valor OSC a valor UI (0-1)
    // Nota: frequency usa knob con rango 0-10 (= escala OSC), no necesita conversión
    const uiValue = param === 'frequency' ? oscValue : oscToUIValue(oscValue, 'osc', param);

    // Evitar loop de retroalimentación
    this._ignoreOSCUpdates = true;

    try {
      // Aplicar a la UI
      const oscId = `panel3-osc-${oscIndex + 1}`;
      const oscUI = this._app._oscillatorUIs?.[oscId];
      
      if (oscUI && oscUI.knobs[knobIndex]) {
        // Actualizar knob (esto disparará onChange pero con _ignoreOSCUpdates=true)
        oscUI.knobs[knobIndex].setValue(uiValue);
        
        // Llamar al handler de audio directamente (el onChange no envía OSC por el flag)
        this._applyToAudio(oscIndex, knobIndex, uiValue, oscUI);
      }
    } finally {
      // Restaurar después de un pequeño delay para evitar rebotes
      setTimeout(() => {
        this._ignoreOSCUpdates = false;
      }, 10);
    }
  }

  /**
   * Procesa un mensaje OSC entrante de cambio de rango
   * 
   * @param {number} oscIndex - Índice del oscilador (0-based)
   * @param {string} rangeValue - 'hi' o 'lo'
   * @private
   */
  _handleIncomingRange(oscIndex, rangeValue) {
    if (this._ignoreOSCUpdates || !this._app) return;

    const normalizedRange = (rangeValue === 'lo' || rangeValue === 'LO') ? 'lo' : 'hi';

    this._ignoreOSCUpdates = true;

    try {
      const oscId = `panel3-osc-${oscIndex + 1}`;
      const oscUI = this._app._oscillatorUIs?.[oscId];
      
      if (oscUI) {
        // Actualizar estado interno
        oscUI.rangeState = normalizedRange;
        
        // Actualizar UI del switch
        const rangeEl = document.querySelector(`#${oscId} .output-channel__switch`);
        if (rangeEl) {
          oscUI._renderRange(rangeEl);
          flashGlow(rangeEl);
        }
        
        // Recalcular frecuencia con el nuevo rango
        if (this._app._onOscRangeChange) {
          this._app._onOscRangeChange(3, oscIndex, normalizedRange);
        }
      }
    } finally {
      setTimeout(() => {
        this._ignoreOSCUpdates = false;
      }, 10);
    }
  }

  /**
   * Aplica el valor recibido al motor de audio
   * 
   * @param {number} oscIndex - Índice del oscilador
   * @param {number} knobIndex - Índice del knob
   * @param {number} uiValue - Valor normalizado 0-1
   * @param {Object} oscUI - Referencia al UI del oscilador
   * @private
   */
  _applyToAudio(oscIndex, knobIndex, uiValue, oscUI) {
    if (!this._app) return;

    // Mapear knobIndex a método de app
    const panelIndex = 3; // Todos los osciladores están en Panel 3
    
    switch (knobIndex) {
      case 0: // Pulse level
        this._app._updatePanelPulseVolume?.(panelIndex, oscIndex, uiValue);
        break;
      case 1: // Pulse shape (width)
        this._app._updatePanelPulseWidth?.(panelIndex, oscIndex, uiValue);
        break;
      case 2: // Sine level
        this._app._updatePanelOscVolume?.(panelIndex, oscIndex, uiValue);
        break;
      case 3: // Sine symmetry
        this._app._updatePanelSineSymmetry?.(panelIndex, oscIndex, uiValue);
        break;
      case 4: // Triangle level
        this._app._updatePanelTriVolume?.(panelIndex, oscIndex, uiValue);
        break;
      case 5: // Sawtooth level
        this._app._updatePanelSawVolume?.(panelIndex, oscIndex, uiValue);
        break;
      case 6: // Frequency
        const isRangeLow = oscUI?.rangeState === 'lo';
        this._app._updatePanelOscFreq?.(panelIndex, oscIndex, uiValue, isRangeLow);
        break;
    }
  }

  /**
   * Verifica si debe ignorar actualizaciones OSC (para evitar loops)
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

/** @type {OscillatorOSCSync} Instancia singleton */
const oscillatorOSCSync = new OscillatorOSCSync();

export { oscillatorOSCSync, OscillatorOSCSync, KNOB_INDEX_TO_OSC_KEY, OSC_KEY_TO_KNOB_INDEX };
export default oscillatorOSCSync;
