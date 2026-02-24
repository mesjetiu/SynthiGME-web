/**
 * OscilloscopeDisplay - Componente de visualización para osciloscopio
 * 
 * Renderiza señales de audio en un canvas con dos modos:
 * - Y-T: Eje X = tiempo, Eje Y = amplitud (forma de onda tradicional)
 *        Soporta DUAL BEAM: muestra dos señales simultáneas (bufferY y bufferX)
 *        como líneas independientes, simulando el comportamiento del Synthi 100
 *        original que tenía dos haces para las columnas de Panel 5 y Panel 6.
 * - X-Y: Eje X = señal X, Eje Y = señal Y (figuras de Lissajous, un solo trazo)
 * 
 * @example
 * ```javascript
 * const display = new OscilloscopeDisplay({
 *   container: document.getElementById('scope-container'),
 *   width: 300,
 *   height: 200,
 *   lineColor: '#00ff00',   // Beam 1 (Y)
 *   lineColor2: '#00ff00',  // Beam 2 (X en modo Y-T)
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
   * @param {string} [options.lineColor='#0f0'] - Color de la línea del Beam 1 (señal Y)
   * @param {string} [options.lineColor2='#0f0'] - Color de la línea del Beam 2 (señal X en modo Y-T)
   * @param {string} [options.bgColor='#000'] - Color de fondo
   * @param {string} [options.gridColor='#1a1a1a'] - Color de la cuadrícula
   * @param {string} [options.centerColor='#333'] - Color de líneas centrales
   * @param {number} [options.lineWidth=2] - Grosor de la línea de señal
   * @param {number} [options.glowBlur=0] - Intensidad del blur para efecto glow CRT (0 = desactivado)
   * @param {string} [options.glowColor=null] - Color del glow del Beam 1 (null = usa lineColor)
   * @param {string} [options.glowColor2=null] - Color del glow del Beam 2 (null = usa lineColor2)
   * @param {boolean} [options.showGrid=true] - Mostrar cuadrícula
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
      // ─────────────────────────────────────────────────────────────────────
      // DUAL BEAM: Colores para las dos líneas del osciloscopio
      // En modo Y-T se muestran dos trazos simultáneos (como el Synthi 100 original):
      //   - Beam 1: señal Y (columnas Panel 5 audio, ej. col 57)
      //   - Beam 2: señal X (columnas Panel 6 control, ej. col 63)
      // En modo X-Y (Lissajous) solo se usa lineColor (una figura paramétrica).
      // ─────────────────────────────────────────────────────────────────────
      lineColor = '#0f0',        // Beam 1 (Y) - verde por defecto
      lineColor2 = '#0f0',       // Beam 2 (X en modo Y-T) - verde por defecto (como el original)
      bgColor = '#000',
      gridColor = '#1a1a1a',
      centerColor = '#333',
      lineWidth = 2,
      glowBlur = 0,              // Efecto glow CRT (0 = desactivado)
      glowColor = null,          // Color del glow Beam 1 (null = usa lineColor)
      glowColor2 = null,         // Color del glow Beam 2 (null = usa lineColor2)
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
        ${bgColor !== 'transparent' ? `background: ${bgColor};` : ''}
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
    this.lineColor2 = lineColor2;          // Beam 2 (dual beam en modo Y-T)
    this.bgColor = bgColor;
    this.gridColor = gridColor;
    this.centerColor = centerColor;
    this.lineWidth = lineWidth;
    this.glowBlur = glowBlur;
    this.glowColor = glowColor || lineColor;
    this.glowColor2 = glowColor2 || lineColor2;  // Glow del Beam 2
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
   * Dibuja en modo Y-T (forma de onda tradicional) con soporte DUAL BEAM.
   * 
   * En el Synthi 100 original, el osciloscopio tenía dos haces (beams) que
   * permitían visualizar dos señales simultáneamente:
   * - Beam 1: señal de las columnas del Panel 5 (audio, ej. col 57)
   * - Beam 2: señal de las columnas del Panel 6 (control, ej. col 63)
   * 
   * Esta implementación replica ese comportamiento posicionando cada beam
   * en los tercios del display, dividiéndolo en 3 partes iguales:
   * 
   *   ┌─────────────────────────┐
   *   │      (espacio 1/3)      │
   *   ├─────── BEAM 1 ──────────┤  ← a 1/3 del alto (height/3)
   *   │      (espacio 1/3)      │
   *   ├─────── BEAM 2 ──────────┤  ← a 2/3 del alto (2*height/3)
   *   │      (espacio 1/3)      │
   *   └─────────────────────────┘
   * 
   * @param {Float32Array} bufferY - Datos de la señal Y (Beam 1)
   * @param {Float32Array} bufferX - Datos de la señal X (Beam 2, en modo Y-T)
   * @param {boolean} triggered - Si se detectó trigger
   * @param {number} [validLength] - Longitud válida (ciclos completos)
   * @private
   */
  _drawYT(bufferY, bufferX, triggered, validLength) {
    const { ctx, width, height, lineWidth, glowBlur, timeScale, ampScale } = this;
    
    // Usar validLength si está disponible, sino todo el buffer
    const baseLength = validLength && validLength > 0 ? validLength : (bufferY?.length || 0);
    // Aplicar timeScale: cuántos samples mostrar
    const effectiveLength = Math.floor(baseLength * timeScale);
    
    // ─────────────────────────────────────────────────────────────────────────
    // DUAL BEAM: Cada beam se posiciona en un tercio del display
    // - Beam 1: centerY = height/3 (línea divisoria superior)
    // - Beam 2: centerY = 2*height/3 (línea divisoria inferior)
    // Esto divide el display en 3 espacios iguales con los beams como divisores
    // ─────────────────────────────────────────────────────────────────────────
    const thirdHeight = height / 3;
    
    // Altura disponible para la oscilación de cada beam (1/3 del total)
    const beamHeight = thirdHeight;
    
    // ─────────────────────────────────────────────────────────────────────────
    // BEAM 1: Señal Y (columnas Panel 5 - audio) - en 1/3 del alto
    // ─────────────────────────────────────────────────────────────────────────
    if (bufferY && bufferY.length > 0) {
      const beam1CenterY = thirdHeight;  // Línea a 1/3 del alto
      this._drawSingleBeam(bufferY, effectiveLength, this.lineColor, this.glowColor, beam1CenterY, beamHeight);
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // BEAM 2: Señal X como segunda forma de onda (columnas Panel 6 - control)
    // En 2/3 del alto - Solo se dibuja si hay señal significativa
    // ─────────────────────────────────────────────────────────────────────────
    if (bufferX && bufferX.length > 0) {
      // Detectar si hay señal real en bufferX (no solo silencio)
      const hasSignal = bufferX.some(v => Math.abs(v) > 0.001);
      if (hasSignal) {
        const beam2CenterY = 2 * thirdHeight;  // Línea a 2/3 del alto
        this._drawSingleBeam(bufferX, effectiveLength, this.lineColor2, this.glowColor2, beam2CenterY, beamHeight);
      }
    }
    
    this._drawTriggerIndicator(triggered);
  }

  /**
   * Dibuja un único beam (trazo de forma de onda) en modo Y-T.
   * Método auxiliar utilizado por _drawYT para renderizar cada beam.
   * 
   * @param {Float32Array} buffer - Datos de la señal a dibujar
   * @param {number} effectiveLength - Número de samples a mostrar (con timeScale aplicado)
   * @param {string} color - Color de la línea
   * @param {string} glowColor - Color del efecto glow
   * @param {number} centerY - Posición Y central del beam en píxeles
   * @param {number} beamHeight - Altura disponible para la oscilación del beam
   * @private
   */
  _drawSingleBeam(buffer, effectiveLength, color, glowColor, centerY, beamHeight) {
    const { ctx, width, lineWidth, glowBlur, ampScale } = this;
    
    if (!buffer || buffer.length === 0 || effectiveLength <= 0) return;
    
    // Aplicar efecto glow CRT (fosforescencia)
    if (glowBlur > 0) {
      ctx.shadowBlur = glowBlur;
      ctx.shadowColor = glowColor;
    }
    
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';      // Puntas redondeadas para aspecto suave
    ctx.lineJoin = 'round';     // Uniones redondeadas
    ctx.beginPath();
    
    // Calcular cuántos samples por píxel (basado en longitud efectiva con timeScale)
    const samplesPerPixel = effectiveLength / width;
    let firstPoint = true;
    
    // Mitad de la altura del beam (para mapear -1..1)
    const halfBeamHeight = beamHeight / 2;
    
    for (let px = 0; px < width; px++) {
      // Índices del rango de samples para este píxel
      const startIdx = Math.floor(px * samplesPerPixel);
      const endIdx = Math.min(Math.ceil((px + 1) * samplesPerPixel), effectiveLength);
      
      // Encontrar min y max del rango (técnica de osciloscopio real)
      let minV = buffer[startIdx] ?? 0;
      let maxV = minV;
      for (let i = startIdx + 1; i < endIdx; i++) {
        const v = buffer[i];
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
      
      // Aplicar ampScale (escalar desde el centro)
      const scaledMinV = minV * ampScale;
      const scaledMaxV = maxV * ampScale;
      
      // Mapear -1..1 a la sección del beam (invertido para que positivo vaya arriba)
      // centerY es el punto central, halfBeamHeight es la amplitud máxima
      const yMin = centerY - scaledMaxV * halfBeamHeight;
      const yMax = centerY - scaledMinV * halfBeamHeight;
      
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
    if (glowBlur > 0) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }
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
    if (bgColor === 'transparent') {
      ctx.clearRect(0, 0, width, height);
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }
    
    // Dibujar cuadrícula
    if (showGrid) {
      this._drawGrid();
    }
    
    // Dibujar señal según modo
    if (this.mode === 'xy') {
      // Modo X-Y (Lissajous): una sola figura paramétrica
      this._drawXY(data.bufferX, data.bufferY);
    } else {
      // Modo Y-T (dual beam): bufferY = Beam 1, bufferX = Beam 2
      this._drawYT(data.bufferY, data.bufferX, data.triggered, data.validLength);
    }
    
    // Dibujar indicador de trigger (TRIG/AUTO)
    this._drawTriggerIndicator(data.triggered, data.isAuto);
  }

  /**
   * Dibuja una línea central cuando no hay señal.
   */
  drawEmpty() {
    const { ctx, width, height, bgColor, showGrid, centerColor } = this;
    
    if (bgColor === 'transparent') {
      ctx.clearRect(0, 0, width, height);
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }
    
    if (showGrid) {
      this._drawGrid();
    }
    
    // Línea central (no mostrar en modo transparente)
    if (bgColor !== 'transparent') {
      ctx.strokeStyle = centerColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    }
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
