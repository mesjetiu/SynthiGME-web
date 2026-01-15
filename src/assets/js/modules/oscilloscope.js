/**
 * OscilloscopeModule - Módulo de osciloscopio dual con modos Y-T y X-Y
 * 
 * Proporciona visualización de señales de audio con dos entradas:
 * - inputY: Señal para eje vertical (y modo Y-T tradicional)
 * - inputX: Señal para eje horizontal (modo X-Y / Lissajous)
 * 
 * @example
 * ```javascript
 * const scope = new OscilloscopeModule(engine, 'scope1');
 * engine.addModule(scope);
 * 
 * // Conectar señales
 * oscillator1.connect(scope.inputY);
 * oscillator2.connect(scope.inputX);
 * 
 * // Crear UI
 * const display = scope.createDisplay(container);
 * ```
 */

import { Module } from '../core/engine.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('OscilloscopeModule');

export class OscilloscopeModule extends Module {
  /**
   * @param {import('../core/engine.js').AudioEngine} engine - Motor de audio
   * @param {string} id - Identificador único del módulo
   */
  constructor(engine, id = 'oscilloscope') {
    super(engine, id, 'Oscilloscope');
    
    // Nodos de entrada (GainNodes para permitir conexiones múltiples)
    this.inputY = null;
    this.inputX = null;
    
    // AudioWorkletNode para captura sincronizada
    this.captureNode = null;
    
    // Datos del último frame capturado
    this.lastData = {
      bufferY: null,
      bufferX: null,
      sampleRate: 44100,
      triggered: false
    };
    
    // Callbacks para actualización de UI
    this._onDataCallbacks = [];
    
    // Estado del worklet
    this.workletReady = false;
    this._workletLoadPromise = null;
    
    // Configuración
    this.mode = 'yt';  // 'yt' (tiempo) o 'xy' (Lissajous)
    this.triggerEnabled = true;
    this.triggerLevel = 0.0;
    this.bufferSize = 1024;
    this.triggerHysteresis = 150;  // Samples de holdoff entre triggers
    this.schmittHysteresis = 0.05; // Histéresis de nivel para Schmitt trigger
  }

  /**
   * Inicia el módulo: crea nodos de audio y carga el worklet.
   */
  async start() {
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    
    // Crear nodos de entrada
    this.inputY = ctx.createGain();
    this.inputY.gain.value = 1.0;
    
    this.inputX = ctx.createGain();
    this.inputX.gain.value = 1.0;
    
    // Cargar y crear worklet
    await this._loadWorklet();
    
    if (this.workletReady) {
      this._createCaptureNode();
    } else {
      log.warn(' Worklet not available, using fallback');
      this._createFallbackCapture();
    }
  }

  /**
   * Carga el AudioWorklet de captura.
   * @private
   */
  async _loadWorklet() {
    if (this._workletLoadPromise) return this._workletLoadPromise;
    
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    
    this._workletLoadPromise = (async () => {
      try {
        const workletPath = './assets/js/worklets/scopeCapture.worklet.js';
        await ctx.audioWorklet.addModule(workletPath);
        this.workletReady = true;
        log.info(' ScopeCapture worklet loaded');
      } catch (err) {
        log.error(' Failed to load worklet:', err);
        this.workletReady = false;
      }
    })();
    
    return this._workletLoadPromise;
  }

  /**
   * Crea el AudioWorkletNode para captura sincronizada.
   * @private
   */
  _createCaptureNode() {
    const ctx = this.getAudioCtx();
    if (!ctx || !this.workletReady) return;
    
    this.captureNode = new AudioWorkletNode(ctx, 'scope-capture', {
      numberOfInputs: 2,
      numberOfOutputs: 0,  // Solo captura, no emite audio
      processorOptions: {
        bufferSize: this.bufferSize,
        triggerHysteresis: this.triggerHysteresis,
        schmittHysteresis: this.schmittHysteresis
      }
    });
    
    // Conectar entradas al worklet
    this.inputY.connect(this.captureNode, 0, 0);
    this.inputX.connect(this.captureNode, 0, 1);
    
    // Recibir datos del worklet
    this.captureNode.port.onmessage = (event) => {
      if (event.data.type === 'scopeData') {
        this.lastData = {
          bufferY: event.data.bufferY,
          bufferX: event.data.bufferX,
          sampleRate: event.data.sampleRate,
          triggered: event.data.triggered,
          validLength: event.data.validLength,  // Longitud de ciclos completos
          isAuto: event.data.isAuto             // Modo auto-trigger activo
        };
        
        // Notificar a los listeners
        for (const callback of this._onDataCallbacks) {
          callback(this.lastData);
        }
      }
    };
    
    // Aplicar configuración inicial
    this._sendConfig();
  }

  /**
   * Fallback usando AnalyserNode cuando worklet no está disponible.
   * Nota: No soporta modo X-Y sincronizado.
   * @private
   */
  _createFallbackCapture() {
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    
    this._analyser = ctx.createAnalyser();
    this._analyser.fftSize = this.bufferSize * 2;
    this._analyserData = new Float32Array(this._analyser.frequencyBinCount);
    
    this.inputY.connect(this._analyser);
    
    // Polling para obtener datos
    this._fallbackInterval = setInterval(() => {
      if (!this._analyser) return;
      
      this._analyser.getFloatTimeDomainData(this._analyserData);
      
      this.lastData = {
        bufferY: this._analyserData.slice(0, this.bufferSize),
        bufferX: new Float32Array(this.bufferSize),  // Vacío en fallback
        sampleRate: ctx.sampleRate,
        triggered: false
      };
      
      for (const callback of this._onDataCallbacks) {
        callback(this.lastData);
      }
    }, 1000 / 60);  // ~60 FPS
  }

  /**
   * Envía configuración al worklet.
   * @private
   */
  _sendConfig() {
    if (!this.captureNode) return;
    
    this.captureNode.port.postMessage({
      type: 'setTriggerEnabled',
      enabled: this.triggerEnabled
    });
    
    this.captureNode.port.postMessage({
      type: 'setTriggerLevel',
      level: this.triggerLevel
    });
  }

  /**
   * Notifica a los listeners que no hay señal (para limpiar display).
   * Se llama cuando se desconectan todas las fuentes.
   */
  _notifyNoSignal() {
    const emptyData = {
      bufferY: new Float32Array(this.bufferSize),
      bufferX: new Float32Array(this.bufferSize),
      sampleRate: this.engine?.audioCtx?.sampleRate || 44100,
      triggered: false,
      noSignal: true
    };
    
    for (const callback of this._onDataCallbacks) {
      callback(emptyData);
    }
  }

  /**
   * Registra un callback para recibir datos de captura.
   * @param {function} callback - Función que recibe { bufferY, bufferX, sampleRate, triggered }
   */
  onData(callback) {
    if (typeof callback === 'function') {
      this._onDataCallbacks.push(callback);
    }
  }

  /**
   * Elimina un callback registrado.
   * @param {function} callback
   */
  offData(callback) {
    const idx = this._onDataCallbacks.indexOf(callback);
    if (idx !== -1) {
      this._onDataCallbacks.splice(idx, 1);
    }
  }

  /**
   * Cambia el modo de visualización.
   * @param {'yt' | 'xy'} mode - 'yt' para tiempo, 'xy' para Lissajous
   */
  setMode(mode) {
    if (mode === 'yt' || mode === 'xy') {
      this.mode = mode;
    }
  }

  /**
   * Activa o desactiva el trigger.
   * @param {boolean} enabled
   */
  setTriggerEnabled(enabled) {
    this.triggerEnabled = enabled;
    if (this.captureNode) {
      this.captureNode.port.postMessage({
        type: 'setTriggerEnabled',
        enabled
      });
    }
  }

  /**
   * Establece el nivel de trigger.
   * @param {number} level - Nivel de -1.0 a 1.0
   */
  setTriggerLevel(level) {
    this.triggerLevel = Math.max(-1, Math.min(1, level));
    if (this.captureNode) {
      this.captureNode.port.postMessage({
        type: 'setTriggerLevel',
        level: this.triggerLevel
      });
    }
  }

  /**
   * Establece el tamaño del buffer de captura.
   * @param {512 | 1024 | 2048 | 4096} size
   */
  setBufferSize(size) {
    if ([512, 1024, 2048, 4096].includes(size)) {
      this.bufferSize = size;
      if (this.captureNode) {
        this.captureNode.port.postMessage({
          type: 'setBufferSize',
          size
        });
      }
    }
  }

  /**
   * Establece la histéresis del trigger (samples de holdoff entre triggers).
   * Valores altos evitan triggers falsos por armónicos/ruido.
   * @param {number} samples - Número de samples a ignorar después de un trigger
   */
  setTriggerHysteresis(samples) {
    this.triggerHysteresis = Math.max(0, Math.floor(samples));
    if (this.captureNode) {
      this.captureNode.port.postMessage({
        type: 'setTriggerHysteresis',
        samples: this.triggerHysteresis
      });
    }
  }

  /**
   * Establece la histéresis de nivel del Schmitt trigger.
   * Crea una "banda muerta" alrededor del nivel de trigger para evitar
   * disparos múltiples cuando la señal oscila cerca del umbral.
   * @param {number} value - Histéresis (0.0 - 0.5, típico 0.05)
   */
  setSchmittHysteresis(value) {
    this.schmittHysteresis = Math.max(0, Math.min(0.5, value));
    if (this.captureNode) {
      this.captureNode.port.postMessage({
        type: 'setSchmittHysteresis',
        value: this.schmittHysteresis
      });
    }
  }

  /**
   * Detiene el módulo y libera recursos.
   */
  stop() {
    if (this.captureNode) {
      this.captureNode.port.postMessage({ type: 'stop' });
      this.captureNode.disconnect();
      this.captureNode = null;
    }
    
    if (this._fallbackInterval) {
      clearInterval(this._fallbackInterval);
      this._fallbackInterval = null;
    }
    
    if (this._analyser) {
      this._analyser.disconnect();
      this._analyser = null;
    }
    
    if (this.inputY) {
      this.inputY.disconnect();
      this.inputY = null;
    }
    
    if (this.inputX) {
      this.inputX.disconnect();
      this.inputX = null;
    }
    
    // Resetear estado del worklet para que se recargue en el nuevo contexto
    this.workletReady = false;
    this._workletLoadPromise = null;
    
    this._onDataCallbacks = [];
  }

  /**
   * Maneja el cambio de estado dormant.
   * Envía mensaje al worklet para pausar captura y ahorra CPU.
   * @param {boolean} dormant - true si entrando en dormancy, false si saliendo
   * @protected
   */
  _onDormancyChange(dormant) {
    if (this.captureNode) {
      try {
        this.captureNode.port.postMessage({ type: 'setDormant', dormant });
        console.log(`[Dormancy] Oscilloscope: ${dormant ? 'DORMANT' : 'ACTIVE'}`);
      } catch (e) {
        // Ignorar errores si el worklet no está listo
      }
    }
  }
}

export default OscilloscopeModule;
