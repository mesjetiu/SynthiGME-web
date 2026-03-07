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

describe('Atajos numéricos de paneles', () => {
  it('usan foco PiP antes de devolver un panel detached al canvas', () => {
    assert.match(shortcutSource, /import \{[\s\S]*?focusPip,[\s\S]*?getFocusedPipLockState,[\s\S]*?isPipped,[\s\S]*?toggleRememberedPip,[\s\S]*?toggleAllRememberedPips[\s\S]*?\} from '\.\/pipManager\.js';/);
    assert.match(shortcutSource, /function panelShortcutAction\(panelId\) \{[\s\S]*?if \(isPipped\(panelId\)\) \{[\s\S]*?const \{ hasFocusedPip, panelId: focusedPanelId \} = getFocusedPipLockState\(\);[\s\S]*?if \(hasFocusedPip && focusedPanelId === panelId\) \{[\s\S]*?toggleRememberedPip\(panelId\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?focusPip\(panelId\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?toggleRememberedPip\(panelId\);[\s\S]*?\}/);
  });
});
