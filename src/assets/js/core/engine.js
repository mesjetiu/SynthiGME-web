// Núcleo de audio: contexto WebAudio y clase base Module para el resto del sistema
import { createLogger } from '../utils/logger.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { showToast } from '../ui/toast.js';
import { attachProcessorErrorHandler } from '../utils/audio.js';
import { trackEvent as telemetryTrackEvent } from '../utils/telemetry.js';
import {
  applySoftClip,
  digitalToVoltage,
  voltageToDigital,
  DEFAULT_INPUT_VOLTAGE_LIMIT,
  VOLTAGE_DEFAULTS,
  createHybridClipCurve
} from '../utils/voltageConstants.js';
import { audioMatrixConfig, outputChannelConfig } from '../configs/index.js';

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
  /** Tiempo de crossfade para bypass de filtros (50ms, evita clicks) */
  FILTER_BYPASS_CROSSFADE: 0.05,
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
    // DSP (AUDIO ENGINE ON/OFF)
    // ─────────────────────────────────────────────────────────────────────────
    // dspEnabled: si es false, start() es no-op y el audio no se inicializa.
    // Se lee de localStorage al arrancar; se puede cambiar en vivo con
    // suspendDSP() / resumeDSP().
    // ─────────────────────────────────────────────────────────────────────────
    const hasLS = typeof localStorage !== 'undefined';
    const savedDsp = hasLS ? localStorage.getItem(STORAGE_KEYS.DSP_ENABLED) : null;
    // Por defecto el DSP está habilitado (comportamiento histórico)
    this.dspEnabled = savedDsp === null ? true : savedDsp === 'true';

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
    // Filtro escala dial -5 a 5: -5=LP máximo, 0=sin filtro (bypass), +5=HP máximo
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
    
    // DEBUG: Bypass total de la cadena de channel (filter, level, mute, pan)
    // Cuando está activo, bus.input conecta directo a masterGains, saltando todo
    this._channelBypassDebug = false;

    // ───────────────────────────────────────────────────────────────────────────
    // STEREO BUSES: Mezclas estéreo con panning
    // ───────────────────────────────────────────────────────────────────────────
    // Dos buses estéreo que mezclan los 8 canales con panning:
    //   - Pan 1-4 (stereoBusA): Mezcla Out 1-4 con sus pans respectivos
    //   - Pan 5-8 (stereoBusB): Mezcla Out 5-8 con sus pans respectivos
    // 
    // Arquitectura por bus estéreo:
    //   Out N levelNode → panGainL → stereoBus.sumL → outputL → channelGains → masterGains
    //   Out N levelNode → panGainR → stereoBus.sumR → outputR → channelGains → masterGains
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
    // Array de 4 salidas de stereo bus, cada una con sus channelGains
    // [0]=Pan1-4L, [1]=Pan1-4R, [2]=Pan5-8L, [3]=Pan5-8R
    this.stereoBusOutputs = [];
    
    // Matriz de routing para stereo buses: [rowIdx][chIdx] = ganancia
    // Se inicializa en _createStereoBuses con el número real de canales
    this._stereoBusRoutingMatrix = null;
    
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
   * @param {string} [options.latencyHint='interactive'] - Hint de latencia: 'interactive', 'balanced', 'playback'
   */
  start(options = {}) {
    // Si DSP está deshabilitado, no crear AudioContext
    if (!this.dspEnabled) {
      log.info('DSP disabled, skipping AudioContext creation');
      return;
    }
    
    if (this.audioCtx) {
      // Si ya existe el contexto, no intentar resume automático.
      // El resume se hará cuando haya un gesto del usuario.
      // Esto evita el warning "AudioContext was not allowed to start"
      return;
    }
    
    // Permitir inyección de AudioContext para testing
    let ctx;
    if (options.audioContext) {
      ctx = options.audioContext;
    } else {
      let latencyHint = options.latencyHint || 'interactive';
      // Convertir valores numéricos de string a número
      if (!isNaN(parseFloat(latencyHint))) {
        latencyHint = parseFloat(latencyHint);
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioContextClass({ latencyHint });
      log.info(`AudioContext created with latencyHint: ${typeof latencyHint === 'number' ? latencyHint + 's' : '"' + latencyHint + '"'}, baseLatency: ${ctx.baseLatency?.toFixed(3) || 'N/A'}s`);
    }
    this.audioCtx = ctx;

    // Cargar AudioWorklet para osciladores con fase coherente
    this._loadWorklet();

    // ─────────────────────────────────────────────────────────────────────────
    // INICIALIZACIÓN MULTICANAL
    // ─────────────────────────────────────────────────────────────────────────
    // Detectar canales físicos disponibles en el dispositivo por defecto.
    // Por defecto asumimos estéreo (2 canales) hasta que se detecte el hardware.
    // NOTA: Chromium limita destination.maxChannelCount a 2 en la mayoría de
    // configuraciones, incluso si el hardware soporta más canales.
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
      // SATURACIÓN HÍBRIDA: Emulación de raíles ±12V del Synthi 100
      // ─────────────────────────────────────────────────────────────────────
      // El Synthi 100 tiene raíles de alimentación de ±12V que saturan
      // progresivamente las señales que se acercan al límite.
      // Tres zonas: lineal → compresión suave (tanh) → hard clip
      // ─────────────────────────────────────────────────────────────────────
      let hybridClipShaper = null;
      const { hybridClipping } = audioMatrixConfig;
      if (hybridClipping.enabled) {
        hybridClipShaper = ctx.createWaveShaper();
        hybridClipShaper.curve = createHybridClipCurve(
          hybridClipping.samples,
          hybridClipping.linearThreshold,
          hybridClipping.softThreshold,
          hybridClipping.hardLimit,
          hybridClipping.softness
        );
        hybridClipShaper.oversample = '2x'; // Evitar aliasing en transiciones
      }
      
      // ─────────────────────────────────────────────────────────────────────
      // VCA CEM 3330 (levelNode) - VA ANTES DEL FILTRO
      // ─────────────────────────────────────────────────────────────────────
      // En el Synthi 100 Cuenca/Datanomics 1982, el VCA procesa la señal
      // ANTES del filtro. Esto significa que:
      // 1. La re-entrada a la matriz es POST-VCA, PRE-filtro
      // 2. El filtro solo afecta la salida externa, no la re-entrada
      //
      // Cadena correcta: Input → [Clipper] → VCA → Split → Filtro → Mute → Out
      //                                        └─→ Re-entry (a matriz)
      // ─────────────────────────────────────────────────────────────────────
      const levelNode = ctx.createGain();
      levelNode.gain.value = this.outputLevels[i];
      
      // ─────────────────────────────────────────────────────────────────────
      // POST-VCA SPLIT: Punto de división para re-entrada a matriz
      // ─────────────────────────────────────────────────────────────────────
      // Este nodo permite tomar la señal procesada por el VCA pero ANTES
      // del filtro, para enviarla de vuelta a la matriz de audio.
      // ─────────────────────────────────────────────────────────────────────
      const postVcaNode = ctx.createGain();
      postVcaNode.gain.value = 1.0;
      
      // ─────────────────────────────────────────────────────────────────────
      // RE-ENTRY: postVcaNode es el punto de conexión para re-entrada
      // ─────────────────────────────────────────────────────────────────────
      // La señal post-VCA se envía directamente a la matriz de audio.
      // No se interpone ningún filtro DC: las señales DC legítimas
      // (joystick, voltajes de control) deben pasar sin modificación
      // para que la re-entry funcione correctamente como fuente de CV.
      // ─────────────────────────────────────────────────────────────────────
      
      // ─────────────────────────────────────────────────────────────────────
      // FILTRO RC PASIVO: Corrección tonal auténtica (DESPUÉS del VCA)
      // ─────────────────────────────────────────────────────────────────────
      // Modelo del circuito real del plano D100-08 C1 (Cuenca 1982):
      //   Pot 10K lineal + 2× condensadores 0.047µF + buffer CA3140
      //
      // Respuesta de audio (1er orden, 6 dB/oct, un solo polo):
      //   -1: Lowpass  → fc(-3dB) ≈ 677 Hz, atenúa HF gradualmente
      //    0: Plano    → 0 dB en todo el espectro (20 Hz – 20 kHz)
      //   +1: Shelving → +6 dB en HF (por encima de ~677 Hz), LF intactas
      //
      // La pendiente suave de 6 dB/oct produce un coloreo musical,
      // no un corte brusco. Zona de transición en medios-bajos (339-677 Hz).
      //
      // NOTA: Los filtros solo afectan la SALIDA EXTERNA.
      // La señal de re-entrada a la matriz sale del postVcaNode,
      // que es ANTES de los filtros (POST-VCA, PRE-filtro).
      // ─────────────────────────────────────────────────────────────────────
      // filterNode se crea de forma diferida en _initFilterNodes(),
      // después de que _loadWorklet() haya cargado el módulo del worklet.
      // Mientras tanto, filterGain conecta directamente a muteNode (passthrough).
      let filterNode = null;
      
      // Nodo de mute separado - permite silenciar sin interferir con CV de matriz
      const muteNode = ctx.createGain();
      muteNode.gain.value = this.outputMutes[i] ? 0 : 1;
      
      // ─────────────────────────────────────────────────────────────────────
      // CROSSFADE NODES para bypass suave de filtros (evita clicks)
      // ─────────────────────────────────────────────────────────────────────
      // En lugar de desconectar/reconectar nodos (causa clicks), mantenemos
      // ambas rutas conectadas y hacemos crossfade entre ellas:
      //   postVcaNode → filterGain → filterNode (worklet RC) → muteNode
      //   postVcaNode → bypassGain ────────────────────────→ muteNode
      // ─────────────────────────────────────────────────────────────────────
      const filterGain = ctx.createGain();
      const bypassGain = ctx.createGain();
      
      // ─────────────────────────────────────────────────────────────────────
      // CADENA DE SEÑAL CORRECTA (Cuenca 1982) con crossfade
      // ─────────────────────────────────────────────────────────────────────
      // busInput → [hybridClipShaper] → levelNode (VCA) → postVcaNode → ...
      //                                                        │
      //                                                        ├─→ filterGain → filterNode (RC worklet) ─┬─→ muteNode → [dcBlocker] → dcBlockerOut → channelGains → 🔊
      //                                                        └─→ bypassGain ──────────────────────────┘
      //                                                        └─→ (re-entry a matriz - señal directa, DC pasa)
      //
      // FILTER BYPASS: crossfade entre filterGain y bypassGain
      // DC BLOCKER: solo en salida a altavoces, re-entry NO lo atraviesa
      // ─────────────────────────────────────────────────────────────────────
      const filterDialValue = this.outputFilters[i];
      const filterBipolar = filterDialValue / 5;  // Convertir dial (-5 a 5) a bipolar (-1/+1)
      const isNeutral = Math.abs(filterBipolar) < AUDIO_CONSTANTS.FILTER_BYPASS_THRESHOLD;
      const shouldBypass = this._filterBypassEnabled && isNeutral;
      
      // Establecer ganancias iniciales según estado de bypass
      if (shouldBypass) {
        filterGain.gain.value = 0;
        bypassGain.gain.value = 1;
        this._filterBypassState[i] = true;
      } else {
        filterGain.gain.value = 1;
        bypassGain.gain.value = 0;
        this._filterBypassState[i] = false;
      }
      
      // PASO 1: Conectar entrada → [clipper] → levelNode (VCA)
      if (hybridClipShaper) {
        busInput.connect(hybridClipShaper);
        hybridClipShaper.connect(levelNode);
      } else {
        busInput.connect(levelNode);
      }
      
      // PASO 2: levelNode (VCA) → postVcaNode (split)
      levelNode.connect(postVcaNode);
      
      // PASO 3: postVcaNode → rutas paralelas con crossfade → muteNode
      // Ruta de filtros: postVcaNode → filterGain → [filterNode] → muteNode
      // (filterNode se inserta después via _initFilterNodes, de momento passthrough)
      postVcaNode.connect(filterGain);
      filterGain.connect(muteNode);
      
      // Ruta de bypass: postVcaNode → bypassGain → muteNode
      postVcaNode.connect(bypassGain);
      bypassGain.connect(muteNode);

      // ─────────────────────────────────────────────────────────────────────
      // DC BLOCKER OUTPUT: Protección de altavoces (SOLO ruta de salida)
      // ─────────────────────────────────────────────────────────────────────
      // Nodo passthrough que será reemplazado por el AudioWorklet dcBlocker
      // una vez cargado (_initDCBlockerNodes). Cadena final:
      //   muteNode → dcBlockerWorklet → dcBlockerOut → channelGains → 🔊
      //
      // IMPORTANTE: La re-entry (postVcaNode → matriz) NO pasa por aquí.
      // Las señales DC legítimas (CV, joystick) llegan intactas a la matriz.
      // ─────────────────────────────────────────────────────────────────────
      const dcBlockerOut = ctx.createGain();
      dcBlockerOut.gain.value = 1.0;
      muteNode.connect(dcBlockerOut);  // Passthrough temporal hasta _initDCBlockerNodes

      // Crear nodos de ganancia para cada canal físico (ruteo multicanal)
      const channelGains = [];
      for (let ch = 0; ch < initialChannels; ch++) {
        const gainNode = ctx.createGain();
        // Usar valor de la matriz de ruteo
        const routingValue = this._outputRoutingMatrix[i]?.[ch] ?? 0;
        gainNode.gain.value = routingValue;
        dcBlockerOut.connect(gainNode);
        gainNode.connect(this.masterGains[ch]);
        channelGains.push(gainNode);
      }

      // Mantener panLeft/panRight para compatibilidad legacy (apuntan a canales 0 y 1)
      const busIndex = i;
      const bus = {
        input: busInput,
        hybridClipShaper, // Saturación híbrida (emulación raíles ±12V, puede ser null)
        levelNode,  // VCA - Nivel (para modulación CV de matriz) - ANTES del filtro
        postVcaNode, // Punto de split POST-VCA y re-entry a matriz (señal directa, sin DC blocker)
        filterGain, // Ganancia para crossfade suave de filtros
        bypassGain, // Ganancia para crossfade suave de bypass
        filterNode, // Filtro RC pasivo (AudioWorklet, 1er orden 6 dB/oct, fc≈677Hz, LP↔plano↔HP shelf)
        muteNode,   // Mute (para on/off del canal)
        dcBlockerOut, // GainNode post-DC-blocker para salida a altavoces (passthrough hasta worklet init)
        dcBlockerWorklet: null, // AudioWorkletNode DC blocker (se crea en _initDCBlockerNodes)
        panLeft: channelGains[0] || null,
        panRight: channelGains[1] || null,
        channelGains, // Array completo de ganancias por canal
        // Nodos de pan para stereo buses (se crean en _createStereoBuses)
        stereoPanL: null,
        stereoPanR: null,
        // VCA Worklet para modulación CV a audio-rate (se crea bajo demanda)
        vcaWorklet: null,
        // Estado dormant - para desconectar buses sin conexiones entrantes
        _isDormant: false,
        _savedMuteValue: 1,
        /**
         * Activa/desactiva el modo dormant del bus.
         * Cuando dormant, desconecta busInput del grafo para que el VCA y filtros
         * no procesen audio. Ahorra CPU al evitar procesamiento innecesario.
         * 
         * Cadena (Cuenca 1982): input → [clipper] → VCA → postVca → filtros → mute
         * 
         * @param {boolean} dormant - true para desconectar, false para reconectar
         */
        setDormant: (dormant) => {
          if (bus._isDormant === dormant) return;
          bus._isDormant = dormant;
          
          const engine = this;
          const hasClipper = !!bus.hybridClipShaper;
          
          if (dormant) {
            // DORMANT: Desconectar busInput del grafo (cortar al inicio de la cadena)
            bus._savedMuteValue = bus.muteNode.gain.value;
            try {
              if (hasClipper) {
                bus.input.disconnect(bus.hybridClipShaper);
              } else {
                bus.input.disconnect(bus.levelNode);
              }
              console.log(`[Dormancy] Output Bus ${busIndex + 1}: DORMANT (disconnected)`);
            } catch { /* Ya desconectado */ }
          } else {
            // ACTIVE: Reconectar busInput
            try {
              if (hasClipper) {
                bus.input.connect(bus.hybridClipShaper);
              } else {
                bus.input.connect(bus.levelNode);
              }
              
              // ─────────────────────────────────────────────────────────────
              // RESINCRONIZAR VCA: Aplicar nivel actual del fader
              // ─────────────────────────────────────────────────────────────
              // Mientras el bus estaba dormant, el levelNode.gain puede haberse
              // quedado desactualizado. Reaplicamos el valor del array de niveles.
              //
              // IMPORTANTE: Si hay vcaWorklet activo, también debemos resincronizar
              // su estado interno (_voltageSmoothed) para evitar el transitorio
              // de ramping que genera offset DC. Ver vcaProcessor.worklet.js.
              // ─────────────────────────────────────────────────────────────
              const currentLevel = engine.outputLevels[busIndex];
              if (typeof currentLevel === 'number') {
                // Resincronizar GainNode (modo simple)
                if (currentLevel !== bus.levelNode.gain.value) {
                  bus.levelNode.gain.setValueAtTime(currentLevel, engine.audioCtx.currentTime);
                }
                
                // Resincronizar VCA worklet (modo audio-rate con CV)
                // Enviar mensaje para que _voltageSmoothed salte al valor correcto
                // sin hacer ramping, eliminando el transitorio DC
                if (bus.vcaWorklet?.port) {
                  const dialVoltage = engine._gainToDialVoltage(currentLevel);
                  bus.vcaWorklet.port.postMessage({
                    type: 'resync',
                    dialVoltage
                  });
                }
              }
              
              console.log(`[Dormancy] Output Bus ${busIndex + 1}: ACTIVE (reconnected)`);
            } catch { /* Error de conexión */ }
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

  updateOutputPan(busIndex, ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME) {
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (!ctx || !bus) return;
    
    // Actualizar panning en stereo buses (Pan 1-4, Pan 5-8)
    // Nota: No modificar panLeft/panRight (channelGains) - esos contienen valores de routing
    this._updateStereoBusPanning(busIndex, ramp);
  }

  setOutputLevel(busIndex, value, { ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME } = {}) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return;
    this.outputLevels[busIndex] = value;
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    
    if (ctx && bus) {
      // ─────────────────────────────────────────────────────────────────────
      // SIEMPRE actualizar levelNode (VCA), independientemente del mute
      // ─────────────────────────────────────────────────────────────────────
      // El mute (muteNode) es un nodo SEPARADO que corta la salida externa.
      // El VCA debe actualizarse siempre porque:
      // 1. La re-entrada a la matriz sale de postVcaNode (después del VCA)
      // 2. El mute solo afecta la salida externa, no la re-entrada
      // ─────────────────────────────────────────────────────────────────────
      
      if (bus.vcaWorklet) {
        // ─────────────────────────────────────────────────────────────────────
        // MODO AUDIO-RATE: VCA worklet activo
        // ─────────────────────────────────────────────────────────────────────
        // El levelNode está en bypass (ganancia=1), el worklet controla todo.
        // Actualizamos el parámetro dialVoltage del worklet.
        // ─────────────────────────────────────────────────────────────────────
        const dialVoltage = this._gainToDialVoltage(value);
        const param = bus.vcaWorklet.parameters.get('dialVoltage');
        if (param) {
          // Usar linearRampToValueAtTime para transición suave
          param.cancelScheduledValues(ctx.currentTime);
          param.setValueAtTime(param.value, ctx.currentTime);
          param.linearRampToValueAtTime(dialVoltage, ctx.currentTime + ramp);
        }
        // Actualizar cutoffEnabled (corte mecánico cuando dial=0)
        const cutoffParam = bus.vcaWorklet.parameters.get('cutoffEnabled');
        if (cutoffParam) {
          cutoffParam.setValueAtTime(value <= 0 ? 1 : 0, ctx.currentTime);
        }
      } else {
        // ─────────────────────────────────────────────────────────────────────
        // MODO SIMPLE: GainNode directo (sin CV de audio-rate)
        // ─────────────────────────────────────────────────────────────────────
        setParamSmooth(bus.levelNode.gain, value, ctx, { ramp });
      }
    }
    if (busIndex === 0) this.bus1Level = value;
    if (busIndex === 1) this.bus2Level = value;
  }

  getOutputLevel(busIndex) {
    return this.outputLevels[busIndex] ?? 0.0;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // AUDIO-RATE CV: Modulación de nivel a sample-rate
  // ───────────────────────────────────────────────────────────────────────────
  // 
  // El VCA CEM 3330 usa una curva logarítmica de 10 dB/V:
  //   gain = 10^(totalVoltage / 20)  donde totalVoltage = dialVoltage + cvVoltage
  //
  // El dialVoltage (fader) va de -12V (dial=0) a 0V (dial=10):
  //   dial=0 → -12V → gain=0.251 (pero el hardware tiene corte mecánico)
  //   dial=10 → 0V → gain=1.0
  //
  // Para AM de audio real, el CV debe procesarse a sample-rate, no a 60Hz.
  // Esto se logra con un AudioWorklet que recibe el CV como entrada de audio.
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Conecta una fuente de CV al VCA del bus de salida para modulación AM a audio-rate.
   * 
   * Esto crea (o reutiliza) un VCA AudioWorklet que aplica la curva logarítmica
   * 10 dB/V del CEM 3330 al CV entrante, permitiendo modulación de amplitud
   * a frecuencias de audio (trémolo, ring modulation, etc.).
   * 
   * IMPORTANTE: Requiere que los worklets estén cargados (ensureWorkletReady()).
   * 
   * @param {number} busIndex - Índice del bus (0-7)
   * @param {AudioNode} sourceNode - Nodo de audio que proporciona el CV
   * @returns {boolean} true si la conexión fue exitosa
   * 
   * @example
   * // Conectar LFO como CV para trémolo
   * engine.connectOutputLevelCV(0, lfoNode);
   */
  connectOutputLevelCV(busIndex, sourceNode) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return false;
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (!ctx || !bus) return false;

    // Verificar que los worklets estén cargados
    if (!this.workletReady) {
      log.warn('Worklets not ready for audio-rate CV. Call ensureWorkletReady() first.');
      return false;
    }

    // Crear VCA worklet si no existe
    if (!bus.vcaWorklet) {
      try {
        // Obtener slewTime del config (filtro anti-click τ=5ms por defecto)
        const slewTime = outputChannelConfig?.vca?.antiClickFilter?.slewTime ?? 0.005;
        
        bus.vcaWorklet = new AudioWorkletNode(ctx, 'vca-processor', {
          numberOfInputs: 2,  // 0: audio, 1: CV
          numberOfOutputs: 1,
          outputChannelCount: [1],
          parameterData: {
            dialVoltage: this._gainToDialVoltage(this.outputLevels[busIndex]),
            cvScale: 4.0,  // CV normalizado (-1,+1) * 4 = ±4V
            cutoffEnabled: this.outputLevels[busIndex] > 0 ? 0 : 1,
            slewTime: slewTime  // Constante de tiempo del filtro anti-click
          }
        });
        attachProcessorErrorHandler(bus.vcaWorklet, `vca-processor[bus ${busIndex}]`);

        // ─────────────────────────────────────────────────────────────────────
        // RECONECTAR CADENA DE SEÑAL
        // ─────────────────────────────────────────────────────────────────────
        // Cadena original: 
        //   [clipper] → levelNode (GainNode) → postVcaNode
        //
        // Nueva cadena con VCA worklet:
        //   [clipper] → vcaWorklet (entrada 0) → postVcaNode
        //                    ↑
        //               cvSource (entrada 1)
        //
        // El levelNode se mantiene pero se bypasea (ganancia=1).
        // Esto permite volver al modo sin worklet si se desconecta el CV.
        // ─────────────────────────────────────────────────────────────────────
        
        // Desconectar levelNode → postVcaNode
        try {
          bus.levelNode.disconnect(bus.postVcaNode);
        } catch { /* Ya desconectado */ }

        // Conectar: levelNode → vcaWorklet (entrada 0) → postVcaNode
        bus.levelNode.connect(bus.vcaWorklet, 0, 0);
        bus.vcaWorklet.connect(bus.postVcaNode);

        // Poner levelNode en bypass (ganancia=1), el VCA worklet controla la ganancia
        bus.levelNode.gain.setValueAtTime(1, ctx.currentTime);

        log.info(`Bus ${busIndex + 1}: VCA worklet created for audio-rate AM`);
      } catch (err) {
        log.error(`Failed to create VCA worklet for bus ${busIndex}:`, err);
        return false;
      }
    }

    // Conectar la fuente de CV a la entrada 1 del worklet
    try {
      sourceNode.connect(bus.vcaWorklet, 0, 1);
      log.info(`Bus ${busIndex + 1}: CV source connected to VCA worklet`);
      return true;
    } catch (err) {
      log.error(`Failed to connect CV source to bus ${busIndex}:`, err);
      return false;
    }
  }

  /**
   * Desconecta una fuente de CV del VCA del bus.
   * 
   * @param {number} busIndex - Índice del bus (0-7)
   * @param {AudioNode} [sourceNode] - Nodo a desconectar (opcional, desconecta todo si no se especifica)
   * @returns {boolean} true si se desconectó correctamente
   */
  disconnectOutputLevelCV(busIndex, sourceNode = null) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return false;
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (!ctx || !bus?.vcaWorklet) return false;

    try {
      if (sourceNode) {
        // Desconectar solo este sourceNode
        sourceNode.disconnect(bus.vcaWorklet);
      } else {
        // Nota: No podemos desconectar "solo entrada 1" sin saber qué nodos están conectados
        // El llamador debe manejar la desconexión de fuentes específicas
      }
      log.info(`Bus ${busIndex + 1}: CV source disconnected`);
      return true;
    } catch (err) {
      log.warn(`Disconnect CV failed for bus ${busIndex}:`, err);
      return false;
    }
  }

  /**
   * Convierte ganancia lineal (0-1) a voltaje del dial (-12V a 0V).
   * Inverso de la curva 10 dB/V del CEM 3330.
   * 
   * @param {number} gain - Ganancia lineal (0-1)
   * @returns {number} Voltaje del dial (-12 a 0)
   * @private
   */
  _gainToDialVoltage(gain) {
    // gain = 10^(voltage/20)  →  voltage = 20 * log10(gain)
    if (gain <= 0) return -12;  // Mínimo (corte mecánico)
    if (gain >= 1) return 0;    // Máximo
    return Math.max(-12, Math.min(0, 20 * Math.log10(gain)));
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
  // FILTRO BIPOLAR RC: Corrección tonal Lowpass / Highpass (1er orden)
  // ───────────────────────────────────────────────────────────────────────────
  // 
  // ARQUITECTURA:
  //   AudioWorklet 'output-filter' con filtro IIR de 1er orden (6 dB/oct)
  //   Modelo exacto del circuito RC pasivo del plano D100-08 C1 (Cuenca 1982)
  //   Pot 10K LIN + 2× 0.047µF + buffer CA3140 (ganancia 2×)
  // 
  // CONTROL BIPOLAR (rango -1 a +1, desde dial -5 a +5):
  //   value = -1: Lowpass, fc(-3dB) ≈ 677 Hz, pendiente -6 dB/oct
  //              Atenúa agudos: -12 dB a 2.7 kHz, -23 dB a 10 kHz
  //              Resultado: sonido oscuro, graves preservados
  //   value =  0: Respuesta plana, 0 dB en todo el espectro (20 Hz – 20 kHz)
  //   value = +1: Shelving HF, +6 dB por encima de ~677 Hz
  //              NO atenúa graves (DC = 0 dB); realza agudos
  //              Resultado: sonido brillante, presencia en HF
  // 
  // NOTA MUSICAL: la pendiente de 6 dB/oct (1 polo) produce un coloreo
  // suave y musical, muy diferente de filtros resonantes o de 2º orden.
  // La zona de transición (339-677 Hz) afecta a medios-bajos.
  // 
  // El AudioParam 'filterPosition' recibe directamente el valor bipolar.
  // Los coeficientes IIR se recalculan en el worklet por bloque (k-rate).
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Aplica el valor del filtro al AudioWorklet RC del bus.
   * Establece el parámetro filterPosition que controla los coeficientes IIR
   * del filtro de 1er orden (6 dB/oct), determinando fc y respuesta en frecuencia.
   * 
   * @param {number} busIndex - Índice del bus (0-7)
   * @param {number} value - Valor bipolar (-1=LP fc≈677Hz, 0=plano 0dB, +1=HP shelf +6dB)
   * @param {number} [ramp] - Tiempo de rampa en segundos (suaviza cambio de tono)
   */
  _applyFilterValue(busIndex, value, ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME) {
    const bus = this.outputBuses[busIndex];
    const filterNode = bus?.filterNode;
    const ctx = this.audioCtx;
    
    if (!filterNode) return;
    
    const param = filterNode.parameters.get('filterPosition');
    if (!param) return;
    
    if (ctx) {
      setParamSmooth(param, value, ctx, { ramp });
    } else {
      param.value = value;
    }
  }

  /**
   * Establece el filtro tonal de una salida lógica (corrección LP/HP).
   * 
   * Filtro RC pasivo de 1er orden (6 dB/octava) modelado según el circuito
   * real del Synthi 100 Cuenca (plano D100-08 C1).
   * 
   * @param {number} busIndex - Índice del bus (0-based)
   * @param {number} value - Valor en escala dial Synthi 100 (-5 a 5):
   *   -5 = Lowpass: fc(-3dB) ≈ 677 Hz, atenúa HF a -6 dB/oct (sonido oscuro)
   *    0 = Respuesta plana: 0 dB en todo el espectro (sin coloración)
   *   +5 = HP shelving: realce de +6 dB en HF, graves intactos (sonido brillante)
   * @param {Object} [options] - Opciones
   * @param {number} [options.ramp=0.03] - Tiempo de rampa (evita clicks en transiciones)
   */
  setOutputFilter(busIndex, value, { ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME } = {}) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return;
    
    // Convertir escala dial (-5 a 5) a bipolar interno (-1 a +1)
    // -5→-1, 0→0, 5→+1
    const dialClamped = Math.max(-5, Math.min(5, value));
    const bipolarValue = dialClamped / 5;
    
    this.outputFilters[busIndex] = dialClamped;  // Guardar en escala dial
    
    // ─────────────────────────────────────────────────────────────────────
    // FILTER BYPASS: Optimización de CPU
    // ─────────────────────────────────────────────────────────────────────
    if (this._filterBypassEnabled) {
      this._updateFilterBypass(busIndex, bipolarValue);
    }
    
    // Solo aplicar valor si los filtros están conectados
    if (!this._filterBypassState[busIndex]) {
      this._applyFilterValue(busIndex, bipolarValue, ramp);
    }
  }
  
  /**
   * Actualiza el estado de bypass del filtro para un bus específico.
   * Usa crossfade suave entre la ruta de filtros y la ruta directa para evitar clicks.
   * 
   * CADENA CON CROSSFADE:
   * postVcaNode → filterGain → filterNode (RC worklet) ─┬─→ muteNode
   * postVcaNode → bypassGain ──────────────────────────┘
   * 
   * El bypass hace crossfade: filterGain→0, bypassGain→1 (y viceversa)
   * 
   * @param {number} busIndex - Índice del bus
   * @param {number} value - Valor actual del filtro
   * @private
   */
  _updateFilterBypass(busIndex, value) {
    const bus = this.outputBuses[busIndex];
    const ctx = this.audioCtx;
    if (!bus || !ctx) return;
    
    const isNeutral = Math.abs(value) < AUDIO_CONSTANTS.FILTER_BYPASS_THRESHOLD;
    const currentlyBypassed = this._filterBypassState[busIndex];
    
    const crossfadeTime = AUDIO_CONSTANTS.FILTER_BYPASS_CROSSFADE;
    
    // Tiempo de hard-set: 5τ después del inicio del crossfade.
    // En ese punto setTargetAtTime ha alcanzado 99.3% del target;
    // setValueAtTime fuerza el valor exacto y elimina el residuo
    // asintótico de e^(-t/τ) que nunca llega a cero.
    const hardSetDelay = 5 * crossfadeTime;
    const now = ctx.currentTime;
    
    if (isNeutral && !currentlyBypassed) {
      // Activar bypass: crossfade a ruta directa
      setParamSmooth(bus.filterGain.gain, 0, ctx, { ramp: crossfadeTime });
      setParamSmooth(bus.bypassGain.gain, 1, ctx, { ramp: crossfadeTime });
      // Hard-set: forzar valores exactos tras 5τ
      bus.filterGain.gain.setValueAtTime(0, now + hardSetDelay);
      bus.bypassGain.gain.setValueAtTime(1, now + hardSetDelay);
      this._filterBypassState[busIndex] = true;
      
      if (this._filterBypassDebug) {
        this._logFilterBypassChange(busIndex, true);
      }
    } else if (!isNeutral && currentlyBypassed) {
      // Desactivar bypass: crossfade a ruta de filtros
      setParamSmooth(bus.filterGain.gain, 1, ctx, { ramp: crossfadeTime });
      setParamSmooth(bus.bypassGain.gain, 0, ctx, { ramp: crossfadeTime });
      // Hard-set: forzar valores exactos tras 5τ
      bus.filterGain.gain.setValueAtTime(1, now + hardSetDelay);
      bus.bypassGain.gain.setValueAtTime(0, now + hardSetDelay);
      this._filterBypassState[busIndex] = false;
      
      if (this._filterBypassDebug) {
        this._logFilterBypassChange(busIndex, false);
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
    
    const ctx = this.audioCtx;
    if (!ctx) return;
    
    if (enabled) {
      // Al habilitar, revisar todos los buses y aplicar bypass donde corresponda
      for (let i = 0; i < this.outputChannels; i++) {
        const bipolar = this.outputFilters[i] / 5;  // dial (-5 a 5) → bipolar (-1 a +1)
        this._updateFilterBypass(i, bipolar);
      }
    } else {
      // Al deshabilitar, forzar ruta de filtros en todos los buses
      for (let i = 0; i < this.outputChannels; i++) {
        if (this._filterBypassState[i]) {
          const bus = this.outputBuses[i];
          if (bus) {
            // Crossfade a ruta de filtros
            const crossfadeTime = AUDIO_CONSTANTS.FILTER_BYPASS_CROSSFADE;
            const now = ctx.currentTime;
            setParamSmooth(bus.filterGain.gain, 1, ctx, { ramp: crossfadeTime });
            setParamSmooth(bus.bypassGain.gain, 0, ctx, { ramp: crossfadeTime });
            // Hard-set tras 5τ para forzar valores exactos
            const hardSetDelay = 5 * crossfadeTime;
            bus.filterGain.gain.setValueAtTime(1, now + hardSetDelay);
            bus.bypassGain.gain.setValueAtTime(0, now + hardSetDelay);
            this._filterBypassState[i] = false;
            // Aplicar valores actuales de frecuencia (convertir dial → bipolar)
            const bipolar = this.outputFilters[i] / 5;  // dial (-5 a 5) → bipolar (-1 a +1)
            this._applyFilterValue(i, bipolar);
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
    // Inicializar matriz de routing para stereo buses (4 filas x N canales)
    // Por defecto: todo a 0 (se aplicará routing desde el modal)
    this._stereoBusRoutingMatrix = Array.from({ length: 4 }, () =>
      Array(channelCount).fill(0)
    );
    
    // Limpiar array de salidas
    this.stereoBusOutputs = [];
    
    // Crear nodos sumadores para cada stereo bus
    for (const busId of ['A', 'B']) {
      const stereoBus = this.stereoBuses[busId];
      const rowOffset = busId === 'A' ? 0 : 2; // A: rows 0,1, B: rows 2,3
      
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
      
      // Crear channelGains para L (conecta outputL a masterGains)
      const channelGainsL = [];
      for (let ch = 0; ch < channelCount; ch++) {
        const gainNode = ctx.createGain();
        gainNode.gain.value = this._stereoBusRoutingMatrix[rowOffset][ch];
        stereoBus.outputL.connect(gainNode);
        gainNode.connect(this.masterGains[ch]);
        channelGainsL.push(gainNode);
      }
      
      // Crear channelGains para R (conecta outputR a masterGains)
      const channelGainsR = [];
      for (let ch = 0; ch < channelCount; ch++) {
        const gainNode = ctx.createGain();
        gainNode.gain.value = this._stereoBusRoutingMatrix[rowOffset + 1][ch];
        stereoBus.outputR.connect(gainNode);
        gainNode.connect(this.masterGains[ch]);
        channelGainsR.push(gainNode);
      }
      
      // Guardar referencias
      stereoBus.channelGainsL = channelGainsL;
      stereoBus.channelGainsR = channelGainsR;
      
      // Añadir al array de salidas en orden: [0]=Pan1-4L, [1]=Pan1-4R, [2]=Pan5-8L, [3]=Pan5-8R
      this.stereoBusOutputs.push({
        output: stereoBus.outputL,
        channelGains: channelGainsL,
        busId,
        side: 'L'
      });
      this.stereoBusOutputs.push({
        output: stereoBus.outputR,
        channelGains: channelGainsR,
        busId,
        side: 'R'
      });
    }
    
    // Crear nodos de pan para cada outputBus y conectar al stereo bus correspondiente
    for (let i = 0; i < this.outputChannels; i++) {
      const bus = this.outputBuses[i];
      const stereoBusId = i < 4 ? 'A' : 'B';
      const stereoBus = this.stereoBuses[stereoBusId];
      
      // Crear nodos de pan L/R para este canal
      bus.stereoPanL = ctx.createGain();
      bus.stereoPanR = ctx.createGain();
      
      // Conectar desde dcBlockerOut a los nodos de pan (después de DC blocker)
      // La cadena es: muteNode → [dcBlocker] → dcBlockerOut → stereoPan
      bus.dcBlockerOut.connect(bus.stereoPanL);
      bus.dcBlockerOut.connect(bus.stereoPanR);
      
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
  _updateStereoBusPanning(busIndex, ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME) {
    const ctx = this.audioCtx;
    const bus = this.outputBuses[busIndex];
    if (!ctx || !bus?.stereoPanL || !bus?.stereoPanR) return;
    
    const pan = this.outputPans[busIndex] ?? 0;
    // Ley de igual potencia (equal-power panning)
    const angle = (pan + 1) * 0.25 * Math.PI;
    const left = Math.cos(angle);
    const right = Math.sin(angle);
    
    setParamSmooth(bus.stereoPanL.gain, left, ctx, { ramp });
    setParamSmooth(bus.stereoPanR.gain, right, ctx, { ramp });
  }

  /**
   * Configura el routing de una fila de stereo bus a canales físicos.
   * 
   * @param {number} rowIdx - Índice de fila (0=Pan1-4L, 1=Pan1-4R, 2=Pan5-8L, 3=Pan5-8R)
   * @param {number[]} channelGains - Array de ganancias para cada canal físico (0.0 o 1.0)
   */
  setStereoBusRouting(rowIdx, channelGains) {
    if (rowIdx < 0 || rowIdx >= 4) return;
    if (!Array.isArray(channelGains)) return;
    
    const stereoBusOutput = this.stereoBusOutputs[rowIdx];
    if (!stereoBusOutput) return;
    
    const ctx = this.audioCtx;
    
    // Aplicar ganancias a cada channelGain
    channelGains.forEach((gain, ch) => {
      // Guardar en matriz de routing
      if (this._stereoBusRoutingMatrix?.[rowIdx]) {
        this._stereoBusRoutingMatrix[rowIdx][ch] = gain;
      }
      
      // Aplicar al nodo de ganancia si existe
      const gainNode = stereoBusOutput.channelGains?.[ch];
      if (gainNode && ctx) {
        setParamSmooth(gainNode.gain, gain, ctx);
      }
    });
    
    log.debug(`Stereo bus routing row ${rowIdx}: ${channelGains.map(g => g ? 1 : 0).join(',')}`);
  }

  /**
   * Obtiene el routing actual de una fila de stereo bus.
   * 
   * @param {number} rowIdx - Índice de fila (0-3)
   * @returns {number[]} Array de ganancias por canal físico
   */
  getStereoBusRouting(rowIdx) {
    return this._stereoBusRoutingMatrix?.[rowIdx] ?? [];
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
      // 8 canales individuales POST-mute (respetan switch on/off)
      // Cadena: busInput → VCA → postVca → filters → muteNode → out
      individual: this.outputBuses.map(bus => bus.muteNode)
    };
  }

  setOutputPan(busIndex, value, { ramp = AUDIO_CONSTANTS.DEFAULT_RAMP_TIME } = {}) {
    if (busIndex < 0 || busIndex >= this.outputChannels) return;
    this.outputPans[busIndex] = value;
    this._updateStereoBusPanning(busIndex, ramp);
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
   * Fuerza la arquitectura de salida a N canales.
   * Útil para multicanal nativo (Electron) donde no podemos detectar canales
   * via destination.maxChannelCount pero necesitamos 8 canales lógicos.
   * 
   * @param {number} channelCount - Número de canales a forzar
   * @param {string[]} [labels] - Etiquetas opcionales para los canales
   * @param {boolean} [skipDestinationConnect=false] - Si true, no conecta al destination
   * @returns {{ success: boolean, channels: number }}
   */
  forcePhysicalChannels(channelCount, labels = null, skipDestinationConnect = false) {
    if (!this.audioCtx) return { success: false, channels: 2 };
    
    const oldChannels = this.physicalChannels;
    this.physicalChannels = channelCount;
    this.physicalChannelLabels = labels || this._generateChannelLabels(channelCount);
    
    // Guardar flag para _rebuildOutputArchitecture
    this._skipDestinationConnect = skipDestinationConnect;
    
    // Para multicanal nativo, configurar ruteo 1:1 (bus N → canal N)
    // Esto asegura que cada bus vaya a su canal correspondiente
    if (skipDestinationConnect) {
      this._outputRoutingMatrix = [];
      for (let bus = 0; bus < this.outputChannels; bus++) {
        this._outputRoutingMatrix[bus] = Array(channelCount).fill(0);
        // Cada bus va a su canal correspondiente (1:1)
        if (bus < channelCount) {
          this._outputRoutingMatrix[bus][bus] = 1;
        }
      }
      log.info(`Configured 1:1 routing for ${channelCount} channels`);
    }
    
    // Reconstruir arquitectura si el engine está corriendo
    if (this.isRunning && channelCount !== oldChannels) {
      log.info(`Forcing physical channels: ${oldChannels} → ${channelCount}${skipDestinationConnect ? ' (skip destination)' : ''}`);
      this._rebuildOutputArchitecture(channelCount);
      
      // Notificar a listeners externos
      if (this._onPhysicalChannelsChange) {
        this._onPhysicalChannelsChange(channelCount, this.physicalChannelLabels);
      }
    }
    
    return { success: true, channels: channelCount };
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
    
    // Conectar merger al destino (a menos que se indique lo contrario)
    if (!this._skipDestinationConnect) {
      this.merger.connect(ctx.destination);
    } else {
      log.debug('Skipping destination connection (external routing)');
    }
    
    // Reconectar los buses con la nueva matriz de ganancias por canal
    this._rebuildBusConnections(newChannelCount);
    
    // Reconectar stereo buses (Pan 1-4, Pan 5-8) a los nuevos masterGains
    this._rebuildStereoBusConnections(newChannelCount);
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
        
        // Conectar: dcBlockerOut → channelGain → masterGain del canal
        // La cadena completa es: input → [clipper] → VCA → postVca → filtros → muteNode → [dcBlocker] → dcBlockerOut
        // Los channelGains van DESPUÉS del dcBlockerOut (final de la cadena)
        bus.dcBlockerOut.connect(gainNode);
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
   * Reconstruye las conexiones de los stereo buses a los nuevos canales físicos.
   * Similar a _rebuildBusConnections pero para los stereo buses (Pan 1-4, Pan 5-8).
   * Crea nuevos nodos channelGain conectados a los masterGains actuales.
   * 
   * @param {number} channelCount - Número de canales físicos
   * @private
   */
  _rebuildStereoBusConnections(channelCount) {
    const ctx = this.audioCtx;
    if (!ctx || !this.stereoBusOutputs?.length) return;
    
    // Redimensionar la matriz de routing para el nuevo número de canales
    if (this._stereoBusRoutingMatrix) {
      for (let row = 0; row < 4; row++) {
        const oldRow = this._stereoBusRoutingMatrix[row] || [];
        this._stereoBusRoutingMatrix[row] = Array.from(
          { length: channelCount },
          (_, ch) => oldRow[ch] ?? 0
        );
      }
    }
    
    // Reconstruir channelGains para cada stereo bus
    let outputIdx = 0;
    for (const busId of ['A', 'B']) {
      const stereoBus = this.stereoBuses[busId];
      if (!stereoBus) continue;
      const rowOffset = busId === 'A' ? 0 : 2;
      
      // --- Canal L ---
      // Desconectar channelGains antiguos
      stereoBus.channelGainsL?.forEach(g => g?.disconnect());
      
      // Crear nuevos channelGains para L
      const channelGainsL = [];
      for (let ch = 0; ch < channelCount; ch++) {
        const gainNode = ctx.createGain();
        gainNode.gain.value = this._stereoBusRoutingMatrix?.[rowOffset]?.[ch] ?? 0;
        stereoBus.outputL.connect(gainNode);
        gainNode.connect(this.masterGains[ch]);
        channelGainsL.push(gainNode);
      }
      stereoBus.channelGainsL = channelGainsL;
      
      // Actualizar referencia en stereoBusOutputs
      if (this.stereoBusOutputs[outputIdx]) {
        this.stereoBusOutputs[outputIdx].channelGains = channelGainsL;
      }
      outputIdx++;
      
      // --- Canal R ---
      stereoBus.channelGainsR?.forEach(g => g?.disconnect());
      
      const channelGainsR = [];
      for (let ch = 0; ch < channelCount; ch++) {
        const gainNode = ctx.createGain();
        gainNode.gain.value = this._stereoBusRoutingMatrix?.[rowOffset + 1]?.[ch] ?? 0;
        stereoBus.outputR.connect(gainNode);
        gainNode.connect(this.masterGains[ch]);
        channelGainsR.push(gainNode);
      }
      stereoBus.channelGainsR = channelGainsR;
      
      if (this.stereoBusOutputs[outputIdx]) {
        this.stereoBusOutputs[outputIdx].channelGains = channelGainsR;
      }
      outputIdx++;
    }
    
    log.info(`Stereo bus connections rebuilt for ${channelCount} channels`);
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
          './assets/js/worklets/noiseGenerator.worklet.js',
          './assets/js/worklets/cvThermalSlew.worklet.js',
          './assets/js/worklets/cvSoftClip.worklet.js',
          './assets/js/worklets/vcaProcessor.worklet.js',
          './assets/js/worklets/outputFilter.worklet.js',
          './assets/js/worklets/dcBlocker.worklet.js'
        ];
        
        await Promise.all(
          worklets.map(path => this.audioCtx.audioWorklet.addModule(path))
        );
        
        this.workletReady = true;
        log.info('All worklets loaded:', worklets.length);
        
        // Crear nodos AudioWorklet ahora que los módulos están disponibles
        this._initFilterNodes();
        this._initDCBlockerNodes();
      } catch (err) {
        log.error('Failed to load worklet:', err);
        this.workletReady = false;
        telemetryTrackEvent('worklet_fail', { message: err?.message || String(err) });
      }
    })();

    return this._workletLoadPromise;
  }

  /**
   * Crea e inserta los AudioWorkletNode de filtro RC en todos los buses.
   * Se llama automáticamente desde _loadWorklet() tras cargar el módulo,
   * porque AudioWorkletNode requiere que addModule() haya completado.
   * 
   * Reemplaza la conexión temporal filterGain → muteNode (passthrough)
   * por la cadena real: filterGain → filterNode (filtro RC 1er orden) → muteNode
   * 
   * El filterNode implementa un IIR de 1 polo (6 dB/oct) con parámetro
   * filterPosition que controla la respuesta: LP (fc≈677Hz) → plano → HP shelf (+6dB).
   * Los valores del circuito (C=47nF, R=10kΩ) se pasan via processorOptions.
   * 
   * @private
   */
  _initFilterNodes() {
    const ctx = this.audioCtx;
    if (!ctx || !this.outputBuses.length) return;
    
    const filterConfig = outputChannelConfig.audio.filter;
    
    for (let i = 0; i < this.outputBuses.length; i++) {
      const bus = this.outputBuses[i];
      if (!bus || bus.filterNode) continue;  // Ya inicializado
      
      try {
        const filterNode = new AudioWorkletNode(ctx, 'output-filter', {
          channelCount: 1,
          channelCountMode: 'explicit',
          parameterData: { filterPosition: 0 },
          processorOptions: {
            capacitance: filterConfig.capacitance,
            potResistance: filterConfig.potResistance
          }
        });
        attachProcessorErrorHandler(filterNode, `output-filter[bus ${i}]`);
        
        // Desconectar passthrough temporal: filterGain → muteNode
        bus.filterGain.disconnect(bus.muteNode);
        
        // Insertar filterNode en la cadena: filterGain → filterNode → muteNode
        bus.filterGain.connect(filterNode);
        filterNode.connect(bus.muteNode);
        
        bus.filterNode = filterNode;
        
        // Aplicar valor actual del filtro si no es neutral
        const bipolar = this.outputFilters[i] / 5;
        if (Math.abs(bipolar) > 0.001) {
          this._applyFilterValue(i, bipolar);
        }
      } catch (err) {
        log.error(`Failed to create filter node for bus ${i}:`, err);
      }
    }
  }

  /**
   * Crea e inserta los AudioWorkletNode de DC blocker en todos los buses.
   * Se llama automáticamente desde _loadWorklet() tras cargar el módulo.
   * 
   * Reemplaza la conexión temporal muteNode → dcBlockerOut (passthrough)
   * por la cadena real: muteNode → dcBlockerWorklet → dcBlockerOut
   * 
   * El dcBlocker implementa un filtro paso-alto de 1er orden que elimina
   * componentes DC en la ruta hacia altavoces. La re-entry (postVcaNode)
   * NO pasa por este filtro, preservando señales DC legítimas para CV.
   * 
   * fc se lee de outputChannel.config.js (audio.dcBlocker.cutoffFrequency).
   * 
   * @private
   */
  _initDCBlockerNodes() {
    const ctx = this.audioCtx;
    if (!ctx || !this.outputBuses.length) return;
    
    const dcBlockerConfig = outputChannelConfig.audio.dcBlocker;
    
    for (let i = 0; i < this.outputBuses.length; i++) {
      const bus = this.outputBuses[i];
      if (!bus || bus.dcBlockerWorklet) continue;  // Ya inicializado
      
      try {
        const dcBlockerWorklet = new AudioWorkletNode(ctx, 'dc-blocker', {
          channelCount: 1,
          channelCountMode: 'explicit',
          parameterData: {
            cutoffFrequency: dcBlockerConfig.cutoffFrequency
          }
        });
        attachProcessorErrorHandler(dcBlockerWorklet, `dc-blocker[bus ${i}]`);
        
        // Desconectar passthrough temporal: muteNode → dcBlockerOut
        bus.muteNode.disconnect(bus.dcBlockerOut);
        
        // Insertar dcBlockerWorklet en la cadena: muteNode → dcBlockerWorklet → dcBlockerOut
        bus.muteNode.connect(dcBlockerWorklet);
        dcBlockerWorklet.connect(bus.dcBlockerOut);
        
        bus.dcBlockerWorklet = dcBlockerWorklet;
      } catch (err) {
        log.error(`Failed to create DC blocker node for bus ${i}:`, err);
      }
    }
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
      channelCount: 1,             // Importante para que el input reciba señal mono
      channelCountMode: 'explicit', // No cambiar automáticamente el channel count
      processorOptions: { waveform }
    });
    attachProcessorErrorHandler(node, 'synth-oscillator[single]');

    // Establecer valores iniciales
    node.parameters.get('frequency').value = frequency;
    node.parameters.get('pulseWidth').value = pulseWidth;
    node.parameters.get('symmetry').value = symmetry;
    node.parameters.get('gain').value = gain;

    // Métodos de conveniencia
    // ramp = 0 → instantáneo (CV de matriz), ramp > 0 → rampa suave (knob manual)
    node.setFrequency = (value, ramp = 0) => {
      const param = node.parameters.get('frequency');
      const now = this.audioCtx.currentTime;
      param.cancelScheduledValues(now);
      if (ramp > 0) {
        // Rampa exponencial para frecuencia (más natural musicalmente)
        param.setTargetAtTime(value, now, ramp / 3); // τ = ramp/3 para alcanzar ~95% en 'ramp' segundos
      } else {
        param.setValueAtTime(value, now);
      }
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
  
  /**
   * Crea un oscilador multi-waveform con fase maestra unificada.
   * 
   * Todas las formas de onda (sine, saw, tri, pulse) se generan desde
   * una única fase maestra (rampa 0→1), garantizando coherencia perfecta.
   * 
   * SALIDAS:
   * - Output 0: sine + sawtooth
   * - Output 1: triangle + pulse
   * 
   * HARD SYNC:
   * Conectar una señal al input 0 para resetear la fase en cada
   * flanco positivo (zero-crossing ascendente).
   * 
   * @param {Object} options - Opciones iniciales
   * @param {number} [options.frequency=10] - Frecuencia inicial
   * @param {number} [options.pulseWidth=0.5] - Ancho de pulso (0.01-0.99)
   * @param {number} [options.symmetry=0.5] - Simetría sine (0.01-0.99)
   * @param {number} [options.sineLevel=0] - Nivel sine (0-1)
   * @param {number} [options.sawLevel=0] - Nivel sawtooth (0-1)
   * @param {number} [options.triLevel=0] - Nivel triangle (0-1)
   * @param {number} [options.pulseLevel=0] - Nivel pulse (0-1)
   * @param {number} [options.sineShapeAttenuation=1.0] - Atenuación histórica del Shape (0=off, 1=8:1 ratio)
   * @returns {AudioWorkletNode|null} El nodo o null si worklet no disponible
   */
  createMultiOscillator(options = {}) {
    if (!this.audioCtx || !this.workletReady) {
      log.warn('Worklet not ready, cannot create MultiOscillator');
      return null;
    }

    const {
      frequency = 10,
      pulseWidth = 0.5,
      symmetry = 0.5,
      sineLevel = 0,
      sawLevel = 0,
      triLevel = 0,
      pulseLevel = 0,
      // Parámetros de calibración del algoritmo híbrido de seno (oscillator.config.js)
      sineShapeAttenuation = 1.0,
      sinePurity = 0.7,
      saturationK = 1.55,
      maxOffset = 0.85,
      // Tiempo de suavizado para cambios de parámetros (oscillator.config.js)
      smoothingTime = AUDIO_CONSTANTS.FAST_RAMP_TIME,
      // Suavizado inherente del módulo - emula slew rate del CA3140 (oscillator.config.js)
      // Frecuencia de corte del filtro one-pole que suaviza pulse y sawtooth
      moduleSlewCutoff = 20000,
      // Flag para habilitar/deshabilitar el suavizado (para A/B testing)
      moduleSlewEnabled = true
    } = options;

    const node = new AudioWorkletNode(this.audioCtx, 'synth-oscillator', {
      numberOfInputs: 1,  // Input 0: sync signal
      numberOfOutputs: 2, // Output 0: sine+saw, Output 1: tri+pulse
      outputChannelCount: [1, 1],
      channelCount: 1,             // Importante para que el input reciba señal mono
      channelCountMode: 'explicit', // No cambiar automáticamente el channel count
      processorOptions: { 
        mode: 'multi', 
        sineShapeAttenuation, 
        sinePurity,
        saturationK,
        maxOffset,
        // Suavizado inherente del módulo (emula slew rate del CA3140)
        moduleSlewCutoff,
        moduleSlewEnabled
      }
    });
    attachProcessorErrorHandler(node, 'synth-oscillator[multi]');

    // Establecer valores iniciales
    node.parameters.get('frequency').value = frequency;
    node.parameters.get('pulseWidth').value = pulseWidth;
    node.parameters.get('symmetry').value = symmetry;
    node.parameters.get('sineLevel').value = sineLevel;
    node.parameters.get('sawLevel').value = sawLevel;
    node.parameters.get('triLevel').value = triLevel;
    node.parameters.get('pulseLevel').value = pulseLevel;

    const ctx = this.audioCtx;

    // Métodos de conveniencia
    // ramp = 0 → instantáneo (CV de matriz), ramp > 0 → rampa suave (knob manual)
    node.setFrequency = (value, ramp = 0) => {
      const param = node.parameters.get('frequency');
      const now = ctx.currentTime;
      param.cancelScheduledValues(now);
      if (ramp > 0) {
        // Rampa exponencial para frecuencia (más natural musicalmente)
        param.setTargetAtTime(value, now, ramp / 3); // τ = ramp/3 para alcanzar ~95% en 'ramp' segundos
      } else {
        param.setValueAtTime(value, now);
      }
    };

    node.setPulseWidth = (value, ramp = smoothingTime) => {
      const param = node.parameters.get('pulseWidth');
      const now = ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(Math.max(0.01, Math.min(0.99, value)), now, ramp);
    };

    node.setSymmetry = (value, ramp = smoothingTime) => {
      const param = node.parameters.get('symmetry');
      const now = ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(Math.max(0.01, Math.min(0.99, value)), now, ramp);
    };

    node.setSineLevel = (value, ramp = smoothingTime) => {
      const param = node.parameters.get('sineLevel');
      const now = ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, ramp);
    };

    node.setSawLevel = (value, ramp = smoothingTime) => {
      const param = node.parameters.get('sawLevel');
      const now = ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, ramp);
    };

    node.setTriLevel = (value, ramp = smoothingTime) => {
      const param = node.parameters.get('triLevel');
      const now = ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, ramp);
    };

    node.setPulseLevel = (value, ramp = smoothingTime) => {
      const param = node.parameters.get('pulseLevel');
      const now = ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, ramp);
    };

    node.resetPhase = () => {
      node.port.postMessage({ type: 'resetPhase' });
    };

    node.stop = () => {
      node.port.postMessage({ type: 'stop' });
    };

    /**
     * Conecta una señal de sync para hard sync.
     * La fase se resetea en cada flanco positivo de la señal.
     * @param {AudioNode} syncSource - Nodo fuente de sync (típicamente otro oscilador)
     */
    node.connectSync = (syncSource) => {
      syncSource.connect(node, 0, 0);
    };

    /**
     * Cambia la atenuación histórica del Sine Shape en runtime.
     * @param {number} value - Factor de atenuación (0=off, 1=8:1 histórico)
     */
    node.setSineShapeAttenuation = (value) => {
      node.port.postMessage({ type: 'setSineShapeAttenuation', value });
    };

    /**
     * Cambia la pureza del seno en el centro en runtime.
     * @param {number} value - Factor de pureza (0=100% analógico, 1=100% digital puro)
     */
    node.setSinePurity = (value) => {
      node.port.postMessage({ type: 'setSinePurity', value });
    };

    /**
     * Cambia el coeficiente de saturación tanh en runtime.
     * @param {number} value - Factor k (1.0=suave, 1.55=default, 2.0=pronunciado)
     */
    node.setSaturationK = (value) => {
      node.port.postMessage({ type: 'setSaturationK', value });
    };

    /**
     * Cambia el offset máximo de asimetría en runtime.
     * @param {number} value - Offset máximo (0.5=moderado, 0.85=default, 1.0=máximo)
     */
    node.setMaxOffset = (value) => {
      node.port.postMessage({ type: 'setMaxOffset', value });
    };

    return node;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DSP ON/OFF: Suspender y reanudar el motor de audio en vivo
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Suspende el DSP: congela el AudioContext (CPU ~0%) sin destruir el grafo.
   * Los nodos mantienen su estado y se reanudan con resumeDSP().
   * Si el AudioContext no existe aún, simplemente marca dspEnabled = false.
   * @returns {Promise<void>}
   */
  async suspendDSP() {
    this.dspEnabled = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.DSP_ENABLED, 'false');
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        await this.audioCtx.suspend();
        log.info('DSP suspended (AudioContext frozen)');
      } catch (e) {
        log.warn('Error suspending AudioContext:', e);
      }
    }
  }

  /**
   * Reanuda el DSP: descongela el AudioContext si estaba suspendido.
   * Si el AudioContext no existía, lo marca para ser creado en el próximo
   * ensureAudio() (al interactuar con un control).
   * @returns {Promise<void>}
   */
  async resumeDSP() {
    this.dspEnabled = true;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.DSP_ENABLED, 'true');
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
        log.info('DSP resumed (AudioContext running)');
      } catch (e) {
        log.warn('Error resuming AudioContext:', e);
      }
    }
  }

  /**
   * Cierra el AudioContext actual. 
   * Usado antes de reiniciar con diferente latencyHint.
   * @returns {Promise<void>}
   */
  async closeAudioContext() {
    if (this.audioCtx) {
      // Detener todos los módulos primero para que liberen recursos
      for (const m of this.modules) {
        if (m.stop) {
          try {
            m.stop();
          } catch (e) {
            log.warn('Error stopping module:', e);
          }
        }
      }
      
      try {
        await this.audioCtx.close();
        log.info('AudioContext closed');
      } catch (e) {
        log.warn('Error closing AudioContext:', e);
      }
      this.audioCtx = null;
      this.workletReady = false;
      this._workletLoadPromise = null;
      this.isRunning = false;
      // Limpiar buses de salida (se recrearán al reiniciar)
      this.outputBuses = [];
      this.masterGains = [];
    }
  }
  
  /**
   * @returns {string} El latencyHint actual del AudioContext
   */
  getLatencyInfo() {
    const ctx = this.audioCtx;
    if (!ctx) return { baseLatency: null, outputLatency: null };
    return {
      baseLatency: ctx.baseLatency ?? null,
      outputLatency: ctx.outputLatency ?? null
    };
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
    
    // ─────────────────────────────────────────────────────────────────────────
    // VOLTAGE SYSTEM (Cuenca/Datanomics 1982)
    // ─────────────────────────────────────────────────────────────────────────
    // Sistema de emulación de voltajes analógicos. Cada módulo puede definir
    // su propio límite de entrada para soft clipping.
    // ─────────────────────────────────────────────────────────────────────────
    this._inputVoltageLimit = DEFAULT_INPUT_VOLTAGE_LIMIT; // 8V por defecto
    this._softClipEnabled = VOLTAGE_DEFAULTS.softClipEnabled;
  }

  getAudioCtx() {
    return this.engine.audioCtx;
  }
  
  // ───────────────────────────────────────────────────────────────────────────
  // VOLTAGE SYSTEM METHODS
  // ───────────────────────────────────────────────────────────────────────────
  
  /**
   * Configura el límite de voltaje de entrada para este módulo.
   * Señales que excedan este límite serán saturadas suavemente (soft clip).
   * @param {number} limitVolts - Límite en voltios (típicamente 8V para Synthi 100)
   */
  setInputVoltageLimit(limitVolts) {
    this._inputVoltageLimit = limitVolts;
  }
  
  /**
   * Activa o desactiva el soft clipping para este módulo.
   * @param {boolean} enabled
   */
  setSoftClipEnabled(enabled) {
    this._softClipEnabled = enabled;
  }
  
  /**
   * Aplica soft clipping a un valor digital de entrada.
   * Convierte a voltaje, aplica saturación, y devuelve a digital.
   * 
   * @param {number} digitalValue - Valor en rango digital (-1 a 1 típicamente)
   * @param {number} [softness=1.0] - Factor de suavidad (menor = más abrupto)
   * @returns {number} Valor digital saturado
   */
  applyInputClipping(digitalValue, softness = 1.0) {
    if (!this._softClipEnabled) {
      return digitalValue;
    }
    
    // Convertir a voltaje, aplicar clip, convertir de vuelta
    const voltage = digitalToVoltage(digitalValue);
    const clippedVoltage = applySoftClip(voltage, this._inputVoltageLimit, softness);
    return voltageToDigital(clippedVoltage);
  }
  
  /**
   * Aplica soft clipping directamente a un valor en voltios.
   * Útil cuando ya se trabaja en dominio de voltaje.
   * 
   * @param {number} voltage - Valor en voltios
   * @param {number} [softness=1.0] - Factor de suavidad
   * @returns {number} Voltaje saturado
   */
  applyVoltageClipping(voltage, softness = 1.0) {
    if (!this._softClipEnabled) {
      return voltage;
    }
    return applySoftClip(voltage, this._inputVoltageLimit, softness);
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
