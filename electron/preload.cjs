/**
 * Electron Preload Script
 * 
 * Este script se ejecuta antes de cargar la página web en el renderer.
 * Con contextIsolation=false, exponemos APIs directamente en window.
 * 
 * APIs expuestas:
 * - electronAPI: información de plataforma
 * - oscAPI: comunicación OSC peer-to-peer
 * - multichannelAPI: audio multicanal 8ch via PipeWire con SharedArrayBuffer
 * 
 * @see /OSC.md - Documentación del protocolo OSC
 */

const { ipcRenderer } = require('electron');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// API de plataforma
// ─────────────────────────────────────────────────────────────────────────────
window.electronAPI = {
  /** Indica que estamos en Electron (no en navegador) */
  isElectron: true,
  /** Plataforma: 'darwin', 'win32', 'linux' */
  platform: process.platform
};

// ─────────────────────────────────────────────────────────────────────────────
// API OSC para comunicación peer-to-peer
// ─────────────────────────────────────────────────────────────────────────────
window.oscAPI = {
  start: (config) => ipcRenderer.invoke('osc:start', config),
  stop: () => ipcRenderer.invoke('osc:stop'),
  send: (address, args) => ipcRenderer.invoke('osc:send', address, args),
  getStatus: () => ipcRenderer.invoke('osc:status'),
  onMessage: (callback) => {
    const handler = (event, data) => {
      callback(data.address, data.args, data.from);
    };
    ipcRenderer.on('osc:message', handler);
    return () => ipcRenderer.removeListener('osc:message', handler);
  },
  addTarget: (host, port) => ipcRenderer.invoke('osc:addTarget', host, port),
  removeTarget: (host, port) => ipcRenderer.invoke('osc:removeTarget', host, port),
  getTargets: () => ipcRenderer.invoke('osc:getTargets')
};

// ─────────────────────────────────────────────────────────────────────────────
// API de Audio Multicanal (8 canales via PipeWire)
// Usa SharedArrayBuffer para comunicación lock-free con AudioWorklet
// ─────────────────────────────────────────────────────────────────────────────

let nativeAudio = null;
let nativeStream = null;

try {
  const addonPaths = [
    path.join(__dirname, 'native/build/Release/pipewire_audio.node'),
    path.join(__dirname, '../electron/native/build/Release/pipewire_audio.node'),
    path.join(process.resourcesPath || '', 'native/pipewire_audio.node')
  ];
  
  for (const addonPath of addonPaths) {
    try {
      nativeAudio = require(addonPath);
      console.log('[Preload] Native audio addon loaded from:', addonPath);
      break;
    } catch (e) {
      // Intentar siguiente path
    }
  }
  
  if (!nativeAudio) {
    console.warn('[Preload] Native audio addon not found, falling back to IPC');
  }
} catch (e) {
  console.warn('[Preload] Could not load native audio:', e.message);
}

window.multichannelAPI = {
  checkAvailability: () => {
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    if (nativeAudio) {
      return Promise.resolve({ 
        available: true, 
        native: true,
        sharedArrayBuffer: hasSharedArrayBuffer
      });
    }
    return ipcRenderer.invoke('multichannel:check');
  },
  
  open: (config) => {
    if (nativeAudio && !nativeStream) {
      try {
        const sampleRate = config?.sampleRate || 48000;
        const channels = config?.channels || 8;
        const bufferSize = 256;
        
        nativeStream = new nativeAudio.PipeWireAudio('SynthiGME', channels, sampleRate, bufferSize);
        const started = nativeStream.start();
        
        if (!started) {
          nativeStream = null;
          return Promise.resolve({ success: false, error: 'Failed to start stream' });
        }
        
        console.log('[Preload] Native stream started');
        
        return Promise.resolve({ 
          success: true, 
          info: { sampleRate, channels, direct: true }
        });
      } catch (e) {
        nativeStream = null;
        return Promise.resolve({ success: false, error: e.message });
      }
    }
    return ipcRenderer.invoke('multichannel:open', config);
  },
  
  /**
   * Adjunta un SharedArrayBuffer - pasamos un Int32Array que lo envuelve
   * porque N-API no puede detectar SharedArrayBuffer directamente
   */
  attachSharedBuffer: (sharedBuffer, bufferFrames) => {
    console.log('[Preload] attachSharedBuffer called, type:', sharedBuffer?.constructor?.name, 'frames:', bufferFrames);
    if (nativeStream && sharedBuffer instanceof SharedArrayBuffer) {
      try {
        // Crear un Int32Array que envuelve el SharedArrayBuffer
        // El addon C++ extraerá el buffer subyacente del TypedArray
        const wrapper = new Int32Array(sharedBuffer);
        console.log('[Preload] Passing Int32Array wrapper, length:', wrapper.length);
        const success = nativeStream.attachSharedBuffer(wrapper, bufferFrames);
        console.log('[Preload] attachSharedBuffer:', success ? 'OK - LOCK-FREE MODE!' : 'FAILED');
        return success;
      } catch (e) {
        console.error('[Preload] attachSharedBuffer error:', e);
        return false;
      }
    }
    console.warn('[Preload] attachSharedBuffer: no stream or invalid buffer type');
    return false;
  },
  
  write: (audioData) => {
    if (nativeStream) {
      // Asegurar que sea Float32Array
      let float32;
      if (audioData instanceof Float32Array) {
        float32 = audioData;
      } else if (audioData instanceof ArrayBuffer) {
        float32 = new Float32Array(audioData);
      } else if (audioData && audioData.buffer instanceof ArrayBuffer) {
        float32 = new Float32Array(audioData.buffer);
      } else {
        console.warn('[Preload] write: invalid audio data type:', typeof audioData);
        return;
      }
      nativeStream.write(float32);
      return;
    }
    ipcRenderer.send('multichannel:write', audioData);
  },
  
  close: () => {
    if (nativeStream) {
      if (nativeStream.hasSharedBuffer) {
        nativeStream.detachSharedBuffer();
      }
      nativeStream.stop();
      nativeStream = null;
      console.log('[Preload] Native stream stopped');
      return Promise.resolve();
    }
    return ipcRenderer.invoke('multichannel:close');
  },
  
  getInfo: () => {
    if (nativeStream) {
      return Promise.resolve({
        underflows: nativeStream.underflows,
        overflows: nativeStream.overflows,
        silentUnderflows: nativeStream.silentUnderflows,
        bufferedFrames: nativeStream.bufferedFrames,
        hasSharedBuffer: nativeStream.hasSharedBuffer,
        direct: true
      });
    }
    return ipcRenderer.invoke('multichannel:info');
  }
};
