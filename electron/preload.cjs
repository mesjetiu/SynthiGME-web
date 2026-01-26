/**
 * Electron Preload Script
 * 
 * Este script se ejecuta antes de cargar la página web en el renderer.
 * Permite exponer APIs nativas de forma segura al contexto del renderer
 * usando contextBridge.
 * 
 * APIs expuestas:
 * - electronAPI: Información básica (isElectron, platform)
 * - electronAudio: Salida multicanal nativa (Linux/Windows/macOS)
 * 
 * Documentación: MULTICANAL-ELECTRON.md
 */

const { contextBridge, ipcRenderer } = require('electron');

// Indicador básico de que está en Electron
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform
});

/**
 * API de Audio Multicanal Nativo
 * 
 * Expone la funcionalidad del MultichannelBridge al renderer.
 * Permite salida de audio >2 canales usando herramientas nativas
 * del sistema operativo.
 * 
 * Uso desde el renderer:
 *   const { available } = await window.electronAudio.isMultichannelAvailable();
 *   if (available) {
 *     await window.electronAudio.openStream({ channels: 8, sampleRate: 48000 });
 *     await window.electronAudio.write(interleavedSamples);
 *   }
 */
contextBridge.exposeInMainWorld('electronAudio', {
  /**
   * Verifica si el sistema soporta salida multicanal
   * @returns {Promise<{available: boolean, reason?: string, backend?: string}>}
   */
  isMultichannelAvailable: () => ipcRenderer.invoke('audio:check-availability'),
  
  /**
   * Abre un stream de audio multicanal
   * @param {Object} config - Configuración del stream
   * @param {number} config.channels - Número de canales (1-64)
   * @param {number} config.sampleRate - Sample rate (44100, 48000, etc.)
   * @param {string} [config.deviceName] - Nombre visible en el sistema
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  openStream: (config) => ipcRenderer.invoke('audio:open-stream', config),
  
  /**
   * Escribe samples de audio al stream
   * IMPORTANTE: Usamos 'send' en lugar de 'invoke' para fire-and-forget verdadero.
   * Esto elimina el round-trip IPC que causaba latencia masiva.
   * @param {Float32Array} samples - Samples interleaved
   */
  write: (samples) => {
    // Convertir Float32Array a ArrayBuffer para transferencia IPC
    const buffer = samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength);
    // Fire-and-forget: no esperamos respuesta
    ipcRenderer.send('audio:write', buffer);
  },
  
  /**
   * Cierra el stream de audio
   * @returns {Promise<void>}
   */
  closeStream: () => ipcRenderer.invoke('audio:close-stream'),
  
  /**
   * Obtiene información del stream actual
   * @returns {Promise<{channels: number, sampleRate: number, deviceName: string, backend: string} | null>}
   */
  getStreamInfo: () => ipcRenderer.invoke('audio:get-stream-info')
});
