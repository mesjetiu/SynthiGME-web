/**
 * OSC Joystick Sync - Sincronización de joysticks via OSC
 * 
 * Gestiona el envío y recepción de mensajes OSC para los 2 joysticks
 * del Panel 7. Cada joystick tiene posición XY (pad) y rangos XY (knobs).
 * 
 * Direcciones OSC:
 * - /joy/{1-2}/positionX   -1 a 1 (posición normalizada del pad)
 * - /joy/{1-2}/positionY   -1 a 1 (posición normalizada del pad)
 * - /joy/{1-2}/rangeX      0-10 (knob de rango eje X)
 * - /joy/{1-2}/rangeY      0-10 (knob de rango eje Y)
 * 
 * Nota: 1=left, 2=right
 * 
 * @module osc/oscJoystickSync
 * @see /OSC.md - Documentación del protocolo
 */

import { oscBridge } from './oscBridge.js';

/**
 * Clase que gestiona la sincronización OSC de joysticks
 */
class JoystickOSCSync {
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
   * Inicializa la sincronización OSC para joysticks
   * 
   * @param {Object} app - Instancia de SGMEApp
   */
  init(app) {
    this._app = app;
    this._setupListeners();
    console.log('[JoystickOSCSync] Inicializado para 2 joysticks');
  }

  /**
   * Envía un cambio de posición XY via OSC
   * 
   * @param {number} joyIndex - 0=left, 1=right
   * @param {number} nx - Posición normalizada X (-1..+1)
   * @param {number} ny - Posición normalizada Y (-1..+1)
   */
  sendPositionChange(joyIndex, nx, ny) {
    if (!oscBridge.connected) return;
    
    const joyNum = joyIndex + 1;
    
    // Enviar X
    const addressX = `joy/${joyNum}/positionX`;
    const lastX = this._lastSentValues.get(addressX);
    if (lastX === undefined || Math.abs(lastX - nx) >= 0.001) {
      this._lastSentValues.set(addressX, nx);
      oscBridge.send(addressX, nx);
    }
    
    // Enviar Y
    const addressY = `joy/${joyNum}/positionY`;
    const lastY = this._lastSentValues.get(addressY);
    if (lastY === undefined || Math.abs(lastY - ny) >= 0.001) {
      this._lastSentValues.set(addressY, ny);
      oscBridge.send(addressY, ny);
    }
  }

  /**
   * Envía un cambio de rango Y via OSC
   * 
   * @param {number} joyIndex - 0=left, 1=right
   * @param {number} dialValue - Valor del knob (0-10)
   */
  sendRangeYChange(joyIndex, dialValue) {
    if (!oscBridge.connected) return;
    
    const address = `joy/${joyIndex + 1}/rangeY`;
    
    const lastValue = this._lastSentValues.get(address);
    if (lastValue !== undefined && Math.abs(lastValue - dialValue) < 0.0001) {
      return;
    }
    this._lastSentValues.set(address, dialValue);
    
    oscBridge.send(address, dialValue);
  }

  /**
   * Envía un cambio de rango X via OSC
   * 
   * @param {number} joyIndex - 0=left, 1=right
   * @param {number} dialValue - Valor del knob (0-10)
   */
  sendRangeXChange(joyIndex, dialValue) {
    if (!oscBridge.connected) return;
    
    const address = `joy/${joyIndex + 1}/rangeX`;
    
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

    const params = ['positionX', 'positionY', 'rangeX', 'rangeY'];
    
    for (let n = 1; n <= 2; n++) {
      for (const param of params) {
        const address = `joy/${n}/${param}`;
        const unsub = oscBridge.on(address, (value) => {
          this._handleIncoming(n - 1, param, value);
        });
        this._unsubscribers.set(`joy-${n}-${param}`, unsub);
      }
    }
  }

  /**
   * Procesa un mensaje OSC entrante
   * 
   * @param {number} joyIndex - 0=left, 1=right
   * @param {string} param - Nombre del parámetro
   * @param {number} oscValue - Valor OSC
   * @private
   */
  _handleIncoming(joyIndex, param, oscValue) {
    if (this._ignoreOSCUpdates || !this._app) return;

    this._ignoreOSCUpdates = true;

    try {
      const side = joyIndex === 0 ? 'left' : 'right';
      const module = this._app._joystickModules?.[side];
      const joyUI = this._app._joystickUIs?.[`joystick-${side}`];
      const knobs = this._app._joystickKnobs?.[side];
      
      if (!module) return;

      switch (param) {
        case 'positionX':
        case 'positionY': {
          // Obtener la posición actual del otro eje desde el módulo
          const currentX = module.x || 0;
          const currentY = module.y || 0;
          const nx = param === 'positionX' ? oscValue : currentX;
          const ny = param === 'positionY' ? oscValue : currentY;
          
          module.setPosition(nx, ny);
          
          // Actualizar handle visual del pad
          if (joyUI?.padEl) {
            const handle = joyUI.padEl.querySelector('.joystick-handle');
            if (handle) {
              const handleScale = 0.83;
              const px = (nx * handleScale + 1) / 2;
              const py = (1 - ny * handleScale) / 2;
              handle.style.left = (px * 100) + '%';
              handle.style.top = (py * 100) + '%';
              handle.style.transform = 'translate(-50%, -50%)';
            }
          }
          break;
        }
        
        case 'rangeY': {
          // OSC value 0-10, el knob usa normalizado 0-1
          const config = joyUI?.config?.knobs?.rangeY;
          const max = config?.max || 10;
          module.setRangeY(oscValue);
          
          // Actualizar knob UI
          if (knobs?.rangeY) {
            knobs.rangeY.knob.setValue(oscValue / max);
          }
          break;
        }
        
        case 'rangeX': {
          const config = joyUI?.config?.knobs?.rangeX;
          const max = config?.max || 10;
          module.setRangeX(oscValue);
          
          // Actualizar knob UI
          if (knobs?.rangeX) {
            knobs.rangeX.knob.setValue(oscValue / max);
          }
          break;
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

/** @type {JoystickOSCSync} Instancia singleton */
const joystickOSCSync = new JoystickOSCSync();

export { joystickOSCSync, JoystickOSCSync };
export default joystickOSCSync;
