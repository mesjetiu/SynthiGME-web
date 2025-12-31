// Núcleo de audio: contexto WebAudio y clase base Module para el resto del sistema

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE AUDIO
// ─────────────────────────────────────────────────────────────────────────────
// Valores centralizados para evitar "magic numbers" dispersos en el código.
// ─────────────────────────────────────────────────────────────────────────────
export const AUDIO_CONSTANTS = {
  /** Tiempo de rampa por defecto para cambios de parámetros (30ms, evita clicks) */
  DEFAULT_RAMP_TIME: 0.03,
  /** Tiempo de rampa lento para faders y controles de volumen (60ms) */
  SLOW_RAMP_TIME: 0.06,
  /** Tiempo de rampa rápido para modulaciones (10ms) */
  FAST_RAMP_TIME: 0.01
};

/**
 * Helper para actualizar un AudioParam con rampa suave.
 * Evita clicks cancelando valores programados y usando setTargetAtTime.
 * 
 * @param {AudioParam} param - El parámetro a actualizar
 * @param {number} value - El nuevo valor objetivo
 * @param {AudioContext} ctx - El contexto de audio (para obtener currentTime)
 * @param {Object} [options] - Opciones de rampa
 * @param {number} [options.ramp=0.03] - Tiempo de rampa en segundos
 */
export function setParamSmooth(param, value, ctx, { ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME } = {}) {
  if (!param || !ctx) return;
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, ramp);
}

export class AudioEngine {
  constructor(options = {}) {
    const { outputChannels = 8 } = options;
    this.audioCtx = null;
    this.modules = [];
    this.isRunning = false;
    this.muted = false;
    this.masterBaseGain = 1.0;
    this.workletReady = false;
    this._workletLoadPromise = null;

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIGURACIÓN DE CANALES
    // ─────────────────────────────────────────────────────────────────────────
    // outputChannels: número de salidas lógicas del sintetizador (buses)
    // physicalChannels: número de canales físicos del dispositivo (detectado)
    // outputRouting: matriz de ruteo [busIndex][channelIndex] = gain (0.0-1.0)
    // ─────────────────────────────────────────────────────────────────────────
    this.outputChannels = outputChannels;
    this.physicalChannels = 2; // Por defecto estéreo, se actualiza al detectar dispositivo
    this.physicalChannelLabels = ['L', 'R']; // Etiquetas de canales físicos
    this.outputLevels = Array.from({ length: this.outputChannels }, () => 0.0);
    this.outputPans = Array.from({ length: this.outputChannels }, () => 0.0);
    this.outputBuses = [];
    
    // Matriz de ruteo multicanal: [busIndex] = array de ganancias por canal físico
    // Se inicializa en _initOutputRouting() con el número real de canales
    this._outputRoutingMatrix = null;
    
    // Callbacks para notificar cambios de configuración de canales
    this._onPhysicalChannelsChange = null;

    this.bus1 = null;
    this.bus2 = null;
    this.bus1Mod = null;
    this.bus2Mod = null;
    this.bus1L = null;
    this.bus1R = null;
    this.bus2L = null;
    this.bus2R = null;
    this.masterL = null;
    this.masterR = null;
    this.merger = null;

    this.bus1Level = this.outputLevels[0] ?? 0.0;
    this.bus1Pan = this.outputPans[0] ?? 0.0;
    this.bus2Level = this.outputLevels[1] ?? 0.0;
    this.bus2Pan = this.outputPans[1] ?? 0.0;
  }

  start() {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.audioCtx = ctx;

    // Cargar AudioWorklet para osciladores con fase coherente
    this._loadWorklet();

    // ─────────────────────────────────────────────────────────────────────────
    // INICIALIZACIÓN MULTICANAL
    // ─────────────────────────────────────────────────────────────────────────
    // Detectar canales físicos disponibles en el dispositivo por defecto.
    // Por defecto asumimos estéreo (2 canales) hasta que se detecte el hardware.
    // ─────────────────────────────────────────────────────────────────────────
    const initialChannels = ctx.destination.maxChannelCount || 2;
    this.physicalChannels = initialChannels;
    this.physicalChannelLabels = this._generateChannelLabels(initialChannels);
    console.log(`[AudioEngine] Initial physical channels: ${initialChannels}`);

    // Crear nodos master para cada canal físico
    this.masterGains = [];
    for (let ch = 0; ch < initialChannels; ch++) {
      const gain = ctx.createGain();
      gain.gain.value = this.muted ? 0 : this.masterBaseGain;
      this.masterGains.push(gain);
    }
    
    // Referencias legacy para compatibilidad con código existente
    this.masterL = this.masterGains[0] || null;
    this.masterR = this.masterGains[1] || null;

    // Inicializar matriz de ruteo si no existe
    this._initOutputRoutingMatrix(initialChannels);

    // Crear buses de salida lógicos
    this.outputBuses = [];
    for (let i = 0; i < this.outputChannels; i += 1) {
      const busInput = ctx.createGain();
      busInput.gain.value = 1.0;
      const levelNode = ctx.createGain();
      levelNode.gain.value = this.outputLevels[i];
      busInput.connect(levelNode);

      // Crear nodos de ganancia para cada canal físico (ruteo multicanal)
      const channelGains = [];
      for (let ch = 0; ch < initialChannels; ch++) {
        const gainNode = ctx.createGain();
        // Usar valor de la matriz de ruteo
        const routingValue = this._outputRoutingMatrix[i]?.[ch] ?? 0;
        gainNode.gain.value = routingValue;
        levelNode.connect(gainNode);
        gainNode.connect(this.masterGains[ch]);
        channelGains.push(gainNode);
      }

      // Mantener panLeft/panRight para compatibilidad legacy (apuntan a canales 0 y 1)
      this.outputBuses.push({
        input: busInput,
        levelNode,
        panLeft: channelGains[0] || null,
        panRight: channelGains[1] || null,
        channelGains // Array completo de ganancias por canal
      });
    }

    // Referencias legacy para compatibilidad
    this.bus1 = this.outputBuses[0]?.input || null;
    this.bus2 = this.outputBuses[1]?.input || null;
    this.bus1Mod = this.outputBuses[0]?.levelNode || null;
    this.bus2Mod = this.outputBuses[1]?.levelNode || null;
    this.bus1L = this.outputBuses[0]?.channelGains?.[0] || null;
    this.bus1R = this.outputBuses[0]?.channelGains?.[1] || null;
    this.bus2L = this.outputBuses[1]?.channelGains?.[0] || null;
    this.bus2R = this.outputBuses[1]?.channelGains?.[1] || null;

    // Crear merger multicanal y conectar masters
    this.merger = ctx.createChannelMerger(initialChannels);
    this.masterGains.forEach((gain, ch) => {
      gain.connect(this.merger, 0, ch);
    });
    this.merger.connect(ctx.destination);

    for (const m of this.modules) {
      if (m.start) m.start();
    }
    // Nota: updateOutputPan está deprecated en modo multicanal, el ruteo se
    // controla directamente con setOutputRouting(). Lo mantenemos para compatibilidad.
    for (let i = 0; i < this.outputChannels; i += 1) {
      this.updateOutputPan(i);
    }
    this.isRunning = true;
  }

  /**
   * Inicializa la matriz de ruteo multicanal con valores por defecto.
   * Por defecto: bus 0 → canal 0 (L), bus 1 → canal 1 (R), resto apagado.
   * 
   * @param {number} channelCount - Número de canales físicos
   */
  _initOutputRoutingMatrix(channelCount) {
    if (this._outputRoutingMatrix) return; // Ya inicializada
    
    this._outputRoutingMatrix = [];
    for (let bus = 0; bus < this.outputChannels; bus++) {
      const channelGains = Array(channelCount).fill(0);
      // Default: bus 0 → L, bus 1 → R
      if (bus === 0 && channelCount > 0) channelGains[0] = 1;
      if (bus === 1 && channelCount > 1) channelGains[1] = 1;
      this._outputRoutingMatrix.push(channelGains);
    }
  }

  updateOutputPan(busIndex) {
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (!ctx || !bus) return;
    const pan = this.outputPans[busIndex] ?? 0;
    const angle = (pan + 1) * 0.25 * Math.PI;
    const left = Math.cos(angle);
    const right = Math.sin(angle);
    setParamSmooth(bus.panLeft.gain, left, ctx);
    setParamSmooth(bus.panRight.gain, right, ctx);
  }

  setOutputLevel(busIndex, value, { ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME } = {}) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return;
    this.outputLevels[busIndex] = value;
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (ctx && bus) {
      setParamSmooth(bus.levelNode.gain, value, ctx, { ramp });
    }
    if (busIndex === 0) this.bus1Level = value;
    if (busIndex === 1) this.bus2Level = value;
  }

  getOutputLevel(busIndex) {
    return this.outputLevels[busIndex] ?? 0.0;
  }

  setOutputPan(busIndex, value) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return;
    this.outputPans[busIndex] = value;
    this.updateOutputPan(busIndex);
    if (busIndex === 0) this.bus1Pan = value;
    if (busIndex === 1) this.bus2Pan = value;
  }

  /**
   * Establece el ruteo de una salida lógica a los canales físicos.
   * 
   * MODO MULTICANAL (recomendado):
   *   setOutputRouting(busIndex, channelGains)
   *   - channelGains: Array de ganancias [ch0, ch1, ch2, ...] donde cada valor es 0.0-1.0
   * 
   * MODO LEGACY (compatibilidad con estéreo):
   *   setOutputRouting(busIndex, leftGain, rightGain)
   *   - leftGain: Ganancia hacia canal 0 (L)
   *   - rightGain: Ganancia hacia canal 1 (R)
   * 
   * Si se especifica un canal que no existe en el dispositivo actual, se ignora
   * silenciosamente (el valor se guarda en la matriz pero no se aplica al audio).
   * 
   * @param {number} busIndex - Índice de la salida lógica (0-based)
   * @param {number|number[]} leftGainOrChannelGains - Ganancia L o array de ganancias
   * @param {number} [rightGain] - Ganancia R (solo en modo legacy)
   * @returns {{ applied: number[], ignored: number[] }} - Canales aplicados e ignorados
   */
  setOutputRouting(busIndex, leftGainOrChannelGains, rightGain) {
    if (busIndex < 0 || busIndex >= this.outputChannels) {
      return { applied: [], ignored: [] };
    }
    
    // Determinar si es modo multicanal o legacy
    let channelGains;
    if (Array.isArray(leftGainOrChannelGains)) {
      // Modo multicanal: array de ganancias
      channelGains = leftGainOrChannelGains;
    } else {
      // Modo legacy: leftGain, rightGain → convertir a array
      channelGains = [leftGainOrChannelGains ?? 0, rightGain ?? 0];
    }
    
    // Inicializar matriz si no existe
    if (!this._outputRoutingMatrix) {
      this._outputRoutingMatrix = Array.from({ length: this.outputChannels }, () => 
        Array(this.physicalChannels).fill(0)
      );
    }
    
    // Guardar en la matriz de ruteo (para persistencia y reconstrucción)
    const applied = [];
    const ignored = [];
    
    channelGains.forEach((gain, ch) => {
      // Guardar siempre en la matriz (para cuando cambie el dispositivo)
      if (!this._outputRoutingMatrix[busIndex]) {
        this._outputRoutingMatrix[busIndex] = [];
      }
      this._outputRoutingMatrix[busIndex][ch] = gain;
      
      // Aplicar al audio solo si el canal existe
      const bus = this.outputBuses[busIndex];
      const gainNode = bus?.channelGains?.[ch];
      
      if (gainNode && this.audioCtx) {
        setParamSmooth(gainNode.gain, gain, this.audioCtx);
        applied.push(ch);
      } else if (ch < channelGains.length) {
        // Canal especificado pero no existe en el hardware actual
        ignored.push(ch);
      }
    });
    
    // Log de advertencia si hay canales ignorados
    if (ignored.length > 0) {
      console.warn(
        `[AudioEngine] setOutputRouting: Bus ${busIndex} → canales ${ignored.join(', ')} ` +
        `ignorados (dispositivo actual tiene ${this.physicalChannels} canales)`
      );
    }
    
    return { applied, ignored };
  }

  /**
   * Obtiene el ruteo actual de una salida lógica.
   * 
   * @param {number} busIndex - Índice del bus
   * @returns {{ channels: number[], legacy: { left: number, right: number } } | null}
   *   - channels: Array de ganancias por canal físico
   *   - legacy: Objeto {left, right} para compatibilidad
   */
  getOutputRouting(busIndex) {
    const bus = this.outputBuses[busIndex];
    if (!bus) return null;
    
    // Obtener ganancias de todos los canales
    const channels = (bus.channelGains || []).map(g => g?.gain?.value ?? 0);
    
    // Asegurar que tenemos al menos 2 valores para legacy
    while (channels.length < 2) channels.push(0);
    
    return {
      channels,
      // Compatibilidad legacy
      legacy: {
        left: channels[0] ?? 0,
        right: channels[1] ?? 0
      },
      // Alias directos para compatibilidad
      left: channels[0] ?? 0,
      right: channels[1] ?? 0
    };
  }

  /**
   * Obtiene la matriz completa de ruteo.
   * @returns {number[][]} - Matriz [busIndex][channelIndex] = gain
   */
  getFullRoutingMatrix() {
    return this._outputRoutingMatrix ? 
      this._outputRoutingMatrix.map(row => [...row]) : 
      [];
  }

  /**
   * Establece la matriz completa de ruteo.
   * Útil para restaurar desde localStorage.
   * 
   * @param {number[][]} matrix - Matriz de ruteo
   * @returns {{ warnings: string[] }} - Advertencias sobre canales ignorados
   */
  setFullRoutingMatrix(matrix) {
    const warnings = [];
    
    if (!Array.isArray(matrix)) {
      return { warnings: ['Invalid matrix format'] };
    }
    
    matrix.forEach((channelGains, busIndex) => {
      if (busIndex >= this.outputChannels) return;
      
      const result = this.setOutputRouting(busIndex, channelGains);
      if (result.ignored.length > 0) {
        warnings.push(
          `Bus ${busIndex + 1}: canales ${result.ignored.map(c => c + 1).join(', ')} ignorados`
        );
      }
    });
    
    return { warnings };
  }

  /**
   * Cambia el dispositivo de salida de audio.
   * Requiere que el navegador soporte setSinkId (Chrome/Edge).
   * Tras el cambio, detecta el número de canales disponibles y reconfigura
   * la arquitectura de salida si es necesario.
   * 
   * @param {string} deviceId - ID del dispositivo de salida
   * @returns {Promise<{success: boolean, channels: number}>} - Resultado del cambio
   */
  async setOutputDevice(deviceId) {
    if (!this.audioCtx) return { success: false, channels: 2 };
    
    // setSinkId está en el AudioContext en algunos navegadores
    if (typeof this.audioCtx.setSinkId === 'function') {
      try {
        await this.audioCtx.setSinkId(deviceId === 'default' ? '' : deviceId);
        console.log('[AudioEngine] Output device changed to:', deviceId);
        
        // Detectar canales disponibles en el nuevo dispositivo
        const detectedChannels = await this._detectPhysicalChannels();
        console.log('[AudioEngine] Detected physical channels:', detectedChannels);
        
        return { success: true, channels: detectedChannels };
      } catch (e) {
        console.warn('[AudioEngine] Failed to change output device:', e);
        return { success: false, channels: this.physicalChannels };
      }
    }
    
    console.warn('[AudioEngine] setSinkId not supported in this browser');
    return { success: false, channels: this.physicalChannels };
  }

  /**
   * Detecta el número máximo de canales físicos del dispositivo de salida actual.
   * Usa destination.maxChannelCount para obtener la capacidad real del hardware.
   * 
   * NOTAS DE COMPATIBILIDAD:
   * - Chrome/Edge: Soporte completo, puede devolver >2 canales con hardware multicanal
   * - Firefox: Generalmente devuelve 2 (limitación del navegador)
   * - Safari: Generalmente devuelve 2 (limitación del navegador)
   * 
   * @returns {Promise<number>} - Número de canales físicos detectados
   */
  async _detectPhysicalChannels() {
    if (!this.audioCtx) return 2;
    
    // destination.maxChannelCount indica la capacidad máxima del dispositivo
    const maxChannels = this.audioCtx.destination.maxChannelCount || 2;
    const oldChannels = this.physicalChannels;
    
    // Actualizar contador de canales físicos
    this.physicalChannels = maxChannels;
    
    // Generar etiquetas para los canales
    this.physicalChannelLabels = this._generateChannelLabels(maxChannels);
    
    // Si cambió el número de canales, reconstruir la arquitectura de salida
    if (maxChannels !== oldChannels && this.isRunning) {
      console.log(`[AudioEngine] Channel count changed: ${oldChannels} → ${maxChannels}`);
      this._rebuildOutputArchitecture(maxChannels);
      
      // Notificar a listeners externos (como AudioSettingsModal)
      if (this._onPhysicalChannelsChange) {
        this._onPhysicalChannelsChange(maxChannels, this.physicalChannelLabels);
      }
    }
    
    return maxChannels;
  }

  /**
   * Genera etiquetas descriptivas para los canales físicos.
   * @param {number} count - Número de canales
   * @returns {string[]} - Array de etiquetas
   */
  _generateChannelLabels(count) {
    // Etiquetas estándar para configuraciones comunes
    const labelSets = {
      2: ['L', 'R'],
      4: ['FL', 'FR', 'RL', 'RR'], // Cuadrafónico
      6: ['FL', 'FR', 'C', 'LFE', 'RL', 'RR'], // 5.1
      8: ['FL', 'FR', 'C', 'LFE', 'RL', 'RR', 'SL', 'SR'] // 7.1
    };
    
    if (labelSets[count]) return labelSets[count];
    
    // Para otros casos, generar etiquetas numéricas
    return Array.from({ length: count }, (_, i) => `Ch${i + 1}`);
  }

  /**
   * Reconstruye la arquitectura de salida cuando cambia el número de canales.
   * Reconecta los buses a un nuevo merger con el número correcto de canales.
   * Preserva la matriz de ruteo existente (ignora canales inexistentes).
   * 
   * @param {number} newChannelCount - Nuevo número de canales físicos
   */
  _rebuildOutputArchitecture(newChannelCount) {
    const ctx = this.audioCtx;
    if (!ctx) return;
    
    console.log(`[AudioEngine] Rebuilding output architecture for ${newChannelCount} channels`);
    
    // Desconectar merger actual
    if (this.merger) {
      this.merger.disconnect();
    }
    
    // Desconectar masters actuales del merger
    this.masterGains?.forEach(g => g?.disconnect());
    
    // Crear nuevos nodos master para cada canal físico
    this.masterGains = [];
    for (let ch = 0; ch < newChannelCount; ch++) {
      const gain = ctx.createGain();
      gain.gain.value = this.muted ? 0 : this.masterBaseGain;
      this.masterGains.push(gain);
    }
    
    // Para compatibilidad con código existente, mantener masterL/masterR
    this.masterL = this.masterGains[0] || null;
    this.masterR = this.masterGains[1] || null;
    
    // Crear nuevo merger con el número correcto de canales
    this.merger = ctx.createChannelMerger(newChannelCount);
    
    // Conectar cada master al canal correspondiente del merger
    this.masterGains.forEach((gain, ch) => {
      gain.connect(this.merger, 0, ch);
    });
    
    // Conectar merger al destino
    this.merger.connect(ctx.destination);
    
    // Reconectar los buses con la nueva matriz de ganancias por canal
    this._rebuildBusConnections(newChannelCount);
  }

  /**
   * Reconstruye las conexiones de los buses a los nuevos canales físicos.
   * Crea nodos de ganancia individuales para cada combinación bus→canal.
   * 
   * @param {number} channelCount - Número de canales físicos
   */
  _rebuildBusConnections(channelCount) {
    const ctx = this.audioCtx;
    if (!ctx) return;
    
    // Para cada bus, crear/actualizar los nodos de ganancia por canal
    this.outputBuses.forEach((bus, busIndex) => {
      // Desconectar nodos de ganancia antiguos
      bus.channelGains?.forEach(g => g?.disconnect());
      
      // Crear nuevos nodos de ganancia para cada canal físico
      bus.channelGains = [];
      for (let ch = 0; ch < channelCount; ch++) {
        const gainNode = ctx.createGain();
        // Obtener valor de la matriz de ruteo si existe, sino 0
        const routingValue = this._outputRoutingMatrix?.[busIndex]?.[ch] ?? 0;
        gainNode.gain.value = routingValue;
        
        // Conectar: levelNode → channelGain → masterGain del canal
        bus.levelNode.connect(gainNode);
        gainNode.connect(this.masterGains[ch]);
        
        bus.channelGains.push(gainNode);
      }
    });
    
    // Actualizar referencias legacy para compatibilidad
    if (this.outputBuses[0]) {
      this.bus1L = this.outputBuses[0].channelGains?.[0] || null;
      this.bus1R = this.outputBuses[0].channelGains?.[1] || null;
    }
    if (this.outputBuses[1]) {
      this.bus2L = this.outputBuses[1].channelGains?.[0] || null;
      this.bus2R = this.outputBuses[1].channelGains?.[1] || null;
    }
  }

  /**
   * Registra un callback para ser notificado cuando cambie el número de canales.
   * Útil para que la UI (AudioSettingsModal) actualice la matriz dinámicamente.
   * 
   * @param {Function} callback - (channelCount, labels) => void
   */
  onPhysicalChannelsChange(callback) {
    this._onPhysicalChannelsChange = callback;
  }

  /**
   * Obtiene información sobre los canales físicos actuales.
   * @returns {{ count: number, labels: string[] }}
   */
  getPhysicalChannelInfo() {
    return {
      count: this.physicalChannels,
      labels: [...this.physicalChannelLabels]
    };
  }

  getOutputBusNode(busIndex) {
    return this.outputBuses[busIndex]?.input || null;
  }

  connectNodeToOutput(busIndex, node) {
    const busNode = this.getOutputBusNode(busIndex);
    if (!busNode || !node) return null;
    node.connect(busNode);
    return busNode;
  }

  setBusLevel(bus, value) {
    const targetIndex = bus - 1;
    this.setOutputLevel(targetIndex, value);
  }

  setBusPan(bus, value) {
    const targetIndex = bus - 1;
    this.setOutputPan(targetIndex, value);
  }

  addModule(module) {
    this.modules.push(module);
  }

  findModule(id) {
    return this.modules.find(m => m.id === id) || null;
  }

  /**
   * Activa o desactiva el mute global de todas las salidas.
   * En modo multicanal, mutea todos los canales físicos.
   * 
   * @param {boolean} flag - true para mutear, false para desmutear
   */
  setMute(flag) {
    this.muted = flag;
    if (!this.audioCtx) return;
    
    const value = this.muted ? 0 : this.masterBaseGain;
    
    // Mutear todos los canales físicos
    if (this.masterGains && this.masterGains.length > 0) {
      this.masterGains.forEach(gain => {
        if (gain) setParamSmooth(gain.gain, value, this.audioCtx);
      });
    } else {
      // Fallback legacy para compatibilidad
      if (this.masterL) setParamSmooth(this.masterL.gain, value, this.audioCtx);
      if (this.masterR) setParamSmooth(this.masterR.gain, value, this.audioCtx);
    }
  }

  toggleMute() {
    this.setMute(!this.muted);
  }

  /**
   * Carga los AudioWorklets del sistema.
   * Se llama automáticamente en start(), pero puede llamarse antes si se necesita.
   * @returns {Promise<void>}
   */
  async _loadWorklet() {
    if (this._workletLoadPromise) return this._workletLoadPromise;
    if (!this.audioCtx) return Promise.resolve();

    this._workletLoadPromise = (async () => {
      try {
        // Cargar todos los worklets necesarios
        const worklets = [
          './assets/js/worklets/synthOscillator.worklet.js',
          './assets/js/worklets/scopeCapture.worklet.js',
          './assets/js/worklets/noiseGenerator.worklet.js'
        ];
        
        await Promise.all(
          worklets.map(path => this.audioCtx.audioWorklet.addModule(path))
        );
        
        this.workletReady = true;
        console.log('[AudioEngine] All worklets loaded:', worklets.length);
      } catch (err) {
        console.error('[AudioEngine] Failed to load worklet:', err);
        this.workletReady = false;
      }
    })();

    return this._workletLoadPromise;
  }

  /**
   * Espera a que el worklet esté listo antes de crear nodos.
   * @returns {Promise<boolean>} true si el worklet está disponible
   */
  async ensureWorkletReady() {
    if (this.workletReady) return true;
    
    // Si no hay contexto de audio, iniciarlo primero
    if (!this.audioCtx) {
      this.start();
    }
    
    // Si no hay promesa de carga, iniciar carga
    if (!this._workletLoadPromise) {
      this._loadWorklet();
    }
    
    // Esperar a que termine la carga
    if (this._workletLoadPromise) {
      await this._workletLoadPromise;
      return this.workletReady;
    }
    return false;
  }

  /**
   * Crea un nodo SynthOscillator con fase coherente.
   * @param {Object} options - Opciones iniciales
   * @param {string} [options.waveform='pulse'] - Tipo de onda: 'pulse' o 'sine'
   * @param {number} [options.frequency=440] - Frecuencia inicial
   * @param {number} [options.pulseWidth=0.5] - Ancho de pulso inicial (0.01-0.99) para pulse
   * @param {number} [options.symmetry=0.5] - Simetría inicial (0.01-0.99) para sine
   * @param {number} [options.gain=1.0] - Ganancia inicial
   * @returns {AudioWorkletNode|null} El nodo o null si worklet no disponible
   */
  createSynthOscillator(options = {}) {
    if (!this.audioCtx || !this.workletReady) {
      console.warn('[AudioEngine] Worklet not ready, cannot create SynthOscillator');
      return null;
    }

    const { 
      waveform = 'pulse',
      frequency = 440, 
      pulseWidth = 0.5, 
      symmetry = 0.5,
      gain = 1.0 
    } = options;

    const node = new AudioWorkletNode(this.audioCtx, 'synth-oscillator', {
      numberOfInputs: 1,  // Input para sync
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { waveform }
    });

    // Establecer valores iniciales
    node.parameters.get('frequency').value = frequency;
    node.parameters.get('pulseWidth').value = pulseWidth;
    node.parameters.get('symmetry').value = symmetry;
    node.parameters.get('gain').value = gain;

    // Métodos de conveniencia
    node.setFrequency = (value, ramp = 0.01) => {
      const param = node.parameters.get('frequency');
      const now = this.audioCtx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, ramp);
    };

    node.setPulseWidth = (value, ramp = 0.01) => {
      const param = node.parameters.get('pulseWidth');
      const now = this.audioCtx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(Math.max(0.01, Math.min(0.99, value)), now, ramp);
    };

    node.setSymmetry = (value, ramp = 0.01) => {
      const param = node.parameters.get('symmetry');
      const now = this.audioCtx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(Math.max(0.01, Math.min(0.99, value)), now, ramp);
    };

    node.setGain = (value, ramp = 0.01) => {
      const param = node.parameters.get('gain');
      const now = this.audioCtx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, ramp);
    };

    node.setWaveform = (wf) => {
      node.port.postMessage({ type: 'setWaveform', waveform: wf });
    };

    node.resetPhase = () => {
      node.port.postMessage({ type: 'resetPhase' });
    };

    node.stop = () => {
      node.port.postMessage({ type: 'stop' });
    };

    return node;
  }
}

export class Module {
  constructor(engine, id, name) {
    this.engine = engine;
    this.id = id;
    this.name = name;
    this.inputs = [];
    this.outputs = [];
  }

  getAudioCtx() {
    return this.engine.audioCtx;
  }
}
