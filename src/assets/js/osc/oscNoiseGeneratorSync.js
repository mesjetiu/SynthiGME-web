/**
 * OSC Noise Generator Sync - Sincronización de generadores de ruido via OSC
 * 
 * Gestiona el envío y recepción de mensajes OSC para los 2 generadores
 * de ruido del Panel 3. Los valores de dial (0-10) se envían directamente
 * ya que coinciden con la escala OSC.
 * 
 * Parámetros:
 * - colour: 0-10 (control de color del ruido, 5=blanco)
 * - level: 0-10 (nivel de salida, curva logarítmica)
 * 
 * @module osc/oscNoiseGeneratorSync
 * @see /OSC.md - Documentación del protocolo
 */

import { oscBridge } from './oscBridge.js';

/**
 * Mapeo de índices de knob a claves OSC para noise generators
 */
const KNOB_INDEX_TO_OSC_KEY = {
  0: 'colour',
  1: 'level'
};

/**
 * Clase que gestiona la sincronización OSC de generadores de ruido
 */
class NoiseGeneratorOSCSync {
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
   * Inicializa la sincronización OSC para generadores de ruido
   * 
   * @param {Object} app - Instancia de SGMEApp
   */
  init(app) {
    this._app = app;
    this._setupListeners();
    console.log('[NoiseGeneratorOSCSync] Inicializado para 2 generadores');
  }

  /**
   * Envía un cambio de colour via OSC
   * 
   * @param {number} noiseIndex - Índice del generador (0-based)
   * @param {number} dialValue - Valor del dial (0-10)
   */
  sendColourChange(noiseIndex, dialValue) {
    if (!oscBridge.connected) return;
    
    const address = `noise/${noiseIndex + 1}/colour`;
    
    const lastValue = this._lastSentValues.get(address);
    if (lastValue !== undefined && Math.abs(lastValue - dialValue) < 0.0001) {
      return;
    }
    this._lastSentValues.set(address, dialValue);
    
    oscBridge.send(address, dialValue);
  }

  /**
   * Envía un cambio de level via OSC
   * 
   * @param {number} noiseIndex - Índice del generador (0-based)
   * @param {number} dialValue - Valor del dial (0-10)
   */
  sendLevelChange(noiseIndex, dialValue) {
    if (!oscBridge.connected) return;
    
    const address = `noise/${noiseIndex + 1}/level`;
    
    const lastValue = this._lastSentValues.get(address);
    if (lastValue !== undefined && Math.abs(lastValue - dialValue) < 0.0001) {
      return;
    }
    this._lastSentValues.set(address, dialValue);
    
    oscBridge.send(address, dialValue);
  }

  /**
   * Configura los listeners para recibir mensajes OSC
   * @private
   */
  _setupListeners() {
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers.clear();

    const params = ['colour', 'level'];
    
    for (let n = 1; n <= 2; n++) {
      for (const param of params) {
        const address = `noise/${n}/${param}`;
        const unsub = oscBridge.on(address, (value) => {
          this._handleIncoming(n - 1, param, value);
        });
        this._unsubscribers.set(`noise-${n}-${param}`, unsub);
      }
    }
  }

  /**
   * Procesa un mensaje OSC entrante
   * 
   * @param {number} noiseIndex - Índice del generador (0-based)
   * @param {string} param - 'colour' o 'level'
   * @param {number} oscValue - Valor OSC (0-10)
   * @private
   */
  _handleIncoming(noiseIndex, param, oscValue) {
    if (this._ignoreOSCUpdates || !this._app) return;

    this._ignoreOSCUpdates = true;

    try {
      // Obtener módulo de audio desde _panel3LayoutData
      const audioKey = noiseIndex === 0 ? 'noise1' : 'noise2';
      const noiseAudioModules = this._app._panel3LayoutData?.noiseAudioModules;
      const audioModule = noiseAudioModules?.[audioKey];
      
      // Obtener UI
      const noiseId = `panel3-noise-${noiseIndex + 1}`;
      const noiseUI = this._app._noiseUIs?.[noiseId];
      
      if (param === 'colour') {
        // Aplicar al audio
        if (audioModule) {
          audioModule.setColour(oscValue);
        }
        // Actualizar knob UI (keyed by name, not index)
        if (noiseUI?.knobs?.['colour']) {
          noiseUI.knobs['colour'].setValue(oscValue);
        }
      } else if (param === 'level') {
        // Aplicar al audio
        if (audioModule) {
          audioModule.setLevel(oscValue);
        }
        // Actualizar knob UI (keyed by name, not index)
        if (noiseUI?.knobs?.['level']) {
          noiseUI.knobs['level'].setValue(oscValue);
        }
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

/** @type {NoiseGeneratorOSCSync} Instancia singleton */
const noiseGeneratorOSCSync = new NoiseGeneratorOSCSync();

export { noiseGeneratorOSCSync, NoiseGeneratorOSCSync, KNOB_INDEX_TO_OSC_KEY };
export default noiseGeneratorOSCSync;
