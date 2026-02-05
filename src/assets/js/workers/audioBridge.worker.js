/**
 * Worker para puente SharedArrayBuffer → C++ native addon
 * 
 * Este worker corre en su propio thread, completamente independiente
 * del main thread del renderer. Lee del SharedArrayBuffer escrito
 * por el AudioWorklet y escribe a C++.
 * 
 * Flujo lock-free:
 * AudioWorklet (audio thread) → SharedArrayBuffer → Worker → C++ (PipeWire)
 */

let sharedBuffer = null;
let controlBuffer = null;  // Int32Array [writeIndex, readIndex]
let audioBuffer = null;    // Float32Array (interleaved samples)
let bufferFrames = 0;
let channels = 12;
let running = false;
let nativeWrite = null;
let pollInterval = null;

// Estadísticas
let framesProcessed = 0;
let pollCount = 0;

self.onmessage = (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'init':
      initBuffer(data);
      break;
    case 'start':
      startPolling();
      break;
    case 'stop':
      stopPolling();
      break;
  }
};

function initBuffer(data) {
  sharedBuffer = data.sharedBuffer;
  bufferFrames = data.bufferFrames;
  channels = data.channels || 12;
  
  // Layout:
  // [0-3]: writeIndex (Int32)
  // [4-7]: readIndex (Int32)  
  // [8+]: audio (Float32 interleaved)
  controlBuffer = new Int32Array(sharedBuffer, 0, 2);
  audioBuffer = new Float32Array(sharedBuffer, 8, bufferFrames * channels);
  
  // Inicializar readIndex a 0
  Atomics.store(controlBuffer, 1, 0);
  
  console.log(`[AudioBridge Worker] Initialized: ${bufferFrames} frames, ${channels} channels`);
  self.postMessage({ type: 'initialized' });
}

function startPolling() {
  if (running) return;
  running = true;
  
  console.log('[AudioBridge Worker] Starting poll loop');
  
  // Poll cada 5ms para leer del SharedArrayBuffer
  pollInterval = setInterval(pollAndWrite, 5);
}

function stopPolling() {
  running = false;
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  console.log(`[AudioBridge Worker] Stopped. Processed ${framesProcessed} frames in ${pollCount} polls`);
}

function pollAndWrite() {
  if (!controlBuffer || !audioBuffer) return;
  
  pollCount++;
  
  const writeIndex = Atomics.load(controlBuffer, 0);
  const readIndex = Atomics.load(controlBuffer, 1);
  
  // Calcular frames disponibles para leer
  let available;
  if (writeIndex >= readIndex) {
    available = writeIndex - readIndex;
  } else {
    available = bufferFrames - readIndex + writeIndex;
  }
  
  if (available === 0) return;
  
  // Leer en chunks de hasta 512 frames para evitar copiar demasiado
  const chunkFrames = Math.min(available, 512);
  const chunkSamples = chunkFrames * channels;
  
  // Crear buffer para enviar al main thread
  const chunk = new Float32Array(chunkSamples);
  
  let readPos = readIndex;
  for (let frame = 0; frame < chunkFrames; frame++) {
    const baseIndex = readPos * channels;
    for (let ch = 0; ch < channels; ch++) {
      chunk[frame * channels + ch] = audioBuffer[baseIndex + ch];
    }
    readPos = (readPos + 1) % bufferFrames;
  }
  
  // Actualizar readIndex atómicamente
  Atomics.store(controlBuffer, 1, readPos);
  
  // Enviar al main thread para escribir a C++
  self.postMessage({
    type: 'audioChunk',
    buffer: chunk.buffer,
    frames: chunkFrames
  }, [chunk.buffer]);
  
  framesProcessed += chunkFrames;
  
  // Log ocasional
  if (pollCount % 500 === 0) {
    console.log(`[AudioBridge Worker] Poll #${pollCount}, frames: ${framesProcessed}, available: ${available}`);
  }
}
