/**
 * MIDILearnManager - Motor de MIDI Learn y sistema de mapeo.
 * 
 * Gestiona la asociación entre controles MIDI (CC, notas, pitch bend) y
 * controles del sintetizador (knobs, sliders, toggles). Persiste los
 * mappings en localStorage con opción de exportar/importar.
 * 
 * Flujo de MIDI Learn:
 * 1. El usuario hace click derecho en un control → "MIDI Learn"
 * 2. Se activa el modo learn para ese control (indicador visual)
 * 3. El usuario mueve un knob/slider/rueda en su dispositivo MIDI
 * 4. El primer mensaje MIDI entrante se asocia al control
 * 5. A partir de ahora, ese control MIDI mueve el control del synth
 * 
 * Sigue el mismo patrón de singleton con anti-feedback que el módulo OSC.
 * 
 * @module midi/midiLearnManager
 */

import { createLogger } from '../utils/logger.js';
import { midiAccess } from './midiAccess.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { flashGlow } from '../ui/glowManager.js';

const log = createLogger('MIDILearn');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

/** Versión del formato de exportación */
const EXPORT_VERSION = 1;

/** Tiempo que se mantiene el flag anti-feedback (ms) */
const ANTI_FEEDBACK_DELAY = 10;

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Información de un control del sintetizador (proviene de detectControl + detectModule)
 * @typedef {Object} ControlInfo
 * @property {string} moduleId       - ID del módulo DOM (ej: 'panel1-osc-1')
 * @property {string} [controlType]  - 'knob'|'slider'|'switch'|'pad'|'toggle'
 * @property {string} [controlKey]   - Clave del control (ej: 'filter', 'rangeX')
 * @property {number} [knobIndex]    - Índice del knob en array (osciladores)
 * @property {string} [label]        - Nombre legible del control
 */

/**
 * Un mapping MIDI → Control
 * @typedef {Object} MIDIMapping
 * @property {string} midiKey        - Clave única: "deviceId:channel:type:number"
 * @property {string} deviceId       - ID del dispositivo MIDI
 * @property {string} deviceName     - Nombre del dispositivo
 * @property {number} channel        - Canal MIDI 0–15
 * @property {string} type           - 'cc'|'noteon'|'pitchbend'
 * @property {number} number         - Número de CC/nota (0 para pitch bend)
 * @property {ControlInfo} target    - Control destino en el sintetizador
 */

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera la clave única para un mensaje MIDI.
 * @param {string} deviceId
 * @param {number} channel
 * @param {string} type - 'cc'|'noteon'|'noteoff'|'pitchbend'
 * @param {number} number - CC number o nota
 * @returns {string}
 */
function buildMIDIKey(deviceId, channel, type, number) {
  // Normalizar: noteoff usa la misma clave que noteon
  const normalizedType = type === 'noteoff' ? 'noteon' : type;
  // Pitch bend no tiene número, usamos 0
  const num = normalizedType === 'pitchbend' ? 0 : number;
  return `${deviceId}:${channel}:${normalizedType}:${num}`;
}

/**
 * Genera el identificador único de un control destino.
 * @param {ControlInfo} target
 * @returns {string}
 */
function buildControlId(target) {
  if (target.controlKey) {
    return `${target.moduleId}:${target.controlType || 'knob'}:${target.controlKey}`;
  }
  return `${target.moduleId}:${target.controlType || 'knob'}:${target.knobIndex}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASE MIDILearnManager (singleton)
// ─────────────────────────────────────────────────────────────────────────────

class MIDILearnManagerClass {
  constructor() {
    /** @type {import('../app.js').default|null} Referencia a la app */
    this._app = null;

    /** Mapa de mappings: midiKey → MIDIMapping */
    this._mappings = new Map();

    /** Índice inverso: controlId → midiKey (para búsqueda rápida) */
    this._controlIndex = new Map();

    /** Control actualmente en modo learn, o null */
    this._learnTarget = null;

    /** Flag anti-feedback (como el OSC sync) */
    this._ignoreMIDIUpdates = false;

    /** Timer para limpiar flag anti-feedback */
    this._antiFeedbackTimer = null;

    /** Unsubscribe del listener de mensajes MIDI */
    this._unsubscribeMessages = null;

    /** ¿Está habilitado el sistema MIDI? */
    this._enabled = false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // API PÚBLICA
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Inicializa el gestor de MIDI Learn.
   * @param {import('../app.js').default} app - Referencia a la instancia de App
   */
  init(app) {
    this._app = app;

    // Cargar mappings persistidos
    this._loadFromStorage();

    // Registrar listener de mensajes MIDI
    this._unsubscribeMessages = midiAccess.onMessage((msg) => this._onMIDIMessage(msg));

    // Respetar estado persistido (puede estar desactivado desde menú Electron)
    const storedEnabled = localStorage.getItem(STORAGE_KEYS.MIDI_ENABLED);
    this._enabled = storedEnabled !== 'false'; // true por defecto
    log.info(`MIDI Learn inicializado — ${this._mappings.size} mapping(s) cargado(s), ${this._enabled ? 'activo' : 'desactivado'}`);
  }

  /**
   * ¿Está activo el modo learn?
   * @returns {boolean}
   */
  get isLearning() {
    return this._learnTarget !== null;
  }

  /**
   * ¿Está habilitado el sistema MIDI?
   * @returns {boolean}
   */
  get enabled() {
    return this._enabled;
  }

  /**
   * Activa o desactiva el sistema MIDI Learn.
   * Cuando se desactiva, los mensajes MIDI se ignoran pero los mappings se conservan.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._enabled = enabled;
    localStorage.setItem(STORAGE_KEYS.MIDI_ENABLED, String(enabled));
    log.info(`MIDI Learn ${enabled ? 'activado' : 'desactivado'}`);
    document.dispatchEvent(new CustomEvent('midi:enabledChanged', {
      detail: { enabled }
    }));
  }

  /**
   * Devuelve el flag anti-feedback. Los onChange de knobs deben consultarlo.
   * @returns {boolean}
   */
  shouldIgnoreMIDI() {
    return this._ignoreMIDIUpdates;
  }

  // ── Modo Learn ──────────────────────────────────────────────────────────

  /**
   * Inicia el modo MIDI Learn para un control específico.
   * El siguiente mensaje MIDI entrante se asociará a este control.
   * 
   * @param {ControlInfo} controlInfo - Info del control (del menú contextual)
   */
  async startLearn(controlInfo) {
    // Si ya estaba en learn, cancelar el anterior
    if (this._learnTarget) {
      this.cancelLearn();
    }

    // Si MIDI no está inicializado, intentar de nuevo (puede que el usuario
    // haya conectado un dispositivo después de cargar la app)
    if (!midiAccess.initialized) {
      log.info('MIDI no inicializado — reintentando...');
      const success = await midiAccess.init();
      if (!success) {
        log.warn('No se pudo acceder a MIDI');
      } else {
        log.info(`MIDI reinicializado — ${midiAccess.getInputs().length} dispositivo(s)`);
        // Si no teníamos callback registrado, registrarlo ahora
        if (!this._unsubscribeMessages) {
          this._unsubscribeMessages = midiAccess.onMessage((msg) => this._onMIDIMessage(msg));
          this._enabled = true;
        }
      }
    }

    this._learnTarget = { ...controlInfo };

    // Añadir clase CSS de indicación al control
    const el = this._resolveControlElement(controlInfo);
    if (el) {
      el.classList.add('midi-learn-target');
    }

    const deviceCount = midiAccess.getInputs().length;
    log.info(`MIDI Learn activado para: ${controlInfo.label || controlInfo.moduleId} (${deviceCount} dispositivo(s) MIDI)`);

    document.dispatchEvent(new CustomEvent('midi:learnStart', {
      detail: { target: controlInfo, deviceCount }
    }));
  }

  /**
   * Cancela el modo learn sin asignar nada.
   */
  cancelLearn() {
    if (!this._learnTarget) return;

    // Quitar indicación visual
    const el = this._resolveControlElement(this._learnTarget);
    if (el) {
      el.classList.remove('midi-learn-target');
    }

    this._learnTarget = null;

    document.dispatchEvent(new CustomEvent('midi:learnCancel'));
    log.info('MIDI Learn cancelado');
  }

  // ── Gestión de Mappings ────────────────────────────────────────────────

  /**
   * Elimina el mapping de un control específico.
   * @param {ControlInfo} controlInfo
   * @returns {boolean} true si se eliminó
   */
  removeMappingForControl(controlInfo) {
    const controlId = buildControlId(controlInfo);
    const midiKey = this._controlIndex.get(controlId);
    if (!midiKey) return false;

    this._mappings.delete(midiKey);
    this._controlIndex.delete(controlId);

    // Quitar indicador visual
    const el = this._resolveControlElement(controlInfo);
    if (el) {
      el.classList.remove('midi-mapped');
    }

    this._saveToStorage();

    log.info(`Mapping eliminado para: ${controlInfo.label || controlId}`);
    document.dispatchEvent(new CustomEvent('midi:mappingChanged'));
    return true;
  }

  /**
   * Elimina un mapping por su clave MIDI.
   * @param {string} midiKey
   * @returns {boolean}
   */
  removeMappingByKey(midiKey) {
    const mapping = this._mappings.get(midiKey);
    if (!mapping) return false;

    const controlId = buildControlId(mapping.target);
    this._controlIndex.delete(controlId);
    this._mappings.delete(midiKey);

    // Quitar indicador visual
    const el = this._resolveControlElement(mapping.target);
    if (el) {
      el.classList.remove('midi-mapped');
    }

    this._saveToStorage();

    log.info(`Mapping eliminado: ${midiKey}`);
    document.dispatchEvent(new CustomEvent('midi:mappingChanged'));
    return true;
  }

  /**
   * Borra todos los mappings.
   */
  clearAllMappings() {
    // Quitar indicadores visuales
    for (const mapping of this._mappings.values()) {
      const el = this._resolveControlElement(mapping.target);
      if (el) {
        el.classList.remove('midi-mapped');
      }
    }

    this._mappings.clear();
    this._controlIndex.clear();
    this._saveToStorage();

    log.info('Todos los mappings MIDI eliminados');
    document.dispatchEvent(new CustomEvent('midi:mappingChanged'));
  }

  /**
   * Consulta si un control tiene un mapping MIDI asignado.
   * @param {ControlInfo} controlInfo
   * @returns {MIDIMapping|null}
   */
  getMappingForControl(controlInfo) {
    const controlId = buildControlId(controlInfo);
    const midiKey = this._controlIndex.get(controlId);
    if (!midiKey) return null;
    return this._mappings.get(midiKey) || null;
  }

  /**
   * Devuelve todos los mappings como array para mostrar en la UI.
   * @returns {MIDIMapping[]}
   */
  getAllMappings() {
    return Array.from(this._mappings.values());
  }

  /**
   * Número total de mappings.
   * @returns {number}
   */
  get mappingCount() {
    return this._mappings.size;
  }

  // ── Exportar / Importar ────────────────────────────────────────────────

  /**
   * Exporta todos los mappings a un objeto JSON.
   * @returns {Object}
   */
  exportMappings() {
    const mappings = this.getAllMappings().map(m => ({
      midiKey: m.midiKey,
      deviceName: m.deviceName,
      channel: m.channel,
      type: m.type,
      number: m.number,
      target: {
        moduleId: m.target.moduleId,
        controlType: m.target.controlType,
        controlKey: m.target.controlKey,
        knobIndex: m.target.knobIndex,
        label: m.target.label
      }
    }));

    return {
      version: EXPORT_VERSION,
      exportDate: new Date().toISOString(),
      mappingCount: mappings.length,
      mappings
    };
  }

  /**
   * Importa mappings desde un objeto JSON (reemplaza los actuales).
   * @param {Object} data - Objeto con { version, mappings }
   * @returns {{ success: boolean, count: number, error?: string }}
   */
  importMappings(data) {
    try {
      if (!data || !data.version || !Array.isArray(data.mappings)) {
        return { success: false, count: 0, error: 'Formato inválido' };
      }

      if (data.version !== EXPORT_VERSION) {
        return { success: false, count: 0, error: `Versión no soportada: ${data.version}` };
      }

      // Limpiar existentes
      this.clearAllMappings();

      // Importar cada mapping
      let imported = 0;
      for (const m of data.mappings) {
        if (!m.target || !m.target.moduleId) continue;

        // Reconstruir la clave MIDI (el deviceId puede haber cambiado)
        // Si no tenemos deviceId en el export, usamos 'any' como wildcard
        const deviceId = m.midiKey?.split(':')[0] || 'any';
        const midiKey = buildMIDIKey(deviceId, m.channel, m.type, m.number);

        const mapping = {
          midiKey,
          deviceId,
          deviceName: m.deviceName || 'Imported',
          channel: m.channel,
          type: m.type,
          number: m.number,
          target: m.target
        };

        this._mappings.set(midiKey, mapping);
        this._controlIndex.set(buildControlId(m.target), midiKey);

        // Añadir indicador visual si el control existe
        const el = this._resolveControlElement(m.target);
        if (el) {
          el.classList.add('midi-mapped');
        }

        imported++;
      }

      this._saveToStorage();

      log.info(`${imported} mapping(s) importados`);
      document.dispatchEvent(new CustomEvent('midi:mappingChanged'));
      return { success: true, count: imported };
    } catch (err) {
      log.error('Error al importar mappings:', err);
      return { success: false, count: 0, error: err.message };
    }
  }

  /**
   * Descarga los mappings como archivo JSON.
   */
  downloadMappings() {
    const data = this.exportMappings();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synthigme-midi-mappings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Abre un selector de archivo para importar mappings.
   * @returns {Promise<{success: boolean, count: number, error?: string}>}
   */
  async uploadMappings() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) {
          resolve({ success: false, count: 0, error: 'No file selected' });
          return;
        }
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          resolve(this.importMappings(data));
        } catch (err) {
          resolve({ success: false, count: 0, error: `Error al leer: ${err.message}` });
        }
      });
      input.click();
    });
  }

  // ── Limpieza ───────────────────────────────────────────────────────────

  /**
   * Destruye el manager y limpia recursos.
   */
  destroy() {
    this.cancelLearn();
    if (this._unsubscribeMessages) {
      this._unsubscribeMessages();
      this._unsubscribeMessages = null;
    }
    this._app = null;
    this._enabled = false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // INTERNOS — Manejo de mensajes
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Handler principal de mensajes MIDI. Decide si estamos en modo learn
   * o en modo normal (aplicar mapping).
   * @param {import('./midiAccess.js').ParsedMIDIMessage} msg
   */
  _onMIDIMessage(msg) {
    if (!this._enabled) {
      log.debug('Mensaje MIDI ignorado (sistema deshabilitado)');
      return;
    }

    // ── Modo Learn: el primer mensaje asigna el mapping ──
    if (this._learnTarget) {
      log.info(`MIDI Learn capturó: ${msg.type} ch=${msg.channel} de ${msg.deviceName}`);
      this._completeLearn(msg);
      return;
    }

    // ── Modo normal: buscar mapping y aplicar ──
    this._applyMapping(msg);
  }

  /**
   * Completa el proceso de MIDI Learn: asocia el mensaje entrante al control.
   * @param {import('./midiAccess.js').ParsedMIDIMessage} msg
   */
  _completeLearn(msg) {
    const target = this._learnTarget;
    if (!target) return;

    // Para teclados: mapear todo el dispositivo+canal, no una nota concreta.
    // Así todas las notas, CC y pitchbend del mismo device+channel se reenvían.
    const isKeyboard = target.controlType === 'keyboard';

    // Construir clave MIDI
    const type = msg.type === 'noteoff' ? 'noteon' : msg.type;
    const number = type === 'cc' ? msg.cc : type === 'noteon' ? msg.note : 0;
    const midiKey = isKeyboard
      ? buildMIDIKey(msg.deviceId, msg.channel, 'keyboard', 0)
      : buildMIDIKey(msg.deviceId, msg.channel, type, number);

    // Si ya existía un mapping con esta clave MIDI, eliminarlo
    if (this._mappings.has(midiKey)) {
      const old = this._mappings.get(midiKey);
      const oldControlId = buildControlId(old.target);
      this._controlIndex.delete(oldControlId);
      const oldEl = this._resolveControlElement(old.target);
      if (oldEl) oldEl.classList.remove('midi-mapped');
    }

    // Si el control destino ya tenía un mapping anterior, eliminarlo
    const controlId = buildControlId(target);
    const prevMidiKey = this._controlIndex.get(controlId);
    if (prevMidiKey && prevMidiKey !== midiKey) {
      this._mappings.delete(prevMidiKey);
    }

    // Crear el mapping
    const mapping = {
      midiKey,
      deviceId: msg.deviceId,
      deviceName: msg.deviceName,
      channel: msg.channel,
      type: isKeyboard ? 'keyboard' : type,
      number: isKeyboard ? 0 : number,
      target: { ...target }
    };

    this._mappings.set(midiKey, mapping);
    this._controlIndex.set(controlId, midiKey);

    // Quitar la clase de learn, poner la de mapped
    const el = this._resolveControlElement(target);
    if (el) {
      el.classList.remove('midi-learn-target');
      el.classList.add('midi-mapped');
      flashGlow(el);
    }

    this._learnTarget = null;
    this._saveToStorage();

    // Generar descripción legible del origen MIDI
    const sourceLabel = this._formatMIDISource(mapping);
    const targetLabel = target.label || controlId;

    log.info(`MIDI Learn completado: ${sourceLabel} → ${targetLabel}`);

    document.dispatchEvent(new CustomEvent('midi:learnComplete', {
      detail: { mapping, sourceLabel, targetLabel }
    }));
  }

  /**
   * Aplica un mapping: convierte el valor MIDI y lo envía al control.
   * @param {import('./midiAccess.js').ParsedMIDIMessage} msg
   */
  _applyMapping(msg) {
    const type = msg.type === 'noteoff' ? 'noteon' : msg.type;
    const number = type === 'cc' ? msg.cc : type === 'noteon' ? msg.note : 0;
    const midiKey = buildMIDIKey(msg.deviceId, msg.channel, type, number);

    let mapping = this._mappings.get(midiKey);

    // Si no hay mapping exacto, buscar mapping de keyboard (captura device+canal completo)
    if (!mapping) {
      const kbKey = buildMIDIKey(msg.deviceId, msg.channel, 'keyboard', 0);
      const kbMapping = this._mappings.get(kbKey);
      if (kbMapping && kbMapping.target.controlType === 'keyboard') {
        mapping = kbMapping;
      }
    }
    if (!mapping) return;

    // Obtener instancia del control
    const resolved = this._resolveControl(mapping.target);
    if (!resolved) return;

    // Convertir valor MIDI al rango del control
    const { control, controlType } = resolved;

    // Anti-feedback: marcamos flag para que los onChange de controles
    // sepan que este cambio viene de MIDI y no generen bucles.
    // NUNCA descartamos mensajes MIDI entrantes — siempre se aplica
    // el último valor recibido independientemente de la velocidad.
    this._ignoreMIDIUpdates = true;
    clearTimeout(this._antiFeedbackTimer);
    try {
      this._applyValueToControl(control, controlType, msg);
    } finally {
      this._antiFeedbackTimer = setTimeout(() => {
        this._ignoreMIDIUpdates = false;
      }, ANTI_FEEDBACK_DELAY);
    }
  }

  /**
   * Aplica un valor MIDI a un control concreto.
   * @param {Object} control - Instancia del knob, toggle, o channel
   * @param {string} controlType - 'knob'|'vernierKnob'|'slider'|'switch'|'pad'|'toggle'
   * @param {import('./midiAccess.js').ParsedMIDIMessage} msg
   */
  _applyValueToControl(control, controlType, msg) {
    switch (controlType) {
      case 'knob':
      case 'vernierKnob': {
        // Mapear valor MIDI al rango del knob
        const knob = control;
        let normalized;
        if (msg.type === 'pitchbend') {
          normalized = msg.value / 16383; // 0–1
        } else if (msg.type === 'cc') {
          normalized = msg.value / 127;   // 0–1
        } else {
          // Note on: velocity como valor
          normalized = (msg.velocity || 0) / 127;
        }
        const value = knob.min + normalized * (knob.max - knob.min);
        knob.setValue(value);
        break;
      }

      case 'slider': {
        // Output channel slider (no es un Knob, es un OutputChannel)
        const channel = control;
        let normalized;
        if (msg.type === 'pitchbend') {
          normalized = msg.value / 16383;
        } else if (msg.type === 'cc') {
          normalized = msg.value / 127;
        } else {
          normalized = (msg.velocity || 0) / 127;
        }
        // Escalar al rango real del slider (ej: 0-10 en Output Channel)
        const sliderEl = channel.slider;
        const sliderMin = parseFloat(sliderEl?.min ?? 0);
        const sliderMax = parseFloat(sliderEl?.max ?? 10);
        const level = sliderMin + normalized * (sliderMax - sliderMin);
        channel.deserialize({ level });
        break;
      }

      case 'switch':
      case 'toggle': {
        // Toggle: Note On = 'b' (on), Note Off = 'a' (off)
        // CC: valor > 63 = 'b', ≤ 63 = 'a'
        let state;
        if (msg.type === 'noteon' || msg.type === 'noteoff') {
          state = (msg.type === 'noteon' && (msg.velocity || 0) > 0) ? 'b' : 'a';
        } else if (msg.type === 'cc') {
          state = msg.value > 63 ? 'b' : 'a';
        } else {
          state = msg.value > 8191 ? 'b' : 'a';
        }
        if (control.setState) {
          control.setState(state);
        } else if (control.toggle) {
          // Si no tiene setState pero sí toggle, alternar cuando ON
          if (state === 'b') control.toggle();
        }
        break;
      }

      case 'pad': {
        // Joystick pad: mapping a X o Y según el tipo de mensaje
        // CC → X, Pitch Bend → Y (o se puede configurar)
        // Por ahora, mapeamos CC a posición 2D estimada
        const module = control;
        if (msg.type === 'cc' && module.setPosition) {
          const normalized = (msg.value / 127) * 2 - 1; // -1 a +1
          // CC par → X, CC impar → Y (patrón común en pads XY)
          if (msg.cc % 2 === 0) {
            module.setPosition(normalized, undefined);
          } else {
            module.setPosition(undefined, normalized);
          }
        }
        break;
      }

      case 'keyboard': {
        // Teclado flotante: despachar evento con datos MIDI para conversión a voltaje.
        // Funciona independientemente de si la ventana de teclados está visible.
        const keyboardId = control.keyboardId; // 'keyboard-upper' o 'keyboard-lower'
        document.dispatchEvent(new CustomEvent('synth:keyboardMIDI', {
          detail: {
            keyboardId,
            type: msg.type,           // 'noteon' | 'noteoff'
            note: msg.note ?? 0,      // 0–127 (MIDI note number)
            velocity: msg.velocity ?? 0,
            channel: msg.channel,
            // Para CC y PitchBend (modulación sobre el teclado)
            cc: msg.cc,
            value: msg.value
          }
        }));
        break;
      }

      default:
        log.warn(`Tipo de control no soportado para MIDI: ${controlType}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // INTERNOS — Resolución de controles
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Resuelve un ControlInfo a la instancia real del control.
   * @param {ControlInfo} target
   * @returns {{ control: Object, controlType: string } | null}
   */
  _resolveControl(target) {
    if (!this._app) return null;

    const found = this._app._findModuleById(target.moduleId);
    if (!found) return null;

    const { type, ui } = found;

    switch (type) {
      case 'oscillator': {
        const knob = ui.knobs?.[target.knobIndex];
        if (!knob) return null;
        const isVernier = target.knobIndex === 0; // Primer knob es VernierKnob
        return { control: knob, controlType: isVernier ? 'vernierKnob' : 'knob' };
      }

      case 'noise':
      case 'randomVoltage': {
        // ModuleUI: knobs es un objeto con claves string
        if (target.controlKey && ui.knobs?.[target.controlKey]) {
          return { control: ui.knobs[target.controlKey], controlType: 'knob' };
        }
        // Fallback por índice
        const keys = Object.keys(ui.knobs || {});
        const key = keys[target.knobIndex];
        if (key && ui.knobs[key]) {
          return { control: ui.knobs[key], controlType: 'knob' };
        }
        return null;
      }

      case 'inputAmplifiers': {
        const knob = ui.knobs?.[target.knobIndex];
        return knob ? { control: knob, controlType: 'knob' } : null;
      }

      case 'outputChannel': {
        if (target.controlType === 'slider') {
          return { control: ui, controlType: 'slider' };
        }
        if (target.controlType === 'knob' && target.controlKey === 'filter') {
          return ui.filterKnobUI ? { control: ui.filterKnobUI, controlType: 'knob' } : null;
        }
        if (target.controlType === 'knob' && target.controlKey === 'pan') {
          return ui.panKnobUI ? { control: ui.panKnobUI, controlType: 'knob' } : null;
        }
        if (target.controlType === 'switch') {
          return ui.powerSwitch ? { control: ui.powerSwitch, controlType: 'switch' } : null;
        }
        return null;
      }

      case 'joystick': {
        if (target.controlType === 'pad') {
          return ui.module ? { control: ui.module, controlType: 'pad' } : null;
        }
        if (target.controlType === 'knob' && target.controlKey) {
          const knobData = ui.knobs?.[target.controlKey];
          if (knobData?.knobInstance) {
            return { control: knobData.knobInstance, controlType: 'knob' };
          }
        }
        return null;
      }

      case 'keyboard': {
        // Teclados flotantes: el control es un objeto virtual
        // que despacha eventos MIDI a document para conversión a voltaje
        return { control: { keyboardId: target.moduleId }, controlType: 'keyboard' };
      }

      case 'oscilloscope': {
        const scopeKnobs = [ui.timeKnob, ui.ampKnob, ui.levelKnob];
        if (target.controlType === 'switch' || target.controlType === 'toggle') {
          return ui.modeToggle ? { control: ui.modeToggle, controlType: 'toggle' } : null;
        }
        const knobData = scopeKnobs[target.knobIndex];
        return knobData?.knobInstance
          ? { control: knobData.knobInstance, controlType: 'knob' }
          : null;
      }

      default:
        return null;
    }
  }

  /**
   * Resuelve el elemento DOM raíz de un control (para clases CSS).
   * @param {ControlInfo} target
   * @returns {HTMLElement|null}
   */
  _resolveControlElement(target) {
    const resolved = this._resolveControl(target);
    if (!resolved) return null;

    const { control, controlType } = resolved;

    // Knobs: rootEl es el contenedor visual
    if (controlType === 'knob' || controlType === 'vernierKnob') {
      return control.rootEl || null;
    }

    // Slider: el wrap del slider
    if (controlType === 'slider') {
      return control._sliderWrapEl || null;
    }

    // Switch/Toggle: el toggle element
    if (controlType === 'switch' || controlType === 'toggle') {
      return control.element || control.rootEl || null;
    }

    // Pad: el elemento del pad
    if (controlType === 'pad') {
      return control.element || null;
    }

    // Keyboard: el grupo SVG del teclado (puede no existir si ventana cerrada)
    if (controlType === 'keyboard') {
      const kbWin = document.getElementById('keyboardWindow');
      if (!kbWin) return null;
      const selector = target.moduleId === 'keyboard-upper' ? '#keyboard-upper' : '#keyboard-lower';
      return kbWin.querySelector(selector) || null;
    }

    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // INTERNOS — Persistencia
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Guarda los mappings en localStorage.
   */
  _saveToStorage() {
    try {
      const data = this.exportMappings();
      localStorage.setItem(STORAGE_KEYS.MIDI_MAPPINGS, JSON.stringify(data));
    } catch (err) {
      log.error('Error al guardar mappings MIDI:', err);
    }
  }

  /**
   * Carga los mappings desde localStorage.
   */
  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MIDI_MAPPINGS);
      if (!raw) return;

      const data = JSON.parse(raw);
      if (data && data.mappings) {
        // Importar sin limpiar (ya estamos vacíos en el constructor)
        for (const m of data.mappings) {
          if (!m.target || !m.target.moduleId) continue;

          const deviceId = m.midiKey?.split(':')[0] || 'any';
          const midiKey = m.midiKey || buildMIDIKey(deviceId, m.channel, m.type, m.number);

          const mapping = {
            midiKey,
            deviceId,
            deviceName: m.deviceName || 'Unknown',
            channel: m.channel,
            type: m.type,
            number: m.number,
            target: m.target
          };

          this._mappings.set(midiKey, mapping);
          this._controlIndex.set(buildControlId(m.target), midiKey);
        }
      }
    } catch (err) {
      log.error('Error al cargar mappings MIDI:', err);
    }
  }

  /**
   * Aplica los indicadores visuales `.midi-mapped` a todos los controles
   * que tengan mappings. Llamar después de que los UIs estén creados.
   */
  applyVisualIndicators() {
    for (const mapping of this._mappings.values()) {
      const el = this._resolveControlElement(mapping.target);
      if (el) {
        el.classList.add('midi-mapped');
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // INTERNOS — Formateo
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Genera una etiqueta legible para un origen MIDI.
   * @param {MIDIMapping} mapping
   * @returns {string}
   */
  _formatMIDISource(mapping) {
    const ch = mapping.channel + 1; // Mostrar 1-based
    switch (mapping.type) {
      case 'keyboard':
        return `Keyboard (Ch ${ch})`;
      case 'cc':
        return `CC ${mapping.number} (Ch ${ch})`;
      case 'noteon':
        return `Note ${this._noteNumberToName(mapping.number)} (Ch ${ch})`;
      case 'pitchbend':
        return `Pitch Bend (Ch ${ch})`;
      default:
        return `MIDI ${mapping.type} (Ch ${ch})`;
    }
  }

  /**
   * Convierte un número de nota MIDI a nombre legible.
   * @param {number} noteNumber - 0–127
   * @returns {string} Ej: "C4", "F#3"
   */
  _noteNumberToName(noteNumber) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(noteNumber / 12) - 1;
    const name = names[noteNumber % 12];
    return `${name}${octave}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON
// ─────────────────────────────────────────────────────────────────────────────

/** Instancia singleton del gestor de MIDI Learn */
export const midiLearnManager = new MIDILearnManagerClass();
