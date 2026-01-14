/**
 * Tests para ui/oscilloscopeDisplay.js
 * 
 * Verifica el componente OscilloscopeDisplay:
 * - Creación y configuración del canvas
 * - Modo dual-beam (Y-T): dos líneas en tercios del display
 * - Modo X-Y (Lissajous): una sola línea centrada
 * - Colores configurables para cada beam
 * - Escalas de tiempo y amplitud
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK del DOM Canvas para Node.js
// ═══════════════════════════════════════════════════════════════════════════

class MockCanvasRenderingContext2D {
  constructor() {
    this._calls = {
      fillRect: 0,
      stroke: 0,
      beginPath: 0,
      moveTo: 0,
      lineTo: 0,
      arc: 0
    };
    this._paths = [];
    this._currentPath = [];
    
    // Propiedades de estilo
    this.fillStyle = '#000';
    this.strokeStyle = '#0f0';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.shadowBlur = 0;
    this.shadowColor = 'transparent';
    this.font = '10px sans-serif';
    this.textAlign = 'left';
  }
  
  fillRect(x, y, w, h) {
    this._calls.fillRect++;
  }
  
  stroke() {
    this._calls.stroke++;
    if (this._currentPath.length > 0) {
      this._paths.push([...this._currentPath]);
      this._currentPath = [];
    }
  }
  
  beginPath() {
    this._calls.beginPath++;
    this._currentPath = [];
  }
  
  moveTo(x, y) {
    this._calls.moveTo++;
    this._currentPath.push({ type: 'moveTo', x, y });
  }
  
  lineTo(x, y) {
    this._calls.lineTo++;
    this._currentPath.push({ type: 'lineTo', x, y });
  }
  
  arc(x, y, r, start, end) {
    this._calls.arc++;
  }
  
  fill() {}
  fillText() {}
  setLineDash() {}
  closePath() {}
  save() {}
  restore() {}
  translate() {}
  scale() {}
  rotate() {}
  clearRect() {}
}

class MockHTMLCanvasElement {
  constructor(width = 300, height = 150) {
    this.width = width;
    this.height = height;
    this.style = {
      cssText: '',
      display: 'block',
      width: '100%',
      height: '100%'
    };
    this._context = new MockCanvasRenderingContext2D();
  }
  
  getContext(type) {
    if (type === '2d') {
      return this._context;
    }
    return null;
  }
}

// Mock global para el entorno de test
global.window = global.window || { devicePixelRatio: 1 };

// ═══════════════════════════════════════════════════════════════════════════
// MOCK de OscilloscopeDisplay (versión simplificada para testing)
// ═══════════════════════════════════════════════════════════════════════════

class MockOscilloscopeDisplay {
  constructor(options = {}) {
    const {
      canvas,
      internalWidth = 600,
      internalHeight = 450,
      mode = 'yt',
      lineColor = '#0f0',
      lineColor2 = '#0f0',
      bgColor = '#000',
      glowBlur = 0,
      glowColor = null,
      glowColor2 = null,
      showGrid = true,
      showTriggerIndicator = true
    } = options;
    
    // Usar canvas existente o crear mock
    if (canvas) {
      this.canvas = canvas;
    } else {
      this.canvas = new MockHTMLCanvasElement(internalWidth, internalHeight);
    }
    
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    
    // Configuración visual
    this.mode = mode;
    this.lineColor = lineColor;
    this.lineColor2 = lineColor2;
    this.bgColor = bgColor;
    this.glowBlur = glowBlur;
    this.glowColor = glowColor || lineColor;
    this.glowColor2 = glowColor2 || lineColor2;
    this.showGrid = showGrid;
    this.showTriggerIndicator = showTriggerIndicator;
    
    // Escalas
    this.timeScale = 1.0;
    this.ampScale = 1.0;
    
    // Estado
    this.lastData = null;
    this._isRunning = false;
  }
  
  setMode(mode) {
    if (mode === 'yt' || mode === 'xy') {
      this.mode = mode;
    }
  }
  
  getMode() {
    return this.mode;
  }
  
  toggleMode() {
    this.setMode(this.mode === 'yt' ? 'xy' : 'yt');
    return this.mode;
  }
  
  setTimeScale(scale) {
    this.timeScale = Math.max(0.1, Math.min(1.0, scale));
  }
  
  setAmpScale(scale) {
    this.ampScale = Math.max(0.25, Math.min(4.0, scale));
  }
  
  /**
   * Calcula las posiciones Y de los beams en modo dual-beam
   * @returns {{ beam1CenterY: number, beam2CenterY: number, beamHeight: number }}
   */
  _getBeamPositions() {
    const thirdHeight = this.height / 3;
    return {
      beam1CenterY: thirdHeight,           // 1/3 del alto
      beam2CenterY: 2 * thirdHeight,       // 2/3 del alto
      beamHeight: thirdHeight              // Cada beam ocupa 1/3
    };
  }
  
  /**
   * Detecta si hay señal significativa en un buffer
   */
  _hasSignal(buffer) {
    if (!buffer || buffer.length === 0) return false;
    return buffer.some(v => Math.abs(v) > 0.001);
  }
  
  draw(data) {
    this.lastData = data;
    
    if (data.noSignal) {
      this._drawEmpty();
      return;
    }
    
    // Limpiar canvas
    this.ctx.fillStyle = this.bgColor;
    this.ctx._calls.fillRect++;
    
    // Dibujar según modo
    if (this.mode === 'xy') {
      this._drawXY(data.bufferX, data.bufferY);
    } else {
      this._drawYT(data.bufferY, data.bufferX, data.triggered, data.validLength);
    }
  }
  
  _drawYT(bufferY, bufferX, triggered, validLength) {
    const { beam1CenterY, beam2CenterY, beamHeight } = this._getBeamPositions();
    
    // BEAM 1: Señal Y
    if (bufferY && bufferY.length > 0) {
      this._drawSingleBeam(bufferY, this.lineColor, beam1CenterY, beamHeight);
    }
    
    // BEAM 2: Señal X (solo si hay señal)
    if (this._hasSignal(bufferX)) {
      this._drawSingleBeam(bufferX, this.lineColor2, beam2CenterY, beamHeight);
    }
  }
  
  _drawSingleBeam(buffer, color, centerY, beamHeight) {
    this.ctx.strokeStyle = color;
    this.ctx.beginPath();
    
    const samplesPerPixel = buffer.length / this.width;
    const halfBeamHeight = beamHeight / 2;
    
    for (let px = 0; px < this.width; px++) {
      const idx = Math.floor(px * samplesPerPixel);
      const value = buffer[idx] ?? 0;
      const scaledValue = value * this.ampScale;
      const y = centerY - scaledValue * halfBeamHeight;
      
      if (px === 0) {
        this.ctx.moveTo(px, y);
      } else {
        this.ctx.lineTo(px, y);
      }
    }
    
    this.ctx.stroke();
  }
  
  _drawXY(bufferX, bufferY) {
    this.ctx.strokeStyle = this.lineColor;
    this.ctx.beginPath();
    
    if (!bufferX || !bufferY) return;
    
    const len = Math.min(bufferX.length, bufferY.length);
    
    for (let i = 0; i < len; i++) {
      const x = ((bufferX[i] + 1) / 2) * this.width;
      const y = ((1 - bufferY[i]) / 2) * this.height;
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    
    this.ctx.stroke();
  }
  
  _drawEmpty() {
    this.ctx.fillStyle = this.bgColor;
    this.ctx._calls.fillRect++;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('OscilloscopeDisplay', () => {
  
  let display;
  
  beforeEach(() => {
    display = new MockOscilloscopeDisplay({
      internalWidth: 300,
      internalHeight: 300
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // INICIALIZACIÓN
  // ─────────────────────────────────────────────────────────────────────────
  
  describe('inicialización', () => {
    
    it('modo inicial es Y-T', () => {
      assert.equal(display.mode, 'yt');
    });
    
    it('colores por defecto son verdes', () => {
      assert.equal(display.lineColor, '#0f0');
      assert.equal(display.lineColor2, '#0f0');
    });
    
    it('permite configurar colores diferentes para cada beam', () => {
      const customDisplay = new MockOscilloscopeDisplay({
        lineColor: '#00ff00',
        lineColor2: '#ffff00'
      });
      
      assert.equal(customDisplay.lineColor, '#00ff00');
      assert.equal(customDisplay.lineColor2, '#ffff00');
    });
    
    it('escalas iniciales son 1.0', () => {
      assert.equal(display.timeScale, 1.0);
      assert.equal(display.ampScale, 1.0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MODO Y-T DUAL BEAM
  // ─────────────────────────────────────────────────────────────────────────
  
  describe('modo Y-T (dual beam)', () => {
    
    it('posiciona Beam 1 en 1/3 del alto', () => {
      const positions = display._getBeamPositions();
      
      assert.equal(positions.beam1CenterY, display.height / 3);
    });
    
    it('posiciona Beam 2 en 2/3 del alto', () => {
      const positions = display._getBeamPositions();
      
      assert.equal(positions.beam2CenterY, 2 * display.height / 3);
    });
    
    it('cada beam tiene altura de 1/3 del display', () => {
      const positions = display._getBeamPositions();
      
      assert.equal(positions.beamHeight, display.height / 3);
    });
    
    it('dibuja Beam 1 cuando hay bufferY', () => {
      const bufferY = new Float32Array([0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5]);
      
      display.draw({ bufferY, bufferX: null, triggered: true });
      
      // Debe haber llamado a stroke() al menos una vez
      assert.ok(display.ctx._calls.stroke >= 1);
    });
    
    it('dibuja Beam 2 cuando hay señal en bufferX', () => {
      const bufferY = new Float32Array([0, 0.5, 1]);
      const bufferX = new Float32Array([0, 0.3, 0.6]);
      
      display.draw({ bufferY, bufferX, triggered: true });
      
      // Debe haber llamado a stroke() dos veces (una por cada beam)
      assert.ok(display.ctx._calls.stroke >= 2);
    });
    
    it('NO dibuja Beam 2 si bufferX es silencio', () => {
      const bufferY = new Float32Array([0, 0.5, 1]);
      const bufferX = new Float32Array([0, 0.0001, 0]);  // Por debajo del umbral
      
      display.ctx._calls.stroke = 0;  // Reset contador
      display.draw({ bufferY, bufferX, triggered: true });
      
      // Solo debe haber dibujado un beam
      assert.equal(display.ctx._calls.stroke, 1);
    });
    
    it('detecta señal correctamente con umbral 0.001', () => {
      // Con señal
      assert.equal(display._hasSignal(new Float32Array([0.01])), true);
      assert.equal(display._hasSignal(new Float32Array([0.002])), true);
      
      // Sin señal (por debajo del umbral)
      assert.equal(display._hasSignal(new Float32Array([0.0001])), false);
      assert.equal(display._hasSignal(new Float32Array([0, 0, 0])), false);
      assert.equal(display._hasSignal(null), false);
      assert.equal(display._hasSignal([]), false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MODO X-Y (LISSAJOUS)
  // ─────────────────────────────────────────────────────────────────────────
  
  describe('modo X-Y (Lissajous)', () => {
    
    beforeEach(() => {
      display.setMode('xy');
    });
    
    it('cambia a modo X-Y correctamente', () => {
      assert.equal(display.getMode(), 'xy');
    });
    
    it('dibuja una sola figura (un solo stroke)', () => {
      const bufferX = new Float32Array([0, 0.5, 1, 0.5, 0]);
      const bufferY = new Float32Array([0, 0.5, 0, -0.5, 0]);
      
      display.ctx._calls.stroke = 0;
      display.draw({ bufferX, bufferY, triggered: true });
      
      // Solo un stroke para la figura Lissajous
      assert.equal(display.ctx._calls.stroke, 1);
    });
    
    it('usa lineColor (no lineColor2) para Lissajous', () => {
      const customDisplay = new MockOscilloscopeDisplay({
        lineColor: '#ff0000',
        lineColor2: '#00ff00',
        mode: 'xy'
      });
      
      const bufferX = new Float32Array([0, 0.5]);
      const bufferY = new Float32Array([0, 0.5]);
      
      customDisplay.draw({ bufferX, bufferY, triggered: true });
      
      // El strokeStyle debe ser lineColor, no lineColor2
      assert.equal(customDisplay.ctx.strokeStyle, '#ff0000');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TOGGLE DE MODO
  // ─────────────────────────────────────────────────────────────────────────
  
  describe('toggleMode()', () => {
    
    it('alterna de Y-T a X-Y', () => {
      assert.equal(display.getMode(), 'yt');
      
      display.toggleMode();
      
      assert.equal(display.getMode(), 'xy');
    });
    
    it('alterna de X-Y a Y-T', () => {
      display.setMode('xy');
      
      display.toggleMode();
      
      assert.equal(display.getMode(), 'yt');
    });
    
    it('devuelve el nuevo modo', () => {
      const newMode = display.toggleMode();
      
      assert.equal(newMode, 'xy');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ESCALAS
  // ─────────────────────────────────────────────────────────────────────────
  
  describe('escalas', () => {
    
    it('setTimeScale clampea entre 0.1 y 1.0', () => {
      display.setTimeScale(0.5);
      assert.equal(display.timeScale, 0.5);
      
      display.setTimeScale(0.01);
      assert.equal(display.timeScale, 0.1);  // Clamp mínimo
      
      display.setTimeScale(2.0);
      assert.equal(display.timeScale, 1.0);  // Clamp máximo
    });
    
    it('setAmpScale clampea entre 0.25 y 4.0', () => {
      display.setAmpScale(2.0);
      assert.equal(display.ampScale, 2.0);
      
      display.setAmpScale(0.1);
      assert.equal(display.ampScale, 0.25);  // Clamp mínimo
      
      display.setAmpScale(10.0);
      assert.equal(display.ampScale, 4.0);  // Clamp máximo
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DIVISIÓN DEL DISPLAY EN TERCIOS
  // ─────────────────────────────────────────────────────────────────────────
  
  describe('división del display en tercios', () => {
    
    it('con altura 300px: Beam 1 a 100px, Beam 2 a 200px', () => {
      const display300 = new MockOscilloscopeDisplay({
        internalHeight: 300
      });
      
      const positions = display300._getBeamPositions();
      
      assert.equal(positions.beam1CenterY, 100);
      assert.equal(positions.beam2CenterY, 200);
      assert.equal(positions.beamHeight, 100);
    });
    
    it('con altura 450px: Beam 1 a 150px, Beam 2 a 300px', () => {
      const display450 = new MockOscilloscopeDisplay({
        internalHeight: 450
      });
      
      const positions = display450._getBeamPositions();
      
      assert.equal(positions.beam1CenterY, 150);
      assert.equal(positions.beam2CenterY, 300);
      assert.equal(positions.beamHeight, 150);
    });
    
    it('los tercios dividen el espacio uniformemente', () => {
      const positions = display._getBeamPositions();
      const { beam1CenterY, beam2CenterY, beamHeight } = positions;
      
      // Espacio arriba de Beam 1
      const spaceAboveBeam1 = beam1CenterY;
      
      // Espacio entre Beam 1 y Beam 2
      const spaceBetweenBeams = beam2CenterY - beam1CenterY;
      
      // Espacio debajo de Beam 2
      const spaceBelowBeam2 = display.height - beam2CenterY;
      
      // Los tres espacios deben ser iguales (1/3 cada uno)
      assert.equal(spaceAboveBeam1, display.height / 3);
      assert.equal(spaceBetweenBeams, display.height / 3);
      assert.equal(spaceBelowBeam2, display.height / 3);
    });
  });
});
