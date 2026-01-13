/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DORMANCY MANAGER - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Gestiona el estado "dormant" (inactivo) de todos los módulos de audio
 * basándose en las conexiones activas en las matrices Panel 5 (audio) y
 * Panel 6 (control).
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * CONCEPTO
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Cuando un módulo no tiene conexiones relevantes (sin salida para fuentes,
 * sin entrada para destinos), se pone en estado "dormant":
 * - Los nodos de audio se silencian o desconectan
 * - Se reduce el consumo de CPU
 * - Es transparente al usuario
 * 
 * Condiciones de dormancy por tipo de módulo:
 * - Oscillator: No tiene salida conectada → dormant
 * - NoiseModule: No tiene salida conectada → dormant  
 * - OutputChannel: No tiene entrada conectada → dormant
 * - Oscilloscope: No tiene entrada conectada → dormant
 * - InputAmplifier: Ningún canal tiene salida conectada → dormant
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * INSPIRACIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Esta optimización está inspirada en la implementación del SynthiGME para
 * SuperCollider, donde los Synths se activan/desactivan dinámicamente según
 * las conexiones de la matriz, logrando excelente rendimiento incluso con
 * muchos módulos instanciados.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createLogger } from '../utils/logger.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { showToast } from '../ui/toast.js';

const log = createLogger('DormancyManager');

export class DormancyManager {
  /**
   * @param {Object} app - Instancia de la aplicación principal
   */
  constructor(app) {
    this.app = app;
    
    // Cargar preferencia guardada (por defecto activo)
    const savedEnabled = localStorage.getItem(STORAGE_KEYS.DORMANCY_ENABLED);
    this._enabled = savedEnabled === null ? true : savedEnabled === 'true';
    
    // Mapa de estados: moduleId → { isDormant: boolean }
    this._moduleStates = new Map();
    
    // ID de requestAnimationFrame pendiente
    this._pendingUpdate = null;
    
    // Flag para mostrar indicadores visuales de debug
    this._debugIndicators = localStorage.getItem(STORAGE_KEYS.DORMANCY_DEBUG) === 'true';
    
    log.info(`Initialized (enabled: ${this._enabled}, debug: ${this._debugIndicators})`);
  }
  
  /**
   * Habilita o deshabilita el sistema de dormancy.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    if (this._enabled === enabled) return;
    
    this._enabled = enabled;
    localStorage.setItem(STORAGE_KEYS.DORMANCY_ENABLED, String(enabled));
    
    log.info(`Dormancy system ${enabled ? 'enabled' : 'disabled'}`);
    
    if (!enabled) {
      // Despertar todos los módulos
      this._wakeAllModules();
    } else {
      // Recalcular estado
      this.updateAllStates();
    }
  }
  
  /**
   * @returns {boolean} Si el sistema de dormancy está habilitado
   */
  isEnabled() {
    return this._enabled;
  }
  
  /**
   * Activa o desactiva los indicadores visuales de debug.
   * @param {boolean} enabled
   */
  setDebugIndicators(enabled) {
    this._debugIndicators = enabled;
    localStorage.setItem(STORAGE_KEYS.DORMANCY_DEBUG, String(enabled));
    
    // Forzar actualización para aplicar/quitar indicadores
    this._applyDebugIndicators();
  }
  
  /**
   * Aplica indicadores visuales de debug mostrando el estado actual.
   * @private
   */
  _applyDebugIndicators() {
    if (!this._enabled) return;
    
    // Si debug está activo, mostrar un resumen del estado actual
    if (this._debugIndicators) {
      // Mostrar estado actual sin esperar a cambios
      this._showCurrentStateToast();
    }
  }
  
  /**
   * Muestra un toast con el estado actual de todos los módulos.
   * Útil para debug inicial.
   * @private
   */
  _showCurrentStateToast() {
    const panel5Connections = this._getPanel5Connections();
    
    // Contar conexiones de osciladores
    const connectedOscs = new Set();
    panel5Connections.forEach(c => {
      if (c.source?.kind === 'panel3Osc') {
        connectedOscs.add(c.source.oscIndex);
      }
    });
    
    // Verificar oscilador activo (al menos uno conectado a salida)
    const hasScopeInput = panel5Connections.some(c => c.dest?.kind === 'oscilloscope');
    const hasNoiseOutput = panel5Connections.some(c => c.source?.kind === 'noiseGen');
    const hasInputAmp = panel5Connections.some(c => c.source?.kind === 'inputAmp');
    
    // Contar salidas conectadas
    const connectedOutputs = new Set();
    panel5Connections.forEach(c => {
      if (c.dest?.kind === 'outputBus') {
        connectedOutputs.add(c.dest.bus);
      }
    });
    
    const parts = [];
    parts.push(`🔌 OSCs: ${connectedOscs.size}/9`);
    parts.push(`🔊 Outputs: ${connectedOutputs.size}/8`);
    if (hasScopeInput) parts.push('📺 Scope');
    if (hasNoiseOutput) parts.push('🔉 Noise');
    if (hasInputAmp) parts.push('🎤 Input');
    
    showToast(`Dormancy: ${parts.join(' | ')}`, 3000);
  }
  
  /**
   * @returns {boolean} Si los indicadores de debug están activos
   */
  hasDebugIndicators() {
    return this._debugIndicators;
  }
  
  /**
   * Debe llamarse cada vez que cambia una conexión en la matriz.
   * Recalcula qué módulos deben estar dormant.
   */
  onConnectionChange() {
    if (!this._enabled) return;
    
    // Usar requestAnimationFrame para agrupar múltiples cambios rápidos
    if (this._pendingUpdate) return;
    
    this._pendingUpdate = requestAnimationFrame(() => {
      this._pendingUpdate = null;
      this.updateAllStates();
    });
  }
  
  /**
   * Recalcula el estado dormant de todos los módulos.
   */
  updateAllStates() {
    if (!this._enabled) return;
    
    // Acumular cambios para toast consolidado
    this._pendingChanges = { woke: [], slept: [] };
    
    const panel5Connections = this._getPanel5Connections();
    const panel6Connections = this._getPanel6Connections();
    
    // ─────────────────────────────────────────────────────────────────────────
    // OSCILLATORS (Panel 3) - 9 osciladores con 2 salidas cada uno
    // ─────────────────────────────────────────────────────────────────────────
    for (let oscIndex = 0; oscIndex < 9; oscIndex++) {
      const hasOutput = panel5Connections.some(c => 
        c.source?.kind === 'panel3Osc' && c.source?.oscIndex === oscIndex
      );
      
      // Solo actualizar si el módulo existe (ha sido inicializado)
      const module = this._findModule(`osc-${oscIndex}`);
      if (module) {
        this._setModuleDormant(`osc-${oscIndex}`, !hasOutput);
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // NOISE GENERATORS - 2 generadores
    // ─────────────────────────────────────────────────────────────────────────
    for (let noiseIndex = 0; noiseIndex < 2; noiseIndex++) {
      const hasOutput = panel5Connections.some(c =>
        c.source?.kind === 'noiseGen' && c.source?.index === noiseIndex
      );
      this._setModuleDormant(`noise-${noiseIndex + 1}`, !hasOutput);
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // INPUT AMPLIFIERS - 8 canales
    // ─────────────────────────────────────────────────────────────────────────
    // Por ahora, todos los canales comparten estado (podría granularizarse)
    const hasAnyInputConnected = panel5Connections.some(c =>
      c.source?.kind === 'inputAmp'
    );
    this._setModuleDormant('input-amplifiers', !hasAnyInputConnected);
    
    // ─────────────────────────────────────────────────────────────────────────
    // OSCILLOSCOPE - 2 entradas (X, Y)
    // ─────────────────────────────────────────────────────────────────────────
    const hasScopeInput = panel5Connections.some(c =>
      c.dest?.kind === 'oscilloscope'
    );
    this._setModuleDormant('oscilloscope', !hasScopeInput);
    
    // ─────────────────────────────────────────────────────────────────────────
    // OUTPUT BUSES - 8 canales de salida
    // ─────────────────────────────────────────────────────────────────────────
    for (let busIndex = 0; busIndex < 8; busIndex++) {
      const hasInput = panel5Connections.some(c =>
        c.dest?.kind === 'outputBus' && c.dest?.bus === busIndex + 1
      );
      this._setModuleDormant(`output-channel-${busIndex + 1}`, !hasInput);
    }
    
    // Mostrar toast consolidado si debug está activo
    this._showConsolidatedToast();
  }
  
  /**
   * Obtiene las conexiones activas de Panel 5 con información de source/dest.
   * @returns {Array<{ source: Object, dest: Object, key: string }>}
   * @private
   */
  _getPanel5Connections() {
    const routing = this.app._panel3Routing;
    if (!routing?.connections) return [];
    
    const connections = [];
    for (const key of Object.keys(routing.connections)) {
      const [rowStr, colStr] = key.split(':');
      const rowIndex = parseInt(rowStr, 10);
      const colIndex = parseInt(colStr, 10);
      
      const source = routing.sourceMap?.get(rowIndex);
      const dest = routing.destMap?.get(colIndex);
      
      if (source || dest) {
        connections.push({ source, dest, key });
      }
    }
    
    return connections;
  }
  
  /**
   * Obtiene las conexiones activas de Panel 6.
   * @returns {Array<{ source: Object, dest: Object, key: string }>}
   * @private
   */
  _getPanel6Connections() {
    const routing = this.app._panel6Routing;
    if (!routing?.connections) return [];
    
    const connections = [];
    for (const key of Object.keys(routing.connections)) {
      const [rowStr, colStr] = key.split(':');
      const rowIndex = parseInt(rowStr, 10);
      const colIndex = parseInt(colStr, 10);
      
      const source = routing.sourceMap?.get(rowIndex);
      const dest = routing.destMap?.get(colIndex);
      
      if (source || dest) {
        connections.push({ source, dest, key });
      }
    }
    
    return connections;
  }
  
  /**
   * Cambia el estado dormant de un módulo si es diferente al actual.
   * @param {string} moduleId - ID del módulo
   * @param {boolean} dormant - true para desactivar, false para activar
   * @private
   */
  _setModuleDormant(moduleId, dormant) {
    const currentState = this._moduleStates.get(moduleId);
    if (currentState?.isDormant === dormant) return;
    
    this._moduleStates.set(moduleId, { isDormant: dormant });
    
    // Buscar el módulo y cambiar su estado
    const module = this._findModule(moduleId);
    if (module?.setDormant) {
      module.setDormant(dormant);
      
      // Acumular cambio para toast consolidado
      if (this._debugIndicators && this._pendingChanges) {
        if (dormant) {
          this._pendingChanges.slept.push(moduleId);
        } else {
          this._pendingChanges.woke.push(moduleId);
        }
      }
    }
  }
  
  /**
   * Muestra un toast consolidado con todos los cambios de estado.
   * @private
   */
  _showConsolidatedToast() {
    if (!this._debugIndicators || !this._pendingChanges) return;
    
    const { woke, slept } = this._pendingChanges;
    if (woke.length === 0 && slept.length === 0) return;
    
    const parts = [];
    if (woke.length > 0) {
      parts.push(`🔊 ${woke.join(', ')}`);
    }
    if (slept.length > 0) {
      parts.push(`💤 ${slept.join(', ')}`);
    }
    
    showToast(parts.join(' | '), 2000);
    this._pendingChanges = null;
  }
  
  /**
   * Encuentra un módulo por su ID.
   * @param {string} moduleId
   * @returns {Object|null}
   * @private
   */
  _findModule(moduleId) {
    // Osciladores de Panel 3 (construidos dinámicamente)
    if (moduleId.startsWith('osc-')) {
      const oscIndex = parseInt(moduleId.split('-')[1], 10);
      // Los osciladores están en _panelAudios[3].nodes
      return this.app._panelAudios?.[3]?.nodes?.[oscIndex];
    }
    
    // Noise modules
    if (moduleId === 'noise-1') {
      return this.app._panel3LayoutData?.noiseAudioModules?.noise1;
    }
    if (moduleId === 'noise-2') {
      return this.app._panel3LayoutData?.noiseAudioModules?.noise2;
    }
    
    // Oscilloscope
    if (moduleId === 'oscilloscope') {
      return this.app.oscilloscope;
    }
    
    // Input amplifiers
    if (moduleId === 'input-amplifiers') {
      return this.app.inputAmplifiers;
    }
    
    // Output channels
    if (moduleId.startsWith('output-channel-')) {
      const busIndex = parseInt(moduleId.split('-')[2], 10) - 1;
      return this.app.engine?.outputBuses?.[busIndex];
    }
    
    // Módulos registrados en engine
    return this.app.engine?.findModule?.(moduleId) ?? null;
  }
  
  /**
   * Despierta todos los módulos (sale de dormancy).
   * @private
   */
  _wakeAllModules() {
    for (const [moduleId] of this._moduleStates) {
      this._setModuleDormant(moduleId, false);
    }
    this._moduleStates.clear();
    
  }
  
  /**
   * Obtiene el estado dormant de un módulo.
   * @param {string} moduleId
   * @returns {boolean}
   */
  isDormant(moduleId) {
    return this._moduleStates.get(moduleId)?.isDormant ?? false;
  }
  
  /**
   * Obtiene estadísticas de dormancy para debugging.
   * @returns {{ total: number, dormant: number, active: number }}
   */
  getStats() {
    let dormant = 0;
    let active = 0;
    
    for (const [, state] of this._moduleStates) {
      if (state.isDormant) {
        dormant++;
      } else {
        active++;
      }
    }
    
    return {
      total: this._moduleStates.size,
      dormant,
      active
    };
  }
}
