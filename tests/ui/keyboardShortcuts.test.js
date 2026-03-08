/**
 * Tests estáticos para ui/keyboardShortcuts.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const shortcutSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/keyboardShortcuts.js'), 'utf-8');
const quickbarSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/quickbar.js'), 'utf-8');
const electronBridgeSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/electronMenuBridge.js'), 'utf-8');
const settingsSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/settingsModal.js'), 'utf-8');
const translationsSource = readFileSync(resolve(ROOT, 'src/assets/js/i18n/translations.yaml'), 'utf-8');

describe('Atajos numéricos de paneles', () => {
  it('usan foco PiP antes de devolver un panel detached al canvas', () => {
    assert.match(shortcutSource, /import \{[\s\S]*?focusPip,[\s\S]*?getFocusedPipLockState,[\s\S]*?isPipped,[\s\S]*?toggleRememberedPip,[\s\S]*?closeAllPips,[\s\S]*?openAllPips[\s\S]*?\} from '\.\/pipManager\.js';/);
    assert.match(shortcutSource, /function panelShortcutAction\(panelId\) \{[\s\S]*?if \(isPipped\(panelId\)\) \{[\s\S]*?const \{ hasFocusedPip, panelId: focusedPanelId \} = getFocusedPipLockState\(\);[\s\S]*?if \(hasFocusedPip && focusedPanelId === panelId\) \{[\s\S]*?toggleRememberedPip\(panelId\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?focusPip\(panelId\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?toggleRememberedPip\(panelId\);[\s\S]*?\}/);
  });

  it('reservan 0, 8 y 9 para cerrar PiPs, alternar teclados y abrir PiPs', () => {
    assert.ok(shortcutSource.includes("closeAllPips: { key: '0', shift: false, ctrl: false, alt: false }"));
    assert.ok(shortcutSource.includes("toggleKeyboard: { key: '8', shift: false, ctrl: false, alt: false }"));
    assert.ok(shortcutSource.includes("openAllPips: { key: '9', shift: false, ctrl: false, alt: false }"));
  });

  it('ejecutan las mismas rutas compartidas de PiP y teclado', () => {
    assert.match(shortcutSource, /import \{ toggleKeyboard \} from '\.\/keyboardWindow\.js';/);
    assert.match(shortcutSource, /closeAllPips: \(\) => closeAllPips\(\),/);
    assert.match(shortcutSource, /toggleKeyboard: \(\) => toggleKeyboard\(\),/);
    assert.match(shortcutSource, /openAllPips: \(\) => openAllPips\(\)/);
  });

  it('migra shortcuts antiguos de overview y filtra acciones obsoletas al cargar', () => {
    assert.match(shortcutSource, /if \(!migrated\.closeAllPips && migrated\.overview\) \{[\s\S]*?migrated\.closeAllPips = migrated\.overview;[\s\S]*?\}/);
    assert.match(shortcutSource, /Object\.entries\(migrated\)\.filter\(\(\[actionId\]\) => Object\.hasOwn\(DEFAULT_SHORTCUTS, actionId\)\)/);
  });

  it('captura shortcuts antes que otros listeners y ajustes sigue listando todas las acciones', () => {
    assert.match(shortcutSource, /document\.addEventListener\('keydown', this\._boundHandler, true\);/);
    assert.match(settingsSource, /const actionIds = keyboardShortcuts\.getActionIds\(\);/);
  });
});

describe('Sincronización de teclados flotantes', () => {
  it('quickbar y bridge de Electron escuchan el evento synth:keyboardToggle', () => {
    assert.match(quickbarSource, /document\.addEventListener\('synth:keyboardToggle', \(\) => \{[\s\S]*?updateKeyboardButton\(\);[\s\S]*?\}\);/);
    assert.match(electronBridgeSource, /document\.addEventListener\('synth:keyboardToggle', \(e\) => \{[\s\S]*?syncState\(\{ keyboardVisible: e\.detail\?\.visible \?\? false \}\);[\s\S]*?\}\);/);
  });

  it('expone etiquetas traducibles para los nuevos shortcuts en Ajustes', () => {
    assert.match(translationsSource, /settings\.shortcuts\.closeAllPips:/);
    assert.match(translationsSource, /settings\.shortcuts\.toggleKeyboard:/);
    assert.match(translationsSource, /settings\.shortcuts\.openAllPips:/);
  });
});
