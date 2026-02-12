/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NOISE MODULE — Synthi 100 Cuenca (Datanomics 1982)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Módulo de audio para generación de ruido, emulando los generadores del
 * EMS Synthi 100 versión Cuenca/GME.
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * CIRCUITO REAL
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Fuente: Unión NP del transistor BC169C polarizada en inversa.
 * Genera ruido impulsivo de espectro plano (white noise), amplificado.
 * 
 * Filtro COLOUR: pot lineal 10kΩ + capacitor → filtro RC de 6 dB/oct
 *   Dial 0:  LP → ruido oscuro/rosa (dark noise, atenúa HF)
 *   Dial 5:  Plano → ruido blanco (white noise, ±3dB 100Hz-10kHz)
 *   Dial 10: HP → ruido brillante/azul (bright noise, +6dB shelf HF)
 * 
 * Nivel: pot logarítmico 10kΩ (audio taper, tipo A), salida bufferizada
 *   Dial 0:  Silencio total
 *   Dial 10: Salida máxima (~3V p-p)
 * 
 * Doble función: fuente de audio (Subgrupo IIA-1/1) y fuente de voltaje
 * de control aleatorio (Subgrupo IIA-2/1). DC-coupled, fmin ≈ 2-3 Hz.
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENTACIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * AudioWorklet genera ruido blanco y aplica filtro IIR de 1er orden
 * (misma topología que outputFilter.worklet.js) controlado por
 * colourPosition.
 * 
 * Cadena de audio:
 *   [NoiseGeneratorProcessor (white noise + colour filter)]
 *       → [GainNode (level, curva LOG)]
 *       → output (matriz Panel 5)
 * 
 * El módulo convierte:
 *   - Dial colour 0-10 → posición bipolar -1..+1 → AudioParam colourPosition
 *   - Dial level 0-10 → ganancia LOG (audio taper) → GainNode.gain
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * USO
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * ```javascript
 * const noise = new NoiseModule(engine, 'noise-1', {
 *   initialColour: 5,
 *   initialLevel: 0,
 *   colourFilter: { potResistance: 10000, capacitance: 33e-9 },
 *   levelCurve: { type: 'log', logBase: 10 }
 * });
 * await noise.start();
 * noise.setColour(3);   // LP, ruido más oscuro
 * noise.setLevel(7);    // ~50% percepción de volumen
 * noise.getOutputNode().connect(destination);
 * ```
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * @version 2.0.0 — Reescrito: filtro COLOUR IIR, nivel LOG, rangos 0-10
 * @author SynthiGME Team
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Module } from '../core/engine.js';
import { createLogger } from '../utils/logger.js';
import { attachProcessorErrorHandler } from '../utils/audio.js';

const log = createLogger('NoiseModule');

export class NoiseModule extends Module {
  
  /**
   * @param {AudioEngine} engine - Instancia del motor de audio
   * @param {string} id - Identificador único del módulo
   * @param {Object} [config={}] - Configuración desde noise.config.js
   * @param {number} [config.initialColour=5] - Valor inicial de colour (0-10, 5=white)
   * @param {number} [config.initialLevel=0] - Valor inicial de level (0-10)
   * @param {number} [config.levelSmoothingTime=0.03] - Tiempo de suavizado para level (s)
   * @param {number} [config.colourSmoothingTime=0.01] - Tiempo de suavizado para colour (s)
   * @param {Object} [config.colourFilter] - Parámetros del filtro RC del colour
   * @param {number} [config.colourFilter.potResistance=10000] - Resistencia del pot (Ω)
   * @param {number} [config.colourFilter.capacitance=33e-9] - Capacitancia (F)
   * @param {Object} [config.levelCurve] - Tipo de curva del pot de nivel
   * @param {string} [config.levelCurve.type='log'] - 'log' para pot logarítmico
   * @param {number} [config.levelCurve.logBase=100] - Base de la curva logarítmica
   * @param {Object} [config.ramps] - Tiempos de rampa para controles manuales
   * @param {number} [config.ramps.colour=0.05] - Rampa del colour (s)
   * @param {number} [config.ramps.level=0.06] - Rampa del level (s)
   */
  constructor(engine, id, config = {}) {
    super(engine, id, 'Noise Gen');
    
    /**
     * Configuración del módulo, permite override desde noise.config.js.
     * @type {Object}
     */
    this.config = {
      initialColour: config.initialColour ?? 5,
      initialLevel: config.initialLevel ?? 0,
      levelSmoothingTime: config.levelSmoothingTime ?? 0.03,
      colourSmoothingTime: config.colourSmoothingTime ?? 0.01,
      colourFilter: {
        potResistance: config.colourFilter?.potResistance ?? 10000,
        capacitance: config.colourFilter?.capacitance ?? 33e-9
      },
      levelCurve: {
        type: config.levelCurve?.type ?? 'log',
        logBase: config.levelCurve?.logBase ?? 100
      },
      ramps: {
        colour: config.ramps?.colour ?? 0.05,
        level: config.ramps?.level ?? 0.06
      }
    };
    
    /**
     * Nodo AudioWorklet para generación de ruido + filtro colour.
     * @type {AudioWorkletNode|null}
     */
    this.workletNode = null;
    
    /**
     * Nodo de ganancia para control de nivel (curva LOG).
     * @type {GainNode|null}
     */
    this.levelNode = null;
    
    /**
     * AudioParam del filtro colour (referencia directa, -1..+1).
     * @type {AudioParam|null}
     */
    this.colourParam = null;
    
    /**
     * Valores actuales de los controles (escala de dial 0-10).
     * @type {Object}
     */
    this.values = {
      colour: this.config.initialColour,
      level: this.config.initialLevel
    };
    
    /**
     * Flag para indicar si el módulo está iniciado.
     * @type {boolean}
     */
    this.isStarted = false;
    
    /**
     * Estado actual del filter bypass (colour en posición neutra).
     * Cuando true, el worklet genera white noise sin IIR.
     * @type {boolean}
     */
    this._colourBypassed = false;
    
    /**
     * Si el filter bypass está habilitado globalmente (setting del usuario).
     * Se sincroniza con el mismo setting que el Output Channel filter bypass.
     * @type {boolean}
     */
    this._filterBypassEnabled = false;
    
    /**
     * Umbral para considerar el colour como neutral (bypass).
     * Mismo valor que FILTER_BYPASS_THRESHOLD del Output Channel.
     * @type {number}
     */
    this._bypassThreshold = 0.02;
  }

  /**
   * Convierte la posición del dial colour (0-10) a posición bipolar (-1..+1)
   * para el AudioParam del filtro IIR en el worklet.
   * 
   *   Dial 0  → -1 (LP, dark/pink)
   *   Dial 5  →  0 (plano, white)
   *   Dial 10 → +1 (HP, bright/blue)
   * 
   * @param {number} dial - Valor del dial (0-10)
   * @returns {number} Posición bipolar (-1..+1)
   */
  _colourDialToPosition(dial) {
    return (dial / 5) - 1;
  }

  /**
   * Convierte la posición del dial level (0-10) a ganancia usando la curva
   * logarítmica del pot real (audio taper, tipo A, ley del 10%).
   * 
   *   gain = (B^(dial/max) - 1) / (B - 1)
   * 
   * donde B = logBase (por defecto 100):
   *   Dial 0:  gain = 0      (silencio)
   *   Dial 5:  gain ≈ 0.091  (-21 dB, percepción ~"mitad volumen")
   *   Dial 10: gain = 1.0    (0 dB, ~3V p-p)
   * 
   * @param {number} dial - Valor del dial (0-10)
   * @returns {number} Ganancia lineal (0-1)
   */
  _levelDialToGain(dial) {
    if (dial <= 0) return 0;
    const base = this.config.levelCurve.logBase;
    const normalized = dial / 10;   // 0..1
    return (Math.pow(base, normalized) - 1) / (base - 1);
  }

  /**
   * Inicializa los nodos de audio.
   * Requiere que el worklet ya esté cargado en el AudioContext.
   * @private
   */
  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) return;
    
    try {
      // Crear nodo de worklet con parámetros del filtro COLOUR
      this.workletNode = new AudioWorkletNode(ctx, 'noise-generator', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          potResistance: this.config.colourFilter.potResistance,
          capacitance: this.config.colourFilter.capacitance
        }
      });
      attachProcessorErrorHandler(this.workletNode, 'noise-generator');
      
      // Referencia al AudioParam del filtro colour (-1..+1)
      this.colourParam = this.workletNode.parameters.get('colourPosition');
      this.colourParam.value = this._colourDialToPosition(this.values.colour);
      
      // GainNode para nivel de salida (curva LOG del pot real)
      this.levelNode = ctx.createGain();
      this.levelNode.gain.value = this._levelDialToGain(this.values.level);
      
      // Cadena: worklet (noise + colour filter) → level → output
      this.workletNode.connect(this.levelNode);
      
      // Registrar salida para la matriz
      this.outputs.push({
        id: 'audioOut',
        kind: 'audio',
        node: this.levelNode,
        label: 'Noise OUT'
      });
      
    } catch (error) {
      log.error(`${this.id}] Error inicializando nodos:`, error);
    }
  }

  /**
   * Inicia el módulo de ruido.
   * El worklet comienza a generar audio inmediatamente.
   */
  start() {
    if (this.isStarted) return;
    
    this._initAudioNodes();
    this.isStarted = true;
  }

  /**
   * Detiene el módulo de ruido.
   * @param {number} [time] - Tiempo en el que detener (opcional)
   */
  stop(time) {
    if (!this.isStarted || !this.workletNode) return;
    
    try {
      // Enviar mensaje al worklet para que detenga el procesamiento
      this.workletNode.port.postMessage({ type: 'stop' });
      
      // Desconectar nodos
      this.workletNode.disconnect();
      if (this.levelNode) {
        this.levelNode.disconnect();
      }
      
      this.workletNode = null;
      this.levelNode = null;
      this.colourParam = null;
      this.isStarted = false;
      
    } catch (error) {
      log.error(`${this.id}] Error deteniendo:`, error);
    }
  }

  /**
   * Establece el colour del ruido (dial 0-10).
   * Convierte internamente a posición bipolar para el filtro IIR.
   * Gestiona el filter bypass cuando el colour está en posición neutra.
   * 
   * @param {number} value - Posición del dial (0=LP dark, 5=white, 10=HP bright)
   */
  setColour(value) {
    this.values.colour = Math.max(0, Math.min(10, value));
    
    // Si estamos en dormancy, solo guardar el valor. Se aplicará al despertar.
    if (this._isDormant) return;
    
    if (!this.colourParam) return;
    
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    
    const position = this._colourDialToPosition(this.values.colour);
    
    // Gestionar filter bypass
    this._updateColourBypass(position);
    
    const now = ctx.currentTime;
    this.colourParam.cancelScheduledValues(now);
    this.colourParam.setTargetAtTime(
      position,
      now,
      this.config.ramps.colour / 3
    );
  }

  /**
   * Establece el nivel de salida (dial 0-10, curva LOG).
   * Convierte internamente a ganancia lineal usando la curva del pot real.
   * 
   * @param {number} value - Posición del dial (0=silencio, 10=máximo ~3V p-p)
   */
  setLevel(value) {
    this.values.level = Math.max(0, Math.min(10, value));
    
    // Si estamos en dormancy, actualizar también el nivel guardado para que
    // al despertar se restaure el valor correcto (fix: patch load race condition)
    if (this._isDormant) {
      this._preDormantLevel = this.values.level;
      return; // No tocar AudioParam mientras dormant (está silenciado)
    }
    
    if (!this.levelNode) return;
    
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    
    const gain = this._levelDialToGain(this.values.level);
    const now = ctx.currentTime;
    this.levelNode.gain.cancelScheduledValues(now);
    this.levelNode.gain.setTargetAtTime(
      gain,
      now,
      this.config.ramps.level / 3
    );
  }

  /**
   * Obtiene el valor actual de colour (escala de dial 0-10).
   * @returns {number}
   */
  getColour() {
    return this.values.colour;
  }

  /**
   * Obtiene el valor actual de level (escala de dial 0-10).
   * @returns {number}
   */
  getLevel() {
    return this.values.level;
  }

  /**
   * Obtiene el nodo de salida para conexiones externas.
   * Si los nodos no están inicializados, intenta crearlos (lazy init).
   * @returns {GainNode|null}
   */
  getOutputNode() {
    // Si no hay levelNode, intentar inicializar (lazy init)
    if (!this.levelNode) {
      this._initAudioNodes();
    }
    return this.levelNode;
  }

  /**
   * Obtiene el AudioParam de colour para modulación directa (CV).
   * Permite conectar LFOs u otras fuentes de modulación.
   * Rango: -1 (LP) a +1 (HP), 0 = plano.
   * @returns {AudioParam|null}
   */
  getColourParam() {
    return this.colourParam;
  }

  /**
   * Obtiene el AudioParam de level para modulación directa.
   * @returns {AudioParam|null}
   */
  getLevelParam() {
    return this.levelNode?.gain ?? null;
  }
  
  /**
   * Habilita o deshabilita el filter bypass del colour.
   * Cuando habilitado, el worklet puede saltar el IIR si p ≈ 0 (white noise).
   * Se conecta al mismo setting global que el filter bypass del Output Channel.
   * 
   * @param {boolean} enabled - true para habilitar bypass
   */
  setFilterBypassEnabled(enabled) {
    this._filterBypassEnabled = !!enabled;
    
    if (this.workletNode) {
      try {
        // Si se deshabilita, forzar desactivación del bypass
        const bypassed = enabled && Math.abs(this._colourDialToPosition(this.values.colour)) < this._bypassThreshold;
        this.workletNode.port.postMessage({ type: 'setFilterBypassed', bypassed });
        this._colourBypassed = bypassed;
      } catch (e) {
        // Ignorar errores si el worklet no está listo
      }
    }
  }
  
  /**
   * Actualiza el estado de bypass del filtro colour según la posición actual.
   * Se llama internamente desde setColour().
   * 
   * @param {number} position - Posición bipolar del colour (-1..+1)
   * @private
   */
  _updateColourBypass(position) {
    if (!this._filterBypassEnabled || !this.workletNode) return;
    
    const isNeutral = Math.abs(position) < this._bypassThreshold;
    
    if (isNeutral !== this._colourBypassed) {
      try {
        this.workletNode.port.postMessage({ type: 'setFilterBypassed', bypassed: isNeutral });
        this._colourBypassed = isNeutral;
      } catch (e) {
        // Ignorar errores si el worklet no está listo
      }
    }
  }
  
  /**
   * Maneja el cambio de estado dormant.
   * Envía mensaje al worklet para early exit y silencia la salida.
   * @param {boolean} dormant - true si entrando en dormancy, false si saliendo
   * @protected
   */
  _onDormancyChange(dormant) {
    // Enviar mensaje al worklet para early exit (ahorra CPU)
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: 'setDormant', dormant });
      } catch (e) {
        // Ignorar errores si el worklet no está listo
      }
    }
    
    if (!this.levelNode) return;
    
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    
    const rampTime = 0.01; // 10ms para evitar clicks
    const now = ctx.currentTime;
    
    if (dormant) {
      // Guardar nivel actual y silenciar
      this._preDormantLevel = this.values.level;
      try {
        this.levelNode.gain.cancelScheduledValues(now);
        this.levelNode.gain.setTargetAtTime(0, now, rampTime);
      } catch { /* Ignorar errores de AudioParam */ }
    } else {
      // Restaurar nivel actual (puede haber cambiado durante dormancy por patch load)
      const targetGain = this._levelDialToGain(this.values.level);
      try {
        this.levelNode.gain.cancelScheduledValues(now);
        this.levelNode.gain.setTargetAtTime(targetGain, now, rampTime);
      } catch { /* Ignorar errores de AudioParam */ }
      
      // Resincronizar colour AudioParam (puede haber cambiado durante dormancy)
      if (this.colourParam) {
        const position = this._colourDialToPosition(this.values.colour);
        try {
          this.colourParam.cancelScheduledValues(now);
          this.colourParam.setTargetAtTime(position, now, rampTime);
        } catch { /* Ignorar errores de AudioParam */ }
        this._updateColourBypass(position);
      }
    }
  }
}
