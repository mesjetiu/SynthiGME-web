/**
 * Electron Application Menu
 * 
 * Menú nativo completo que refleja las secciones de ajustes del sintetizador.
 * Recibe traducciones y estado desde el renderer vía IPC, y envía acciones
 * de vuelta mediante el canal 'menu:action'.
 * 
 * Estructura de menús:
 * - Archivo: Patches, recargar, salir
 * - Ver: Quickbar, fullscreen, zoom, display options, DevTools
 * - Audio: Mute, grabar, ajustes de audio/grabación
 * - Paneles: Toggle PiP por panel, extraer/devolver todos, locks
 * - Avanzado: Optimizaciones, emulación de voltaje, reset, ajustes
 * - OSC: Toggle OSC, SuperCollider, log, ajustes
 * - Ayuda: Acerca de, repositorio, reportar error, actualizaciones
 */

const { Menu, app, shell, dialog } = require('electron');
const { exec } = require('child_process');

/**
 * Abre una URL en el navegador externo del sistema.
 * Usa shell.openExternal con fallback a xdg-open/open/start.
 * @param {string} url
 */
async function openExternalUrl(url) {
  try {
    await shell.openExternal(url);
  } catch (err) {
    console.error('[Menu] shell.openExternal failed:', err);
    // Fallback: comando nativo del SO
    const cmd = process.platform === 'darwin' ? 'open'
              : process.platform === 'win32' ? 'start ""'
              : 'xdg-open';
    exec(`${cmd} "${url}"`, (error) => {
      if (error) console.error('[Menu] Fallback open failed:', error);
    });
  }
}

/** @type {BrowserWindow|null} Referencia a la ventana principal */
let mainWindow = null;

/** Flag para indicar que el usuario ha confirmado salir */
let _quitConfirmed = false;

/** Estado actual de los checkboxes del menú */
let menuState = {
  muted: false,
  recording: false,
  quickbarVisible: true,
  patchBrowserOpen: false,
  // Ver
  inactivePins: false,
  tooltipVoltage: true,
  tooltipAudioRate: true,
  linearFaders: true,
  sharpRasterize: false,
  // Paneles
  panLocked: false,
  zoomLocked: false,
  rememberPip: false,
  pipPanels: {},  // { 'panel-1': false, 'panel-2': false, ... }
  // Avanzado
  debugGlobal: false,
  dormancy: true,
  dormancyDebug: false,
  filterBypass: true,
  filterBypassDebug: false,
  softClip: true,
  pinTolerance: true,
  thermalDrift: true,
  // OSC
  oscEnabled: false,
  oscSendToSC: false,
  oscReceiveFromSC: false,
  oscShowLog: false
};

/** Traducciones actuales (se actualizan cuando cambia el idioma) */
let translations = {};

/** Idioma actual (se sincroniza desde el renderer) */
let currentLocale = 'en';

/** Lista de idiomas soportados */
let supportedLocales = ['en', 'es', 'fr', 'de', 'it', 'pt', 'cs'];

/**
 * Construye el submenú de selección de idioma.
 * Cada idioma se muestra como radio button con su nombre nativo.
 * @returns {Electron.MenuItemConstructorOptions[]}
 */
function buildLanguageSubmenu() {
  return supportedLocales.map(code => ({
    label: translations[`settings.language.${code}`] || code,
    type: 'radio',
    checked: code === currentLocale,
    click: () => sendAction('setLocale', { locale: code })
  }));
}

/** Nombres de los paneles traducidos */
const PANEL_DEFINITIONS = [
  { id: 'panel-1', label: 'Panel 1' },
  { id: 'panel-2', label: 'Panel 2' },
  { id: 'panel-3', label: 'Panel 3' },
  { id: 'panel-4', label: 'Panel 4' },
  { id: 'panel-5', label: 'Panel 5' },
  { id: 'panel-6', label: 'Panel 6' },
  { id: 'panel-output', label: 'Panel 7' }
];

/**
 * Obtiene texto traducido o fallback
 * @param {string} key - Clave de traducción
 * @param {string} [fallback] - Texto por defecto
 * @returns {string}
 */
function t(key, fallback) {
  return translations[key] || fallback || key;
}

/**
 * Envía una acción al renderer process
 * @param {string} action - Nombre de la acción
 * @param {*} [data] - Datos opcionales
 */
function sendAction(action, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu:action', { action, data });
  }
}

/**
 * Construye la plantilla del menú
 * @returns {Electron.MenuItemConstructorOptions[]}
 */
function buildMenuTemplate() {
  const isMac = process.platform === 'darwin';

  // ─── Archivo ───
  const fileMenu = {
    label: t('menu.file', 'File'),
    submenu: [
      {
        label: t('menu.file.patches', 'Patches…'),
        type: 'checkbox',
        checked: menuState.patchBrowserOpen,
        click: () => sendAction('togglePatches')
      },
      { type: 'separator' },
      {
        label: t('menu.file.language', 'Language'),
        submenu: buildLanguageSubmenu()
      },
      { type: 'separator' },
      {
        label: t('menu.file.reload', 'Reload'),
        click: async () => {
          if (!mainWindow) return;
          const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            buttons: [
              t('menu.file.reload', 'Reload'),
              t('common.cancel', 'Cancel')
            ],
            defaultId: 1,
            cancelId: 1,
            title: t('menu.file.reload', 'Reload'),
            message: t('menu.file.reload.confirm', 'Reload the application? Unsaved changes will be lost.')
          });
          if (response === 0) mainWindow.reload();
        }
      },
      { type: 'separator' },
      {
        label: t('menu.file.quit', 'Quit'),
        accelerator: isMac ? 'Cmd+Q' : 'Alt+F4',
        click: async () => {
          if (!mainWindow) { app.quit(); return; }
          const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            buttons: [
              t('menu.file.quit', 'Quit'),
              t('common.cancel', 'Cancel')
            ],
            defaultId: 1,
            cancelId: 1,
            title: t('menu.file.quit', 'Quit'),
            message: t('menu.file.quit.confirm', 'Quit the application?')
          });
          if (response === 0) {
            _quitConfirmed = true;
            app.quit();
          }
        }
      }
    ]
  };

  // ─── Ver ───
  const viewMenu = {
    label: t('menu.view', 'View'),
    submenu: [
      {
        id: 'quickbar',
        label: t('menu.view.quickbar', 'Show Quickbar'),
        type: 'checkbox',
        checked: menuState.quickbarVisible,
        click: (menuItem) => {
          menuState.quickbarVisible = menuItem.checked;
          sendAction('toggleQuickbar', { visible: menuItem.checked });
        }
      },
      { type: 'separator' },
      {
        label: t('menu.view.fullscreen', 'Fullscreen'),
        accelerator: 'F11',
        click: () => sendAction('toggleFullscreen')
      },
      { type: 'separator' },
      {
        label: t('menu.view.zoomIn', 'Zoom In'),
        accelerator: 'CmdOrCtrl+Plus',
        click: () => sendAction('zoomIn')
      },
      {
        label: t('menu.view.zoomOut', 'Zoom Out'),
        accelerator: 'CmdOrCtrl+-',
        click: () => sendAction('zoomOut')
      },
      {
        label: t('menu.view.zoomReset', 'Reset Zoom'),
        accelerator: 'CmdOrCtrl+0',
        click: () => sendAction('zoomReset')
      },
      { type: 'separator' },
      {
        id: 'inactivePins',
        label: t('menu.view.inactivePins', 'Show inactive pins'),
        type: 'checkbox',
        checked: menuState.inactivePins,
        click: (menuItem) => {
          menuState.inactivePins = menuItem.checked;
          sendAction('setInactivePins', { enabled: menuItem.checked });
        }
      },
      {
        id: 'tooltipVoltage',
        label: t('menu.view.tooltipVoltage', 'Electronic parameters in tooltips'),
        type: 'checkbox',
        checked: menuState.tooltipVoltage,
        click: (menuItem) => {
          menuState.tooltipVoltage = menuItem.checked;
          sendAction('setTooltipVoltage', { enabled: menuItem.checked });
        }
      },
      {
        id: 'tooltipAudioRate',
        label: t('menu.view.tooltipAudioRate', 'Audio info in tooltips'),
        type: 'checkbox',
        checked: menuState.tooltipAudioRate,
        click: (menuItem) => {
          menuState.tooltipAudioRate = menuItem.checked;
          sendAction('setTooltipAudioRate', { enabled: menuItem.checked });
        }
      },
      {
        id: 'linearFaders',
        label: t('menu.view.linearFaders', 'Linear fader response'),
        type: 'checkbox',
        checked: menuState.linearFaders,
        click: (menuItem) => {
          menuState.linearFaders = menuItem.checked;
          sendAction('setLinearFaders', { enabled: menuItem.checked });
        }
      },
      {
        id: 'sharpRasterize',
        label: t('menu.view.sharpRasterize', 'Adaptive rasterization (sharp zoom)'),
        type: 'checkbox',
        checked: menuState.sharpRasterize,
        click: (menuItem) => {
          menuState.sharpRasterize = menuItem.checked;
          sendAction('setSharpRasterize', { enabled: menuItem.checked });
        }
      },
      { type: 'separator' },
      {
        label: t('menu.view.devTools', 'Developer Tools'),
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => {
          if (mainWindow) mainWindow.webContents.toggleDevTools();
        }
      }
    ]
  };

  // ─── Audio ───
  const audioMenu = {
    label: t('menu.audio', 'Audio'),
    submenu: [
      {
        id: 'mute',
        label: menuState.muted
          ? t('menu.audio.unmute', 'Unmute')
          : t('menu.audio.mute', 'Mute'),
        click: () => sendAction('toggleMute')
      },
      { type: 'separator' },
      {
        id: 'record',
        label: menuState.recording
          ? t('menu.audio.stopRecording', 'Stop Recording')
          : t('menu.audio.record', 'Record'),
        click: () => sendAction('toggleRecording')
      },
      { type: 'separator' },
      {
        label: t('menu.audio.audioSettings', 'Audio Settings…'),
        click: () => sendAction('openSettings', { tab: 'audio' })
      },
      {
        label: t('menu.audio.recordSettings', 'Recording Settings…'),
        click: () => sendAction('openSettings', { tab: 'recording' })
      }
    ]
  };

  // ─── Paneles ───
  const panelItems = PANEL_DEFINITIONS.map(panel => ({
    id: `pip-${panel.id}`,
    label: panel.label,
    type: 'checkbox',
    checked: Boolean(menuState.pipPanels[panel.id]),
    click: (menuItem) => {
      menuState.pipPanels[panel.id] = menuItem.checked;
      sendAction('togglePip', { panelId: panel.id });
    }
  }));

  const panelsMenu = {
    label: t('menu.panels', 'Panels'),
    submenu: [
      {
        label: t('menu.panels.detachHeader', 'Detach Panels'),
        enabled: false
      },
      ...panelItems,
      { type: 'separator' },
      {
        label: t('menu.panels.detachAll', 'Detach All'),
        click: () => sendAction('detachAllPips')
      },
      {
        label: t('menu.panels.attachAll', 'Return All'),
        click: () => sendAction('attachAllPips')
      },
      { type: 'separator' },
      {
        id: 'panLocked',
        label: t('menu.panels.lockPan', 'Lock Panning'),
        type: 'checkbox',
        checked: menuState.panLocked,
        click: (menuItem) => {
          menuState.panLocked = menuItem.checked;
          sendAction('setPanLock', { locked: menuItem.checked });
        }
      },
      {
        id: 'zoomLocked',
        label: t('menu.panels.lockZoom', 'Lock Zoom'),
        type: 'checkbox',
        checked: menuState.zoomLocked,
        click: (menuItem) => {
          menuState.zoomLocked = menuItem.checked;
          sendAction('setZoomLock', { locked: menuItem.checked });
        }
      },
      { type: 'separator' },
      {
        id: 'rememberPip',
        label: t('menu.panels.rememberPip', 'Remember floating panels'),
        type: 'checkbox',
        checked: menuState.rememberPip,
        click: (menuItem) => {
          menuState.rememberPip = menuItem.checked;
          sendAction('setRememberPip', { enabled: menuItem.checked });
        }
      }
    ]
  };

  // ─── Avanzado ───
  const advancedMenu = {
    label: t('menu.advanced', 'Advanced'),
    submenu: [
      {
        id: 'debugGlobal',
        label: t('menu.advanced.debugGlobal', 'Debug toasts (all)'),
        type: 'checkbox',
        checked: menuState.debugGlobal,
        click: (menuItem) => {
          menuState.debugGlobal = menuItem.checked;
          sendAction('setDebugGlobal', { enabled: menuItem.checked });
        }
      },
      { type: 'separator' },
      {
        id: 'dormancy',
        label: t('menu.advanced.dormancy', 'Module Dormancy'),
        type: 'checkbox',
        checked: menuState.dormancy,
        click: (menuItem) => {
          menuState.dormancy = menuItem.checked;
          sendAction('setDormancy', { enabled: menuItem.checked });
        }
      },
      {
        id: 'dormancyDebug',
        label: t('menu.advanced.dormancyDebug', 'Debug dormancy'),
        type: 'checkbox',
        checked: menuState.dormancyDebug,
        click: (menuItem) => {
          menuState.dormancyDebug = menuItem.checked;
          sendAction('setDormancyDebug', { enabled: menuItem.checked });
        }
      },
      { type: 'separator' },
      {
        id: 'filterBypass',
        label: t('menu.advanced.filterBypass', 'Filter Bypass'),
        type: 'checkbox',
        checked: menuState.filterBypass,
        click: (menuItem) => {
          menuState.filterBypass = menuItem.checked;
          sendAction('setFilterBypass', { enabled: menuItem.checked });
        }
      },
      {
        id: 'filterBypassDebug',
        label: t('menu.advanced.filterBypassDebug', 'Debug filter bypass'),
        type: 'checkbox',
        checked: menuState.filterBypassDebug,
        click: (menuItem) => {
          menuState.filterBypassDebug = menuItem.checked;
          sendAction('setFilterBypassDebug', { enabled: menuItem.checked });
        }
      },
      { type: 'separator' },
      {
        id: 'softClip',
        label: t('menu.advanced.softClip', 'Soft Clipping'),
        type: 'checkbox',
        checked: menuState.softClip,
        click: (menuItem) => {
          menuState.softClip = menuItem.checked;
          sendAction('setSoftClip', { enabled: menuItem.checked });
        }
      },
      {
        id: 'pinTolerance',
        label: t('menu.advanced.pinTolerance', 'Pin Tolerance'),
        type: 'checkbox',
        checked: menuState.pinTolerance,
        click: (menuItem) => {
          menuState.pinTolerance = menuItem.checked;
          sendAction('setPinTolerance', { enabled: menuItem.checked });
        }
      },
      {
        id: 'thermalDrift',
        label: t('menu.advanced.thermalDrift', 'Thermal Drift'),
        type: 'checkbox',
        checked: menuState.thermalDrift,
        click: (menuItem) => {
          menuState.thermalDrift = menuItem.checked;
          sendAction('setThermalDrift', { enabled: menuItem.checked });
        }
      },
      { type: 'separator' },
      {
        label: t('menu.advanced.resetSynth', 'Reset Synthesizer…'),
        click: () => sendAction('resetSynth')
      },
      { type: 'separator' },
      {
        label: t('menu.advanced.settings', 'All Settings…'),
        click: () => sendAction('openSettings', { tab: 'advanced' })
      }
    ]
  };

  // ─── OSC ───
  const oscMenu = {
    label: t('menu.osc', 'OSC'),
    submenu: [
      {
        id: 'oscEnabled',
        label: t('menu.osc.enable', 'Enable OSC'),
        type: 'checkbox',
        checked: menuState.oscEnabled,
        click: (menuItem) => {
          menuState.oscEnabled = menuItem.checked;
          sendAction('toggleOsc');
        }
      },
      { type: 'separator' },
      {
        id: 'oscSendToSC',
        label: t('menu.osc.sendToSC', 'Send to SuperCollider'),
        type: 'checkbox',
        checked: menuState.oscSendToSC,
        enabled: menuState.oscEnabled,
        click: (menuItem) => {
          menuState.oscSendToSC = menuItem.checked;
          sendAction('setOscSendToSC', { enabled: menuItem.checked });
        }
      },
      {
        id: 'oscReceiveFromSC',
        label: t('menu.osc.receiveFromSC', 'Receive from SuperCollider'),
        type: 'checkbox',
        checked: menuState.oscReceiveFromSC,
        enabled: menuState.oscEnabled,
        click: (menuItem) => {
          menuState.oscReceiveFromSC = menuItem.checked;
          sendAction('setOscReceiveFromSC', { enabled: menuItem.checked });
        }
      },
      { type: 'separator' },
      {
        id: 'oscShowLog',
        label: t('menu.osc.showLog', 'Show OSC Log'),
        type: 'checkbox',
        checked: menuState.oscShowLog,
        click: (menuItem) => {
          menuState.oscShowLog = menuItem.checked;
          sendAction('toggleOscLog', { visible: menuItem.checked });
        }
      },
      { type: 'separator' },
      {
        label: t('menu.osc.settings', 'OSC Settings…'),
        click: () => sendAction('openSettings', { tab: 'osc' })
      }
    ]
  };

  // ─── Ayuda ───
  const helpMenu = {
    label: t('menu.help', 'Help'),
    submenu: [
      {
        label: t('menu.help.about', 'About Synthi GME…'),
        click: () => sendAction('openSettings', { tab: 'about' })
      },
      { type: 'separator' },
      {
        label: t('menu.help.repository', 'GitHub Repository'),
        click: () => openExternalUrl('https://github.com/mesjetiu/SynthiGME-web')
      },
      {
        label: t('menu.help.reportBug', 'Report a Bug…'),
        click: () => openExternalUrl('https://github.com/mesjetiu/SynthiGME-web/issues')
      },
      { type: 'separator' },
      {
        label: t('menu.help.checkUpdates', 'Check for Updates…'),
        click: () => openExternalUrl('https://github.com/mesjetiu/SynthiGME-web/releases')
      }
    ]
  };

  // Construir template final
  const template = [fileMenu, viewMenu, audioMenu, panelsMenu, advancedMenu, oscMenu, helpMenu];

  // En macOS, añadir menú de la app al principio
  if (isMac) {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  return template;
}

/**
 * Reconstruye y aplica el menú de la aplicación.
 * Llamar cada vez que cambien traducciones o estado.
 */
function rebuildMenu() {
  const template = buildMenuTemplate();
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Actualiza el estado parcial del menú y lo reconstruye.
 * @param {Object} partialState - Estado parcial a aplicar
 */
function updateMenuState(partialState) {
  // Merge profundo para pipPanels
  if (partialState.pipPanels) {
    menuState.pipPanels = { ...menuState.pipPanels, ...partialState.pipPanels };
    delete partialState.pipPanels;
  }
  Object.assign(menuState, partialState);
  rebuildMenu();
}

/**
 * Actualiza las traducciones y reconstruye el menú.
 * @param {Object} newTranslations - Objeto con traducciones { key: value }
 */
function updateTranslations(newTranslations) {
  // Extraer metadatos de idioma antes de almacenar traducciones
  if (newTranslations['_locale']) {
    currentLocale = newTranslations['_locale'];
  }
  if (newTranslations['_locales']) {
    supportedLocales = newTranslations['_locales'];
  }
  translations = newTranslations;
  rebuildMenu();
}

/**
 * Inicializa el sistema de menú.
 * @param {BrowserWindow} win - Ventana principal de la aplicación
 */
function initMenu(win) {
  mainWindow = win;
  rebuildMenu();
}

module.exports = {
  initMenu,
  rebuildMenu,
  updateMenuState,
  updateTranslations,
  isQuitConfirmed: () => _quitConfirmed,
  resetQuitConfirmed: () => { _quitConfirmed = false; },
  t
};
