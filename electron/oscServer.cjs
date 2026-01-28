/**
 * OSC Server para Electron
 * 
 * Servidor UDP para comunicación OSC peer-to-peer entre instancias
 * de SynthiGME en la red local. Usa UDP multicast para descubrimiento
 * automático sin necesidad de configuración de IPs.
 * 
 * @module electron/oscServer
 * @see /OSC.md - Documentación completa del protocolo
 */

const dgram = require('dgram');

/**
 * Configuración por defecto del servidor OSC
 * @constant {Object}
 */
const DEFAULT_CONFIG = {
  /** Puerto UDP para OSC (compatible con SuperCollider) */
  port: 57121,
  /** Grupo multicast IPv4 - 224.0.1.1 es estándar administratively scoped */
  multicastGroup: '224.0.1.1',
  /** Prefijo de direcciones OSC */
  prefix: 'SynthiGME',
  /** Dirección de binding (todas las interfaces) */
  bindAddress: '0.0.0.0'
};

/**
 * Clase que gestiona la comunicación OSC via UDP multicast.
 * 
 * Permite enviar y recibir mensajes OSC a/desde todas las instancias
 * en la red local que estén en el mismo grupo multicast.
 * 
 * @example
 * const server = new OSCServer();
 * server.onMessage = (address, args) => console.log(address, args);
 * server.start();
 * server.send('/SynthiGME/osc/1/frequency', [5.0]);
 */
class OSCServer {
  /**
   * Crea una nueva instancia del servidor OSC
   * @param {Object} config - Configuración opcional
   * @param {number} [config.port=57121] - Puerto UDP
   * @param {string} [config.multicastGroup='224.0.1.1'] - Grupo multicast (RFC 2365: administratively scoped)
   * @param {string} [config.prefix='/SynthiGME/'] - Prefijo de direcciones
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.socket = null;
    this.running = false;
    
    /**
     * Lista de targets unicast adicionales (además del multicast)
     * Útil para enviar a aplicaciones que no soportan multicast (ej: SuperCollider)
     * @type {Array<{host: string, port: number}>}
     */
    this.unicastTargets = [];
    
    /**
     * Callback invocado cuando se recibe un mensaje OSC
     * @type {Function|null}
     * @param {string} address - Dirección OSC (ej: '/SynthiGME/osc/1/frequency')
     * @param {Array} args - Argumentos del mensaje
     * @param {Object} rinfo - Información del remitente (address, port)
     */
    this.onMessage = null;
    
    /**
     * Callback invocado en caso de error
     * @type {Function|null}
     * @param {Error} error - Error ocurrido
     */
    this.onError = null;
    
    /**
     * Callback invocado cuando el servidor está listo
     * @type {Function|null}
     */
    this.onReady = null;
  }

  /**
   * Inicia el servidor OSC
   * @returns {Promise<void>} Resuelve cuando el servidor está escuchando
   */
  start() {
    return new Promise((resolve, reject) => {
      if (this.running) {
        resolve();
        return;
      }

      try {
        // Crear socket UDP4 con reuseAddr para permitir múltiples instancias
        this.socket = dgram.createSocket({ 
          type: 'udp4', 
          reuseAddr: true 
        });

        // Manejar errores del socket
        this.socket.on('error', (err) => {
          console.error('[OSC] Socket error:', err.message);
          if (this.onError) this.onError(err);
          if (!this.running) reject(err);
        });

        // Manejar mensajes entrantes
        this.socket.on('message', (buffer, rinfo) => {
          try {
            const message = this._parseOSCMessage(buffer);
            if (message && this.onMessage) {
              // Ignorar mensajes propios (mismo puerto local)
              // Nota: en multicast todos reciben, incluido el emisor
              this.onMessage(message.address, message.args, rinfo);
            }
          } catch (err) {
            console.error('[OSC] Parse error:', err.message);
          }
        });

        // Bind al puerto y unirse al grupo multicast
        this.socket.bind(this.config.port, this.config.bindAddress, () => {
          try {
            // Unirse al grupo multicast para recibir mensajes
            this.socket.addMembership(this.config.multicastGroup);
            
            // Permitir envío multicast
            this.socket.setMulticastTTL(128);
            
            // Recibir nuestros propios mensajes (para debug, se filtrarán luego)
            this.socket.setMulticastLoopback(true);
            
            this.running = true;
            console.log(`[OSC] Server listening on ${this.config.bindAddress}:${this.config.port}`);
            console.log(`[OSC] Multicast group: ${this.config.multicastGroup}`);
            
            if (this.onReady) this.onReady();
            resolve();
          } catch (err) {
            console.error('[OSC] Failed to join multicast group:', err.message);
            reject(err);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Detiene el servidor OSC
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve) => {
      if (!this.running || !this.socket) {
        resolve();
        return;
      }

      try {
        this.socket.dropMembership(this.config.multicastGroup);
      } catch (err) {
        // Ignorar error si ya no está en el grupo
      }

      this.socket.close(() => {
        this.running = false;
        this.socket = null;
        console.log('[OSC] Server stopped');
        resolve();
      });
    });
  }

  /**
   * Envía un mensaje OSC al grupo multicast
   * @param {string} address - Dirección OSC (ej: '/SynthiGME/osc/1/frequency')
   * @param {Array} args - Argumentos del mensaje (números o strings)
   * @returns {boolean} true si se envió correctamente
   */
  send(address, args = []) {
    if (!this.running || !this.socket) {
      console.warn('[OSC] Cannot send: server not running');
      return false;
    }

    try {
      const buffer = this._buildOSCMessage(address, args);
      this.socket.send(
        buffer, 
        0, 
        buffer.length, 
        this.config.port, 
        this.config.multicastGroup,
        (err) => {
          if (err) {
            console.error('[OSC] Send error:', err.message);
          }
        }
      );
      
      // También enviar a targets unicast registrados (ej: SuperCollider)
      for (const target of this.unicastTargets) {
        this.socket.send(
          buffer,
          0,
          buffer.length,
          target.port,
          target.host,
          (err) => {
            if (err) {
              console.error(`[OSC] Unicast send error to ${target.host}:${target.port}:`, err.message);
            }
          }
        );
      }
      
      return true;
    } catch (err) {
      console.error('[OSC] Build message error:', err.message);
      return false;
    }
  }

  /**
   * Añade un target unicast para envío directo (además del multicast)
   * Útil para comunicarse con aplicaciones que no soportan multicast (ej: SuperCollider)
   * @param {string} host - Dirección IP del target
   * @param {number} port - Puerto del target
   */
  addUnicastTarget(host, port) {
    // Evitar duplicados
    const exists = this.unicastTargets.some(t => t.host === host && t.port === port);
    if (!exists) {
      this.unicastTargets.push({ host, port });
      console.log(`[OSC] Añadido target unicast: ${host}:${port}`);
    }
  }

  /**
   * Elimina un target unicast
   * @param {string} host 
   * @param {number} port 
   */
  removeUnicastTarget(host, port) {
    this.unicastTargets = this.unicastTargets.filter(
      t => !(t.host === host && t.port === port)
    );
    console.log(`[OSC] Eliminado target unicast: ${host}:${port}`);
  }

  /**
   * Obtiene la lista de targets unicast
   * @returns {Array<{host: string, port: number}>}
   */
  getUnicastTargets() {
    return [...this.unicastTargets];
  }

  /**
   * Construye un mensaje OSC en formato binario
   * Implementación simplificada del protocolo OSC 1.0
   * 
   * @private
   * @param {string} address - Dirección OSC
   * @param {Array} args - Argumentos
   * @returns {Buffer} Mensaje OSC binario
   */
  _buildOSCMessage(address, args) {
    const parts = [];
    
    // 1. Address string (null-terminated, padded to 4 bytes)
    parts.push(this._encodeString(address));
    
    // 2. Type tag string (starts with ',')
    let typeTags = ',';
    for (const arg of args) {
      if (typeof arg === 'number') {
        typeTags += Number.isInteger(arg) ? 'i' : 'f';
      } else if (typeof arg === 'string') {
        typeTags += 's';
      }
    }
    parts.push(this._encodeString(typeTags));
    
    // 3. Arguments
    for (const arg of args) {
      if (typeof arg === 'number') {
        if (Number.isInteger(arg)) {
          parts.push(this._encodeInt32(arg));
        } else {
          parts.push(this._encodeFloat32(arg));
        }
      } else if (typeof arg === 'string') {
        parts.push(this._encodeString(arg));
      }
    }
    
    return Buffer.concat(parts);
  }

  /**
   * Parsea un mensaje OSC binario
   * @private
   * @param {Buffer} buffer - Mensaje OSC binario
   * @returns {Object|null} { address: string, args: Array }
   */
  _parseOSCMessage(buffer) {
    let offset = 0;
    
    // 1. Leer address
    const { value: address, newOffset: addrOffset } = this._decodeString(buffer, offset);
    offset = addrOffset;
    
    // Verificar que es una dirección OSC válida
    if (!address.startsWith('/')) {
      return null;
    }
    
    // 2. Leer type tags
    const { value: typeTags, newOffset: typeOffset } = this._decodeString(buffer, offset);
    offset = typeOffset;
    
    if (!typeTags.startsWith(',')) {
      return { address, args: [] };
    }
    
    // 3. Leer argumentos según type tags
    const args = [];
    for (let i = 1; i < typeTags.length; i++) {
      const type = typeTags[i];
      switch (type) {
        case 'f': {
          const { value, newOffset } = this._decodeFloat32(buffer, offset);
          args.push(value);
          offset = newOffset;
          break;
        }
        case 'i': {
          const { value, newOffset } = this._decodeInt32(buffer, offset);
          args.push(value);
          offset = newOffset;
          break;
        }
        case 's': {
          const { value, newOffset } = this._decodeString(buffer, offset);
          args.push(value);
          offset = newOffset;
          break;
        }
        // Otros tipos se ignoran
      }
    }
    
    return { address, args };
  }

  /**
   * Codifica un string en formato OSC (null-terminated, 4-byte aligned)
   * @private
   */
  _encodeString(str) {
    const strBuffer = Buffer.from(str, 'utf8');
    // Calcular padding para alineación a 4 bytes (incluye null terminator)
    const padding = 4 - ((strBuffer.length + 1) % 4);
    const totalLength = strBuffer.length + 1 + (padding === 4 ? 0 : padding);
    const buffer = Buffer.alloc(totalLength);
    strBuffer.copy(buffer);
    // El resto ya está en 0 (null bytes)
    return buffer;
  }

  /**
   * Decodifica un string en formato OSC
   * @private
   */
  _decodeString(buffer, offset) {
    let end = offset;
    while (end < buffer.length && buffer[end] !== 0) {
      end++;
    }
    const value = buffer.toString('utf8', offset, end);
    // Saltar al siguiente múltiplo de 4
    const newOffset = Math.ceil((end + 1) / 4) * 4;
    return { value, newOffset };
  }

  /**
   * Codifica un float32 en big-endian
   * @private
   */
  _encodeFloat32(value) {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatBE(value, 0);
    return buffer;
  }

  /**
   * Decodifica un float32 big-endian
   * @private
   */
  _decodeFloat32(buffer, offset) {
    const value = buffer.readFloatBE(offset);
    return { value, newOffset: offset + 4 };
  }

  /**
   * Codifica un int32 en big-endian
   * @private
   */
  _encodeInt32(value) {
    const buffer = Buffer.alloc(4);
    buffer.writeInt32BE(value, 0);
    return buffer;
  }

  /**
   * Decodifica un int32 big-endian
   * @private
   */
  _decodeInt32(buffer, offset) {
    const value = buffer.readInt32BE(offset);
    return { value, newOffset: offset + 4 };
  }

  /**
   * Obtiene el estado actual del servidor
   * @returns {Object} Estado del servidor
   */
  getStatus() {
    return {
      running: this.running,
      port: this.config.port,
      multicastGroup: this.config.multicastGroup,
      prefix: this.config.prefix
    };
  }
}

module.exports = { OSCServer, DEFAULT_CONFIG };
