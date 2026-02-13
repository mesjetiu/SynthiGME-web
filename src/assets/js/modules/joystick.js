/**
 * ═══════════════════════════════════════════════════════════════════════════
 * JOYSTICK MODULE — Synthi 100 Cuenca (Datanomics 1982)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Módulo de control XY que emula los joysticks del EMS Synthi 100.
 * Genera voltajes DC bipolares para modulación en la matriz de control.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CIRCUITO REAL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Cada joystick tiene dos ejes (X, Y) con potenciómetros 10K LIN.
 * Salida: ±8V DC por eje, centro = 0V exacto.
 * Área de desplazamiento: cuadrada (pese al soporte circular).
 *
 * Controles de rango (Range):
 *   Pots 10K LIN encima del joystick, uno por eje.
 *   Escalan linealmente la magnitud del voltaje de salida.
 *   V_out = posición × (rango/10) donde posición ∈ [-1,+1]
 *
 * Las señales pasan por PC-12 (Joystick Buffer) en modo no balanceado
 * antes de llegar a la matriz de control.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENTACIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Al ser señales puramente DC, se usa ConstantSourceNode nativo (sin worklet):
 *
 *   [ConstantSourceNode (offset = posición)] → [GainNode (gain = rango)] → salida
 *
 * Esto es lo más eficiente posible para señales DC:
 * - ConstantSourceNode: implementación C++ nativa, coste ~0
 * - GainNode: implementación C++ nativa, solo multiplica
 * - Sin JavaScript per-sample, sin worklet, sin messaging
 *
 * Dormancy: cuando ningún eje está conectado a la matriz, el módulo
 * se silencia para evitar procesamiento innecesario en downstream.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   const joy = new JoystickModule(engine, 'joystick-left', {
 *     ramps: { position: 0.01, range: 0.05 }
 *   });
 *   joy.start();
 *   joy.setPosition(0.5, -0.3);  // Mueve la palanca
 *   joy.setRangeX(7);             // Dial 0-10
 *   joy.setRangeY(3);             // Dial 0-10
 *   joy.getOutputNodeX();          // → GainNode para matriz
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * @version 2.0.0 — Reescrito: rango por eje, dormancy, sin worklet
 * @author SynthiGME Team
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Module, setParamSmooth } from '../core/engine.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('JoystickModule');

export class JoystickModule extends Module {

  /**
   * @param {AudioEngine} engine - Instancia del motor de audio
   * @param {string} id - Identificador único (ej: 'joystick-left')
   * @param {Object} [config={}] - Configuración desde joystick.config.js
   * @param {Object} [config.ramps] - Tiempos de rampa
   * @param {number} [config.ramps.position=0.01] - Rampa de posición (s)
   * @param {number} [config.ramps.range=0.05] - Rampa de rango (s)
   */
  constructor(engine, id, config = {}) {
    super(engine, id, 'Joystick');

    /**
     * Configuración del módulo.
     * @type {Object}
     */
    this.config = {
      ramps: {
        position: config.ramps?.position ?? 0.01,
        range: config.ramps?.range ?? 0.05
      }
    };

    // ── Nodos de audio (creados en _initAudioNodes) ────────────────────
    /** @type {ConstantSourceNode|null} */ this.xConst = null;
    /** @type {ConstantSourceNode|null} */ this.yConst = null;
    /** @type {GainNode|null} */          this.xGain = null;
    /** @type {GainNode|null} */          this.yGain = null;

    // ── Estado de posición (bipolar -1..+1) ────────────────────────────
    /** @type {number} */ this.x = 0;
    /** @type {number} */ this.y = 0;

    // ── Estado de rango (escala dial 0-10) ─────────────────────────────
    /** @type {number} */ this._rangeX = 0;
    /** @type {number} */ this._rangeY = 0;

    // ── Flags ──────────────────────────────────────────────────────────
    /** @type {boolean} */ this.isStarted = false;

    // ── Pre-dormant state ──────────────────────────────────────────────
    /** @private */ this._preDormantRangeX = null;
    /** @private */ this._preDormantRangeY = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERSIONES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Convierte la posición del dial de rango (0-10) a ganancia normalizada (0-1).
   * Pot lineal 10K: conversión directa.
   *
   * @param {number} dial - Valor del dial (0-10)
   * @returns {number} Ganancia (0-1)
   */
  _rangeDialToGain(dial) {
    return Math.max(0, Math.min(1, dial / 10));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INICIALIZACIÓN Y CICLO DE VIDA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Inicializa los nodos de audio nativos.
   * @private
   */
  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.xConst) return;

    try {
      // ── Eje X ──────────────────────────────────────────────────────────
      this.xConst = ctx.createConstantSource();
      this.xConst.offset.value = 0;

      this.xGain = ctx.createGain();
      this.xGain.gain.value = this._rangeDialToGain(this._rangeX);

      this.xConst.connect(this.xGain);

      // ── Eje Y ──────────────────────────────────────────────────────────
      this.yConst = ctx.createConstantSource();
      this.yConst.offset.value = 0;

      this.yGain = ctx.createGain();
      this.yGain.gain.value = this._rangeDialToGain(this._rangeY);

      this.yConst.connect(this.yGain);

      // ── Registrar salidas para la matriz ───────────────────────────────
      this.outputs.push(
        { id: 'xOut', kind: 'cv', node: this.xGain, label: `${this.name} X` },
        { id: 'yOut', kind: 'cv', node: this.yGain, label: `${this.name} Y` }
      );
    } catch (error) {
      log.error(`${this.id}] Error inicializando nodos:`, error);
    }
  }

  /**
   * Inicia el módulo. Los ConstantSourceNodes comienzan a producir DC.
   */
  start() {
    if (this.isStarted) return;

    this._initAudioNodes();
    const ctx = this.getAudioCtx();
    if (!ctx) return;

    const t = ctx.currentTime + 0.05;
    try { this.xConst.start(t); } catch { /* ya iniciado */ }
    try { this.yConst.start(t); } catch { /* ya iniciado */ }

    this.isStarted = true;
  }

  /**
   * Detiene el módulo de forma permanente.
   * ConstantSourceNode no se puede reiniciar: habría que recrearlo.
   * @param {number} [time] - Tiempo de parada (opcional)
   */
  stop(time) {
    if (!this.isStarted || !this.xConst) return;

    try {
      this.xConst.stop(time);
      this.yConst.stop(time);
      this.xConst.disconnect();
      this.yConst.disconnect();
      if (this.xGain) this.xGain.disconnect();
      if (this.yGain) this.yGain.disconnect();
    } catch (error) {
      log.error(`${this.id}] Error deteniendo:`, error);
    }

    this.xConst = null;
    this.yConst = null;
    this.xGain = null;
    this.yGain = null;
    this.isStarted = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL DE POSICIÓN
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Establece la posición del joystick (ambos ejes simultáneamente).
   * Se llama desde la interacción de puntero en el pad.
   *
   * @param {number} nx - Posición X normalizada (-1 a +1)
   * @param {number} ny - Posición Y normalizada (-1 a +1)
   */
  setPosition(nx, ny) {
    const x = Math.max(-1, Math.min(1, nx));
    const y = Math.max(-1, Math.min(1, ny));
    this.x = x;
    this.y = y;

    // Durante dormancy, solo guardar valores. Se aplicarán al despertar.
    if (this._isDormant) return;

    const ctx = this.getAudioCtx();
    if (!ctx || !this.xConst || !this.yConst) return;

    // Rampa lineal para interpolación continua entre eventos de puntero (~60fps).
    // linearRampToValueAtTime produce transiciones mucho más suaves que
    // setTargetAtTime para actualizaciones frecuentes de posición.
    const now = ctx.currentTime;
    const rampEnd = now + this.config.ramps.position;
    this.xConst.offset.cancelScheduledValues(now);
    this.xConst.offset.setValueAtTime(this.xConst.offset.value, now);
    this.xConst.offset.linearRampToValueAtTime(x, rampEnd);
    this.yConst.offset.cancelScheduledValues(now);
    this.yConst.offset.setValueAtTime(this.yConst.offset.value, now);
    this.yConst.offset.linearRampToValueAtTime(y, rampEnd);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL DE RANGO
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Establece el rango del eje X (dial 0-10, pot lineal).
   *
   * @param {number} value - Posición del dial (0=sin salida, 10=±8V máximo)
   */
  setRangeX(value) {
    this._rangeX = Math.max(0, Math.min(10, value));

    if (this._isDormant) return;

    if (!this.xGain) return;
    const ctx = this.getAudioCtx();
    if (!ctx) return;

    const gain = this._rangeDialToGain(this._rangeX);
    setParamSmooth(this.xGain.gain, gain, ctx, { ramp: this.config.ramps.range });
  }

  /**
   * Establece el rango del eje Y (dial 0-10, pot lineal).
   *
   * @param {number} value - Posición del dial (0=sin salida, 10=±8V máximo)
   */
  setRangeY(value) {
    this._rangeY = Math.max(0, Math.min(10, value));

    if (this._isDormant) return;

    if (!this.yGain) return;
    const ctx = this.getAudioCtx();
    if (!ctx) return;

    const gain = this._rangeDialToGain(this._rangeY);
    setParamSmooth(this.yGain.gain, gain, ctx, { ramp: this.config.ramps.range });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  /** @returns {number} Posición X actual (-1..+1) */
  getX() { return this.x; }

  /** @returns {number} Posición Y actual (-1..+1) */
  getY() { return this.y; }

  /** @returns {number} Rango X actual (dial 0-10) */
  getRangeX() { return this._rangeX; }

  /** @returns {number} Rango Y actual (dial 0-10) */
  getRangeY() { return this._rangeY; }

  /**
   * Obtiene el nodo de salida del eje X para conexiones de matriz.
   * @returns {GainNode|null}
   */
  getOutputNodeX() {
    if (!this.xGain) this._initAudioNodes();
    return this.xGain;
  }

  /**
   * Obtiene el nodo de salida del eje Y para conexiones de matriz.
   * @returns {GainNode|null}
   */
  getOutputNodeY() {
    if (!this.yGain) this._initAudioNodes();
    return this.yGain;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DORMANCY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Maneja cambio de estado dormant.
   * Al dormir: silencia ambas salidas (gain → 0).
   * Al despertar: restaura rangos y posiciones actuales.
   *
   * @param {boolean} dormant - true para dormir, false para despertar
   * @protected
   */
  _onDormancyChange(dormant) {
    if (!this.xGain || !this.yGain) return;

    const ctx = this.getAudioCtx();
    if (!ctx) return;

    const rampTime = 0.01; // 10ms para evitar clicks

    if (dormant) {
      // Guardar rangos actuales y silenciar
      this._preDormantRangeX = this._rangeX;
      this._preDormantRangeY = this._rangeY;

      try {
        const now = ctx.currentTime;
        this.xGain.gain.cancelScheduledValues(now);
        this.xGain.gain.setTargetAtTime(0, now, rampTime);
        this.yGain.gain.cancelScheduledValues(now);
        this.yGain.gain.setTargetAtTime(0, now, rampTime);
      } catch { /* Ignorar errores de AudioParam */ }
    } else {
      // Restaurar rangos (pueden haber cambiado durante dormancy por patch load)
      const targetGainX = this._rangeDialToGain(this._rangeX);
      const targetGainY = this._rangeDialToGain(this._rangeY);

      try {
        const now = ctx.currentTime;
        this.xGain.gain.cancelScheduledValues(now);
        this.xGain.gain.setTargetAtTime(targetGainX, now, rampTime);
        this.yGain.gain.cancelScheduledValues(now);
        this.yGain.gain.setTargetAtTime(targetGainY, now, rampTime);
      } catch { /* Ignorar errores de AudioParam */ }

      // Resincronizar posiciones (pueden haber cambiado durante dormancy)
      if (this.xConst && this.yConst) {
        try {
          setParamSmooth(this.xConst.offset, this.x, ctx, { ramp: rampTime });
          setParamSmooth(this.yConst.offset, this.y, ctx, { ramp: rampTime });
        } catch { /* Ignorar errores de AudioParam */ }
      }
    }
  }
}
