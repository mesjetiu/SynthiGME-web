import { createLogger } from '../utils/logger.js';

const log = createLogger('RecordingEngine');

/**
 * RecordingEngine - Audio recording system with multi-track WAV export.
 * 
 * Uses an AudioWorklet to capture samples from configurable output buses
 * and exports to 16-bit PCM WAV format.
 */

const STORAGE_KEY_TRACK_COUNT = 'synthigme-recording-tracks';
const STORAGE_KEY_ROUTING = 'synthigme-recording-routing';

export class RecordingEngine {
  /**
   * @param {import('./engine.js').AudioEngine} audioEngine - The main audio engine
   */
  constructor(audioEngine) {
    this.engine = audioEngine;
    this.isRecording = false;
    this.workletNode = null;
    this.workletReady = false;
    this._workletLoadPromise = null;
    
    // Recording buffers per track (arrays of Float32Arrays)
    this._trackBuffers = [];
    this._sampleRate = 44100;
    
    // Recording configuration
    this._trackCount = this._loadTrackCount();
    // Routing matrix: [outputBusIndex][trackIndex] = gain (0 or 1)
    this._routingMatrix = this._loadRoutingMatrix();
    
    // Mixer nodes for routing outputs to tracks
    this._trackMixers = [];
    this._outputGains = []; // [busIndex][trackIndex]
    
    // Callbacks
    this.onRecordingStart = null;
    this.onRecordingStop = null;
  }

  /**
   * Load track count from storage or return default
   */
  _loadTrackCount() {
    const stored = localStorage.getItem(STORAGE_KEY_TRACK_COUNT);
    if (stored) {
      const count = parseInt(stored, 10);
      if (count >= 1 && count <= 8) return count;
    }
    return 2; // Default: stereo
  }

  /**
   * Save track count to storage
   */
  _saveTrackCount(count) {
    localStorage.setItem(STORAGE_KEY_TRACK_COUNT, String(count));
  }

  /**
   * Load routing matrix from storage or create default
   * Default: out1 → track1, out2 → track2, etc.
   */
  _loadRoutingMatrix() {
    const stored = localStorage.getItem(STORAGE_KEY_ROUTING);
    if (stored) {
      try {
        const matrix = JSON.parse(stored);
        if (Array.isArray(matrix)) return matrix;
      } catch (e) {
        log.warn(' Invalid routing matrix in storage');
      }
    }
    return this._createDefaultRoutingMatrix();
  }

  /**
   * Create default routing matrix: out[n] → track[n]
   */
  _createDefaultRoutingMatrix() {
    const outputCount = this.engine?.outputChannels || 8;
    const matrix = [];
    for (let bus = 0; bus < outputCount; bus++) {
      const trackGains = Array(this._trackCount).fill(0);
      // Default: bus 0 → track 0, bus 1 → track 1, etc.
      if (bus < this._trackCount) {
        trackGains[bus] = 1;
      }
      matrix.push(trackGains);
    }
    return matrix;
  }

  /**
   * Save routing matrix to storage
   */
  _saveRoutingMatrix() {
    localStorage.setItem(STORAGE_KEY_ROUTING, JSON.stringify(this._routingMatrix));
  }

  /**
   * Get current track count
   */
  get trackCount() {
    return this._trackCount;
  }

  /**
   * Set track count and update routing matrix
   */
  set trackCount(count) {
    const newCount = Math.max(1, Math.min(8, count));
    if (newCount === this._trackCount) return;
    
    this._trackCount = newCount;
    this._saveTrackCount(newCount);
    
    // Adjust routing matrix columns
    const outputCount = this.engine?.outputChannels || 8;
    for (let bus = 0; bus < outputCount; bus++) {
      if (!this._routingMatrix[bus]) {
        this._routingMatrix[bus] = Array(newCount).fill(0);
        if (bus < newCount) this._routingMatrix[bus][bus] = 1;
      } else {
        // Expand or shrink
        while (this._routingMatrix[bus].length < newCount) {
          this._routingMatrix[bus].push(0);
        }
        this._routingMatrix[bus] = this._routingMatrix[bus].slice(0, newCount);
      }
    }
    this._saveRoutingMatrix();
    
    // Rebuild audio graph if already initialized
    if (this.workletReady) {
      this._rebuildRoutingGraph();
    }
  }

  /**
   * Get routing matrix
   */
  get routingMatrix() {
    return this._routingMatrix;
  }

  /**
   * Set routing value for a specific output → track connection
   */
  setRouting(busIndex, trackIndex, value) {
    if (!this._routingMatrix[busIndex]) return;
    if (trackIndex < 0 || trackIndex >= this._trackCount) return;
    
    const gain = value ? 1 : 0;
    this._routingMatrix[busIndex][trackIndex] = gain;
    this._saveRoutingMatrix();
    
    // Update live gain if graph exists
    if (this._outputGains[busIndex]?.[trackIndex]) {
      const ctx = this.engine.audioCtx;
      if (ctx) {
        this._outputGains[busIndex][trackIndex].gain.setTargetAtTime(
          gain, ctx.currentTime, 0.01
        );
      }
    }
  }

  /**
   * Get routing value for a specific connection
   */
  getRouting(busIndex, trackIndex) {
    return this._routingMatrix[busIndex]?.[trackIndex] ?? 0;
  }

  /**
   * Load the recording AudioWorklet
   */
  async ensureWorkletReady() {
    if (this.workletReady) return;
    if (this._workletLoadPromise) return this._workletLoadPromise;
    
    const ctx = this.engine.audioCtx;
    if (!ctx) throw new Error('AudioContext not available');
    
    this._workletLoadPromise = (async () => {
      try {
        await ctx.audioWorklet.addModule('./assets/js/worklets/recordingCapture.worklet.js');
        this.workletReady = true;
        log.info(' Worklet loaded');
      } catch (e) {
        log.error(' Failed to load worklet:', e);
        throw e;
      }
    })();
    
    return this._workletLoadPromise;
  }

  /**
   * Build the routing graph: outputs → gains → merger → worklet
   */
  async _buildRoutingGraph() {
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    
    await this.ensureWorkletReady();
    
    this._sampleRate = ctx.sampleRate;
    
    // Clean up existing nodes
    this._cleanupRoutingGraph();
    
    // Create merger for all tracks
    const merger = ctx.createChannelMerger(this._trackCount);
    
    // Create track mixers (one per track, sums all routed outputs)
    this._trackMixers = [];
    for (let track = 0; track < this._trackCount; track++) {
      const mixer = ctx.createGain();
      mixer.gain.value = 1.0;
      mixer.connect(merger, 0, track);
      this._trackMixers.push(mixer);
    }
    
    // Create gain nodes for each output → track connection
    this._outputGains = [];
    const outputCount = this.engine.outputChannels;
    
    for (let bus = 0; bus < outputCount; bus++) {
      this._outputGains[bus] = [];
      const busNode = this.engine.outputBuses[bus]?.levelNode;
      if (!busNode) continue;
      
      for (let track = 0; track < this._trackCount; track++) {
        const gain = ctx.createGain();
        const routingValue = this._routingMatrix[bus]?.[track] ?? 0;
        gain.gain.value = routingValue;
        busNode.connect(gain);
        gain.connect(this._trackMixers[track]);
        this._outputGains[bus][track] = gain;
      }
    }
    
    // Create worklet node
    this.workletNode = new AudioWorkletNode(ctx, 'recording-capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: this._trackCount,
      processorOptions: {
        channelCount: this._trackCount
      }
    });
    
    merger.connect(this.workletNode);
    
    // Handle messages from worklet
    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'samples' && this.isRecording) {
        this._handleSamples(event.data.channels);
      } else if (event.data.type === 'stopped') {
        this._finalizeRecording();
      }
    };
  }

  /**
   * Rebuild routing graph (when track count changes)
   */
  async _rebuildRoutingGraph() {
    if (this.isRecording) {
      log.warn(' Cannot rebuild while recording');
      return;
    }
    await this._buildRoutingGraph();
  }

  /**
   * Clean up existing routing nodes
   */
  _cleanupRoutingGraph() {
    // Disconnect output gains
    for (const busGains of this._outputGains) {
      if (busGains) {
        for (const gain of busGains) {
          if (gain) gain.disconnect();
        }
      }
    }
    this._outputGains = [];
    
    // Disconnect track mixers
    for (const mixer of this._trackMixers) {
      if (mixer) mixer.disconnect();
    }
    this._trackMixers = [];
    
    // Disconnect worklet
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
  }

  /**
   * Handle incoming samples from worklet
   */
  _handleSamples(channels) {
    for (let track = 0; track < channels.length; track++) {
      if (!this._trackBuffers[track]) {
        this._trackBuffers[track] = [];
      }
      this._trackBuffers[track].push(channels[track]);
    }
  }

  /**
   * Start recording
   */
  async startRecording() {
    if (this.isRecording) return;
    
    const ctx = this.engine.audioCtx;
    if (!ctx || ctx.state !== 'running') {
      log.warn(' AudioContext not running');
      return;
    }
    
    // Build/rebuild routing graph
    await this._buildRoutingGraph();
    
    // Clear buffers
    this._trackBuffers = [];
    for (let i = 0; i < this._trackCount; i++) {
      this._trackBuffers[i] = [];
    }
    
    // Start recording
    this.isRecording = true;
    this.workletNode.port.postMessage({ command: 'start' });
    
    if (this.onRecordingStart) this.onRecordingStart();
    log.info(' Recording started');
  }

  /**
   * Stop recording and export WAV
   */
  stopRecording() {
    if (!this.isRecording) return;
    
    this.isRecording = false;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ command: 'stop' });
    }
    // _finalizeRecording will be called when worklet confirms stop
  }

  /**
   * Finalize recording and trigger WAV download
   */
  _finalizeRecording() {
    log.info(' Finalizing recording...');
    
    // Concatenate buffers for each track
    const trackData = [];
    let totalSamples = 0;
    
    for (let track = 0; track < this._trackCount; track++) {
      const chunks = this._trackBuffers[track] || [];
      if (chunks.length === 0) {
        trackData.push(new Float32Array(0));
        continue;
      }
      
      // Calculate total length
      const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      if (track === 0) totalSamples = length;
      
      // Concatenate
      const buffer = new Float32Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }
      trackData.push(buffer);
    }
    
    // Clear buffers
    this._trackBuffers = [];
    
    if (totalSamples === 0) {
      log.warn(' No audio recorded');
      if (this.onRecordingStop) this.onRecordingStop(null);
      return;
    }
    
    // Encode to WAV
    const wavBlob = this._encodeWAV(trackData, this._sampleRate);
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `synthigme-${timestamp}.wav`;
    
    // Notificar ANTES de descargar (en móviles el download puede interferir)
    if (this.onRecordingStop) this.onRecordingStop(filename);
    log.info(` Recording saved: ${filename}`);
    
    // Trigger download (con pequeño delay para permitir que el toast se muestre)
    setTimeout(() => this._downloadBlob(wavBlob, filename), 100);
  }

  /**
   * Encode multi-track audio to 16-bit PCM WAV
   */
  _encodeWAV(trackData, sampleRate) {
    const numChannels = trackData.length;
    const numSamples = trackData[0]?.length || 0;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;
    
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    
    // RIFF header
    this._writeString(view, 0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    this._writeString(view, 8, 'WAVE');
    
    // fmt chunk
    this._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // data chunk
    this._writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Interleaved sample data
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = trackData[ch]?.[i] || 0;
        // Clamp and convert to 16-bit
        const clamped = Math.max(-1, Math.min(1, sample));
        const int16 = clamped < 0 
          ? Math.floor(clamped * 32768)
          : Math.floor(clamped * 32767);
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Write string to DataView
   */
  _writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Trigger file download
   */
  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Toggle recording state
   */
  async toggle() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }
}
