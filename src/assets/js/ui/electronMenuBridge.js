/**
 * Electron Menu Bridge (Renderer Side)
 * 
 * Puente bidireccional entre el menú nativo de Electron y la aplicación web.
 * 
 * - Escucha acciones del menú (menuAPI.onMenuAction) → dispara CustomEvents
 * - Escucha eventos de la app (synth:*, osc:*) → sincroniza estado al menú
 * - Envía traducciones al menú cuando cambia el idioma
 * 
 * Solo se activa si window.menuAPI existe (i.e. estamos en Electron).
 */

import { t, onLocaleChange, getLocale, getSupportedLocales } from '../i18n/index.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { getOpenPips } from './pipManager.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('MenuBridge');

/** Indica si el puente está activo */
let initialized = false;

/**
 * Claves de traducción necesarias para el menú nativo.
 * Se envían al proceso principal para reconstruir el menú.
 */
const MENU_TRANSLATION_KEYS = [
  // App
  'app.windowTitle',
  // Archivo
  'menu.file', 'menu.file.patches', 'menu.file.language',
  'menu.file.reload', 'menu.file.quit',
  'menu.file.reload.confirm', 'common.cancel',
  // Ver
  'menu.view', 'menu.view.quickbar', 'menu.view.fullscreen',
  'menu.view.zoomIn', 'menu.view.zoomOut', 'menu.view.zoomReset',
  'menu.view.inactivePins', 'menu.view.tooltipVoltage', 'menu.view.tooltipAudioRate',
  'menu.view.linearFaders', 'menu.view.devTools',
  // Audio
  'menu.audio', 'menu.audio.mute', 'menu.audio.unmute',
  'menu.audio.record', 'menu.audio.stopRecording',
  'menu.audio.audioSettings', 'menu.audio.recordSettings',
  // Paneles
  'menu.panels', 'menu.panels.detachHeader', 'menu.panels.detachAll', 'menu.panels.attachAll',
  'menu.panels.lockPan', 'menu.panels.lockZoom', 'menu.panels.rememberPip',
  // Avanzado
  'menu.advanced', 'menu.advanced.debugGlobal',
  'menu.advanced.dormancy', 'menu.advanced.dormancyDebug',
  'menu.advanced.filterBypass', 'menu.advanced.filterBypassDebug',
  'menu.advanced.softClip', 'menu.advanced.pinTolerance', 'menu.advanced.thermalDrift',
  'menu.advanced.resetSynth', 'menu.advanced.settings',
  // OSC
  'menu.osc', 'menu.osc.enable', 'menu.osc.sendToSC', 'menu.osc.receiveFromSC',
  'menu.osc.showLog', 'menu.osc.settings',
  // Ayuda
  'menu.help', 'menu.help.about', 'menu.help.repository',
  'menu.help.reportBug', 'menu.help.checkUpdates'
];

/**
 * Lee un booleano de localStorage
 * @param {string} key - Clave de localStorage
 * @param {boolean} defaultVal - Valor por defecto
 * @returns {boolean}
 */
function readBool(key, defaultVal) {
  const val = localStorage.getItem(key);
  if (val === null) return defaultVal;
  return val === 'true';
}

/**
 * Lee el estado actual completo desde localStorage para sincronizar el menú.
 * @returns {Object} Estado para enviar al main process
 */
function readCurrentState() {
  const openPips = getOpenPips();
  const pipPanels = {};
  ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6', 'panel-output'].forEach(id => {
    pipPanels[id] = openPips.includes(id);
  });

  return {
    muted: false, // No hay persistencia de mute, siempre empieza unmuted
    recording: false,
    quickbarVisible: readBool(STORAGE_KEYS.QUICKBAR_VISIBLE ?? 'synthigme-quickbar-visible', true),
    // Ver
    inactivePins: readBool(STORAGE_KEYS.SHOW_INACTIVE_PINS, false),
    tooltipVoltage: readBool(STORAGE_KEYS.TOOLTIP_SHOW_VOLTAGE, true),
    tooltipAudioRate: readBool(STORAGE_KEYS.TOOLTIP_SHOW_AUDIO_VALUES, true),
    linearFaders: readBool(STORAGE_KEYS.FADER_LINEAR_RESPONSE, true),
    // Paneles
    panLocked: window.__synthNavLocks?.panLocked ?? false,
    zoomLocked: window.__synthNavLocks?.zoomLocked ?? false,
    rememberPip: readBool(STORAGE_KEYS.PIP_REMEMBER, false),
    pipPanels,
    // Avanzado
    debugGlobal: readBool(STORAGE_KEYS.OPTIMIZATIONS_DEBUG, false),
    dormancy: readBool(STORAGE_KEYS.DORMANCY_ENABLED, true),
    dormancyDebug: readBool(STORAGE_KEYS.DORMANCY_DEBUG, false),
    filterBypass: readBool(STORAGE_KEYS.FILTER_BYPASS_ENABLED, true),
    filterBypassDebug: readBool(STORAGE_KEYS.FILTER_BYPASS_DEBUG, false),
    softClip: readBool(STORAGE_KEYS.VOLTAGE_SOFT_CLIP_ENABLED, true),
    pinTolerance: readBool(STORAGE_KEYS.VOLTAGE_PIN_TOLERANCE_ENABLED, true),
    thermalDrift: readBool(STORAGE_KEYS.VOLTAGE_THERMAL_DRIFT_ENABLED, true),
    // OSC
    oscEnabled: readBool(STORAGE_KEYS.OSC_ENABLED, false),
    oscSendToSC: readBool(STORAGE_KEYS.OSC_SUPERCOLLIDER_SEND, false),
    oscReceiveFromSC: readBool(STORAGE_KEYS.OSC_SUPERCOLLIDER_RECEIVE, false),
    oscShowLog: readBool(STORAGE_KEYS.OSC_LOG_VISIBLE, false)
  };
}

/**
 * Construye y envía las traducciones actuales al menú nativo.
 */
function syncTranslations() {
  if (!window.menuAPI) return;
  const translations = {};
  MENU_TRANSLATION_KEYS.forEach(key => {
    translations[key] = t(key);
  });
  // Enviar datos de idioma para el submenú de idioma en el menú nativo
  translations['_locale'] = getLocale();
  translations['_locales'] = getSupportedLocales();
  // Nombres nativos de idiomas (settings.language.xx ya están en los locales generados)
  getSupportedLocales().forEach(code => {
    translations[`settings.language.${code}`] = t(`settings.language.${code}`);
  });
  window.menuAPI.syncTranslations(translations);
}

/**
 * Envía el estado actual al menú nativo.
 */
function syncState(partial) {
  if (!window.menuAPI) return;
  window.menuAPI.syncMenuState(partial || readCurrentState());
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeo de acciones del menú → CustomEvents / acciones del renderer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maneja una acción recibida del menú nativo.
 * @param {Object} payload - { action, data }
 */
function handleMenuAction({ action, data }) {
  log.info(`Menu action: ${action}`, data);

  switch (action) {
    // ─── Archivo ───
    case 'togglePatches':
      document.dispatchEvent(new CustomEvent('synth:togglePatches'));
      break;

    // ─── Ver ───
    case 'toggleQuickbar':
      document.dispatchEvent(new CustomEvent('synth:toggleQuickbar', { detail: data }));
      break;
    case 'setInactivePins':
      localStorage.setItem(STORAGE_KEYS.SHOW_INACTIVE_PINS, String(data.enabled));
      document.dispatchEvent(new CustomEvent('synth:showInactivePinsChange', {
        detail: { show: data.enabled }
      }));
      break;
    case 'setTooltipVoltage':
      localStorage.setItem(STORAGE_KEYS.TOOLTIP_SHOW_VOLTAGE, String(data.enabled));
      // Tooltips se leen on-demand desde localStorage, no necesitan evento específico
      document.dispatchEvent(new CustomEvent('synth:settingChanged', {
        detail: { key: 'tooltipShowVoltage', value: data.enabled }
      }));
      break;
    case 'setTooltipAudioRate':
      localStorage.setItem(STORAGE_KEYS.TOOLTIP_SHOW_AUDIO_VALUES, String(data.enabled));
      // Tooltips se leen on-demand desde localStorage, no necesitan evento específico
      document.dispatchEvent(new CustomEvent('synth:settingChanged', {
        detail: { key: 'tooltipShowAudioValues', value: data.enabled }
      }));
      break;
    case 'setLinearFaders':
      localStorage.setItem(STORAGE_KEYS.FADER_LINEAR_RESPONSE, String(data.enabled));
      document.dispatchEvent(new CustomEvent('synth:faderResponseChanged', {
        detail: { linear: data.enabled }
      }));
      break;

    // ─── Audio ───
    case 'toggleMute':
      document.dispatchEvent(new CustomEvent('synth:toggleMute'));
      break;
    case 'toggleRecording':
      document.dispatchEvent(new CustomEvent('synth:toggleRecording'));
      break;

    // ─── Paneles ───
    case 'togglePip': {
      const { togglePip: togglePipFn } = require_togglePip();
      if (togglePipFn) togglePipFn(data.panelId);
      break;
    }
    case 'detachAllPips': {
      const { openAllPips } = require_togglePip();
      if (openAllPips) openAllPips();
      break;
    }
    case 'attachAllPips': {
      const { closeAllPips } = require_togglePip();
      if (closeAllPips) closeAllPips();
      break;
    }
    case 'setPanLock':
      if (window.__synthNavLocks) {
        window.__synthNavLocks.panLocked = data.locked;
        document.dispatchEvent(new CustomEvent('synth:navLockChanged', {
          detail: { panLocked: data.locked }
        }));
      }
      break;
    case 'setZoomLock':
      if (window.__synthNavLocks) {
        window.__synthNavLocks.zoomLocked = data.locked;
        document.dispatchEvent(new CustomEvent('synth:navLockChanged', {
          detail: { zoomLocked: data.locked }
        }));
      }
      break;
    case 'setRememberPip':
      localStorage.setItem(STORAGE_KEYS.PIP_REMEMBER, String(data.enabled));
      break;

    // ─── Avanzado ───
    case 'setDebugGlobal':
      localStorage.setItem(STORAGE_KEYS.OPTIMIZATIONS_DEBUG, String(data.enabled));
      document.dispatchEvent(new CustomEvent('synth:optimizationsDebugChange', {
        detail: { enabled: data.enabled }
      }));
      break;
    case 'setDormancy':
      localStorage.setItem(STORAGE_KEYS.DORMANCY_ENABLED, String(data.enabled));
      document.dispatchEvent(new CustomEvent('synth:dormancyEnabledChange', {
        detail: { enabled: data.enabled }
      }));
      break;
    case 'setDormancyDebug':
      localStorage.setItem(STORAGE_KEYS.DORMANCY_DEBUG, String(data.enabled));
      document.dispatchEvent(new CustomEvent('synth:dormancyDebugChange', {
        detail: { enabled: data.enabled }
      }));
      break;
    case 'setFilterBypass':
      localStorage.setItem(STORAGE_KEYS.FILTER_BYPASS_ENABLED, String(data.enabled));
      document.dispatchEvent(new CustomEvent('synth:filterBypassEnabledChange', {
        detail: { enabled: data.enabled }
      }));
      break;
    case 'setFilterBypassDebug':
      localStorage.setItem(STORAGE_KEYS.FILTER_BYPASS_DEBUG, String(data.enabled));
      document.dispatchEvent(new CustomEvent('synth:filterBypassDebugChange', {
        detail: { enabled: data.enabled }
      }));
      break;
    case 'setSoftClip':
      localStorage.setItem(STORAGE_KEYS.VOLTAGE_SOFT_CLIP_ENABLED, String(data.enabled));
      document.dispatchEvent(new CustomEvent('synth:voltageSoftClipChange', {
        detail: { enabled: data.enabled }
      }));
      break;
    case 'setPinTolerance':
      localStorage.setItem(STORAGE_KEYS.VOLTAGE_PIN_TOLERANCE_ENABLED, String(data.enabled));
      document.dispatchEvent(new CustomEvent('synth:voltagePinToleranceChange', {
        detail: { enabled: data.enabled }
      }));
      break;
    case 'setThermalDrift':
      localStorage.setItem(STORAGE_KEYS.VOLTAGE_THERMAL_DRIFT_ENABLED, String(data.enabled));
      document.dispatchEvent(new CustomEvent('synth:voltageThermalDriftChange', {
        detail: { enabled: data.enabled }
      }));
      break;
    case 'resetSynth':
      document.dispatchEvent(new CustomEvent('synth:resetToDefaults'));
      break;

    // ─── OSC ───
    case 'toggleOsc':
      document.dispatchEvent(new CustomEvent('osc:toggle'));
      break;
    case 'setOscSendToSC':
      localStorage.setItem(STORAGE_KEYS.OSC_SUPERCOLLIDER_SEND, String(data.enabled));
      document.dispatchEvent(new CustomEvent('synth:settingChanged', {
        detail: { key: 'oscSendToSC', value: data.enabled }
      }));
      break;
    case 'setOscReceiveFromSC':
      localStorage.setItem(STORAGE_KEYS.OSC_SUPERCOLLIDER_RECEIVE, String(data.enabled));
      document.dispatchEvent(new CustomEvent('synth:settingChanged', {
        detail: { key: 'oscReceiveFromSC', value: data.enabled }
      }));
      break;
    case 'toggleOscLog':
      localStorage.setItem(STORAGE_KEYS.OSC_LOG_VISIBLE, String(data.visible));
      window.dispatchEvent(new CustomEvent('osc:log-visibility', {
        detail: { visible: data.visible }
      }));
      break;

    // ─── Ver: Zoom ───
    case 'toggleFullscreen':
      try {
        if (document.fullscreenElement) {
          if (typeof window.__synthPrepareForFullscreen === 'function') {
            window.__synthPrepareForFullscreen(false);
          }
          document.exitFullscreen();
        } else {
          if (typeof window.__synthPrepareForFullscreen === 'function') {
            window.__synthPrepareForFullscreen(true);
          }
          document.documentElement.requestFullscreen();
        }
      } catch (err) {
        log.error('Fullscreen toggle failed:', err);
      }
      break;
    case 'zoomIn':
      if (window.__synthFocusedPip && window.__synthZoomFocusedPip) {
        window.__synthZoomFocusedPip('in');
      } else {
        document.dispatchEvent(new CustomEvent('synth:zoomIn'));
      }
      break;
    case 'zoomOut':
      if (window.__synthFocusedPip && window.__synthZoomFocusedPip) {
        window.__synthZoomFocusedPip('out');
      } else {
        document.dispatchEvent(new CustomEvent('synth:zoomOut'));
      }
      break;
    case 'zoomReset':
      if (window.__synthFocusedPip && window.__synthZoomFocusedPip) {
        window.__synthZoomFocusedPip('reset');
      } else {
        document.dispatchEvent(new CustomEvent('synth:zoomReset'));
      }
      break;

    // ─── Ayuda ───
    case 'openSettings':
      document.dispatchEvent(new CustomEvent('synth:toggleSettings', {
        detail: { tabId: data?.tab }
      }));
      break;
    case 'setLocale':
      if (data?.locale) {
        import('../i18n/index.js').then(({ setLocale: setLocaleFn }) => {
          setLocaleFn(data.locale);
        });
      }
      break;
    case 'openUrl':
      window.open(data?.url, '_blank');
      break;
    case 'checkUpdates':
      document.dispatchEvent(new CustomEvent('synth:checkUpdates'));
      break;

    default:
      log.warn(`Unknown menu action: ${action}`);
  }
}

/**
 * Lazy import para evitar dependencias circulares con pipManager.
 * Se carga una sola vez y se cachea.
 */
let _pipModule = null;
function require_togglePip() {
  if (!_pipModule) {
    // pipManager ya está importado arriba para getOpenPips
    // Usamos import dinámico diferido para evitar problemas de circular
    _pipModule = { togglePip: null, openAllPips: null, closeAllPips: null };
    import('./pipManager.js').then(mod => {
      _pipModule.togglePip = mod.togglePip;
      _pipModule.openAllPips = mod.openAllPips;
      _pipModule.closeAllPips = mod.closeAllPips;
    });
  }
  return _pipModule;
}

// ─────────────────────────────────────────────────────────────────────────────
// Escucha de eventos del renderer para sincronizar al menú
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configura listeners para sincronizar estado de la app al menú.
 */
function setupStateListeners() {
  // Mute
  document.addEventListener('synth:muteChanged', (e) => {
    syncState({ muted: e.detail?.muted ?? false });
  });

  // Recording
  document.addEventListener('synth:recordingChanged', (e) => {
    syncState({ recording: e.detail?.recording ?? false });
  });

  // OSC status
  document.addEventListener('osc:statusChanged', (e) => {
    syncState({ oscEnabled: e.detail?.enabled ?? false });
  });

  // Patch browser
  document.addEventListener('synth:patchBrowserChanged', (e) => {
    syncState({ patchBrowserOpen: e.detail?.open ?? false });
  });

  // PiP changes
  window.addEventListener('pip:open', () => {
    const openPips = getOpenPips();
    const pipPanels = {};
    ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6', 'panel-output'].forEach(id => {
      pipPanels[id] = openPips.includes(id);
    });
    syncState({ pipPanels });
  });
  window.addEventListener('pip:close', () => {
    const openPips = getOpenPips();
    const pipPanels = {};
    ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6', 'panel-output'].forEach(id => {
      pipPanels[id] = openPips.includes(id);
    });
    syncState({ pipPanels });
  });

  // Settings changed (from modal or menu → sync menu checkboxes)
  // Escuchar los eventos específicos que dispara settingsModal.js
  const specificEventMap = {
    'synth:showInactivePinsChange':    (e) => ({ inactivePins: e.detail?.show ?? false }),
    'synth:faderResponseChanged':      (e) => ({ linearFaders: e.detail?.linear ?? true }),
    'synth:optimizationsDebugChange':  (e) => ({ debugGlobal: e.detail?.enabled ?? false }),
    'synth:dormancyEnabledChange':     (e) => ({ dormancy: e.detail?.enabled ?? true }),
    'synth:dormancyDebugChange':       (e) => ({ dormancyDebug: e.detail?.enabled ?? false }),
    'synth:filterBypassEnabledChange': (e) => ({ filterBypass: e.detail?.enabled ?? true }),
    'synth:filterBypassDebugChange':   (e) => ({ filterBypassDebug: e.detail?.enabled ?? false }),
    'synth:voltageSoftClipChange':     (e) => ({ softClip: e.detail?.enabled ?? true }),
    'synth:voltagePinToleranceChange': (e) => ({ pinTolerance: e.detail?.enabled ?? true }),
    'synth:voltageThermalDriftChange': (e) => ({ thermalDrift: e.detail?.enabled ?? true }),
  };
  for (const [eventName, extractor] of Object.entries(specificEventMap)) {
    document.addEventListener(eventName, (e) => syncState(extractor(e)));
  }

  // Tooltips y OSC se sincronizan via synth:settingChanged (no tienen evento específico)
  document.addEventListener('synth:settingChanged', (e) => {
    const { key, value } = e.detail || {};
    const stateMap = {
      tooltipShowVoltage: 'tooltipVoltage',
      tooltipShowAudioValues: 'tooltipAudioRate',
      oscSendToSC: 'oscSendToSC',
      oscReceiveFromSC: 'oscReceiveFromSC',
      oscLogVisible: 'oscShowLog'
    };
    const menuKey = stateMap[key];
    if (menuKey) {
      syncState({ [menuKey]: value });
    }
  });

  // Quickbar visibility
  document.addEventListener('synth:quickbarVisibilityChanged', (e) => {
    syncState({ quickbarVisible: e.detail?.visible ?? true });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Inicialización pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa el puente de menú de Electron.
 * Solo se activa si estamos en Electron (window.menuAPI existe).
 * Debe llamarse después de initI18n() y setupMobileQuickActionsBar().
 */
export function initElectronMenuBridge() {
  if (initialized) return;
  if (!window.menuAPI) {
    log.info('Not in Electron, menu bridge disabled');
    return;
  }

  initialized = true;
  log.info('Initializing Electron menu bridge');

  // Pre-cargar módulo PiP
  require_togglePip();

  // 1. Enviar traducciones iniciales al menú
  syncTranslations();

  // 2. Enviar estado inicial desde localStorage
  syncState();

  // 3. Escuchar acciones del menú nativo
  window.menuAPI.onMenuAction(handleMenuAction);

  // 4. Escuchar eventos de la app para sincronizar al menú
  setupStateListeners();

  // 5. Re-enviar traducciones cuando cambie el idioma
  onLocaleChange(() => {
    syncTranslations();
  });
}
