/**
 * OscilloscopeDisplay - Componente de visualización para osciloscopio
 * 
 * Renderiza señales de audio en un canvas con dos modos:
 * - Y-T: Eje X = tiempo, Eje Y = amplitud (forma de onda tradicional)
 * - X-Y: Eje X = señal X, Eje Y = señal Y (figuras de Lissajous)
 * 
 * @example
 * ```javascript
 * const display = new OscilloscopeDisplay({
 *   container: document.getElementById('scope-container'),
 *   width: 300,
 *   height: 200
 * });
 * 
 * // Conectar a un OscilloscopeModule
 * scopeModule.onData(data => display.draw(data));
 * 
 * // Cambiar modo
 * display.setMode('xy');
 * ```
 */

export class OscilloscopeDisplay {
  /**
   * @param {Object} options - Opciones de configuración
   * @param {HTMLElement} [options.container] - Contenedor donde insertar el canvas
   * @param {HTMLCanvasElement} [options.canvas] - Canvas existente (alternativa a container)
   * @param {number} [options.width=300] - Ancho del canvas
   * @param {number} [options.height=200] - Alto del canvas
   * @param {string} [options.mode='yt'] - Modo inicial: 'yt' o 'xy'
   * @param {string} [options.lineColor='#0f0'] - Color de la línea de señal
   * @param {string} [options.bgColor='#000'] - Color de fondo
   * @param {string} [options.gridColor='#1a1a1a'] - Color de la cuadrícula
   * @param {string} [options.centerColor='#333'] - Color de líneas centrales
   * @param {number} [options.lineWidth=2] - Grosor de la línea de señal * @param {number} [options.glowBlur=0] - Intensidad del blur para efecto glow CRT (0 = desactivado)
 * @param {string} [options.glowColor=null] - Color del glow (null = usa lineColor)   * @param {boolean} [options.showGrid=true] - Mostrar cuadrícula
   * @param {boolean} [options.showTriggerIndicator=true] - Mostrar indicador de trigger
   */
  constructor(options = {}) {
    const {
      container,
      canvas,
      // Resolución interna fija (alta resolución)
      internalWidth = 600,
      internalHeight = 450,
      useDevicePixelRatio = true,
      mode = 'yt',
      lineColor = '#0f0',
      bgColor = '#000',
      gridColor = '#1a1a1a',
      centerColor = '#333',
      lineWidth = 2,
      glowBlur = 0,              // Efecto glow CRT (0 = desactivado)
      glowColor = null,          // Color del glow (null = usa lineColor)
      showGrid = true,
      showTriggerIndicator = true
    } = options;
    
    // Calcular resolución real (con soporte Retina)
    const dpr = useDevicePixelRatio ? (window.devicePixelRatio || 1) : 1;
    const realWidth = Math.round(internalWidth * dpr);
    const realHeight = Math.round(internalHeight * dpr);
    
    // Crear o usar canvas existente
    if (canvas) {
      this.canvas = canvas;
    } else {
      this.canvas = document.createElement('canvas');
      // Resolución interna alta
      this.canvas.width = realWidth;
      this.canvas.height = realHeight;
      // Tamaño visual escalado con CSS (ocupa 100% del contenedor)
      this.canvas.style.cssText = `
        display: block;
        width: 100%;
        height: 100%;
        background: ${bgColor};
        border-radius: 4px;
      `;
      
      if (container) {
        container.appendChild(this.canvas);
      }
    }
    
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.dpr = dpr;
    
    // Configuración visual
    this.mode = mode;
    this.lineColor = lineColor;
    this.bgColor = bgColor;
    this.gridColor = gridColor;
    this.centerColor = centerColor;
    this.lineWidth = lineWidth;
    this.glowBlur = glowBlur;
    this.glowColor = glowColor || lineColor;
    this.showGrid = showGrid;
    this.showTriggerIndicator = showTriggerIndicator;
    
    // Escalas de visualización (controladas por knobs)
    this.timeScale = 1.0;        // 1.0 = todo el buffer, 0.1 = 10% (zoom)
    this.ampScale = 1.0;         // 1.0 = normal, 2.0 = amplifica, 0.5 = reduce
    
    // Estado
    this.lastTriggered = false;
    this.animationId = null;
    this.lastData = null;
    
    // ─────────────────────────────────────────────────────────────────────────
    // SINCRONIZACIÓN CON requestAnimationFrame
    // ─────────────────────────────────────────────────────────────────────────
    // El worklet envía datos a ~43 Hz, pero el monitor refresca a 60+ Hz.
    // Para evitar "tearing" y temblores, solo dibujamos en el frame del navegador.
    // ─────────────────────────────────────────────────────────────────────────
    this._pendingData = null;      // Datos pendientes de dibujar
    this._rafId = null;            // ID del requestAnimationFrame activo
    this._isRunning = false;       // Si el loop de animación está activo
  }

  /**
   * Inicia el loop de renderizado sincronizado con el monitor.
   * Debe llamarse una vez después de crear el display.
   */
  startRenderLoop() {
    if (this._isRunning) return;
    this._isRunning = true;
    this._renderFrame();
  }

  /**
   * Detiene el loop de renderizado.
   */
  stopRenderLoop() {
    this._isRunning = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * Frame de renderizado interno.
   * Solo dibuja si hay datos nuevos pendientes.
   * @private
   */
  _renderFrame() {
    if (!this._isRunning) return;
    
    // Solo dibujar si hay datos nuevos
    if (this._pendingData) {
      this._drawInternal(this._pendingData);
      this._pendingData = null;
    }
    
    // Programar siguiente frame
    this._rafId = requestAnimationFrame(() => this._renderFrame());
  }

  /**
   * Actualiza los datos a dibujar (sin dibujar inmediatamente).
   * El siguiente frame de animación dibujará estos datos.
   * @param {Object} data - Datos del osciloscopio
   */
  updateData(data) {
    this._pendingData = data;
    this.lastData = data;
  }

  /**
   * Establece la escala de tiempo (horizontal).
   * @param {number} scale - 0.1 a 1.0 (1.0 = todo el buffer)
   */
  setTimeScale(scale) {
    this.timeScale = Math.max(0.1, Math.min(1.0, scale));
    if (this.lastData) this.draw(this.lastData);
  }

  /**
   * Establece la escala de amplitud (vertical).
   * @param {number} scale - 0.25 a 4.0 (1.0 = normal)
   */
  setAmpScale(scale) {
    this.ampScale = Math.max(0.25, Math.min(4.0, scale));
    if (this.lastData) this.draw(this.lastData);
  }

  /**
   * Cambia el modo de visualización.
   * @param {'yt' | 'xy'} mode
   */
  setMode(mode) {
    if (mode === 'yt' || mode === 'xy') {
      this.mode = mode;
      // Redibujar con los últimos datos
      if (this.lastData) {
        this.draw(this.lastData);
      }
    }
  }

  /**
   * Obtiene el modo actual.
   * @returns {'yt' | 'xy'}
   */
  getMode() {
    return this.mode;
  }

  /**
   * Alterna entre modos.
   * @returns {'yt' | 'xy'} El nuevo modo
   */
  toggleMode() {
    this.setMode(this.mode === 'yt' ? 'xy' : 'yt');
    return this.mode;
  }

  /**
   * Dibuja la cuadrícula de fondo.
   * @private
   */
  _drawGrid() {
    const { ctx, width, height, gridColor, centerColor } = this;
    
    // Cuadrícula 5x5
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    
    const gridDivisions = 4;
    
    // Líneas horizontales
    for (let i = 0; i <= gridDivisions; i++) {
      const y = (height / gridDivisions) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Líneas verticales
    for (let i = 0; i <= gridDivisions; i++) {
      const x = (width / gridDivisions) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Líneas centrales (más visibles)
    ctx.strokeStyle = centerColor;
    
    // Horizontal central
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    // Vertical central
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
  }

  /**
   * Dibuja el indicador de trigger con estado AUTO/TRIG.
   * @param {boolean} triggered - Si se detectó trigger
   * @param {boolean} [isAuto=false] - Si está en modo auto-trigger
   * @private
   */
  _drawTriggerIndicator(triggered, isAuto = false) {
    if (!this.showTriggerIndicator) return;
    
    const { ctx, width } = this;
    const radius = 5;
    const x = width - radius - 5;
    const y = radius + 5;
    
    // LED de estado
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    
    if (isAuto) {
      // Modo AUTO: amarillo/naranja
      ctx.fillStyle = '#f90';
    } else if (triggered) {
      // Trigger válido: verde
      ctx.fillStyle = '#0f0';
    } else {
      // Sin trigger: rojo oscuro
      ctx.fillStyle = '#600';
    }
    ctx.fill();
    
    // Etiqueta de texto
    ctx.font = '8px monospace';
    ctx.fillStyle = isAuto ? '#f90' : (triggered ? '#0f0' : '#600');
    ctx.textAlign = 'right';
    ctx.fillText(isAuto ? 'AUTO' : 'TRIG', x - radius - 3, y + 3);
  }

  /**
   * Dibuja en modo Y-T (forma de onda tradicional).
   * @param {Float32Array} bufferY - Datos de la señal Y
   * @param {boolean} triggered - Si se detectó trigger
   * @param {number} [validLength] - Longitud válida (ciclos completos)
   * @private
   */
  _drawYT(bufferY, triggered, validLength) {
    const { ctx, width, height, lineColor, lineWidth, glowBlur, glowColor, timeScale, ampScale } = this;
    
    if (!bufferY || bufferY.length === 0) return;
    
    // Usar validLength si está disponible, sino todo el buffer
    const baseLength = validLength && validLength > 0 ? validLength : bufferY.length;
    // Aplicar timeScale: cuántos samples mostrar
    const effectiveLength = Math.floor(baseLength * timeScale);
    
    // Aplicar efecto glow CRT (fosforescencia)
    if (glowBlur > 0) {
      ctx.shadowBlur = glowBlur;
      ctx.shadowColor = glowColor;
    }
    
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = lineColor;
    ctx.lineCap = 'round';      // Puntas redondeadas para aspecto suave
    ctx.lineJoin = 'round';     // Uniones redondeadas
    ctx.beginPath();
    
    // Calcular cuántos samples por píxel (basado en longitud efectiva con timeScale)
    const samplesPerPixel = effectiveLength / width;
    let firstPoint = true;
    const centerY = height / 2;
    
    for (let px = 0; px < width; px++) {
      // Índices del rango de samples para este píxel
      const startIdx = Math.floor(px * samplesPerPixel);
      const endIdx = Math.min(Math.ceil((px + 1) * samplesPerPixel), effectiveLength);
      
      // Encontrar min y max del rango (técnica de osciloscopio real)
      let minV = bufferY[startIdx] ?? 0;
      let maxV = minV;
      for (let i = startIdx + 1; i < endIdx; i++) {
        const v = bufferY[i];
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
      
      // Aplicar ampScale (escalar desde el centro)
      const scaledMinV = minV * ampScale;
      const scaledMaxV = maxV * ampScale;
      
      // Mapear -1..1 a height..0 (invertido para que positivo vaya arriba)
      // Clamp para evitar dibujar fuera del canvas
      const yMin = Math.max(0, Math.min(height, ((1 - scaledMaxV) / 2) * height));
      const yMax = Math.max(0, Math.min(height, ((1 - scaledMinV) / 2) * height));
      
      if (firstPoint) {
        ctx.moveTo(px, yMin);
        firstPoint = false;
      } else {
        ctx.lineTo(px, yMin);
      }
      // Si hay diferencia significativa, dibujar línea vertical
      if (yMax - yMin > 1) {
        ctx.lineTo(px, yMax);
      }
    }
    
    ctx.stroke();
    
    // Resetear efecto glow para no afectar otros elementos
    if (this.glowBlur > 0) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }
    
    this._drawTriggerIndicator(triggered);
  }

  /**
   * Dibuja en modo X-Y (Lissajous).
   * @param {Float32Array} bufferX - Datos de la señal X
   * @param {Float32Array} bufferY - Datos de la señal Y
   * @private
   */
  _drawXY(bufferX, bufferY) {
    const { ctx, width, height, lineColor, lineWidth, glowBlur, glowColor } = this;
    
    if (!bufferX || !bufferY || bufferX.length === 0) return;
    
    const len = Math.min(bufferX.length, bufferY.length);
    
    // Aplicar efecto glow CRT (fosforescencia)
    if (glowBlur > 0) {
      ctx.shadowBlur = glowBlur;
      ctx.shadowColor = glowColor;
    }
    
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = lineColor;
    ctx.lineCap = 'round';      // Puntas redondeadas para aspecto suave
    ctx.lineJoin = 'round';     // Uniones redondeadas
    ctx.beginPath();
    
    // Decimar samples para suavizar (usar ~width puntos)
    const targetPoints = Math.min(len, width);
    const step = len / targetPoints;
    
    for (let i = 0; i < targetPoints; i++) {
      // Promediar un grupo de samples
      const startIdx = Math.floor(i * step);
      const endIdx = Math.floor((i + 1) * step);
      
      let sumX = 0, sumY = 0, count = 0;
      for (let j = startIdx; j < endIdx && j < len; j++) {
        sumX += bufferX[j];
        sumY += bufferY[j];
        count++;
      }
      
      const avgX = count > 0 ? sumX / count : 0;
      const avgY = count > 0 ? sumY / count : 0;
      
      // Mapear -1..1 a 0..width y 0..height
      const x = ((avgX + 1) / 2) * width;
      const y = ((1 - avgY) / 2) * height;  // Invertido
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
    
    // Resetear efecto glow para no afectar otros elementos
    if (this.glowBlur > 0) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }
    
    // En modo X-Y, mostrar indicador si hay señal en X
    const hasXSignal = bufferX.some(v => Math.abs(v) > 0.01);
    this._drawTriggerIndicator(hasXSignal);
  }

  /**
   * Dibuja un frame con los datos proporcionados.
   * 
   * NOTA: Si el render loop está activo (startRenderLoop), se recomienda usar
   * updateData() en lugar de draw() para sincronizar con requestAnimationFrame.
   * 
   * @param {Object} data - Datos de captura
   * @param {Float32Array} data.bufferY - Señal Y
   * @param {Float32Array} data.bufferX - Señal X
   * @param {boolean} data.triggered - Si se detectó trigger
   * @param {boolean} [data.isAuto] - Si está en modo auto-trigger
   * @param {boolean} [data.noSignal] - Si no hay señal conectada
   */
  draw(data) {
    // Si el render loop está activo, usar el sistema sincronizado
    if (this._isRunning) {
      this.updateData(data);
      return;
    }
    
    // Dibujo directo (cuando no hay render loop)
    this._drawInternal(data);
  }

  /**
   * Dibuja internamente un frame (lógica real de renderizado).
   * @param {Object} data - Datos de captura
   * @private
   */
  _drawInternal(data) {
    const { ctx, width, height, bgColor, showGrid } = this;
    
    // Si no hay señal, dibujar vacío
    if (data.noSignal) {
      this.drawEmpty();
      return;
    }
    
    this.lastData = data;
    this.lastTriggered = data.triggered;
    
    // Limpiar canvas
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    
    // Dibujar cuadrícula
    if (showGrid) {
      this._drawGrid();
    }
    
    // Dibujar señal según modo
    if (this.mode === 'xy') {
      this._drawXY(data.bufferX, data.bufferY);
    } else {
      this._drawYT(data.bufferY, data.triggered, data.validLength);
    }
    
    // Dibujar indicador de trigger (TRIG/AUTO)
    this._drawTriggerIndicator(data.triggered, data.isAuto);
  }

  /**
   * Dibuja una línea central cuando no hay señal.
   */
  drawEmpty() {
    const { ctx, width, height, bgColor, showGrid, centerColor } = this;
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    
    if (showGrid) {
      this._drawGrid();
    }
    
    // Línea central
    ctx.strokeStyle = centerColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  /**
   * Obtiene el elemento canvas.
   * @returns {HTMLCanvasElement}
   */
  getCanvas() {
    return this.canvas;
  }

  /**
   * Redibuja el display (útil si cambia el contenedor).
   * La resolución interna se mantiene fija.
   */
  refresh() {
    if (this.lastData) {
      this.draw(this.lastData);
    } else {
      this.drawEmpty();
    }
  }

  /**
   * @deprecated La resolución ahora es fija. Usa refresh() si necesitas redibujar.
   */
  resize(width, height) {
    // La resolución interna ya no cambia - el canvas se escala con CSS
    this.refresh();
  }

  /**
   * Limpia recursos.
   */
  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.lastData = null;
  }
}

export default OscilloscopeDisplay;
