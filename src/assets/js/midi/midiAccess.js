/**
 * MIDIAccess - Wrapper sobre la Web MIDI API.
 * 
 * Gestiona el acceso a dispositivos MIDI, escucha mensajes entrantes de todos
 * los puertos, y parsea los mensajes en objetos tipados (CC, Note, Pitch Bend).
 * 
 * Emite eventos `midi:statusChanged` en `document` cuando se conectan o
 * desconectan dispositivos.
 * 
 * @module midi/midiAccess
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('MIDIAccess');

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE MENSAJE MIDI
// ─────────────────────────────────────────────────────────────────────────────

/** @typedef {'cc'|'noteon'|'noteoff'|'pitchbend'} MIDIMessageType */

/**
 * @typedef {Object} ParsedMIDIMessage
 * @property {MIDIMessageType} type
 * @property {number} channel     - Canal MIDI 0–15
 * @property {number} [cc]        - Número de CC (solo para type='cc')
 * @property {number} [value]     - Valor 0–127 (CC, velocity) o 0–16383 (pitch bend)
 * @property {number} [note]      - Número de nota MIDI 0–127 (solo para noteon/noteoff)
 * @property {number} [velocity]  - Velocidad 0–127 (solo para noteon/noteoff)
 * @property {string} deviceId    - ID único del dispositivo MIDI
 * @property {string} deviceName  - Nombre legible del dispositivo
 */

/**
 * @typedef {Object} MIDIDeviceInfo
 * @property {string} id    - ID único del puerto MIDI
 * @property {string} name  - Nombre del dispositivo
 * @property {string} manufacturer - Fabricante
 * @property {'connected'|'disconnected'} state
 */

// ─────────────────────────────────────────────────────────────────────────────
// CLASE MIDIAccess (singleton)
// ─────────────────────────────────────────────────────────────────────────────

class MIDIAccessManager {
  constructor() {
    /** @type {MIDIAccess|null} */
    this._midiAccess = null;

    /** @type {boolean} */
    this._supported = false;

    /** @type {boolean} */
    this._initialized = false;

    /** @type {Set<Function>} */
    this._messageCallbacks = new Set();

    /** @type {Map<string, MIDIInput>} */
    this._activeInputs = new Map();

    /** Bound handler para reutilizar referencia al añadir/quitar listeners */
    this._onMIDIMessage = this._onMIDIMessage.bind(this);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // API PÚBLICA
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ¿Soporta el navegador Web MIDI API?
   * @returns {boolean}
   */
  get supported() {
    return this._supported;
  }

  /**
   * ¿Se ha inicializado correctamente?
   * @returns {boolean}
   */
  get initialized() {
    return this._initialized;
  }

  /**
   * Inicializa el acceso MIDI. Solicita permisos al navegador.
   * @returns {Promise<boolean>} true si se obtuvo acceso
   */
  async init() {
    if (this._initialized) return true;

    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      console.warn('[MIDI] Web MIDI API no soportada en este navegador');
      this._supported = false;
      return false;
    }

    this._supported = true;

    try {
      console.log('[MIDI] Solicitando acceso MIDI...');
      this._midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this._initialized = true;

      // Diagnóstico: listar todos los puertos raw
      console.log('[MIDI] Acceso concedido. Puertos de entrada:');
      for (const input of this._midiAccess.inputs.values()) {
        console.log(`[MIDI]   IN: "${input.name}" id=${input.id} state=${input.state} connection=${input.connection} manufacturer="${input.manufacturer}"`);
      }
      console.log('[MIDI] Puertos de salida:');
      for (const output of this._midiAccess.outputs.values()) {
        console.log(`[MIDI]   OUT: "${output.name}" id=${output.id} state=${output.state}`);
      }
      if (this._midiAccess.inputs.size === 0) {
        console.warn('[MIDI] ⚠ No se encontraron puertos de entrada MIDI. Verifica que el dispositivo esté conectado y que el navegador tenga acceso.');
      }

      // Escuchar cambios de estado (conexión/desconexión)
      this._midiAccess.onstatechange = (e) => this._onStateChange(e);

      // Registrar listeners en todos los inputs actuales (abrir puertos)
      await this._bindAllInputs();

      const inputs = this.getInputs();
      console.log(`[MIDI] Inicializado — ${inputs.length} dispositivo(s) de entrada activo(s)`);

      this._emitStatusChanged();
      return true;
    } catch (err) {
      console.error('[MIDI] Error al solicitar acceso MIDI:', err);
      this._initialized = false;
      return false;
    }
  }

  /**
   * Devuelve la lista de dispositivos de entrada MIDI conectados.
   * @returns {MIDIDeviceInfo[]}
   */
  getInputs() {
    if (!this._midiAccess) return [];

    const inputs = [];
    for (const input of this._midiAccess.inputs.values()) {
      inputs.push({
        id: input.id,
        name: input.name || 'Dispositivo MIDI',
        manufacturer: input.manufacturer || '',
        state: input.state
      });
    }
    return inputs;
  }

  /**
   * Registra un callback para mensajes MIDI entrantes parseados.
   * @param {function(ParsedMIDIMessage): void} callback
   * @returns {function(): void} Función para desregistrar el callback
   */
  onMessage(callback) {
    this._messageCallbacks.add(callback);
    return () => this._messageCallbacks.delete(callback);
  }

  /**
   * Limpia todos los recursos.
   */
  destroy() {
    // Desregistrar listeners de todos los inputs
    for (const input of this._activeInputs.values()) {
      input.onmidimessage = null;
    }
    this._activeInputs.clear();
    this._messageCallbacks.clear();

    if (this._midiAccess) {
      this._midiAccess.onstatechange = null;
      this._midiAccess = null;
    }

    this._initialized = false;
    log.info('MIDI destruido');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // INTERNOS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Registra el handler de mensajes en todos los puertos de entrada actuales.
   * Abre explícitamente cada puerto (necesario en Linux/Chrome).
   */
  async _bindAllInputs() {
    if (!this._midiAccess) return;

    // Desregistrar los previos
    for (const input of this._activeInputs.values()) {
      input.onmidimessage = null;
    }
    this._activeInputs.clear();

    // Registrar los actuales — abrir explícitamente cada puerto
    const openPromises = [];
    for (const input of this._midiAccess.inputs.values()) {
      if (input.state === 'connected') {
        openPromises.push(
          this._openAndBind(input).catch(err =>
            console.warn(`[MIDI] No se pudo abrir ${input.name}: ${err.message}`, err)
          )
        );
      }
    }
    await Promise.all(openPromises);
  }

  /**
   * Abre un puerto MIDI y registra el handler de mensajes.
   * @param {MIDIInput} input
   */
  async _openAndBind(input) {
    // Abrir explícitamente — en Linux Chrome esto es imprescindible
    console.log(`[MIDI] Abriendo puerto: "${input.name}" (connection=${input.connection})...`);
    if (input.connection !== 'open') {
      await input.open();
    }
    input.onmidimessage = this._onMIDIMessage;
    this._activeInputs.set(input.id, input);
    console.log(`[MIDI] ✓ Puerto vinculado: "${input.name}" (${input.id}) [${input.connection}]`);
  }

  /**
   * Handler para mensajes MIDI crudos. Parsea y notifica a los callbacks.
   * @param {MIDIMessageEvent} event
   */
  _onMIDIMessage(event) {
    const parsed = this._parseMessage(event);
    if (!parsed) return;

    // Log siempre visible (no depende de LOG_LEVEL)
    console.log(`[MIDI] IN: ${parsed.type} ch=${parsed.channel} from="${parsed.deviceName}"`,
      parsed.type === 'cc' ? `cc=${parsed.cc} val=${parsed.value}` :
      parsed.type === 'pitchbend' ? `val=${parsed.value}` :
      `note=${parsed.note} vel=${parsed.velocity}`);

    for (const cb of this._messageCallbacks) {
      try {
        cb(parsed);
      } catch (err) {
        log.error('Error en callback MIDI:', err);
      }
    }
  }

  /**
   * Parsea un MIDIMessageEvent en un objeto tipado.
   * @param {MIDIMessageEvent} event
   * @returns {ParsedMIDIMessage|null}
   */
  _parseMessage(event) {
    const data = event.data;
    if (!data || data.length < 1) return null;

    const statusByte = data[0];
    const channel = statusByte & 0x0F;
    const command = statusByte & 0xF0;

    // Info del dispositivo origen
    const port = event.target;
    const deviceId = port?.id || 'unknown';
    const deviceName = port?.name || 'MIDI Device';

    const base = { channel, deviceId, deviceName };

    switch (command) {
      // ── Note Off ──
      case 0x80:
        return {
          ...base,
          type: 'noteoff',
          note: data[1],
          velocity: data[2]
        };

      // ── Note On ──
      case 0x90: {
        const velocity = data[2];
        // Velocity 0 = Note Off (convención MIDI)
        if (velocity === 0) {
          return { ...base, type: 'noteoff', note: data[1], velocity: 0 };
        }
        return {
          ...base,
          type: 'noteon',
          note: data[1],
          velocity
        };
      }

      // ── Control Change ──
      case 0xB0:
        return {
          ...base,
          type: 'cc',
          cc: data[1],
          value: data[2]
        };

      // ── Pitch Bend ──
      case 0xE0: {
        // 14-bit value: LSB (data[1]) + MSB (data[2])
        const value = (data[2] << 7) | data[1]; // 0–16383, centro = 8192
        return {
          ...base,
          type: 'pitchbend',
          value
        };
      }

      default:
        // Ignoramos otros mensajes (aftertouch, program change, sysex...)
        return null;
    }
  }

  /**
   * Maneja cambios de estado de puertos MIDI (conexión/desconexión).
   * @param {MIDIConnectionEvent} event
   */
  _onStateChange(event) {
    const port = event.port;
    if (port.type !== 'input') return;

    if (port.state === 'connected') {
      console.log(`[MIDI] Dispositivo conectado: "${port.name}"`);
      this._openAndBind(port).catch(err =>
        console.warn(`[MIDI] No se pudo abrir ${port.name}: ${err.message}`, err)
      );
    } else {
      console.log(`[MIDI] Dispositivo desconectado: "${port.name}"`);
      port.onmidimessage = null;
      this._activeInputs.delete(port.id);
    }

    this._emitStatusChanged();
  }

  /**
   * Emite evento personalizado de cambio de estado MIDI.
   */
  _emitStatusChanged() {
    const inputs = this.getInputs();
    document.dispatchEvent(new CustomEvent('midi:statusChanged', {
      detail: { inputs, supported: this._supported }
    }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON
// ─────────────────────────────────────────────────────────────────────────────

/** Instancia singleton del gestor de acceso MIDI */
export const midiAccess = new MIDIAccessManager();
