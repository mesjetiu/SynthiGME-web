/**
 * Tests de la clase real `RecordingOverlay` (src/assets/js/ui/recordingOverlay.js).
 *
 * Hasta septiembre de 2026 este fichero reescribía el formato MM:SS y
 * "contratos" de nombres de clase como constantes del propio test. Ahora se
 * instancia la clase real en un DOM de JSDOM, con el i18n real cargado y los
 * temporizadores simulados (`mock.timers`), y se comprueba lo que la app usa:
 * que el overlay se monta en `document.body`, que responde al evento
 * `synth:recordingChanged` que dispara `uiInitializer.js`, que el cronómetro
 * avanza cada segundo desde el `show()`, que se limpia al ocultar, y que la
 * etiqueta accesible sigue al idioma.
 */

import { describe, it, before, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(__dirname, '../../src/assets/css/main.css');

// ─── JSDOM ───────────────────────────────────────────────────────────────────
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.HTMLElement = dom.window.HTMLElement;
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] ?? null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
};

const { RecordingOverlay } = await import('../../src/assets/js/ui/recordingOverlay.js');
const { loadLocale, setLocale, t } = await import('../../src/assets/js/i18n/index.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const overlays = () => document.querySelectorAll('.recording-overlay');

function fireRecording(recording) {
  document.dispatchEvent(new CustomEvent('synth:recordingChanged', { detail: { recording } }));
}

function timerText(overlay) {
  return overlay._overlay.querySelector('.recording-overlay__timer').textContent;
}

function isVisible(overlay) {
  return overlay._overlay.classList.contains('recording-overlay--visible');
}

// ═══════════════════════════════════════════════════════════════════════════

describe('RecordingOverlay (clase real)', () => {
  let overlay;

  before(async () => {
    await loadLocale('es');
  });

  beforeEach(() => {
    mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1_000_000 });
    overlay = new RecordingOverlay();
  });

  afterEach(async () => {
    overlay.destroy();
    mock.timers.reset();
    await setLocale('es', false);
    assert.equal(overlays().length, 0, 'cada test deja el body limpio');
  });

  describe('Estructura', () => {
    it('se monta en document.body con las clases BEM que espera el CSS', () => {
      assert.equal(overlays().length, 1);
      const el = overlay._overlay;
      assert.equal(el.parentNode, document.body);
      assert.equal(el.className, 'recording-overlay');
      assert.ok(el.querySelector('.recording-overlay__indicator'));
      assert.ok(el.querySelector('.recording-overlay__indicator > .recording-overlay__dot'));
      assert.equal(el.querySelector('.recording-overlay__label').textContent, 'REC');
      assert.equal(el.querySelector('.recording-overlay__timer').textContent, '00:00');
    });

    it('es una región aria-live cortés y atómica', () => {
      assert.equal(overlay._overlay.getAttribute('aria-live'), 'polite');
      assert.equal(overlay._overlay.getAttribute('aria-atomic'), 'true');
    });

    it('arranca oculto', () => {
      assert.equal(isVisible(overlay), false);
      assert.equal(overlay._timerInterval, null);
    });

    it('las clases que usa existen en main.css (visible, indicador, punto, etiqueta, temporizador)', () => {
      const css = readFileSync(CSS_PATH, 'utf8');
      for (const cls of ['.recording-overlay {', '.recording-overlay--visible', '.recording-overlay__indicator',
        '.recording-overlay__dot', '.recording-overlay__label', '.recording-overlay__timer']) {
        assert.ok(css.includes(cls), `falta ${cls} en main.css`);
      }
      assert.match(css, /\.recording-overlay \{[^}]*pointer-events: none/, 'no bloquea la interacción');
    });
  });

  describe('show() / hide()', () => {
    it('show añade la clase visible, pone la etiqueta accesible y arranca el cronómetro', () => {
      overlay.show();
      assert.equal(isVisible(overlay), true);
      assert.equal(overlay._overlay.getAttribute('aria-label'), 'Grabación en curso');
      assert.equal(timerText(overlay), '00:00');
      assert.notEqual(overlay._timerInterval, null);
    });

    it('el cronómetro cuenta segundos desde el show(), en MM:SS con ceros', () => {
      overlay.show();
      mock.timers.tick(1000);
      assert.equal(timerText(overlay), '00:01');
      mock.timers.tick(58_000);
      assert.equal(timerText(overlay), '00:59');
      mock.timers.tick(1000);
      assert.equal(timerText(overlay), '01:00');
      mock.timers.tick(30_000);
      assert.equal(timerText(overlay), '01:30');
    });

    it('pasada la hora sigue contando minutos (60:00, 61:05…)', () => {
      overlay.show();
      mock.timers.tick(3600_000);
      assert.equal(timerText(overlay), '60:00');
      mock.timers.tick(65_000);
      assert.equal(timerText(overlay), '61:05');
    });

    it('hide quita la clase, para el cronómetro y lo deja en 00:00', () => {
      overlay.show();
      mock.timers.tick(5000);
      assert.equal(timerText(overlay), '00:05');
      overlay.hide();
      assert.equal(isVisible(overlay), false);
      assert.equal(overlay._timerInterval, null);
      assert.equal(timerText(overlay), '00:00');
      mock.timers.tick(5000);
      assert.equal(timerText(overlay), '00:00', 'ya no avanza');
    });

    it('hide sin show previo es inofensivo', () => {
      assert.doesNotThrow(() => overlay.hide());
      assert.equal(isVisible(overlay), false);
    });

    it('una segunda grabación vuelve a empezar de 00:00', () => {
      overlay.show();
      mock.timers.tick(42_000);
      overlay.hide();
      mock.timers.tick(10_000);
      overlay.show();
      assert.equal(timerText(overlay), '00:00');
      mock.timers.tick(3000);
      assert.equal(timerText(overlay), '00:03');
    });

    it('QUIRK: show() dos veces seguidas pierde el primer intervalo (queda corriendo hasta destroy)', () => {
      overlay.show();
      const first = overlay._timerInterval;
      overlay.show();
      assert.notEqual(overlay._timerInterval, first);
      overlay.hide();                                  // solo limpia el segundo
      mock.timers.tick(2000);
      assert.equal(timerText(overlay), '00:02', 'el intervalo huérfano sigue escribiendo');
    });
  });

  describe('Evento synth:recordingChanged', () => {
    it('recording: true muestra; recording: false oculta', () => {
      fireRecording(true);
      assert.equal(isVisible(overlay), true);
      mock.timers.tick(2000);
      assert.equal(timerText(overlay), '00:02');
      fireRecording(false);
      assert.equal(isVisible(overlay), false);
      assert.equal(timerText(overlay), '00:00');
    });

    it('sin detail.recording se interpreta como parar', () => {
      overlay.show();
      document.dispatchEvent(new CustomEvent('synth:recordingChanged', { detail: {} }));
      assert.equal(isVisible(overlay), false);
      overlay.show();
      document.dispatchEvent(new CustomEvent('synth:recordingChanged'));
      assert.equal(isVisible(overlay), false);
    });
  });

  describe('Idioma', () => {
    it('al cambiar de idioma con el overlay visible, la etiqueta accesible se traduce', async () => {
      overlay.show();
      await setLocale('en', false);
      assert.equal(overlay._overlay.getAttribute('aria-label'), t('recording.overlay.recording'));
      assert.equal(overlay._overlay.getAttribute('aria-label'), 'Recording in progress');
    });

    it('oculto, el cambio de idioma no toca la etiqueta', async () => {
      await setLocale('en', false);
      assert.equal(overlay._overlay.hasAttribute('aria-label'), false);
    });
  });

  describe('destroy()', () => {
    it('quita el overlay del DOM, para el cronómetro y se desuscribe del idioma', async () => {
      overlay.show();
      const el = overlay._overlay;
      overlay.destroy();
      assert.equal(el.parentNode, null);
      assert.equal(overlays().length, 0);
      mock.timers.tick(3000);
      assert.equal(el.querySelector('.recording-overlay__timer').textContent, '00:00', 'sin intervalo vivo');
      el.classList.add('recording-overlay--visible');
      await setLocale('en', false);
      assert.equal(el.getAttribute('aria-label'), 'Grabación en curso', 'ya no escucha cambios de idioma');
      overlay = new RecordingOverlay();                // para que afterEach tenga algo que destruir
    });

    it('destroy dos veces no falla', () => {
      overlay.destroy();
      assert.doesNotThrow(() => overlay.destroy());
      overlay = new RecordingOverlay();
    });
  });
});
