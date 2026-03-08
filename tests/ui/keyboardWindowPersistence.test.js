/**
 * Tests estáticos para persistencia visual de keyboardWindow.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const keyboardSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/keyboardWindow.js'), 'utf-8');
const settingsSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/settingsModal.js'), 'utf-8');
const electronBridgeSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/electronMenuBridge.js'), 'utf-8');

describe('keyboardWindow respeta REMEMBER_VISUAL_LAYOUT', () => {
  it('solo guarda y restaura estado entre sesiones cuando la preferencia está activa', () => {
    assert.match(keyboardSource, /function _shouldRememberVisualLayout\(\) \{[\s\S]*?STORAGE_KEYS\.REMEMBER_VISUAL_LAYOUT/);
    assert.match(keyboardSource, /function _saveState\(\) \{[\s\S]*?if \(!_shouldRememberVisualLayout\(\)\) \{[\s\S]*?localStorage\.removeItem\(STORAGE_KEYS\.KEYBOARD_STATE\);[\s\S]*?return;[\s\S]*?\}/);
    assert.match(keyboardSource, /function _restoreState\(\) \{[\s\S]*?if \(!_shouldRememberVisualLayout\(\)\) return;/);
  });
});

describe('desactivar recordar disposición visual limpia keyboard state', () => {
  it('settingsModal elimina KEYBOARD_STATE al desactivar la preferencia', () => {
    assert.match(settingsSource, /if \(!remember\) \{[\s\S]*?localStorage\.removeItem\(STORAGE_KEYS\.PIP_STATE\);[\s\S]*?localStorage\.removeItem\(STORAGE_KEYS\.VIEWPORT_STATE\);[\s\S]*?localStorage\.removeItem\(STORAGE_KEYS\.KEYBOARD_STATE\);[\s\S]*?\}/);
  });

  it('electronMenuBridge no reaplica keyboardVisible guardado si recordar disposición está desactivado y limpia el estado al desactivar', () => {
    assert.match(electronBridgeSource, /keyboardVisible: \(\(\) => \{[\s\S]*?if \(!readBool\(STORAGE_KEYS\.REMEMBER_VISUAL_LAYOUT, false\)\) return false;[\s\S]*?STORAGE_KEYS\.KEYBOARD_STATE/);
    assert.match(electronBridgeSource, /case 'setRememberVisualLayout':[\s\S]*?if \(!data\.enabled\) \{[\s\S]*?localStorage\.removeItem\(STORAGE_KEYS\.PIP_STATE\);[\s\S]*?localStorage\.removeItem\(STORAGE_KEYS\.VIEWPORT_STATE\);[\s\S]*?localStorage\.removeItem\(STORAGE_KEYS\.KEYBOARD_STATE\);[\s\S]*?\}/);
  });
});