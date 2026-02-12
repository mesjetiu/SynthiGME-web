/**
 * Electron Preload Script
 * 
 * Este script se ejecuta antes de cargar la página web en el renderer.
 * Con contextIsolation=false, exponemos APIs directamente en window.
 * 
 * APIs expuestas:
 * - electronAPI: información de plataforma
 * - oscAPI: comunicación OSC peer-to-peer
 * - multichannelAPI: audio multicanal 12ch OUTPUT via PipeWire con SharedArrayBuffer
 * - multichannelInputAPI: audio multicanal 8ch INPUT via PipeWire con SharedArrayBuffer
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
// API de Menú nativo (comunicación bidireccional con el menú de Electron)
// ─────────────────────────────────────────────────────────────────────────────
window.menuAPI = {
  /**
   * Escucha acciones del menú nativo (main → renderer)
   * @param {Function} callback - callback({ action, data })
   * @returns {Function} Función para eliminar el listener
   */
  onMenuAction: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },

  /**
   * Envía estado actualizado al menú nativo (renderer → main)
   * @param {Object} state - Estado parcial de checkboxes { key: value }
   */
  syncMenuState: (state) => {
    ipcRenderer.send('menu:syncState', state);
  },

  /**
   * Envía traducciones al menú nativo (renderer → main)
   * @param {Object} translations - Objeto { key: translatedText }
   */
  syncTranslations: (translations) => {
    ipcRenderer.send('menu:syncTranslations', translations);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// API de gestión de energía (prevención de suspensión del sistema)
// ─────────────────────────────────────────────────────────────────────────────
window.powerAPI = {
  /** Bloquea suspensión del sistema (llamar al iniciar audio) */
  preventSleep: () => ipcRenderer.invoke('power:preventSleep'),
  /** Permite suspensión del sistema (se limpia automáticamente al cerrar) */
  allowSleep: () => ipcRenderer.invoke('power:allowSleep')
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
        
        // Aplicar configuración de latencia si existe
        const latencyConfig = window._multichannelLatencyConfig;
        if (latencyConfig) {
          // Recalcular frames con el sampleRate actual
          const prebufferFrames = Math.round((latencyConfig.prebufferMs / 1000) * sampleRate);
          const ringBufferFrames = prebufferFrames * 2;
          nativeStream.setLatency(prebufferFrames, ringBufferFrames);
          console.log(`[Preload] Latency applied: ${prebufferFrames} frames (${latencyConfig.prebufferMs}ms)`);
        }
        
        const started = nativeStream.start();
        
        if (!started) {
          nativeStream = null;
          return Promise.resolve({ success: false, error: 'Failed to start stream' });
        }
        
        const actualPrebuffer = nativeStream.prebufferFrames || 2048;
        const actualLatencyMs = (actualPrebuffer / sampleRate * 1000).toFixed(1);
        console.log(`[Preload] Native stream started (latency: ${actualLatencyMs}ms)`);
        
        return Promise.resolve({ 
          success: true, 
          info: { 
            sampleRate, 
            channels, 
            direct: true,
            latencyMs: parseFloat(actualLatencyMs),
            prebufferFrames: actualPrebuffer
          }
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
  
  /**
   * Configura la latencia del stream (debe llamarse ANTES de open())
   * @param {number} prebufferMs - Latencia en milisegundos (5-200)
   * @param {number} sampleRate - Sample rate para calcular frames
   * @returns {boolean} true si se configuró correctamente
   */
  setLatency: (prebufferMs, sampleRate = 48000) => {
    if (!nativeAudio) {
      console.warn('[Preload] setLatency: no native audio');
      return false;
    }
    // Guardar para aplicar al crear el stream
    window._multichannelLatencyConfig = {
      prebufferMs,
      sampleRate,
      prebufferFrames: Math.round((prebufferMs / 1000) * sampleRate),
      ringBufferFrames: Math.round((prebufferMs / 1000) * sampleRate * 2)
    };
    console.log('[Preload] Latency configured:', window._multichannelLatencyConfig);
    return true;
  },
  
  getInfo: () => {
    if (nativeStream) {
      const sampleRate = nativeStream.sampleRate || 48000;
      const prebufferFrames = nativeStream.prebufferFrames || 2048;
      const prebufferMs = (prebufferFrames / sampleRate * 1000).toFixed(1);
      
      return Promise.resolve({
        underflows: nativeStream.underflows,
        overflows: nativeStream.overflows,
        silentUnderflows: nativeStream.silentUnderflows,
        bufferedFrames: nativeStream.bufferedFrames,
        hasSharedBuffer: nativeStream.hasSharedBuffer,
        prebufferFrames: prebufferFrames,
        prebufferMs: parseFloat(prebufferMs),
        sampleRate: sampleRate,
        direct: true
      });
    }
    return ipcRenderer.invoke('multichannel:info');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// API de Audio Multicanal INPUT (8 canales via PipeWire)
// Captura audio desde PipeWire y lo expone via SharedArrayBuffer
// Flujo: PipeWire capture → C++ → SAB → AudioWorklet → Web Audio graph
// ─────────────────────────────────────────────────────────────────────────────

let nativeInputStream = null;

window.multichannelInputAPI = {
  checkAvailability: () => {
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    if (nativeAudio) {
      return Promise.resolve({ 
        available: true, 
        native: true,
        sharedArrayBuffer: hasSharedArrayBuffer
      });
    }
    return Promise.resolve({ available: false, native: false, sharedArrayBuffer: hasSharedArrayBuffer });
  },
  
  /**
   * Abre un stream de captura PipeWire con 8 canales (input_amp_1..8)
   * @param {Object} config - { sampleRate, channels }
   */
  open: (config) => {
    if (nativeAudio && !nativeInputStream) {
      try {
        const sampleRate = config?.sampleRate || 48000;
        const channels = config?.channels || 8;
        const bufferSize = 256;
        const direction = 'input';
        const channelNames = '';  // Usa los nombres por defecto del addon (input_amp_1..8)
        const description = 'SynthiGME Multichannel Input';
        
        nativeInputStream = new nativeAudio.PipeWireAudio(
          'SynthiGME-Input', channels, sampleRate, bufferSize,
          direction, channelNames, description
        );
        
        const started = nativeInputStream.start();
        
        if (!started) {
          nativeInputStream = null;
          return Promise.resolve({ success: false, error: 'Failed to start input stream' });
        }
        
        console.log(`[Preload] Native input stream started (${channels}ch, ${sampleRate}Hz)`);
        
        return Promise.resolve({ 
          success: true, 
          info: { 
            sampleRate, 
            channels, 
            direct: true,
            direction: 'input'
          }
        });
      } catch (e) {
        nativeInputStream = null;
        return Promise.resolve({ success: false, error: e.message });
      }
    }
    if (nativeInputStream) {
      return Promise.resolve({ success: false, error: 'Input stream already open' });
    }
    return Promise.resolve({ success: false, error: 'Native audio not available' });
  },
  
  /**
   * Adjunta un SharedArrayBuffer para recibir audio capturado.
   * El C++ escribe en el SAB (writeIndex), el AudioWorklet lee (readIndex).
   * Flujo inverso al output: C++ produce → JS consume.
   * @param {SharedArrayBuffer} sharedBuffer - Buffer compartido
   * @param {number} bufferFrames - Frames del buffer circular
   */
  attachSharedBuffer: (sharedBuffer, bufferFrames) => {
    console.log('[Preload] Input attachSharedBuffer called, type:', sharedBuffer?.constructor?.name, 'frames:', bufferFrames);
    if (nativeInputStream && sharedBuffer instanceof SharedArrayBuffer) {
      try {
        const wrapper = new Int32Array(sharedBuffer);
        console.log('[Preload] Input: Passing Int32Array wrapper, length:', wrapper.length);
        const success = nativeInputStream.attachSharedBuffer(wrapper, bufferFrames);
        console.log('[Preload] Input attachSharedBuffer:', success ? 'OK - LOCK-FREE MODE!' : 'FAILED');
        return success;
      } catch (e) {
        console.error('[Preload] Input attachSharedBuffer error:', e);
        return false;
      }
    }
    console.warn('[Preload] Input attachSharedBuffer: no stream or invalid buffer type');
    return false;
  },
  
  close: () => {
    if (nativeInputStream) {
      if (nativeInputStream.hasSharedBuffer) {
        nativeInputStream.detachSharedBuffer();
      }
      nativeInputStream.stop();
      nativeInputStream = null;
      console.log('[Preload] Native input stream stopped');
      return Promise.resolve();
    }
    return Promise.resolve();
  },
  
  getInfo: () => {
    if (nativeInputStream) {
      const sampleRate = nativeInputStream.sampleRate || 48000;
      
      return Promise.resolve({
        underflows: nativeInputStream.underflows,
        overflows: nativeInputStream.overflows,
        silentUnderflows: nativeInputStream.silentUnderflows,
        bufferedFrames: nativeInputStream.bufferedFrames,
        hasSharedBuffer: nativeInputStream.hasSharedBuffer,
        sampleRate: sampleRate,
        direct: true,
        direction: 'input'
      });
    }
    return Promise.resolve(null);
  }
};
