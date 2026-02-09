/**
 * Tests de contrato: Menú Electron ↔ Bridge ↔ Main Process
 * 
 * Estos tests verifican la integridad de los CONTRATOS entre los 3 componentes
 * del sistema de menú Electron, sin verificar contenido textual ni labels.
 * 
 * Detectan:
 * - Claves de traducción usadas en el menú pero no enviadas por el bridge
 * - Claves de estado del menú sin lector correspondiente en el bridge
 * - Acciones del menú sin handler en el bridge
 * - Canales IPC inconsistentes entre componentes
 * - Rotura de la lógica de confirmación de salida
 * 
 * NO detectan (intencionalmente):
 * - Cambios de texto en traducciones
 * - Reordenación de menús
 * - Cambios cosméticos
 * 
 * Método: análisis estático del código fuente (no requiere Electron runtime).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// ═══════════════════════════════════════════════════════════════════════════
// Lectura de fuentes (análisis estático)
// ═══════════════════════════════════════════════════════════════════════════

const menuSource = readFileSync(resolve(ROOT, 'electron/electronMenu.cjs'), 'utf-8');
const bridgeSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/electronMenuBridge.js'), 'utf-8');
const preloadSource = readFileSync(resolve(ROOT, 'electron/preload.cjs'), 'utf-8');
const mainSource = readFileSync(resolve(ROOT, 'electron/main.cjs'), 'utf-8');

// ═══════════════════════════════════════════════════════════════════════════
// Extractores de contratos (parsean el código fuente con regex)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extrae todas las claves de traducción usadas con t('clave') o t('clave', 'fallback')
 * en electronMenu.cjs.
 */
function extractTranslationKeysFromMenu() {
  const keys = new Set();
  // Patrón: t('clave.algo') o t('clave.algo', 'fallback')
  // No captura la clave dinámica `settings.language.${code}` (se gestiona aparte)
  const regex = /\bt\('([^']+)'/g;
  let match;
  while ((match = regex.exec(menuSource)) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

/**
 * Extrae todas las claves usadas con menuT('clave') en main.cjs.
 */
function extractTranslationKeysFromMain() {
  const keys = new Set();
  const regex = /\bmenuT\('([^']+)'/g;
  let match;
  while ((match = regex.exec(mainSource)) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

/**
 * Extrae el array MENU_TRANSLATION_KEYS del bridge.
 */
function extractBridgeTranslationKeys() {
  const keys = new Set();
  // Buscar el bloque del array MENU_TRANSLATION_KEYS
  const arrayMatch = bridgeSource.match(
    /const MENU_TRANSLATION_KEYS\s*=\s*\[([\s\S]*?)\];/
  );
  if (!arrayMatch) return keys;
  // Extraer strings individuales
  const regex = /'([^']+)'/g;
  let match;
  while ((match = regex.exec(arrayMatch[1])) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

/**
 * Extrae las claves del objeto menuState en electronMenu.cjs.
 */
function extractMenuStateKeys() {
  const keys = new Set();
  // Buscar el bloque let menuState = { ... };
  const stateMatch = menuSource.match(
    /let menuState\s*=\s*\{([\s\S]*?)\};/
  );
  if (!stateMatch) return keys;
  // Extraer nombres de propiedad (clave: valor)
  const regex = /^\s*(\w+)\s*:/gm;
  let match;
  while ((match = regex.exec(stateMatch[1])) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

/**
 * Extrae las claves del objeto retornado por readCurrentState() en el bridge.
 */
function extractBridgeStateKeys() {
  const keys = new Set();
  // Buscar el bloque return { ... } dentro de readCurrentState()
  const fnMatch = bridgeSource.match(
    /function readCurrentState\(\)\s*\{[\s\S]*?return\s*\{([\s\S]*?)\};\s*\}/
  );
  if (!fnMatch) return keys;
  // Captura tanto 'key: value' como shorthand 'key,' o 'key\n'
  const regex = /^\s*(\w+)\s*(?::|,|$)/gm;
  let match;
  while ((match = regex.exec(fnMatch[1])) !== null) {
    // Filtrar palabras clave de JS que no son propiedades
    if (!['return', 'const', 'let', 'var', 'if', 'else', 'true', 'false'].includes(match[1])) {
      keys.add(match[1]);
    }
  }
  return keys;
}

/**
 * Extrae todos los nombres de acción enviados con sendAction('nombre') en el menú.
 */
function extractMenuActions() {
  const actions = new Set();
  const regex = /sendAction\('(\w+)'/g;
  let match;
  while ((match = regex.exec(menuSource)) !== null) {
    actions.add(match[1]);
  }
  return actions;
}

/**
 * Extrae todos los case 'nombre': del switch en handleMenuAction del bridge.
 */
function extractBridgeSwitchCases() {
  const cases = new Set();
  // Buscar el bloque de handleMenuAction
  const fnMatch = bridgeSource.match(
    /function handleMenuAction[\s\S]*?switch\s*\(action\)\s*\{([\s\S]*?)\n\s*default:/
  );
  if (!fnMatch) return cases;
  const regex = /case '(\w+)':/g;
  let match;
  while ((match = regex.exec(fnMatch[1])) !== null) {
    cases.add(match[1]);
  }
  return cases;
}

/**
 * Extrae canales IPC de un archivo fuente.
 */
function extractIPCChannels(source) {
  const channels = new Set();
  // Patrones: 'menu:algo' en cualquier contexto
  const regex = /'(menu:\w+)'/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    channels.add(match[1]);
  }
  return channels;
}

/**
 * Extrae los eventos escuchados en setupStateListeners del bridge.
 * Devuelve Map<eventName, stateKeys[]> para la sincronización inversa.
 */
function extractReverseSyncListeners() {
  const listeners = new Map();
  // Buscar el bloque specificEventMap
  const mapMatch = bridgeSource.match(
    /const specificEventMap\s*=\s*\{([\s\S]*?)\};/
  );
  if (mapMatch) {
    // Extraer pares evento → clave de estado
    const entryRegex = /'([^']+)':\s*\(e\)\s*=>\s*\(\{\s*(\w+):/g;
    let match;
    while ((match = entryRegex.exec(mapMatch[1])) !== null) {
      listeners.set(match[1], match[2]);
    }
  }
  // Buscar el bloque stateMap para synth:settingChanged
  const stateMapMatch = bridgeSource.match(
    /const stateMap\s*=\s*\{([\s\S]*?)\};/
  );
  if (stateMapMatch) {
    const entryRegex = /(\w+):\s*'(\w+)'/g;
    let match;
    while ((match = entryRegex.exec(stateMapMatch[1])) !== null) {
      listeners.set(`settingChanged:${match[1]}`, match[2]);
    }
  }
  // Eventos directos (fuera del map)
  const directRegex = /addEventListener\('([^']+)',\s*\(e\)\s*=>\s*\{\s*\n?\s*syncState\(\{\s*(\w+):/g;
  let directMatch;
  while ((directMatch = directRegex.exec(bridgeSource)) !== null) {
    listeners.set(directMatch[1], directMatch[2]);
  }
  return listeners;
}

// ═══════════════════════════════════════════════════════════════════════════
// Datos extraídos (se cachean antes de los tests)
// ═══════════════════════════════════════════════════════════════════════════

let menuTranslationKeys, mainTranslationKeys, bridgeTranslationKeys;
let menuStateKeys, bridgeStateKeys;
let menuActions, bridgeCases;
let menuIPCChannels, bridgeIPCChannels, preloadIPCChannels, mainIPCChannels;
let reverseSyncListeners;

before(() => {
  menuTranslationKeys = extractTranslationKeysFromMenu();
  mainTranslationKeys = extractTranslationKeysFromMain();
  bridgeTranslationKeys = extractBridgeTranslationKeys();
  menuStateKeys = extractMenuStateKeys();
  bridgeStateKeys = extractBridgeStateKeys();
  menuActions = extractMenuActions();
  bridgeCases = extractBridgeSwitchCases();
  menuIPCChannels = extractIPCChannels(menuSource);
  bridgeIPCChannels = extractIPCChannels(bridgeSource);
  preloadIPCChannels = extractIPCChannels(preloadSource);
  mainIPCChannels = extractIPCChannels(mainSource);
  reverseSyncListeners = extractReverseSyncListeners();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONTRATO DE CLAVES DE TRADUCCIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('Contrato de claves de traducción (menú ↔ bridge)', () => {

  it('los extractores encuentran claves en ambos componentes', () => {
    assert.ok(menuTranslationKeys.size > 0, 'No se encontraron claves t() en electronMenu.cjs');
    assert.ok(bridgeTranslationKeys.size > 0, 'No se encontró MENU_TRANSLATION_KEYS en el bridge');
  });

  it('toda clave t() de electronMenu.cjs está en MENU_TRANSLATION_KEYS del bridge', () => {
    const missing = [...menuTranslationKeys].filter(k => !bridgeTranslationKeys.has(k));
    assert.strictEqual(
      missing.length, 0,
      `Claves usadas en electronMenu.cjs pero NO enviadas por el bridge:\n` +
      missing.map(k => `  - '${k}'`).join('\n') +
      `\n\nAñádelas a MENU_TRANSLATION_KEYS en electronMenuBridge.js`
    );
  });

  it('toda clave menuT() de main.cjs está en MENU_TRANSLATION_KEYS del bridge', () => {
    const missing = [...mainTranslationKeys].filter(k => !bridgeTranslationKeys.has(k));
    assert.strictEqual(
      missing.length, 0,
      `Claves usadas en main.cjs pero NO enviadas por el bridge:\n` +
      missing.map(k => `  - '${k}'`).join('\n') +
      `\n\nAñádelas a MENU_TRANSLATION_KEYS en electronMenuBridge.js`
    );
  });

  it('MENU_TRANSLATION_KEYS no tiene claves huérfanas (sin uso en menú ni main)', () => {
    // Claves usadas en main o menú o que son dinámicas (settings.language.*)
    const allUsedKeys = new Set([...menuTranslationKeys, ...mainTranslationKeys]);
    const orphans = [...bridgeTranslationKeys].filter(k =>
      !allUsedKeys.has(k) &&
      !k.startsWith('settings.language.') &&
      k !== 'app.windowTitle' // Usado en main.cjs via translations['app.windowTitle']
    );
    assert.strictEqual(
      orphans.length, 0,
      `Claves en MENU_TRANSLATION_KEYS que no se usan en ningún sitio:\n` +
      orphans.map(k => `  - '${k}'`).join('\n') +
      `\n\nPueden eliminarse de MENU_TRANSLATION_KEYS`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. CONTRATO DE CLAVES DE ESTADO
// ═══════════════════════════════════════════════════════════════════════════

describe('Contrato de claves de estado (menú ↔ bridge)', () => {

  it('los extractores encuentran claves de estado en ambos componentes', () => {
    assert.ok(menuStateKeys.size > 0, 'No se encontró menuState en electronMenu.cjs');
    assert.ok(bridgeStateKeys.size > 0, 'No se encontró readCurrentState() en el bridge');
  });

  it('toda clave de readCurrentState() existe en menuState', () => {
    const missing = [...bridgeStateKeys].filter(k => !menuStateKeys.has(k));
    assert.strictEqual(
      missing.length, 0,
      `Claves enviadas por el bridge que menuState NO reconoce:\n` +
      missing.map(k => `  - '${k}'`).join('\n') +
      `\n\nAñádelas a menuState en electronMenu.cjs`
    );
  });

  it('toda clave de menuState tiene lectura inicial o sync por evento', () => {
    // patchBrowserOpen es estado de runtime (no persiste en localStorage),
    // se sincroniza exclusivamente vía evento synth:patchBrowserChanged
    const RUNTIME_ONLY_KEYS = new Set(['patchBrowserOpen']);

    const syncedByEvent = new Set(reverseSyncListeners.values());
    const missing = [...menuStateKeys].filter(k =>
      !bridgeStateKeys.has(k) &&
      !RUNTIME_ONLY_KEYS.has(k) &&
      !syncedByEvent.has(k)
    );
    assert.strictEqual(
      missing.length, 0,
      `Claves en menuState sin lectura inicial NI sync por evento:\n` +
      missing.map(k => `  - '${k}'`).join('\n') +
      `\n\nAñade la clave a readCurrentState() o a setupStateListeners()`
    );
  });

  it('menuState y readCurrentState() usan los mismos nombres de propiedad', () => {
    // Verificar que no hay typos: las claves comunes deben coincidir exactamente
    const commonKeys = [...bridgeStateKeys].filter(k => menuStateKeys.has(k));
    assert.ok(
      commonKeys.length >= bridgeStateKeys.size - 1, // Tolerancia de 1 (patchBrowserOpen)
      `Muy pocas claves en común (${commonKeys.length}/${bridgeStateKeys.size}). ` +
      `¿Hay un rename parcial?`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. CONTRATO DE ACCIONES DEL MENÚ
// ═══════════════════════════════════════════════════════════════════════════

describe('Contrato de acciones (menú → bridge)', () => {

  it('los extractores encuentran acciones en ambos componentes', () => {
    assert.ok(menuActions.size > 0, 'No se encontraron sendAction() en electronMenu.cjs');
    assert.ok(bridgeCases.size > 0, 'No se encontraron case en handleMenuAction del bridge');
  });

  it('toda acción del menú tiene un handler en el bridge', () => {
    const missing = [...menuActions].filter(a => !bridgeCases.has(a));
    assert.strictEqual(
      missing.length, 0,
      `Acciones enviadas por el menú sin handler en el bridge:\n` +
      missing.map(a => `  - '${a}'`).join('\n') +
      `\n\nAñade un case '${missing[0]}': en handleMenuAction()`
    );
  });

  it('no hay handlers huérfanos en el bridge (sin acción que los dispare)', () => {
    // Algunos handlers son defensivos (checkUpdates, openUrl) o vienen
    // directamente del main process, no del menú
    const DEFENSIVE_CASES = new Set(['checkUpdates', 'openUrl']);
    const orphans = [...bridgeCases].filter(c =>
      !menuActions.has(c) && !DEFENSIVE_CASES.has(c)
    );
    assert.strictEqual(
      orphans.length, 0,
      `Handlers en el bridge que ninguna acción del menú dispara:\n` +
      orphans.map(c => `  - case '${c}'`).join('\n') +
      `\n\nPueden ser código muerto`
    );
  });

  it('las acciones de checkbox actualizan menuState antes de enviar', () => {
    // Las acciones con checkbox (type: 'checkbox') deben mutar menuState
    // en el click handler, no solo enviar la acción. Verificamos el patrón:
    //   menuState.KEY = menuItem.checked;
    //   sendAction('actionName', ...);
    const checkboxActions = [
      'toggleQuickbar', 'setInactivePins', 'setTooltipVoltage', 'setTooltipAudioRate',
      'setLinearFaders', 'setPanLock', 'setZoomLock', 'setRememberPip',
      'setDebugGlobal', 'setDormancy', 'setDormancyDebug',
      'setFilterBypass', 'setFilterBypassDebug',
      'setSoftClip', 'setPinTolerance', 'setThermalDrift',
      'toggleOscLog', 'togglePip'
    ];
    const missingStateUpdate = checkboxActions.filter(action => {
      // Buscar patrón: menuState.algo = ... seguido de sendAction('action')
      // en un rango cercano (dentro del mismo click handler)
      const actionIdx = menuSource.indexOf(`sendAction('${action}'`);
      if (actionIdx === -1) return false;
      // Buscar menuState. en las 5 líneas anteriores
      const preceding = menuSource.substring(Math.max(0, actionIdx - 300), actionIdx);
      return !preceding.includes('menuState.');
    });
    assert.strictEqual(
      missingStateUpdate.length, 0,
      `Acciones de checkbox que no actualizan menuState antes de sendAction:\n` +
      missingStateUpdate.map(a => `  - '${a}'`).join('\n') +
      `\n\nDeben hacer menuState.key = menuItem.checked antes de sendAction`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. CONTRATO DE CANALES IPC
// ═══════════════════════════════════════════════════════════════════════════

describe('Contrato de canales IPC', () => {

  const REQUIRED_CHANNELS = ['menu:action', 'menu:syncState', 'menu:syncTranslations'];

  it('preload.cjs registra los 3 canales IPC del menú', () => {
    const missing = REQUIRED_CHANNELS.filter(ch => !preloadIPCChannels.has(ch));
    assert.strictEqual(
      missing.length, 0,
      `Canales faltantes en preload.cjs: ${missing.join(', ')}`
    );
  });

  it('main.cjs registra los canales IPC de sincronización', () => {
    assert.ok(
      mainIPCChannels.has('menu:syncState'),
      'main.cjs no tiene handler para menu:syncState'
    );
    assert.ok(
      mainIPCChannels.has('menu:syncTranslations'),
      'main.cjs no tiene handler para menu:syncTranslations'
    );
  });

  it('electronMenu.cjs usa menu:action para enviar al renderer', () => {
    assert.ok(
      menuIPCChannels.has('menu:action'),
      'electronMenu.cjs no envía por menu:action'
    );
  });

  it('todos los componentes usan exactamente los mismos nombres de canal', () => {
    // Verificar que no hay variantes (menu:actions, menu:sync, etc.)
    const allChannels = new Set([
      ...menuIPCChannels, ...bridgeIPCChannels,
      ...preloadIPCChannels, ...mainIPCChannels
    ]);
    const unexpected = [...allChannels].filter(ch =>
      ch.startsWith('menu:') && !REQUIRED_CHANNELS.includes(ch)
    );
    assert.strictEqual(
      unexpected.length, 0,
      `Canales IPC inesperados encontrados: ${unexpected.join(', ')}\n` +
      `Los canales válidos son: ${REQUIRED_CHANNELS.join(', ')}`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CONFIRMACIÓN DE SALIDA (QUIT)
// ═══════════════════════════════════════════════════════════════════════════

describe('Lógica de confirmación de salida', () => {

  it('electronMenu.cjs tiene diálogo de confirmación en Quit', () => {
    assert.ok(
      menuSource.includes('dialog.showMessageBox') &&
      menuSource.includes("_quitConfirmed = true"),
      'Falta diálogo de confirmación o flag _quitConfirmed en el menú Quit'
    );
  });

  it('electronMenu.cjs exporta isQuitConfirmed y resetQuitConfirmed', () => {
    assert.ok(menuSource.includes('isQuitConfirmed'), 'Falta export isQuitConfirmed');
    assert.ok(menuSource.includes('resetQuitConfirmed'), 'Falta export resetQuitConfirmed');
  });

  it('main.cjs importa isQuitConfirmed y resetQuitConfirmed', () => {
    assert.ok(mainSource.includes('isQuitConfirmed'), 'main.cjs no importa isQuitConfirmed');
    assert.ok(mainSource.includes('resetQuitConfirmed'), 'main.cjs no importa resetQuitConfirmed');
  });

  it('main.cjs tiene handler de close con confirmación', () => {
    // Verificar patrón: mainWindow.on('close', ...) con isQuitConfirmed()
    assert.ok(
      mainSource.includes("on('close'") || mainSource.includes('on("close"'),
      'main.cjs no tiene handler para el evento close de la ventana'
    );
    assert.ok(
      mainSource.includes('isQuitConfirmed()'),
      'main.cjs no consulta isQuitConfirmed() en el handler de close'
    );
  });

  it('main.cjs tiene diálogo propio para Alt+F4 / botón X', () => {
    // El handler de close en main.cjs debe tener su propio dialog.showMessageBox
    // para cuando el cierre no viene del menú (sino de Alt+F4 o botón X)
    assert.ok(
      mainSource.includes('dialog.showMessageBox'),
      'main.cjs no muestra diálogo de confirmación para cierre por Alt+F4/X'
    );
  });

  it('main.cjs previene el cierre por defecto (preventDefault)', () => {
    assert.ok(
      mainSource.includes('preventDefault()'),
      'main.cjs no llama a e.preventDefault() en el handler de close'
    );
  });

  it('electronMenu.cjs tiene diálogo de confirmación en Reload', () => {
    // Buscar que Reload también pide confirmación
    const reloadSection = menuSource.match(
      /label:\s*t\('menu\.file\.reload'[\s\S]{0,500}?dialog\.showMessageBox/
    );
    assert.ok(
      reloadSection,
      'El menú Reload debería pedir confirmación antes de recargar'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. SINCRONIZACIÓN INVERSA (app → menú)
// ═══════════════════════════════════════════════════════════════════════════

describe('Sincronización inversa (app → menú via eventos)', () => {

  it('el bridge escucha eventos para sincronizar estado mutable', () => {
    assert.ok(reverseSyncListeners.size > 0, 'No se encontraron listeners de sync inverso');
  });

  it('los checkboxes del menú con estado persistente tienen sync inverso', () => {
    // Claves que deben sincronizarse de vuelta al menú cuando cambian desde la UI
    const MUST_SYNC_BACK = [
      'inactivePins', 'dormancy', 'dormancyDebug',
      'filterBypass', 'filterBypassDebug',
      'softClip', 'pinTolerance', 'thermalDrift',
      'debugGlobal', 'linearFaders'
    ];
    const synced = new Set(reverseSyncListeners.values());
    const missing = MUST_SYNC_BACK.filter(k => !synced.has(k));
    assert.strictEqual(
      missing.length, 0,
      `Claves de estado sin sincronización inversa (UI → menú):\n` +
      missing.map(k => `  - '${k}'`).join('\n') +
      `\n\nAñade listener en setupStateListeners() del bridge`
    );
  });

  it('muted y recording se sincronizan via eventos dedicados', () => {
    assert.ok(
      bridgeSource.includes("'synth:muteChanged'"),
      'Bridge no escucha synth:muteChanged para sincronizar muted'
    );
    assert.ok(
      bridgeSource.includes("'synth:recordingChanged'"),
      'Bridge no escucha synth:recordingChanged para sincronizar recording'
    );
  });

  it('los tooltips se sincronizan via synth:settingChanged', () => {
    assert.ok(
      bridgeSource.includes('tooltipShowVoltage') &&
      bridgeSource.includes("'tooltipVoltage'"),
      'Falta mapeo tooltipShowVoltage → tooltipVoltage en stateMap'
    );
    assert.ok(
      bridgeSource.includes('tooltipShowAudioValues') &&
      bridgeSource.includes("'tooltipAudioRate'"),
      'Falta mapeo tooltipShowAudioValues → tooltipAudioRate en stateMap'
    );
  });

  it('los eventos PiP se escuchan en window (no en document)', () => {
    // pip:open y pip:close se despachan en window, no en document
    assert.ok(
      bridgeSource.includes("window.addEventListener('pip:open'"),
      'pip:open debe escucharse en window, no en document'
    );
    assert.ok(
      bridgeSource.includes("window.addEventListener('pip:close'"),
      'pip:close debe escucharse en window, no en document'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. LÓGICA DE FUNCIONES PURAS (replicadas para test unitario)
// ═══════════════════════════════════════════════════════════════════════════

describe('Lógica de la función t() (fallback de traducciones)', () => {
  // Replica de la función t() de electronMenu.cjs para test unitario
  function t(translations, key, fallback) {
    return translations[key] || fallback || key;
  }

  it('devuelve la traducción cuando existe', () => {
    const tr = { 'menu.file': 'Archivo' };
    assert.strictEqual(t(tr, 'menu.file', 'File'), 'Archivo');
  });

  it('devuelve el fallback cuando no hay traducción', () => {
    assert.strictEqual(t({}, 'menu.file', 'File'), 'File');
  });

  it('devuelve la clave cuando no hay traducción ni fallback', () => {
    assert.strictEqual(t({}, 'menu.file'), 'menu.file');
  });

  it('no devuelve string vacío como traducción (falla al fallback)', () => {
    const tr = { 'menu.file': '' };
    // String vacío es falsy → debería caer al fallback
    assert.strictEqual(t(tr, 'menu.file', 'File'), 'File');
  });
});

describe('Lógica de updateMenuState (merge de estado)', () => {
  // Replica del merge logic de updateMenuState
  function mergeState(currentState, partialState) {
    const newState = { ...currentState };
    if (partialState.pipPanels) {
      newState.pipPanels = { ...currentState.pipPanels, ...partialState.pipPanels };
      const rest = { ...partialState };
      delete rest.pipPanels;
      Object.assign(newState, rest);
    } else {
      Object.assign(newState, partialState);
    }
    return newState;
  }

  it('merge parcial actualiza solo las claves enviadas', () => {
    const current = { muted: false, recording: false, pipPanels: {} };
    const result = mergeState(current, { muted: true });
    assert.strictEqual(result.muted, true);
    assert.strictEqual(result.recording, false);
  });

  it('pipPanels se mergea profundamente', () => {
    const current = {
      pipPanels: { 'panel-1': true, 'panel-2': false }
    };
    const result = mergeState(current, {
      pipPanels: { 'panel-2': true }
    });
    assert.strictEqual(result.pipPanels['panel-1'], true, 'panel-1 no debe cambiar');
    assert.strictEqual(result.pipPanels['panel-2'], true, 'panel-2 debe actualizarse');
  });

  it('propiedades regulares NO se mergean profundamente', () => {
    const current = { muted: false, dormancy: true };
    const result = mergeState(current, { dormancy: false });
    assert.strictEqual(result.dormancy, false);
    assert.strictEqual(result.muted, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. ESTRUCTURA DEL BRIDGE
// ═══════════════════════════════════════════════════════════════════════════

describe('Estructura del bridge (electronMenuBridge.js)', () => {

  it('exporta initElectronMenuBridge como función pública', () => {
    assert.ok(
      bridgeSource.includes('export function initElectronMenuBridge'),
      'Falta export de initElectronMenuBridge'
    );
  });

  it('comprueba window.menuAPI antes de activarse', () => {
    assert.ok(
      bridgeSource.includes('window.menuAPI'),
      'Bridge no comprueba la existencia de window.menuAPI'
    );
  });

  it('tiene guard de doble inicialización', () => {
    assert.ok(
      bridgeSource.includes('if (initialized) return'),
      'Bridge no tiene protección contra doble inicialización'
    );
  });

  it('registra listener de cambio de idioma para re-sincronizar', () => {
    assert.ok(
      bridgeSource.includes('onLocaleChange'),
      'Bridge no se suscribe a cambios de idioma'
    );
  });

  it('la secuencia de inicialización es correcta: traducciones → estado → acciones → listeners', () => {
    // Buscar dentro del cuerpo de initElectronMenuBridge solamente
    const initMatch = bridgeSource.match(
      /export function initElectronMenuBridge\(\)\s*\{([\s\S]*?)\n\}/
    );
    assert.ok(initMatch, 'No se encontró initElectronMenuBridge');
    const initBody = initMatch[1];
    const trIdx = initBody.indexOf('syncTranslations()');
    const stIdx = initBody.indexOf('syncState()');
    const maIdx = initBody.indexOf('onMenuAction(handleMenuAction)');
    const slIdx = initBody.indexOf('setupStateListeners()');
    assert.ok(trIdx > 0, 'syncTranslations() no encontrado en init');
    assert.ok(stIdx > 0, 'syncState() no encontrado en init');
    assert.ok(maIdx > 0, 'onMenuAction() no encontrado en init');
    assert.ok(slIdx > 0, 'setupStateListeners() no encontrado en init');
    assert.ok(trIdx < stIdx, 'syncTranslations debe ejecutarse antes que syncState');
    assert.ok(stIdx < maIdx, 'syncState debe ejecutarse antes que onMenuAction');
    assert.ok(maIdx < slIdx, 'onMenuAction debe ejecutarse antes que setupStateListeners');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. INTEGRIDAD DE PRELOAD (API surface)
// ═══════════════════════════════════════════════════════════════════════════

describe('Integridad de la API del preload', () => {

  it('expone window.menuAPI', () => {
    assert.ok(preloadSource.includes('window.menuAPI'), 'Falta window.menuAPI en preload');
  });

  it('menuAPI tiene onMenuAction', () => {
    assert.ok(preloadSource.includes('onMenuAction'), 'Falta onMenuAction en menuAPI');
  });

  it('menuAPI tiene syncMenuState', () => {
    assert.ok(preloadSource.includes('syncMenuState'), 'Falta syncMenuState en menuAPI');
  });

  it('menuAPI tiene syncTranslations (o syncMenuTranslations)', () => {
    assert.ok(
      preloadSource.includes('syncTranslations') || preloadSource.includes('syncMenuTranslations'),
      'Falta syncTranslations en menuAPI'
    );
  });

  it('onMenuAction devuelve función de unsubscribe', () => {
    // Debe tener un return con removeListener
    assert.ok(
      preloadSource.includes('removeListener'),
      'onMenuAction no devuelve función para quitar el listener'
    );
  });

  it('expone window.electronAPI con isElectron', () => {
    assert.ok(preloadSource.includes('window.electronAPI'), 'Falta window.electronAPI');
    assert.ok(preloadSource.includes('isElectron'), 'Falta isElectron en electronAPI');
  });
});
