/**
 * EnvelopeShaper - Componente UI para Envelope Shaper (ADSR+Delay)
 *
 * Genera la interfaz visual con 8 knobs + botón de gate + LED:
 * - Mode: Selector rotativo de 5 posiciones (GATED_FR, FREE_RUN, GATED, TRIGGERED, HOLD)
 * - Delay: Retardo antes de ADSR (1ms-20s, exponencial)
 * - Attack: Tiempo de ataque (1ms-20s, exponencial)
 * - Decay: Tiempo de caída (1ms-20s, exponencial)
 * - Sustain: Nivel de sustain (0-100%, lineal)
 * - Release: Tiempo de release (1ms-20s, exponencial)
 * - Envelope Level: Nivel de envolvente CV (±5V, bipolar)
 * - Signal Level: Nivel de audio VCA (0-10, LOG)
 *
 * Extiende ModuleUI para reutilizar la lógica común de knobs.
 *
 * @module ui/envelopeShaper
 */

import { ModuleUI } from './moduleUI.js';
import { KNOB_RED, KNOB_WHITE, KNOB_BLUE } from '../configs/knobColors.js';

export class EnvelopeShaper extends ModuleUI {
  /**
   * @param {Object} options
   * @param {string} options.id - ID único del componente
   * @param {string} [options.title='Envelope Shaper'] - Título mostrado
   * @param {Object} [options.knobOptions] - Configuración de knobs
   * @param {number} [options.knobSize=40] - Tamaño de los knobs en px
   */
  constructor(options = {}) {
    super({
      id: options.id || 'envelope-shaper',
      title: options.title || 'Envelope Shaper',
      cssClass: 'envelope-shaper',
      knobDefs: [
        { key: 'mode',          label: 'Mode',     color: KNOB_WHITE, type: 'selector' },
        { key: 'delay',         label: 'Delay',    color: KNOB_RED,   type: 'normal' },
        { key: 'attack',        label: 'Attack',   color: KNOB_RED,   type: 'normal' },
        { key: 'decay',         label: 'Decay',    color: KNOB_RED,   type: 'normal' },
        { key: 'sustain',       label: 'Sustain',  color: KNOB_RED,   type: 'normal' },
        { key: 'release',       label: 'Release',  color: KNOB_RED,   type: 'normal' },
        { key: 'envelopeLevel', label: 'Env Level', color: KNOB_BLUE, type: 'bipolar' },
        { key: 'signalLevel',   label: 'Sig Level', color: KNOB_WHITE, type: 'normal' }
      ],
      knobOptions: options.knobOptions || {},
      knobSize: options.knobSize || 40,
      knobInnerPct: options.knobInnerPct,
      knobGap: options.knobGap,
      knobRowOffsetX: options.knobRowOffsetX,
      knobRowOffsetY: options.knobRowOffsetY,
      knobOffsets: options.knobOffsets
    });

    this._gateButton = null;
    this._gateLed = null;
    this._gateActive = false;
    this._onGatePress = options.onGatePress || null;
    this._onGateRelease = options.onGateRelease || null;
  }

  /**
   * Crea el elemento DOM del componente.
   * Extiende el base para añadir el botón de gate y LED.
   * @returns {HTMLElement}
   */
  createElement() {
    const container = super.createElement();

    // Gate button + LED row
    const gateRow = document.createElement('div');
    gateRow.className = 'envelope-shaper__gate-row';

    // LED indicator
    this._gateLed = document.createElement('div');
    this._gateLed.className = 'envelope-shaper__led';
    gateRow.appendChild(this._gateLed);

    // Gate button
    this._gateButton = document.createElement('button');
    this._gateButton.type = 'button';
    this._gateButton.className = 'envelope-shaper__gate-btn';
    this._gateButton.textContent = 'GATE';

    // Gate works as momentary press (hold to gate)
    this._gateButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._setGateActive(true);
    });
    this._gateButton.addEventListener('pointerup', () => this._setGateActive(false));
    this._gateButton.addEventListener('pointerleave', () => {
      if (this._gateActive) this._setGateActive(false);
    });

    gateRow.appendChild(this._gateButton);
    container.appendChild(gateRow);

    return container;
  }

  /**
   * Activa/desactiva el gate manual.
   * @param {boolean} active
   * @private
   */
  _setGateActive(active) {
    this._gateActive = active;
    if (this._gateLed) {
      this._gateLed.classList.toggle('envelope-shaper__led--active', active);
    }
    if (this._gateButton) {
      this._gateButton.classList.toggle('envelope-shaper__gate-btn--active', active);
    }
    if (active && this._onGatePress) {
      this._onGatePress();
    } else if (!active && this._onGateRelease) {
      this._onGateRelease();
    }
  }

  /**
   * Establece el estado del LED (para feedback de trigger externo).
   * @param {boolean} active
   */
  setLedState(active) {
    if (this._gateLed) {
      this._gateLed.classList.toggle('envelope-shaper__led--active', active);
    }
  }

  /**
   * Serializa el estado incluyendo gate.
   * @returns {Object}
   */
  serialize() {
    return super.serialize();
  }

  /**
   * Restaura estado.
   * @param {Object} data
   */
  deserialize(data) {
    super.deserialize(data);
  }
}

export default EnvelopeShaper;
