// Núcleo de audio: contexto WebAudio y clase base Module para el resto del sistema
import { createLogger } from '../utils/logger.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { showToast } from '../ui/toast.js';

const log = createLogger('AudioEngine');

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
  FAST_RAMP_TIME: 0.01,
  /** 
   * Umbral para activar el bypass de filtros.
   * Si |filterValue| < este umbral, los filtros se desconectan.
   */
  FILTER_BYPASS_THRESHOLD: 0.02
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
    // Filtro bipolar: -1 = lowpass máximo, 0 = sin filtro, +1 = highpass máximo
    this.outputFilters = Array.from({ length: this.outputChannels }, () => 0.0);
    // Estado de mute por canal (false = activo, true = muteado)
    this.outputMutes = Array.from({ length: this.outputChannels }, () => false);
    this.outputBuses = [];
    
    // ───────────────────────────────────────────────────────────────────────────
    // FILTER BYPASS: Optimización para reducir carga de CPU
    // ───────────────────────────────────────────────────────────────────────────
    // Cuando el filtro está en posición neutral (|value| < threshold), los nodos
    // BiquadFilter se desconectan completamente del grafo de audio, ahorrando CPU.
    // ───────────────────────────────────────────────────────────────────────────
    const hasLocalStorage = typeof localStorage !== 'undefined';
    const savedFilterBypass = hasLocalStorage ? localStorage.getItem(STORAGE_KEYS.FILTER_BYPASS_ENABLED) : null;
    this._filterBypassEnabled = savedFilterBypass === null ? true : savedFilterBypass === 'true';
    this._filterBypassDebug = hasLocalStorage ? localStorage.getItem(STORAGE_KEYS.FILTER_BYPASS_DEBUG) === 'true' : false;
    // Estado de bypass por bus (true = filtros bypaseados, false = filtros activos)
    this._filterBypassState = Array.from({ length: this.outputChannels }, () => true);
    // Acumulador de cambios para toast consolidado
    this._filterBypassPendingChanges = null;
    this._filterBypassToastTimeout = null;
    
    // ───────────────────────────────────────────────────────────────────────────
    // STEREO BUSES: Mezclas estéreo con panning
    // ───────────────────────────────────────────────────────────────────────────
    // Dos buses estéreo que mezclan los 8 canales con panning:
    //   - Pan 1-4 (stereoBusA): Mezcla Out 1-4 con sus pans respectivos
    //   - Pan 5-8 (stereoBusB): Mezcla Out 5-8 con sus pans respectivos
    // 
    // Arquitectura por bus estéreo:
    //   Out N levelNode → panGainL → stereoBus.sumL → outputL → masterGain[X]
    //   Out N levelNode → panGainR → stereoBus.sumR → outputR → masterGain[Y]
    // 
    // Por defecto ambos buses van a salida física 0,1 (L/R), sumándose.
    // Total de canales disponibles para grabación: 12
    //   - 8 individuales (Out 1-8)
    //   - 4 estéreo (Pan 1-4 L/R, Pan 5-8 L/R)
    // ───────────────────────────────────────────────────────────────────────────
    this.stereoBuses = {
      A: { sumL: null, sumR: null, outputL: null, outputR: null, channels: [0, 1, 2, 3] },
      B: { sumL: null, sumR: null, outputL: null, outputR: null, channels: [4, 5, 6, 7] }
    };
    // Routing de stereo buses: a qué canales físicos van (por defecto ambos a 0,1)
    this.stereoBusRouting = {
      A: [0, 1],  // Pan 1-4 → L, R
      B: [0, 1]   // Pan 5-8 → L, R (se suman)
    };
    
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

  /**
   * Inicia el motor de audio.
   * @param {Object} [options] - Opciones de inicio
   * @param {AudioContext} [options.audioContext] - AudioContext externo (para tests)
   */
  start(options = {}) {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      return;
    }
    // Permitir inyección de AudioContext para testing
    const ctx = options.audioContext || new (window.AudioContext || window.webkitAudioContext)();
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
    log.info(`Initial physical channels: ${initialChannels}`);

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
      
      // ─────────────────────────────────────────────────────────────────────
      // FILTRO BIPOLAR: Lowpass + Highpass en serie
      // ─────────────────────────────────────────────────────────────────────
      // Control bipolar: -1 a +1 donde:
      //   -1: Lowpass activo (corta agudos), Highpass bypass
      //    0: Ambos bypass (sin filtrado)
      //   +1: Highpass activo (corta graves), Lowpass bypass
      // 
      // Implementación: LP y HP siempre conectados en serie.
      // Cuando un filtro está en "bypass", su frecuencia se pone en el extremo
      // donde no afecta la señal (LP=20kHz, HP=20Hz).
      // 
      // OPTIMIZACIÓN (Filter Bypass):
      // Cuando el filtro está en posición neutral (|value| < threshold),
      // los nodos BiquadFilter se desconectan completamente del grafo.
      // Esto ahorra CPU ya que los filtros no procesan muestras.
      // ─────────────────────────────────────────────────────────────────────
      
      // Lowpass: activo cuando value < 0 (corta agudos)
      const filterLP = ctx.createBiquadFilter();
      filterLP.type = 'lowpass';
      filterLP.Q.value = 0.707; // Butterworth (respuesta plana, sin resonancia)
      filterLP.frequency.value = 20000; // Bypass inicial (20kHz = deja pasar todo)
      
      // Highpass: activo cuando value > 0 (corta graves)
      const filterHP = ctx.createBiquadFilter();
      filterHP.type = 'highpass';
      filterHP.Q.value = 0.707; // Butterworth
      filterHP.frequency.value = 20; // Bypass inicial (20Hz = deja pasar todo)
      
      const levelNode = ctx.createGain();
      levelNode.gain.value = this.outputLevels[i];
      
      // Nodo de mute separado - permite silenciar sin interferir con CV de matriz
      const muteNode = ctx.createGain();
      muteNode.gain.value = this.outputMutes[i] ? 0 : 1;
      
      // ─────────────────────────────────────────────────────────────────────
      // FILTER BYPASS: Conexión inicial
      // ─────────────────────────────────────────────────────────────────────
      // Si el valor inicial del filtro es neutral y el bypass está habilitado,
      // conectamos directamente busInput → levelNode (sin filtros).
      // Si no, conectamos la cadena completa con filtros.
      // ─────────────────────────────────────────────────────────────────────
      const filterValue = this.outputFilters[i];
      const isNeutral = Math.abs(filterValue) < AUDIO_CONSTANTS.FILTER_BYPASS_THRESHOLD;
      const shouldBypass = this._filterBypassEnabled && isNeutral;
      
      // Mantener los filtros pre-conectados entre sí (facilita reconexión)
      filterLP.connect(filterHP);
      
      if (shouldBypass) {
        // Bypass: input → levelNode directamente
        busInput.connect(levelNode);
        this._filterBypassState[i] = true;
      } else {
        // Cadena completa: busInput → filterLP → filterHP → levelNode
        busInput.connect(filterLP);
        filterHP.connect(levelNode);
        this._filterBypassState[i] = false;
      }
      
      levelNode.connect(muteNode);
      
      // Aplicar valor inicial del filtro
      this._applyFilterValue(i, filterValue, filterLP, filterHP);

      // Crear nodos de ganancia para cada canal físico (ruteo multicanal)
      const channelGains = [];
      for (let ch = 0; ch < initialChannels; ch++) {
        const gainNode = ctx.createGain();
        // Usar valor de la matriz de ruteo
        const routingValue = this._outputRoutingMatrix[i]?.[ch] ?? 0;
        gainNode.gain.value = routingValue;
        muteNode.connect(gainNode);
        gainNode.connect(this.masterGains[ch]);
        channelGains.push(gainNode);
      }

      // Mantener panLeft/panRight para compatibilidad legacy (apuntan a canales 0 y 1)
      const busIndex = i;
      const bus = {
        input: busInput,
        filterLP,   // Filtro lowpass (activo con valores negativos)
        filterHP,   // Filtro highpass (activo con valores positivos)
        levelNode,  // Nivel (para modulación CV de matriz)
        muteNode,   // Mute (para on/off del canal)
        panLeft: channelGains[0] || null,
        panRight: channelGains[1] || null,
        channelGains, // Array completo de ganancias por canal
        // Nodos de pan para stereo buses (se crean en _createStereoBuses)
        stereoPanL: null,
        stereoPanR: null,
        // Estado dormant - para silenciar buses sin conexiones entrantes
        _isDormant: false,
        _savedMuteValue: 1,
        /**
         * Activa/desactiva el modo dormant del bus.
         * @param {boolean} dormant - true para silenciar, false para restaurar
         */
        setDormant: (dormant) => {
          if (bus._isDormant === dormant) return;
          bus._isDormant = dormant;
          if (dormant) {
            bus._savedMuteValue = bus.muteNode.gain.value;
            bus.muteNode.gain.setValueAtTime(0, ctx.currentTime);
          } else {
            bus.muteNode.gain.setValueAtTime(bus._savedMuteValue, ctx.currentTime);
          }
        }
      };
      this.outputBuses.push(bus);
    }
    
    // Crear stereo buses (Pan 1-4, Pan 5-8)
    this._createStereoBuses(ctx, initialChannels);

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
      // Por defecto: todo a 0 (el audio fluye por stereo buses, no por routing directo)
      const channelGains = Array(channelCount).fill(0);
      this._outputRoutingMatrix.push(channelGains);
    }
  }

  updateOutputPan(busIndex) {
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (!ctx || !bus) return;
    
    // Actualizar panning en stereo buses (Pan 1-4, Pan 5-8)
    // Nota: No modificar panLeft/panRight (channelGains) - esos contienen valores de routing
    this._updateStereoBusPanning(busIndex);
  }

  setOutputLevel(busIndex, value, { ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME } = {}) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return;
    this.outputLevels[busIndex] = value;
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (ctx && bus) {
      // Solo aplicar si no está muteado
      if (!this.outputMutes[busIndex]) {
        setParamSmooth(bus.levelNode.gain, value, ctx, { ramp });
      }
    }
    if (busIndex === 0) this.bus1Level = value;
    if (busIndex === 1) this.bus2Level = value;
  }

  getOutputLevel(busIndex) {
    return this.outputLevels[busIndex] ?? 0.0;
  }

  /**
   * Mutea o desmutea un canal de salida.
   * 
   * @param {number} busIndex - Índice del bus (0-7)
   * @param {boolean} muted - true para mutear, false para activar
   * @param {Object} [options] - Opciones
   * @param {number} [options.ramp] - Tiempo de transición en segundos
   */
  setOutputMute(busIndex, muted, { ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME } = {}) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return;
    this.outputMutes[busIndex] = muted;
    
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (!ctx || !bus?.muteNode) return;
    
    // Usar muteNode separado: 0 = silenciado, 1 = activo
    // Esto permite que el CV de la matriz module levelNode sin afectar el mute
    const targetGain = muted ? 0 : 1;
    setParamSmooth(bus.muteNode.gain, targetGain, ctx, { ramp });
  }

  /**
   * Obtiene el estado de mute de un canal.
   * @param {number} busIndex - Índice del bus (0-7)
   * @returns {boolean} true si está muteado
   */
  getOutputMute(busIndex) {
    return this.outputMutes[busIndex] ?? false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FILTRO BIPOLAR: Control de frecuencia Lowpass/Highpass
  // ───────────────────────────────────────────────────────────────────────────
  // 
  // ARQUITECTURA:
  //   Dos filtros BiquadFilter en serie: Lowpass → Highpass
  //   Ambos con Q=0.707 (Butterworth, respuesta plana sin resonancia)
  // 
  // CONTROL BIPOLAR (rango -1 a +1):
  //   value = -1: LP corta en ~200Hz (solo graves), HP bypass (20Hz)
  //   value =  0: LP bypass (20kHz), HP bypass (20Hz) → señal limpia
  //   value = +1: LP bypass (20kHz), HP corta en ~5kHz (solo agudos)
  // 
  // MAPEO DE FRECUENCIAS (escala logarítmica):
  //   La percepción humana de frecuencias es logarítmica, no lineal.
  //   Por eso usamos: freq = 10^(log10(min) + t * (log10(max) - log10(min)))
  //   donde t es el valor normalizado 0-1.
  // 
  //   Lowpass (valores negativos, -1 a 0):
  //     -1 → 200 Hz (corta casi todo)
  //      0 → 20000 Hz (bypass, deja pasar todo)
  // 
  //   Highpass (valores positivos, 0 a +1):
  //      0 → 20 Hz (bypass, deja pasar todo)
  //     +1 → 5000 Hz (corta graves y medios)
  // 
  // NOTA: Los rangos de frecuencia son asimétricos intencionalmente.
  // El oído es más sensible a cambios en graves que en agudos.
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Calcula frecuencia de corte del Lowpass según valor bipolar.
   * Solo activo para valores negativos (-1 a 0).
   * 
   * @param {number} value - Valor bipolar (-1 a +1)
   * @returns {number} Frecuencia en Hz (200 a 20000)
   */
  _getLowpassFreq(value) {
    // value < 0: LP activo, mapear -1→200Hz, 0→20000Hz
    // value >= 0: LP bypass (20000Hz)
    if (value >= 0) return 20000;
    
    const t = 1 + value; // -1→0, 0→1
    const minFreq = 200;
    const maxFreq = 20000;
    const minLog = Math.log10(minFreq);
    const maxLog = Math.log10(maxFreq);
    return Math.pow(10, minLog + t * (maxLog - minLog));
  }

  /**
   * Calcula frecuencia de corte del Highpass según valor bipolar.
   * Solo activo para valores positivos (0 a +1).
   * 
   * @param {number} value - Valor bipolar (-1 a +1)
   * @returns {number} Frecuencia en Hz (20 a 5000)
   */
  _getHighpassFreq(value) {
    // value > 0: HP activo, mapear 0→20Hz, +1→5000Hz
    // value <= 0: HP bypass (20Hz)
    if (value <= 0) return 20;
    
    const t = value; // 0→0, 1→1
    const minFreq = 20;
    const maxFreq = 5000;
    const minLog = Math.log10(minFreq);
    const maxLog = Math.log10(maxFreq);
    return Math.pow(10, minLog + t * (maxLog - minLog));
  }

  /**
   * Aplica el valor del filtro a los nodos LP y HP.
   * Usado internamente durante inicialización y cambios.
   * 
   * @param {number} busIndex - Índice del bus
   * @param {number} value - Valor bipolar (-1 a +1)
   * @param {BiquadFilterNode} [filterLP] - Nodo LP (opcional, se obtiene del bus)
   * @param {BiquadFilterNode} [filterHP] - Nodo HP (opcional, se obtiene del bus)
   * @param {number} [ramp] - Tiempo de rampa en segundos
   */
  _applyFilterValue(busIndex, value, filterLP, filterHP, ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME) {
    const bus = this.outputBuses[busIndex];
    const lp = filterLP || bus?.filterLP;
    const hp = filterHP || bus?.filterHP;
    const ctx = this.audioCtx;
    
    if (!lp || !hp) return;
    
    const lpFreq = this._getLowpassFreq(value);
    const hpFreq = this._getHighpassFreq(value);
    
    if (ctx) {
      setParamSmooth(lp.frequency, lpFreq, ctx, { ramp });
      setParamSmooth(hp.frequency, hpFreq, ctx, { ramp });
    } else {
      // Sin contexto, aplicar directamente (inicialización)
      lp.frequency.value = lpFreq;
      hp.frequency.value = hpFreq;
    }
  }

  /**
   * Establece el filtro bipolar de una salida lógica.
   * 
   * @param {number} busIndex - Índice del bus (0-based)
   * @param {number} value - Valor bipolar:
   *   -1 = Lowpass máximo (solo graves, ~200Hz)
   *    0 = Sin filtrado (señal limpia)
   *   +1 = Highpass máximo (solo agudos, ~5kHz)
   * @param {Object} [options] - Opciones
   * @param {number} [options.ramp=0.03] - Tiempo de rampa en segundos
   */
  setOutputFilter(busIndex, value, { ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME } = {}) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return;
    
    const clampedValue = Math.max(-1, Math.min(1, value));
    this.outputFilters[busIndex] = clampedValue;
    
    // ─────────────────────────────────────────────────────────────────────
    // FILTER BYPASS: Optimización de CPU
    // ─────────────────────────────────────────────────────────────────────
    if (this._filterBypassEnabled) {
      this._updateFilterBypass(busIndex, clampedValue);
    }
    
    // Solo aplicar valores de frecuencia si los filtros están conectados
    if (!this._filterBypassState[busIndex]) {
      this._applyFilterValue(busIndex, clampedValue, null, null, ramp);
    }
  }
  
  /**
   * Actualiza el estado de bypass del filtro para un bus específico.
   * Conecta/desconecta los nodos BiquadFilter según sea necesario.
   * 
   * @param {number} busIndex - Índice del bus
   * @param {number} value - Valor actual del filtro
   * @private
   */
  _updateFilterBypass(busIndex, value) {
    const bus = this.outputBuses[busIndex];
    if (!bus) return;
    
    const isNeutral = Math.abs(value) < AUDIO_CONSTANTS.FILTER_BYPASS_THRESHOLD;
    const currentlyBypassed = this._filterBypassState[busIndex];
    
    if (isNeutral && !currentlyBypassed) {
      // Activar bypass: desconectar filtros, conectar directo
      try {
        bus.input.disconnect(bus.filterLP);
        bus.filterHP.disconnect(bus.levelNode);
        bus.input.connect(bus.levelNode);
        this._filterBypassState[busIndex] = true;
        
        if (this._filterBypassDebug) {
          this._logFilterBypassChange(busIndex, true);
        }
      } catch {
        // Ignorar errores si ya está en el estado correcto
      }
    } else if (!isNeutral && currentlyBypassed) {
      // Desactivar bypass: reconectar filtros
      try {
        bus.input.disconnect(bus.levelNode);
        bus.input.connect(bus.filterLP);
        bus.filterHP.connect(bus.levelNode);
        this._filterBypassState[busIndex] = false;
        
        if (this._filterBypassDebug) {
          this._logFilterBypassChange(busIndex, false);
        }
      } catch {
        // Ignorar errores si ya está en el estado correcto
      }
    }
  }
  
  /**
   * Log de cambio de estado del filter bypass.
   * Acumula cambios y muestra un toast consolidado después de un breve delay.
   * @param {number} busIndex - Índice del bus
   * @param {boolean} bypassed - true si ahora está bypaseado
   * @private
   */
  _logFilterBypassChange(busIndex, bypassed) {
    const state = bypassed ? 'BYPASS' : 'ACTIVE';
    log.info(`[FilterBypass] Out ${busIndex + 1}: ${state}`);
    
    // Acumular cambios para toast consolidado
    if (!this._filterBypassPendingChanges) {
      this._filterBypassPendingChanges = { bypassed: [], active: [] };
    }
    
    const outName = `Out ${busIndex + 1}`;
    if (bypassed) {
      this._filterBypassPendingChanges.bypassed.push(outName);
    } else {
      this._filterBypassPendingChanges.active.push(outName);
    }
    
    // Debounce: mostrar toast después de 100ms de inactividad
    if (this._filterBypassToastTimeout) {
      clearTimeout(this._filterBypassToastTimeout);
    }
    this._filterBypassToastTimeout = setTimeout(() => {
      this._showFilterBypassToast();
    }, 100);
  }
  
  /**
   * Muestra un toast consolidado con los cambios de filter bypass.
   * @private
   */
  _showFilterBypassToast() {
    if (!this._filterBypassPendingChanges) return;
    
    const { bypassed, active } = this._filterBypassPendingChanges;
    if (bypassed.length === 0 && active.length === 0) return;
    
    const parts = [];
    if (active.length > 0) {
      parts.push(`🔊 Filter: ${active.join(', ')}`);
    }
    if (bypassed.length > 0) {
      parts.push(`⚡ Bypass: ${bypassed.join(', ')}`);
    }
    
    showToast(parts.join(' | '), 2000);
    this._filterBypassPendingChanges = null;
    this._filterBypassToastTimeout = null;
  }
  
  /**
   * Habilita o deshabilita el sistema de filter bypass.
   * @param {boolean} enabled - true para habilitar
   */
  setFilterBypassEnabled(enabled) {
    this._filterBypassEnabled = enabled;
    
    if (enabled) {
      // Al habilitar, revisar todos los buses y aplicar bypass donde corresponda
      for (let i = 0; i < this.outputChannels; i++) {
        this._updateFilterBypass(i, this.outputFilters[i]);
      }
    } else {
      // Al deshabilitar, reconectar todos los filtros
      for (let i = 0; i < this.outputChannels; i++) {
        if (this._filterBypassState[i]) {
          // Forzar reconexión de filtros
          const bus = this.outputBuses[i];
          if (bus) {
            try {
              bus.input.disconnect(bus.levelNode);
              bus.input.connect(bus.filterLP);
              bus.filterHP.connect(bus.levelNode);
              this._filterBypassState[i] = false;
              // Aplicar valores actuales de frecuencia
              this._applyFilterValue(i, this.outputFilters[i]);
            } catch {
              // Ignorar errores
            }
          }
        }
      }
    }
  }
  
  /**
   * Habilita o deshabilita los logs de debug del filter bypass.
   * @param {boolean} enabled - true para habilitar logs
   */
  setFilterBypassDebug(enabled) {
    this._filterBypassDebug = enabled;
  }
  
  /**
   * Obtiene el estado actual del filter bypass para un bus.
   * @param {number} busIndex - Índice del bus
   * @returns {boolean} true si está bypaseado
   */
  isFilterBypassed(busIndex) {
    return this._filterBypassState[busIndex] ?? false;
  }

  /**
   * Obtiene el valor actual del filtro de una salida.
   * @param {number} busIndex - Índice del bus (0-based)
   * @returns {number} Valor bipolar (-1 a +1), 0 = sin filtro
   */
  getOutputFilter(busIndex) {
    return this.outputFilters[busIndex] ?? 0.0;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEREO BUSES: Pan 1-4 y Pan 5-8
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Crea los stereo buses (Pan 1-4 y Pan 5-8).
   * Cada stereo bus mezcla 4 canales con sus respectivos pans.
   * 
   * @param {AudioContext} ctx - Contexto de audio
   * @param {number} channelCount - Número de canales físicos
   * @private
   */
  _createStereoBuses(ctx, channelCount) {
    // Crear nodos sumadores para cada stereo bus
    for (const busId of ['A', 'B']) {
      const stereoBus = this.stereoBuses[busId];
      
      // Sumadores L/R (mezclan las contribuciones de cada canal)
      stereoBus.sumL = ctx.createGain();
      stereoBus.sumL.gain.value = 1.0;
      stereoBus.sumR = ctx.createGain();
      stereoBus.sumR.gain.value = 1.0;
      
      // Salidas L/R (para routing a canales físicos)
      stereoBus.outputL = ctx.createGain();
      stereoBus.outputL.gain.value = 1.0;
      stereoBus.outputR = ctx.createGain();
      stereoBus.outputR.gain.value = 1.0;
      
      // Conectar sumadores a salidas
      stereoBus.sumL.connect(stereoBus.outputL);
      stereoBus.sumR.connect(stereoBus.outputR);
      
      // Conectar salidas a canales físicos según routing (-1 = deshabilitado)
      const routing = this.stereoBusRouting[busId];
      if (routing[0] >= 0 && this.masterGains[routing[0]]) {
        stereoBus.outputL.connect(this.masterGains[routing[0]]);
      }
      if (routing[1] >= 0 && this.masterGains[routing[1]]) {
        stereoBus.outputR.connect(this.masterGains[routing[1]]);
      }
    }
    
    // Crear nodos de pan para cada outputBus y conectar al stereo bus correspondiente
    for (let i = 0; i < this.outputChannels; i++) {
      const bus = this.outputBuses[i];
      const stereoBusId = i < 4 ? 'A' : 'B';
      const stereoBus = this.stereoBuses[stereoBusId];
      
      // Crear nodos de pan L/R para este canal
      bus.stereoPanL = ctx.createGain();
      bus.stereoPanR = ctx.createGain();
      
      // Conectar desde muteNode a los nodos de pan (después de mute, no de level)
      bus.muteNode.connect(bus.stereoPanL);
      bus.muteNode.connect(bus.stereoPanR);
      
      // Conectar nodos de pan a los sumadores del stereo bus
      bus.stereoPanL.connect(stereoBus.sumL);
      bus.stereoPanR.connect(stereoBus.sumR);
      
      // Aplicar pan inicial (ley de igual potencia)
      const pan = this.outputPans[i] ?? 0;
      const angle = (pan + 1) * 0.25 * Math.PI;
      bus.stereoPanL.gain.value = Math.cos(angle);
      bus.stereoPanR.gain.value = Math.sin(angle);
    }
  }

  /**
   * Actualiza el panning de un canal en su stereo bus correspondiente.
   * 
   * @param {number} busIndex - Índice del bus (0-7)
   * @private
   */
  _updateStereoBusPanning(busIndex) {
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (!ctx || !bus?.stereoPanL || !bus?.stereoPanR) return;
    
    const pan = this.outputPans[busIndex] ?? 0;
    // Ley de igual potencia (equal-power panning)
    const angle = (pan + 1) * 0.25 * Math.PI;
    const left = Math.cos(angle);
    const right = Math.sin(angle);
    
    setParamSmooth(bus.stereoPanL.gain, left, ctx);
    setParamSmooth(bus.stereoPanR.gain, right, ctx);
  }

  /**
   * Configura el routing de un stereo bus a canales físicos.
   * 
   * @param {string} busId - 'A' (Pan 1-4) o 'B' (Pan 5-8)
   * @param {number} leftChannel - Canal físico para L (0-based)
   * @param {number} rightChannel - Canal físico para R (0-based)
   */
  setStereoBusRouting(busId, leftChannel, rightChannel) {
    const stereoBus = this.stereoBuses[busId];
    if (!stereoBus) return;
    
    // Desconectar de canales anteriores
    stereoBus.outputL?.disconnect();
    stereoBus.outputR?.disconnect();
    
    // Actualizar routing (-1 significa deshabilitado)
    this.stereoBusRouting[busId] = [leftChannel, rightChannel];
    
    // Reconectar a nuevos canales (solo si >= 0)
    if (leftChannel >= 0 && this.masterGains[leftChannel]) {
      stereoBus.outputL.connect(this.masterGains[leftChannel]);
    }
    if (rightChannel >= 0 && this.masterGains[rightChannel]) {
      stereoBus.outputR.connect(this.masterGains[rightChannel]);
    }
  }

  /**
   * Obtiene el routing actual de un stereo bus.
   * 
   * @param {string} busId - 'A' o 'B'
   * @returns {number[]} Array [leftChannel, rightChannel]
   */
  getStereoBusRouting(busId) {
    return this.stereoBusRouting[busId] ?? [0, 1];
  }

  /**
   * Obtiene los nodos de salida de los stereo buses para grabación.
   * Retorna 12 canales: 4 estéreo PRIMERO + 8 individuales.
   * ORDEN: stereo (0-3), individual (4-11)
   * 
   * @returns {Object} Objeto con nodos de audio para grabación
   */
  getRecordingNodes() {
    return {
      // 4 canales estéreo PRIMERO (2 por cada stereo bus)
      stereo: {
        A: { L: this.stereoBuses.A?.outputL, R: this.stereoBuses.A?.outputR },
        B: { L: this.stereoBuses.B?.outputL, R: this.stereoBuses.B?.outputR }
      },
      // 8 canales individuales (post-filter, post-level)
      individual: this.outputBuses.map(bus => bus.levelNode)
    };
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
      log.warn(
        `setOutputRouting: Bus ${busIndex} → canales ${ignored.join(', ')} ` +
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
        log.info('Output device changed to:', deviceId);
        
        // Detectar canales disponibles en el nuevo dispositivo
        const detectedChannels = await this._detectPhysicalChannels();
        log.info('Detected physical channels:', detectedChannels);
        
        return { success: true, channels: detectedChannels };
      } catch (e) {
        log.warn('Failed to change output device:', e);
        return { success: false, channels: this.physicalChannels };
      }
    }
    
    log.warn('setSinkId not supported in this browser');
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
      log.info(`Channel count changed: ${oldChannels} → ${maxChannels}`);
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
    
    log.debug(`Rebuilding output architecture for ${newChannelCount} channels`);
    
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
        log.info('All worklets loaded:', worklets.length);
      } catch (err) {
        log.error('Failed to load worklet:', err);
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
      log.warn('Worklet not ready, cannot create SynthOscillator');
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
    
    // ─────────────────────────────────────────────────────────────────────────
    // DORMANCY SYSTEM
    // ─────────────────────────────────────────────────────────────────────────
    // Módulos en estado "dormant" están desactivados para ahorrar CPU cuando
    // no tienen conexiones relevantes en la matriz.
    // ─────────────────────────────────────────────────────────────────────────
    this._isDormant = false;
  }

  getAudioCtx() {
    return this.engine.audioCtx;
  }
  
  /**
   * Indica si el módulo está en estado dormant (desactivado).
   * @returns {boolean}
   */
  get isDormant() {
    return this._isDormant;
  }
  
  /**
   * Activa o desactiva el modo dormant del módulo.
   * Las subclases deben sobrescribir _onDormancyChange() para implementar
   * la lógica específica de desconexión/reconexión.
   * 
   * @param {boolean} dormant - true para desactivar, false para activar
   */
  setDormant(dormant) {
    if (this._isDormant === dormant) return;
    this._isDormant = dormant;
    this._onDormancyChange(dormant);
  }
  
  /**
   * Hook para que las subclases implementen la lógica de dormancy.
   * @param {boolean} dormant - true si entrando en dormancy, false si saliendo
   * @protected
   */
  _onDormancyChange(dormant) {
    // Override en subclases
  }
}
