/**
 * Mock de AudioContext para tests en Node.js
 * 
 * Proporciona factories para crear mocks de:
 * - AudioParam (con tracking de llamadas)
 * - GainNode
 * - BiquadFilterNode
 * - ChannelMergerNode
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
      channelMerger: []
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
