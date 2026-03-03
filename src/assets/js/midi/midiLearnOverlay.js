/**
 * MIDILearnOverlay - Indicador visual durante el modo MIDI Learn.
 * 
 * Muestra un overlay flotante informando al usuario de que debe mover
 * un control en su dispositivo MIDI. Se destruye al completar o cancelar.
 * 
 * @module midi/midiLearnOverlay
 */

import { t } from '../i18n/index.js';
import { midiAccess } from './midiAccess.js';

/** @type {HTMLElement|null} */
let overlayEl = null;

/**
 * Muestra el overlay de MIDI Learn.
 * @param {string} controlLabel - Nombre del control destino
 * @param {number} [deviceCount] - Número de dispositivos MIDI detectados
 */
export function showMIDILearnOverlay(controlLabel, deviceCount) {
  hideMIDILearnOverlay();

  // Obtener estado real de MIDI
  const count = typeof deviceCount === 'number' ? deviceCount : midiAccess.getInputs().length;
  const initialized = midiAccess.initialized;
  const devices = midiAccess.getInputs();

  // Línea de estado de dispositivos
  let statusHtml;
  if (!initialized) {
    statusHtml = `<div class="midi-learn-overlay__status midi-learn-overlay__status--error">⚠ MIDI no disponible</div>`;
  } else if (count === 0) {
    statusHtml = `<div class="midi-learn-overlay__status midi-learn-overlay__status--warning">⚠ ${t('settings.midi.noDevices')}</div>`;
  } else {
    const deviceNames = devices.map(d => d.name).join(', ');
    statusHtml = `<div class="midi-learn-overlay__status midi-learn-overlay__status--ok">🎹 ${escapeHtml(deviceNames)}</div>`;
  }

  overlayEl = document.createElement('div');
  overlayEl.className = 'midi-learn-overlay midi-learn-overlay--visible';
  overlayEl.innerHTML = `
    <div class="midi-learn-overlay__indicator">
      <div class="midi-learn-overlay__icon">${MIDI_ICON_SVG}</div>
      <div class="midi-learn-overlay__text">
        <div class="midi-learn-overlay__title">${t('midi.learn.waiting')}</div>
        <div class="midi-learn-overlay__target">${escapeHtml(controlLabel)}</div>
        ${statusHtml}
      </div>
      <button class="midi-learn-overlay__cancel" title="${t('midi.learn.cancel')}">✕</button>
    </div>
  `;

  // Botón cancelar
  const cancelBtn = overlayEl.querySelector('.midi-learn-overlay__cancel');
  cancelBtn.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('midi:learnCancel'));
  });

  document.body.appendChild(overlayEl);
}

/**
 * Muestra una notificación breve de asignación completada.
 * @param {string} sourceLabel - Ej: "CC 74 (Ch 1)"
 * @param {string} targetLabel - Ej: "Osc 1 > Pulso"
 */
export function showMIDILearnSuccess(sourceLabel, targetLabel) {
  hideMIDILearnOverlay();

  overlayEl = document.createElement('div');
  overlayEl.className = 'midi-learn-overlay midi-learn-overlay--visible midi-learn-overlay--success';
  overlayEl.innerHTML = `
    <div class="midi-learn-overlay__indicator">
      <div class="midi-learn-overlay__icon">${MIDI_ICON_SVG}</div>
      <div class="midi-learn-overlay__text">
        <div class="midi-learn-overlay__title">${escapeHtml(sourceLabel)} → ${escapeHtml(targetLabel)}</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlayEl);

  // Auto-ocultar tras 2 segundos
  setTimeout(() => {
    if (overlayEl) {
      overlayEl.classList.add('midi-learn-overlay--fadeout');
      setTimeout(hideMIDILearnOverlay, 400);
    }
  }, 2000);
}

/**
 * Oculta y destruye el overlay.
 */
export function hideMIDILearnOverlay() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escapa HTML para prevenir XSS en contenido dinámico.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Icono MIDI SVG (conector DIN-5 estilizado) */
const MIDI_ICON_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5">
  <circle cx="12" cy="12" r="10"/>
  <circle cx="8" cy="9" r="1.2" fill="currentColor"/>
  <circle cx="16" cy="9" r="1.2" fill="currentColor"/>
  <circle cx="6" cy="13" r="1.2" fill="currentColor"/>
  <circle cx="18" cy="13" r="1.2" fill="currentColor"/>
  <circle cx="12" cy="15" r="1.2" fill="currentColor"/>
</svg>`;

// ─────────────────────────────────────────────────────────────────────────────
// SETUP — Conectar con eventos del MIDILearnManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa los listeners del overlay para responder a eventos MIDI Learn.
 * Llamar una vez al inicio de la aplicación.
 */
export function initMIDILearnOverlay() {
  document.addEventListener('midi:learnStart', (e) => {
    const target = e.detail?.target;
    const label = target?.label || target?.moduleId || 'Control';
    const deviceCount = e.detail?.deviceCount;
    showMIDILearnOverlay(label, deviceCount);
  });

  document.addEventListener('midi:learnComplete', (e) => {
    const { sourceLabel, targetLabel } = e.detail || {};
    if (sourceLabel && targetLabel) {
      showMIDILearnSuccess(sourceLabel, targetLabel);
    } else {
      hideMIDILearnOverlay();
    }
  });

  document.addEventListener('midi:learnCancel', () => {
    hideMIDILearnOverlay();
  });
}
