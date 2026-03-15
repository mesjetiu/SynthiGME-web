// ═══════════════════════════════════════════════════════════════════════════
// Voltmeter — Voltímetro analógico de aguja para Output Channels
// ═══════════════════════════════════════════════════════════════════════════
//
// Implementación digital del circuito Quad Meter Amplifier (PC-13) del
// Synthi 100. Cada instancia monitoriza un bus de salida post-VCA,
// pre-filtro, pre-mute.
//
// Dos modos de operación seleccionables por Toggle:
//
//   Signal Levels (AC) — Escala 0..10, cero a la izquierda.
//     Rectifica la señal de audio (abs + LPF) para mostrar nivel RMS.
//
//   Control Voltages (DC) — Escala -5..+5, centro-cero.
//     Muestra voltaje DC bipolar directo (sin rectificación).
//
// ═══════════════════════════════════════════════════════════════════════════

import { Toggle } from './toggle.js';
import { flashGlow } from './glowManager.js';

// ── Constantes ─────────────────────────────────────────────────────────────

/** Ángulo mínimo de la aguja (grados, cero de la escala) */
const NEEDLE_ANGLE_MIN = -50;
/** Ángulo máximo de la aguja (grados, fondo de escala) */
const NEEDLE_ANGLE_MAX = 50;
/** Rango total de ángulo */
const NEEDLE_ANGLE_RANGE = NEEDLE_ANGLE_MAX - NEEDLE_ANGLE_MIN;

/** Smoothing para modo AC (rectificado, más lento para simular inercia) */
const SMOOTHING_AC = 0.92;
/** Smoothing para modo DC (respuesta más rápida) */
const SMOOTHING_DC = 0.85;

/** Voltaje máximo en modo DC (±5V) */
const DC_MAX_VOLTAGE = 5.0;
/** Nivel máximo en modo AC (escala 0-10, normalizado a 0-1) */
const AC_MAX_LEVEL = 1.0;

/** Intervalo de refresco del medidor (ms) ~30 FPS */
const REFRESH_INTERVAL = 33;

/** Tamaño del buffer para AnalyserNode */
const FFT_SIZE = 256;

export class Voltmeter {
  /**
   * @param {Object} options
   * @param {string} options.id - ID único (ej: 'voltmeter1')
   * @param {number} options.channelIndex - Índice del canal 0-7
   * @param {Function} [options.onChange] - Callback al cambiar modo
   */
  constructor(options = {}) {
    this.id = options.id || `voltmeter-${Date.now()}`;
    this.channelIndex = options.channelIndex ?? 0;
    this.onChange = options.onChange || null;

    // Estado
    this._mode = 'signal';  // 'signal' (AC) o 'control' (DC)
    this._smoothedValue = 0;
    this._currentAngle = NEEDLE_ANGLE_MIN;
    this._animFrameId = null;
    this._intervalId = null;

    // Audio nodes
    this._analyser = null;
    this._timeDomainData = null;

    // DOM
    this.element = null;
    this._needle = null;
    this._toggle = null;
    this._scaleSignal = null;
    this._scaleControl = null;
  }

  /**
   * Crea el elemento DOM completo del voltímetro.
   * @returns {HTMLElement}
   */
  createElement() {
    const root = document.createElement('div');
    root.className = 'voltmeter';
    root.id = this.id;

    // ── SVG del medidor ──────────────────────────────────────────────
    const meterSvg = this._createMeterSVG();
    root.appendChild(meterSvg);

    // ── Toggle Signal/Control ────────────────────────────────────────
    this._toggle = new Toggle({
      id: `${this.id}-toggle`,
      labelA: 'Sig',
      labelB: 'CV',
      initial: 'a',
      onChange: (state) => {
        this._mode = state === 'a' ? 'signal' : 'control';
        this._updateScaleVisibility();
        this._smoothedValue = 0;
        if (this.onChange) this.onChange(this._mode);
      }
    });
    const toggleEl = this._toggle.createElement();
    root.appendChild(toggleEl);

    this.element = root;
    return root;
  }

  /**
   * Crea el SVG del medidor de aguja.
   * @returns {SVGElement}
   */
  _createMeterSVG() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 75');
    svg.setAttribute('class', 'voltmeter__dial');
    svg.setAttribute('aria-hidden', 'true');

    // ── Fondo del medidor ───────────────────────────────────────────
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', '2');
    bg.setAttribute('y', '2');
    bg.setAttribute('width', '116');
    bg.setAttribute('height', '71');
    bg.setAttribute('rx', '4');
    bg.setAttribute('fill', '#0a0a0a');
    bg.setAttribute('stroke', '#333');
    bg.setAttribute('stroke-width', '0.5');
    svg.appendChild(bg);

    // ── Arco de fondo (área de lectura) ─────────────────────────────
    const arcBg = document.createElementNS(ns, 'path');
    const arcPath = this._describeArc(60, 68, 42, -50, 50);
    arcBg.setAttribute('d', arcPath);
    arcBg.setAttribute('fill', 'none');
    arcBg.setAttribute('stroke', '#1a1a1a');
    arcBg.setAttribute('stroke-width', '18');
    svg.appendChild(arcBg);

    // ── Escala Signal Levels (AC) ───────────────────────────────────
    this._scaleSignal = document.createElementNS(ns, 'g');
    this._scaleSignal.setAttribute('class', 'voltmeter__scale-signal');
    this._createACScale(this._scaleSignal, ns);
    svg.appendChild(this._scaleSignal);

    // ── Escala Control Voltages (DC) ────────────────────────────────
    this._scaleControl = document.createElementNS(ns, 'g');
    this._scaleControl.setAttribute('class', 'voltmeter__scale-control');
    this._scaleControl.style.display = 'none';
    this._createDCScale(this._scaleControl, ns);
    svg.appendChild(this._scaleControl);

    // ── Marcas de graduación ────────────────────────────────────────
    this._createTicks(svg, ns);

    // ── Aguja ───────────────────────────────────────────────────────
    const needleGroup = document.createElementNS(ns, 'g');
    needleGroup.setAttribute('class', 'voltmeter__needle-group');

    this._needle = document.createElementNS(ns, 'line');
    this._needle.setAttribute('x1', '60');
    this._needle.setAttribute('y1', '68');
    this._needle.setAttribute('x2', '60');
    this._needle.setAttribute('y2', '22');
    this._needle.setAttribute('class', 'voltmeter__needle');
    this._needle.setAttribute('stroke', '#ff3300');
    this._needle.setAttribute('stroke-width', '1');
    this._needle.setAttribute('stroke-linecap', 'round');
    needleGroup.appendChild(this._needle);

    // Pivote central
    const pivot = document.createElementNS(ns, 'circle');
    pivot.setAttribute('cx', '60');
    pivot.setAttribute('cy', '68');
    pivot.setAttribute('r', '3');
    pivot.setAttribute('fill', '#444');
    pivot.setAttribute('stroke', '#666');
    pivot.setAttribute('stroke-width', '0.5');
    needleGroup.appendChild(pivot);

    svg.appendChild(needleGroup);

    // Posición inicial
    this._setNeedleAngle(NEEDLE_ANGLE_MIN);

    return svg;
  }

  /**
   * Crea las marcas de graduación del medidor.
   */
  _createTicks(svg, ns) {
    const cx = 60, cy = 68, r = 42;
    const tickCount = 11;  // 0 a 10

    for (let i = 0; i <= tickCount - 1; i++) {
      const fraction = i / (tickCount - 1);
      const angle = NEEDLE_ANGLE_MIN + fraction * NEEDLE_ANGLE_RANGE;
      const rad = (angle - 90) * Math.PI / 180;

      // Marcas principales cada 2 unidades, menores en las intermedias
      const isMajor = i % 2 === 0;
      const innerR = isMajor ? r - 5 : r - 3;
      const outerR = r;

      const x1 = cx + innerR * Math.cos(rad);
      const y1 = cy + innerR * Math.sin(rad);
      const x2 = cx + outerR * Math.cos(rad);
      const y2 = cy + outerR * Math.sin(rad);

      const tick = document.createElementNS(ns, 'line');
      tick.setAttribute('x1', String(x1));
      tick.setAttribute('y1', String(y1));
      tick.setAttribute('x2', String(x2));
      tick.setAttribute('y2', String(y2));
      tick.setAttribute('stroke', '#888');
      tick.setAttribute('stroke-width', isMajor ? '1' : '0.5');
      svg.appendChild(tick);
    }
  }

  /**
   * Crea numeración de la escala AC (0-10).
   */
  _createACScale(group, ns) {
    const cx = 60, cy = 68, r = 30;
    const labels = ['0', '', '2', '', '4', '', '6', '', '8', '', '10'];

    for (let i = 0; i < labels.length; i++) {
      if (!labels[i]) continue;
      const fraction = i / (labels.length - 1);
      const angle = NEEDLE_ANGLE_MIN + fraction * NEEDLE_ANGLE_RANGE;
      const rad = (angle - 90) * Math.PI / 180;

      const x = cx + r * Math.cos(rad);
      const y = cy + r * Math.sin(rad);

      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('class', 'voltmeter__scale-text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', '#ccc');
      text.setAttribute('font-size', '6');
      text.textContent = labels[i];
      group.appendChild(text);
    }
  }

  /**
   * Crea numeración de la escala DC (-5..+5, centro-cero).
   */
  _createDCScale(group, ns) {
    const cx = 60, cy = 68, r = 30;
    const labels = ['-5', '', '-3', '', '-1', '0', '+1', '', '+3', '', '+5'];

    for (let i = 0; i < labels.length; i++) {
      if (!labels[i]) continue;
      const fraction = i / (labels.length - 1);
      const angle = NEEDLE_ANGLE_MIN + fraction * NEEDLE_ANGLE_RANGE;
      const rad = (angle - 90) * Math.PI / 180;

      const x = cx + r * Math.cos(rad);
      const y = cy + r * Math.sin(rad);

      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('class', 'voltmeter__scale-text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', '#8cf');
      text.setAttribute('font-size', '6');
      text.textContent = labels[i];
      group.appendChild(text);
    }
  }

  /**
   * Genera un path de arco SVG.
   */
  _describeArc(cx, cy, r, startAngle, endAngle) {
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  /**
   * Actualiza la visibilidad de las escalas según el modo.
   */
  _updateScaleVisibility() {
    if (this._scaleSignal) {
      this._scaleSignal.style.display = this._mode === 'signal' ? '' : 'none';
    }
    if (this._scaleControl) {
      this._scaleControl.style.display = this._mode === 'control' ? '' : 'none';
    }
  }

  /**
   * Establece el ángulo de la aguja (grados).
   * @param {number} angle - Ángulo en grados
   */
  _setNeedleAngle(angle) {
    if (!this._needle) return;
    this._currentAngle = angle;
    this._needle.setAttribute(
      'transform',
      `rotate(${angle}, 60, 68)`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONEXIÓN DE AUDIO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Conecta el voltímetro a un nodo de audio del engine.
   * Crea un AnalyserNode y comienza a leer datos.
   * @param {AudioNode} sourceNode - Nodo fuente (postVcaNode del bus)
   */
  connect(sourceNode) {
    if (!sourceNode || !sourceNode.context) return;

    const ctx = sourceNode.context;
    this._analyser = ctx.createAnalyser();
    this._analyser.fftSize = FFT_SIZE;
    this._analyser.smoothingTimeConstant = 0;
    this._timeDomainData = new Float32Array(this._analyser.fftSize);

    sourceNode.connect(this._analyser);
    this._startReading();
  }

  /**
   * Desconecta el voltímetro del audio.
   */
  disconnect() {
    this._stopReading();
    if (this._analyser) {
      try { this._analyser.disconnect(); } catch (_) { /* ya desconectado */ }
      this._analyser = null;
    }
    this._timeDomainData = null;
    this._smoothedValue = 0;
    this._setNeedleAngle(this._mode === 'signal' ? NEEDLE_ANGLE_MIN : 0);
  }

  /**
   * Inicia la lectura periódica del AnalyserNode.
   */
  _startReading() {
    if (this._intervalId) return;
    this._intervalId = setInterval(() => this._readAndUpdate(), REFRESH_INTERVAL);
  }

  /**
   * Detiene la lectura periódica.
   */
  _stopReading() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  /**
   * Lee datos del AnalyserNode y actualiza la aguja.
   */
  _readAndUpdate() {
    if (!this._analyser || !this._timeDomainData) return;

    this._analyser.getFloatTimeDomainData(this._timeDomainData);

    let targetValue;

    if (this._mode === 'signal') {
      // Modo AC: rectificador + envolvente (valor absoluto medio)
      let sum = 0;
      for (let i = 0; i < this._timeDomainData.length; i++) {
        sum += Math.abs(this._timeDomainData[i]);
      }
      const avgAbs = sum / this._timeDomainData.length;
      // Normalizar: escala 0-1 donde 1 = fondo de escala
      targetValue = Math.min(avgAbs / AC_MAX_LEVEL, 1);
    } else {
      // Modo DC: voltaje medio bipolar
      let sum = 0;
      for (let i = 0; i < this._timeDomainData.length; i++) {
        sum += this._timeDomainData[i];
      }
      const avgDC = sum / this._timeDomainData.length;
      // Normalizar: -1 a +1 donde ±1 = ±5V
      targetValue = Math.max(-1, Math.min(1, avgDC / DC_MAX_VOLTAGE));
    }

    // Aplicar suavizado (balística de la aguja)
    const smoothing = this._mode === 'signal' ? SMOOTHING_AC : SMOOTHING_DC;
    this._smoothedValue = this._smoothedValue * smoothing + targetValue * (1 - smoothing);

    // Convertir valor a ángulo
    let angle;
    if (this._mode === 'signal') {
      // 0 → ángulo mínimo (izquierda), 1 → ángulo máximo (derecha)
      angle = NEEDLE_ANGLE_MIN + this._smoothedValue * NEEDLE_ANGLE_RANGE;
    } else {
      // -1 → ángulo mínimo, 0 → centro, +1 → ángulo máximo
      const normalized = (this._smoothedValue + 1) / 2;
      angle = NEEDLE_ANGLE_MIN + normalized * NEEDLE_ANGLE_RANGE;
    }

    this._setNeedleAngle(angle);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SERIALIZACIÓN
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Serializa el estado del voltímetro.
   * @returns {Object}
   */
  serialize() {
    return {
      mode: this._mode
    };
  }

  /**
   * Restaura el estado del voltímetro.
   * @param {Object} data
   */
  deserialize(data) {
    if (!data) return;
    if (data.mode === 'signal' || data.mode === 'control') {
      this._mode = data.mode;
      const toggleState = this._mode === 'signal' ? 'a' : 'b';
      if (this._toggle) this._toggle.setState(toggleState);
      this._updateScaleVisibility();
    }
  }

  /**
   * Limpia recursos al destruir.
   */
  dispose() {
    this.disconnect();
    this._toggle = null;
    this._needle = null;
    this.element = null;
  }
}
