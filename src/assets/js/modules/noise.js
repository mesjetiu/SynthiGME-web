/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NOISE MODULE - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Módulo de audio para generación de ruido, emulando el Noise Generator
 * del EMS Synthi 100 (1971).
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * CARACTERÍSTICAS DEL SYNTHI 100 ORIGINAL
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * El Synthi 100 incluía dos generadores de ruido idénticos con:
 * - Control de "Colour": transición continua entre ruido blanco y rosa
 * - Control de "Level": ganancia de salida
 * - Salida enrutable a la matriz de pines (filas 89-90)
 * 
 * El ruido blanco tiene energía igual en todas las frecuencias (densidad
 * espectral plana), mientras que el ruido rosa tiene energía igual por
 * octava (-3dB/octava), lo que suena más "natural" y "cálido".
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENTACIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Este módulo usa un AudioWorklet (noiseGenerator.worklet.js) que implementa
 * el algoritmo Voss-McCartney para generación de pink noise auténtico,
 * con interpolación suave entre white y pink según el parámetro colour.
 * 
 * Cadena de audio:
 *   [NoiseGeneratorProcessor] → [GainNode (level)] → output
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * USO
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * ```javascript
 * const noise = new NoiseModule(engine, 'noise-1');
 * await noise.start();
 * noise.setColour(0.5);  // 50% white, 50% pink
 * noise.setLevel(0.8);   // 80% ganancia
 * 
 * // Conectar a destino
 * noise.getOutputNode().connect(destination);
 * ```
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * @version 2.0.0 - Refactorizado para usar AudioWorklet con Voss-McCartney
 * @author SynthiGME Team
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Module } from '../core/engine.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('NoiseModule');

export class NoiseModule extends Module {
  
  /**
   * @param {AudioEngine} engine - Instancia del motor de audio
   * @param {string} id - Identificador único del módulo
   * @param {Object} [config={}] - Configuración inicial desde blueprint
   * @param {number} [config.initialColour=0] - Valor inicial de colour (0=white, 1=pink)
   * @param {number} [config.initialLevel=0] - Valor inicial de level (0-1)
   * @param {number} [config.levelSmoothingTime=0.03] - Tiempo de suavizado para level (segundos)
   * @param {number} [config.colourSmoothingTime=0.01] - Tiempo de suavizado para colour (segundos)
   */
  constructor(engine, id, config = {}) {
    super(engine, id, 'Noise Gen');
    
    /**
     * Configuración del módulo, permite override desde blueprint.
     * @type {Object}
     */
    this.config = {
      initialColour: config.initialColour ?? 0,
      initialLevel: config.initialLevel ?? 0,
      levelSmoothingTime: config.levelSmoothingTime ?? 0.03,
      colourSmoothingTime: config.colourSmoothingTime ?? 0.01
    };
    
    /**
     * Nodo AudioWorklet para generación de ruido.
     * @type {AudioWorkletNode|null}
     */
    this.workletNode = null;
    
    /**
     * Nodo de ganancia para control de nivel.
     * @type {GainNode|null}
     */
    this.levelNode = null;
    
    /**
     * Parámetro AudioParam para colour (referencia directa).
     * @type {AudioParam|null}
     */
    this.colourParam = null;
    
    /**
     * Valores actuales de los parámetros.
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
      // Crear nodo de worklet
      this.workletNode = new AudioWorkletNode(ctx, 'noise-generator', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1]
      });
      
      // Guardar referencia al parámetro colour
      this.colourParam = this.workletNode.parameters.get('colour');
      this.colourParam.value = this.values.colour;
      
      // Crear nodo de ganancia para nivel
      this.levelNode = ctx.createGain();
      this.levelNode.gain.value = this.values.level;
      
      // Conectar cadena: worklet → level
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
   * Establece el color del ruido.
   * @param {number} value - Valor de 0 (white) a 1 (pink)
   */
  setColour(value) {
    this.values.colour = Math.max(0, Math.min(1, value));
    
    if (!this.colourParam) return;
    
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    
    const now = ctx.currentTime;
    this.colourParam.cancelScheduledValues(now);
    this.colourParam.setTargetAtTime(
      this.values.colour,
      now,
      this.config.colourSmoothingTime
    );
  }

  /**
   * Establece el nivel de salida.
   * @param {number} value - Valor de 0 a 1
   */
  setLevel(value) {
    this.values.level = Math.max(0, Math.min(1, value));
    
    if (!this.levelNode) return;
    
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    
    const now = ctx.currentTime;
    this.levelNode.gain.cancelScheduledValues(now);
    this.levelNode.gain.setTargetAtTime(
      this.values.level,
      now,
      this.config.levelSmoothingTime
    );
  }

  /**
   * Obtiene el valor actual de colour.
   * @returns {number}
   */
  getColour() {
    return this.values.colour;
  }

  /**
   * Obtiene el valor actual de level.
   * @returns {number}
   */
  getLevel() {
    return this.values.level;
  }

  /**
   * Obtiene el nodo de salida para conexiones externas.
   * Si los nodos no están inicializados, intenta crearlos.
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
   * Obtiene el AudioParam de colour para modulación directa.
   * Permite conectar LFOs u otras fuentes de modulación.
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
}

