/**
 * OSC Bridge - Capa de abstracción para comunicación OSC
 * 
 * Este módulo proporciona una API unificada para comunicación OSC
 * entre instancias de SynthiGME en red local. Abstrae las diferencias
 * entre Electron (UDP nativo) y navegador (futuro WebSocket).
 * 
 * Características:
 * - Envío y recepción de mensajes OSC
 * - Mecanismo anti-loop para evitar reenvíos infinitos
 * - Configuración de prefijo OSC personalizable
 * - Callbacks para mensajes entrantes
 * 
 * @module osc/oscBridge
 * @see /OSC.md - Documentación completa del protocolo
 */

/**
 * Configuración por defecto del bridge OSC
 * @constant {Object}
 */
const DEFAULT_CONFIG = {
  /** Prefijo para direcciones OSC (sin barras, se añaden automáticamente) */
  prefix: 'SynthiGME',
  /** Habilitar envío de mensajes */
  sendEnabled: true,
  /** Habilitar recepción de mensajes */
  receiveEnabled: true,
  /** Log de mensajes en consola (debug) */
  verbose: false
};

/**
 * Clase singleton que gestiona la comunicación OSC
 */
class OSCBridge {
  constructor() {
    /** @type {Object} Configuración actual */
    this.config = { ...DEFAULT_CONFIG };
    
    /** @type {boolean} Estado de conexión */
    this.connected = false;
    
    /** @type {Function|null} Función para cancelar suscripción a mensajes */
    this._unsubscribe = null;
    
    /** @type {Map<string, Set<Function>>} Callbacks por dirección OSC */
    this._listeners = new Map();
    
    /** @type {Set<string>} Mensajes recientes para filtrar loops */
    this._recentMessages = new Set();
    
    /** @type {number} Tiempo en ms para considerar un mensaje como duplicado */
    this._dedupeWindow = 50;
  }

  /**
   * Verifica si estamos en Electron con soporte OSC
   * @returns {boolean}
   */
  isAvailable() {
    return typeof window !== 'undefined' && 
           window.oscAPI !== undefined;
  }

  /**
   * Inicia la conexión OSC
   * @param {Object} [config] - Configuración opcional
   * @returns {Promise<boolean>} true si se conectó correctamente
   */
  async start(config = {}) {
    if (!this.isAvailable()) {
      console.warn('[OSCBridge] OSC no disponible (solo funciona en Electron)');
      return false;
    }

    // Aplicar configuración
    this.config = { ...this.config, ...config };
    
    // Leer puerto de localStorage si no se especifica
    // Usar clave con prefijo del proyecto (synthigme_osc-port)
    const savedPort = localStorage.getItem('synthigme_osc-port');
    const port = config.port || (savedPort ? parseInt(savedPort, 10) : 57121);

    try {
      const result = await window.oscAPI.start(port ? { port } : undefined);
      
      if (result.success) {
        this.connected = true;
        this._setupMessageHandler();
        
        console.log('[OSCBridge] Conectado correctamente en puerto', result.status?.port || 57121);
        
        if (this.config.verbose) {
          console.log('[OSCBridge] Conectado:', result.status);
        }
        
        // Emitir evento de conexión
        this._emit('osc:connected', result.status);
        return true;
      } else {
        console.error('[OSCBridge] Error al iniciar:', result.error);
        return false;
      }
    } catch (err) {
      console.error('[OSCBridge] Excepción al iniciar:', err);
      return false;
    }
  }

  /**
   * Detiene la conexión OSC
   * @returns {Promise<boolean>}
   */
  async stop() {
    if (!this.isAvailable() || !this.connected) {
      return false;
    }

    try {
      // Cancelar suscripción a mensajes
      if (this._unsubscribe) {
        this._unsubscribe();
        this._unsubscribe = null;
      }

      const result = await window.oscAPI.stop();
      this.connected = false;
      
      if (this.config.verbose) {
        console.log('[OSCBridge] Desconectado');
      }
      
      // Emitir evento de desconexión
      this._emit('osc:disconnected');
      return result.success;
    } catch (err) {
      console.error('[OSCBridge] Error al detener:', err);
      return false;
    }
  }

  /**
   * Obtiene el prefijo formateado con barras para construir direcciones OSC
   * El usuario configura 'SynthiGME' pero las direcciones usan '/SynthiGME/'
   * @returns {string}
   */
  getFormattedPrefix() {
    const raw = this.config.prefix || 'SynthiGME';
    // Asegurar formato /prefix/
    const clean = raw.replace(/^\/+|\/+$/g, ''); // Quitar barras existentes
    return `/${clean}/`;
  }

  /**
   * Obtiene el estado actual de la conexión
   * @returns {Promise<Object>}
   */
  async getStatus() {
    if (!this.isAvailable()) {
      return { available: false, running: false };
    }
    
    const status = await window.oscAPI.getStatus();
    return { available: true, ...status };
  }

  /**
   * Envía un mensaje OSC
   * 
   * @param {string} address - Dirección OSC relativa (sin prefijo) o absoluta
   * @param {number|Array} value - Valor o array de valores
   * @param {Object} [options] - Opciones adicionales
   * @param {boolean} [options.skipPrefix=false] - No añadir prefijo automáticamente
   * @returns {boolean} true si se envió correctamente
   * 
   * @example
   * // Enviar con prefijo automático -> /SynthiGME/osc/1/frequency
   * oscBridge.send('osc/1/frequency', 5.0);
   * 
   * // Enviar dirección absoluta
   * oscBridge.send('/SynthiGME/osc/1/frequency', 5.0, { skipPrefix: true });
   */
  send(address, value, options = {}) {
    if (!this.connected || !this.config.sendEnabled) {
      console.log('[OSCBridge] send blocked - connected:', this.connected, 'sendEnabled:', this.config.sendEnabled);
      return false;
    }

    // Construir dirección completa
    let fullAddress = address;
    const prefix = this.getFormattedPrefix();
    if (!options.skipPrefix && !address.startsWith(prefix)) {
      fullAddress = prefix + address;
    }

    // Normalizar valor a array
    const args = Array.isArray(value) ? value : [value];

    // Registrar mensaje para deduplicación (evitar loops)
    const msgKey = `${fullAddress}:${JSON.stringify(args)}`;
    this._recentMessages.add(msgKey);
    setTimeout(() => this._recentMessages.delete(msgKey), this._dedupeWindow);

    if (this.config.verbose) {
      console.log('[OSCBridge] Enviando:', fullAddress, args);
    }

    // Emitir evento para el log de OSC (dirección de salida)
    this._emit('osc:message', { 
      address: fullAddress, 
      args, 
      direction: 'out' 
    });

    return window.oscAPI.send(fullAddress, args);
  }

  /**
   * Registra un callback para una dirección OSC específica
   * 
   * @param {string} address - Dirección OSC (puede incluir * como wildcard)
   * @param {Function} callback - Función a llamar: (value, address, from) => {}
   * @returns {Function} Función para cancelar la suscripción
   * 
   * @example
   * // Escuchar dirección específica
   * const unsub = oscBridge.on('osc/1/frequency', (value) => {
   *   console.log('Frecuencia:', value);
   * });
   * 
   * // Escuchar con wildcard
   * oscBridge.on('osc/*\/frequency', (value, address) => {
   *   console.log(address, '=', value);
   * });
   * 
   * // Cancelar suscripción
   * unsub();
   */
  on(address, callback) {
    // Añadir prefijo si no está presente
    let fullAddress = address;
    if (!address.startsWith('/')) {
      fullAddress = this.getFormattedPrefix() + address;
    }

    if (!this._listeners.has(fullAddress)) {
      this._listeners.set(fullAddress, new Set());
    }
    this._listeners.get(fullAddress).add(callback);

    // Retornar función para cancelar
    return () => {
      const listeners = this._listeners.get(fullAddress);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this._listeners.delete(fullAddress);
        }
      }
    };
  }

  /**
   * Registra un callback para TODOS los mensajes OSC
   * @param {Function} callback - Función: (address, args, from) => {}
   * @returns {Function} Función para cancelar
   */
  onAny(callback) {
    return this.on('*', callback);
  }

  /**
   * Actualiza la configuración
   * @param {Object} config - Nueva configuración parcial
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
    
    if (this.config.verbose) {
      console.log('[OSCBridge] Configuración actualizada:', this.config);
    }
  }

  /**
   * Configura el handler de mensajes entrantes
   * @private
   */
  _setupMessageHandler() {
    if (this._unsubscribe) {
      this._unsubscribe();
    }

    this._unsubscribe = window.oscAPI.onMessage((address, args, from) => {
      // Verificar si recepción está habilitada
      if (!this.config.receiveEnabled) {
        return;
      }

      // Deduplicación: ignorar mensajes propios recientes
      const msgKey = `${address}:${JSON.stringify(args)}`;
      if (this._recentMessages.has(msgKey)) {
        if (this.config.verbose) {
          console.log('[OSCBridge] Ignorando mensaje propio:', address);
        }
        return;
      }

      if (this.config.verbose) {
        console.log('[OSCBridge] Recibido:', address, args, 'de', from);
      }

      // Extraer valor (primer argumento o array completo)
      const value = args.length === 1 ? args[0] : args;

      // Notificar a listeners específicos
      this._notifyListeners(address, value, from);
      
      // Notificar a listeners wildcard (*)
      const wildcardListeners = this._listeners.get('*');
      if (wildcardListeners) {
        wildcardListeners.forEach(cb => {
          try {
            cb(address, args, from);
          } catch (err) {
            console.error('[OSCBridge] Error en listener wildcard:', err);
          }
        });
      }

      // Emitir evento genérico
      this._emit('osc:message', { address, args, from, direction: 'in' });
    });
  }

  /**
   * Notifica a los listeners que coinciden con la dirección
   * @private
   */
  _notifyListeners(address, value, from) {
    // Listeners exactos
    const exactListeners = this._listeners.get(address);
    if (exactListeners) {
      exactListeners.forEach(cb => {
        try {
          cb(value, address, from);
        } catch (err) {
          console.error('[OSCBridge] Error en listener:', err);
        }
      });
    }

    // Listeners con wildcard (patrón simple)
    this._listeners.forEach((listeners, pattern) => {
      if (pattern === '*' || pattern === address) return;
      
      // Convertir patrón a regex simple (* -> .*)
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(address)) {
        listeners.forEach(cb => {
          try {
            cb(value, address, from);
          } catch (err) {
            console.error('[OSCBridge] Error en listener wildcard:', err);
          }
        });
      }
    });
  }

  /**
   * Emite un evento de documento
   * @private
   */
  _emit(eventName, detail = null) {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton y exportación
// ─────────────────────────────────────────────────────────────────────────────

/** @type {OSCBridge} Instancia singleton */
const oscBridge = new OSCBridge();

export { oscBridge, OSCBridge };
export default oscBridge;
