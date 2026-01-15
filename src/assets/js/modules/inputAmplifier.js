/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INPUT AMPLIFIER MODULE - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Módulo de audio para los 8 canales de entrada del sintetizador,
 * emulando los Input Amplifiers del EMS Synthi 100 (1971).
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * CARACTERÍSTICAS DEL SYNTHI 100 ORIGINAL
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * El Synthi 100 incluía 8 amplificadores de entrada (Rows 1-8 en la matriz),
 * cada uno con un control de nivel (Level) que ajustaba la ganancia de
 * señales externas antes de entrar a la matriz de ruteo principal.
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENTACIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Este módulo gestiona los 8 canales de entrada:
 * - Cada canal tiene un GainNode para control de nivel (0-1)
 * - Las salidas se registran para conexión a la matriz (Panel 5)
 * 
 * Cadena de audio por canal:
 *   [Input] → [GainNode (level)] → output (a matriz)
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * USO
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * ```javascript
 * const inputAmps = new InputAmplifierModule(engine, 'input-amplifiers');
 * await inputAmps.start();
 * inputAmps.setLevel(0, 0.8);  // Canal 1 al 80%
 * inputAmps.setLevel(1, 0.5);  // Canal 2 al 50%
 * 
 * // Conectar fuente externa al canal 1
 * sourceNode.connect(inputAmps.getInputNode(0));
 * ```
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * @version 1.0.0
 * @author SynthiGME Team
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Module } from '../core/engine.js';

export class InputAmplifierModule extends Module {
  
  /**
   * @param {AudioEngine} engine - Instancia del motor de audio
   * @param {string} id - Identificador único del módulo
   * @param {Object} [config={}] - Configuración inicial desde blueprint
   * @param {number} [config.channels=8] - Número de canales de entrada
   * @param {number} [config.initialLevel=0] - Nivel inicial para todos los canales (0-1)
   * @param {number} [config.levelSmoothingTime=0.03] - Tiempo de suavizado para cambios de nivel
   */
  constructor(engine, id, config = {}) {
    super(engine, id, 'Input Amp');
    
    /**
     * Configuración del módulo
     * @type {Object}
     */
    this.config = {
      channels: config.channels ?? 8,
      initialLevel: config.initialLevel ?? 0,
      levelSmoothingTime: config.levelSmoothingTime ?? 0.03
    };
    
    /**
     * Nodos de ganancia, uno por canal
     * @type {GainNode[]}
     */
    this.gainNodes = [];
    
    /**
     * Niveles actuales por canal
     * @type {number[]}
     */
    this.levels = new Array(this.config.channels).fill(this.config.initialLevel);
    
    /**
     * Estado de inicialización
     * @type {boolean}
     */
    this.isStarted = false;
  }

  /**
   * Inicializa los nodos de audio para cada canal
   * @private
   */
  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.gainNodes.length > 0) return;
    
    for (let i = 0; i < this.config.channels; i++) {
      const gain = ctx.createGain();
      gain.gain.value = this.levels[i];
      
      this.gainNodes.push(gain);
      
      // Registrar salida para la matriz de ruteo
      this.outputs.push({
        id: `channel-${i + 1}`,
        kind: 'audio',
        node: gain,
        label: `Channel ${i + 1}`
      });
    }
  }

  /**
   * Inicia el módulo
   */
  async start() {
    this._initAudioNodes();
    this.isStarted = true;
  }

  /**
   * Detiene el módulo
   */
  stop() {
    this.isStarted = false;
    // Los GainNodes no necesitan cleanup especial
  }

  /**
   * Establece el nivel de un canal
   * @param {number} channel - Índice del canal (0-7)
   * @param {number} level - Nivel de ganancia (0-1)
   */
  setLevel(channel, level) {
    if (channel < 0 || channel >= this.config.channels) return;
    
    const clampedLevel = Math.max(0, Math.min(1, level));
    this.levels[channel] = clampedLevel;
    
    const gain = this.gainNodes[channel];
    if (gain) {
      const ctx = this.getAudioCtx();
      const now = ctx?.currentTime ?? 0;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(clampedLevel, now, this.config.levelSmoothingTime);
    }
  }

  /**
   * Obtiene el nivel actual de un canal
   * @param {number} channel - Índice del canal (0-7)
   * @returns {number}
   */
  getLevel(channel) {
    return this.levels[channel] ?? 0;
  }

  /**
   * Obtiene el nodo de entrada de un canal (para conectar fuentes externas)
   * @param {number} channel - Índice del canal (0-7)
   * @returns {GainNode|null}
   */
  getInputNode(channel) {
    return this.gainNodes[channel] ?? null;
  }

  /**
   * Obtiene el nodo de salida de un canal
   * @param {number} channel - Índice del canal (0-7)
   * @returns {GainNode|null}
   */
  getOutputNode(channel) {
    return this.gainNodes[channel] ?? null;
  }

  /**
   * Obtiene todos los nodos de salida
   * @returns {GainNode[]}
   */
  getAllOutputNodes() {
    return [...this.gainNodes];
  }

  /**
   * Maneja el cambio de estado dormant.
   * Cuando dormant, silencia todos los canales para evitar procesamiento innecesario.
   * @param {boolean} dormant - true si entrando en dormancy, false si saliendo
   * @protected
   */
  _onDormancyChange(dormant) {
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    
    const rampTime = 0.01;
    const now = ctx.currentTime;
    
    if (dormant) {
      // Guardar niveles y silenciar todos los canales
      this._preDormantLevels = [...this.levels];
      for (const gain of this.gainNodes) {
        if (gain) {
          try {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setTargetAtTime(0, now, rampTime);
          } catch { /* Ignorar */ }
        }
      }
      console.log(`[Dormancy] InputAmplifiers: DORMANT`);
    } else {
      // Restaurar niveles previos
      const savedLevels = this._preDormantLevels || this.levels;
      for (let i = 0; i < this.gainNodes.length; i++) {
        const gain = this.gainNodes[i];
        if (gain) {
          try {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setTargetAtTime(savedLevels[i] || 0, now, rampTime);
          } catch { /* Ignorar */ }
        }
      }
      console.log(`[Dormancy] InputAmplifiers: ACTIVE`);
    }
  }
}
