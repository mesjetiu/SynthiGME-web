/**
 * Mock de AudioContext para tests en Node.js
 * 
 * Proporciona factories para crear mocks de:
 * - AudioParam (con tracking de llamadas)
 * - GainNode
 * - BiquadFilterNode
 * - ChannelMergerNode
 * - OscillatorNode
 * - AnalyserNode
 * - AudioWorkletNode
 * - AudioContext completo
 * 
 * Los mocks incluyen contadores de llamadas para verificar interacciones.
 */

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO PARAM MOCK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea un mock de AudioParam con tracking de llamadas.
 * @param {number} initialValue - Valor inicial del parámetro
 * @returns {Object} Mock de AudioParam
 */
export function createMockAudioParam(initialValue = 0) {
  const param = {
    value: initialValue,
    _calls: {
      cancelScheduledValues: 0,
      setTargetAtTime: 0,
      setValueAtTime: 0,
      linearRampToValueAtTime: 0
    },
    cancelScheduledValues(startTime) {
      this._calls.cancelScheduledValues++;
      return this;
    },
    setTargetAtTime(value, startTime, timeConstant) {
      this._calls.setTargetAtTime++;
      this.value = value; // Simula el cambio inmediato para tests
      return this;
    },
    setValueAtTime(value, startTime) {
      this._calls.setValueAtTime++;
      this.value = value;
      return this;
    },
    linearRampToValueAtTime(value, endTime) {
      this._calls.linearRampToValueAtTime++;
      this.value = value;
      return this;
    }
  };
  return param;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAIN NODE MOCK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea un mock de GainNode.
 * @returns {Object} Mock de GainNode
 */
export function createMockGainNode() {
  return {
    gain: createMockAudioParam(1),
    _calls: {
      connect: 0,
      disconnect: 0
    },
    connect(destination, outputIndex, inputIndex) {
      this._calls.connect++;
      return destination;
    },
    disconnect(destination) {
      this._calls.disconnect++;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BIQUAD FILTER NODE MOCK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea un mock de BiquadFilterNode.
 * @returns {Object} Mock de BiquadFilterNode
 */
export function createMockBiquadFilter() {
  return {
    type: 'lowpass',
    frequency: createMockAudioParam(20000),
    Q: createMockAudioParam(1),
    gain: createMockAudioParam(0),
    detune: createMockAudioParam(0),
    _calls: {
      connect: 0,
      disconnect: 0
    },
    connect(destination, outputIndex, inputIndex) {
      this._calls.connect++;
      return destination;
    },
    disconnect(destination) {
      this._calls.disconnect++;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANNEL MERGER NODE MOCK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea un mock de ChannelMergerNode.
 * @param {number} numberOfInputs - Número de entradas
 * @returns {Object} Mock de ChannelMergerNode
 */
export function createMockChannelMerger(numberOfInputs = 6) {
  return {
    numberOfInputs,
    _calls: {
      connect: 0,
      disconnect: 0
    },
    connect(destination, outputIndex, inputIndex) {
      this._calls.connect++;
      return destination;
    },
    disconnect(destination) {
      this._calls.disconnect++;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OSCILLATOR NODE MOCK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea un mock de OscillatorNode.
 * @returns {Object} Mock de OscillatorNode
 */
export function createMockOscillatorNode() {
  return {
    type: 'sine',
    frequency: createMockAudioParam(440),
    detune: createMockAudioParam(0),
    _calls: {
      connect: 0,
      disconnect: 0,
      start: 0,
      stop: 0
    },
    connect(destination, outputIndex, inputIndex) {
      this._calls.connect++;
      return destination;
    },
    disconnect(destination) {
      this._calls.disconnect++;
    },
    start(when = 0) {
      this._calls.start++;
    },
    stop(when = 0) {
      this._calls.stop++;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYSER NODE MOCK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea un mock de AnalyserNode.
 * @returns {Object} Mock de AnalyserNode
 */
export function createMockAnalyserNode() {
  return {
    fftSize: 2048,
    frequencyBinCount: 1024,
    minDecibels: -100,
    maxDecibels: -30,
    smoothingTimeConstant: 0.8,
    _calls: {
      connect: 0,
      disconnect: 0,
      getFloatTimeDomainData: 0,
      getByteTimeDomainData: 0,
      getFloatFrequencyData: 0,
      getByteFrequencyData: 0
    },
    connect(destination, outputIndex, inputIndex) {
      this._calls.connect++;
      return destination;
    },
    disconnect(destination) {
      this._calls.disconnect++;
    },
    getFloatTimeDomainData(array) {
      this._calls.getFloatTimeDomainData++;
      if (array) array.fill(0);
    },
    getByteTimeDomainData(array) {
      this._calls.getByteTimeDomainData++;
      if (array) array.fill(128);
    },
    getFloatFrequencyData(array) {
      this._calls.getFloatFrequencyData++;
      if (array) array.fill(-100);
    },
    getByteFrequencyData(array) {
      this._calls.getByteFrequencyData++;
      if (array) array.fill(0);
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO WORKLET NODE MOCK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea un mock de AudioWorkletNode.
 * @param {string} name - Nombre del worklet
 * @param {Object} options - Opciones del worklet
 * @returns {Object} Mock de AudioWorkletNode
 */
export function createMockAudioWorkletNode(name, options = {}) {
  const parameterDescriptors = options.parameterDescriptors || [];
  const parameters = new Map();
  
  // Crear AudioParams según los descriptores
  parameterDescriptors.forEach(desc => {
    parameters.set(desc.name, createMockAudioParam(desc.defaultValue ?? 0));
  });
  
  return {
    _name: name,
    _options: options,
    parameters,
    port: {
      _messages: [],
      onmessage: null,
      postMessage(msg) {
        this._messages.push(msg);
        // Simular respuesta si hay handler
        if (this.onmessage && msg.type === 'init') {
          setTimeout(() => {
            this.onmessage({ data: { type: 'ready' } });
          }, 0);
        }
      }
    },
    _calls: {
      connect: 0,
      disconnect: 0
    },
    connect(destination, outputIndex, inputIndex) {
      this._calls.connect++;
      return destination;
    },
    disconnect(destination) {
      this._calls.disconnect++;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO CONTEXT MOCK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea un mock completo de AudioContext.
 * @param {Object} options - Opciones de configuración
 * @param {number} options.maxChannelCount - Máximo de canales del destino
 * @returns {Object} Mock de AudioContext
 */
export function createMockAudioContext(options = {}) {
  const { maxChannelCount = 2 } = options;
  
  const ctx = {
    currentTime: 0,
    state: 'running',
    sampleRate: 44100,
    destination: {
      maxChannelCount,
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: maxChannelCount
    },
    _createdNodes: {
      gain: [],
      biquadFilter: [],
      channelMerger: [],
      oscillator: [],
      analyser: [],
      audioWorklet: []
    },
    createGain() {
      const node = createMockGainNode();
      this._createdNodes.gain.push(node);
      return node;
    },
    createBiquadFilter() {
      const node = createMockBiquadFilter();
      this._createdNodes.biquadFilter.push(node);
      return node;
    },
    createChannelMerger(numberOfInputs = 6) {
      const node = createMockChannelMerger(numberOfInputs);
      this._createdNodes.channelMerger.push(node);
      return node;
    },
    createOscillator() {
      const node = createMockOscillatorNode();
      this._createdNodes.oscillator.push(node);
      return node;
    },
    createAnalyser() {
      const node = createMockAnalyserNode();
      this._createdNodes.analyser.push(node);
      return node;
    },
    resume() {
      this.state = 'running';
      return Promise.resolve();
    },
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    },
    close() {
      this.state = 'closed';
      return Promise.resolve();
    },
    // AudioWorklet mock (retorna Promise.resolve para evitar errores)
    audioWorklet: {
      addModule(moduleURL) {
        return Promise.resolve();
      }
    }
  };
  
  return ctx;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS PARA TESTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resetea los contadores de llamadas de un nodo.
 * @param {Object} node - Nodo con _calls
 */
export function resetNodeCalls(node) {
  if (node._calls) {
    Object.keys(node._calls).forEach(key => {
      node._calls[key] = 0;
    });
  }
  // Resetear también AudioParams anidados
  if (node.gain?._calls) resetNodeCalls(node.gain);
  if (node.frequency?._calls) resetNodeCalls(node.frequency);
  if (node.Q?._calls) resetNodeCalls(node.Q);
}

/**
 * Crea un mock de window con AudioContext para inyectar en globalThis.
 * @param {Object} ctxOptions - Opciones para el AudioContext
 * @returns {Object} Mock de window
 */
export function createMockWindow(ctxOptions = {}) {
  return {
    AudioContext: function() {
      return createMockAudioContext(ctxOptions);
    },
    webkitAudioContext: function() {
      return createMockAudioContext(ctxOptions);
    }
  };
}
