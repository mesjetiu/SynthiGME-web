/**
 * Electron Preload Script
 * 
 * Este script se ejecuta antes de cargar la página web en el renderer.
 * Permite exponer APIs nativas de forma segura al contexto del renderer
 * usando contextBridge.
 * 
 * APIs expuestas:
 * - electronAPI: información de plataforma
 * - oscAPI: comunicación OSC peer-to-peer
 * 
 * @see /OSC.md - Documentación del protocolo OSC
 */

const { contextBridge, ipcRenderer } = require('electron');

// ─────────────────────────────────────────────────────────────────────────────
// API de plataforma
// ─────────────────────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  /** Indica que estamos en Electron (no en navegador) */
  isElectron: true,
  /** Plataforma: 'darwin', 'win32', 'linux' */
  platform: process.platform
});

// ─────────────────────────────────────────────────────────────────────────────
// API OSC para comunicación peer-to-peer
// ─────────────────────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('oscAPI', {
  /**
   * Inicia el servidor OSC
   * @returns {Promise<{success: boolean, status?: Object, error?: string}>}
   */
  start: () => ipcRenderer.invoke('osc:start'),
  
  /**
   * Detiene el servidor OSC
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  stop: () => ipcRenderer.invoke('osc:stop'),
  
  /**
   * Envía un mensaje OSC al grupo multicast (y a targets unicast registrados)
   * @param {string} address - Dirección OSC (ej: '/SynthiGME/osc/1/frequency')
   * @param {Array} args - Argumentos del mensaje
   * @returns {Promise<boolean>} true si se envió correctamente
   */
  send: (address, args) => ipcRenderer.invoke('osc:send', address, args),
  
  /**
   * Obtiene el estado actual del servidor OSC
   * @returns {Promise<{running: boolean, port?: number, multicastGroup?: string}>}
   */
  getStatus: () => ipcRenderer.invoke('osc:status'),
  
  /**
   * Registra un callback para recibir mensajes OSC
   * @param {Function} callback - Función a llamar con (address, args, from)
   * @returns {Function} Función para cancelar la suscripción
   */
  onMessage: (callback) => {
    const handler = (event, data) => {
      callback(data.address, data.args, data.from);
    };
    ipcRenderer.on('osc:message', handler);
    // Retornar función para cancelar suscripción
    return () => ipcRenderer.removeListener('osc:message', handler);
  },
  
  /**
   * Añade un target unicast para envío directo
   * Útil para enviar a SuperCollider (que no soporta multicast)
   * @param {string} host - Dirección IP (ej: '127.0.0.1')
   * @param {number} port - Puerto (ej: 57120 para SC)
   * @returns {Promise<{success: boolean, targets: Array}>}
   */
  addTarget: (host, port) => ipcRenderer.invoke('osc:addTarget', host, port),
  
  /**
   * Elimina un target unicast
   * @param {string} host 
   * @param {number} port 
   * @returns {Promise<{success: boolean, targets: Array}>}
   */
  removeTarget: (host, port) => ipcRenderer.invoke('osc:removeTarget', host, port),
  
  /**
   * Obtiene la lista de targets unicast registrados
   * @returns {Promise<Array<{host: string, port: number}>>}
   */
  getTargets: () => ipcRenderer.invoke('osc:getTargets')
});

// ─────────────────────────────────────────────────────────────────────────────
// APIs futuras (comentadas hasta implementación)
// ─────────────────────────────────────────────────────────────────────────────
// contextBridge.exposeInMainWorld('fileAPI', {
//   saveFile: (data, filename) => ipcRenderer.invoke('save-file', data, filename),
//   loadFile: () => ipcRenderer.invoke('load-file'),
// });
