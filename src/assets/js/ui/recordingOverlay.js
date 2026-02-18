/**
 * Overlay visual de grabación.
 * Muestra un indicador "REC" pulsante semitransparente sobre la pantalla
 * cuando se está grabando audio. No bloquea la interacción.
 */

import { t, onLocaleChange } from '../i18n/index.js';

/**
 * Crea y gestiona el overlay visual de grabación.
 * Se muestra/oculta escuchando el evento 'synth:recordingChanged'.
 */
export class RecordingOverlay {
  constructor() {
    this._overlay = null;
    this._timerInterval = null;
    this._startTime = 0;
    this._create();
    this._bindEvents();
    this._unsubscribeLocale = onLocaleChange(() => this._updateTexts());
  }

  /**
   * Crea la estructura DOM del overlay
   */
  _create() {
    // Contenedor principal - no bloquea interacción (pointer-events: none)
    this._overlay = document.createElement('div');
    this._overlay.className = 'recording-overlay';
    this._overlay.setAttribute('aria-live', 'polite');
    this._overlay.setAttribute('aria-atomic', 'true');

    // Indicador REC con punto rojo pulsante
    const indicator = document.createElement('div');
    indicator.className = 'recording-overlay__indicator';

    const dot = document.createElement('span');
    dot.className = 'recording-overlay__dot';

    const label = document.createElement('span');
    label.className = 'recording-overlay__label';
    label.textContent = 'REC';

    const timer = document.createElement('span');
    timer.className = 'recording-overlay__timer';
    timer.textContent = '00:00';
    this._timerElement = timer;

    indicator.appendChild(dot);
    indicator.appendChild(label);
    indicator.appendChild(timer);
    this._overlay.appendChild(indicator);

    document.body.appendChild(this._overlay);
  }

  /**
   * Vincula eventos de grabación
   */
  _bindEvents() {
    document.addEventListener('synth:recordingChanged', (e) => {
      const recording = e.detail?.recording ?? false;
      if (recording) {
        this.show();
      } else {
        this.hide();
      }
    });
  }

  /**
   * Muestra el overlay
   */
  show() {
    this._overlay.classList.add('recording-overlay--visible');
    this._overlay.setAttribute('aria-label', t('recording.overlay.recording'));
    this._startTime = Date.now();
    this._updateTimer();
    this._timerInterval = setInterval(() => this._updateTimer(), 1000);
  }

  /**
   * Oculta el overlay
   */
  hide() {
    this._overlay.classList.remove('recording-overlay--visible');
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
    if (this._timerElement) {
      this._timerElement.textContent = '00:00';
    }
  }

  /**
   * Actualiza el temporizador
   */
  _updateTimer() {
    if (!this._timerElement) return;
    const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const seconds = String(elapsed % 60).padStart(2, '0');
    this._timerElement.textContent = `${minutes}:${seconds}`;
  }

  /**
   * Actualiza textos para i18n
   */
  _updateTexts() {
    if (this._overlay.classList.contains('recording-overlay--visible')) {
      this._overlay.setAttribute('aria-label', t('recording.overlay.recording'));
    }
  }

  /**
   * Limpieza
   */
  destroy() {
    if (this._unsubscribeLocale) this._unsubscribeLocale();
    if (this._timerInterval) clearInterval(this._timerInterval);
    if (this._overlay?.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }
  }
}
