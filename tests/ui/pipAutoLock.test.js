/**
 * Tests para la lógica de auto-lock/unlock de PiP
 * 
 * Verifica el contrato del sistema de bloqueo automático de paneo/zoom:
 * - Al abrir la primera PiP → auto-lock de paneo y zoom del canvas
 * - Al cerrar la última PiP → auto-unlock (si no se cambió manualmente)
 * - Si el usuario cambia los locks manualmente → se invalida el auto-lock
 * - El source 'pipAutoLock' se incluye en los eventos despachados
 * - La invalidación escucha eventos sin source 'pipAutoLock'
 * 
 * Método: análisis estático del código fuente de pipManager.js.
 * No requiere DOM ni Electron runtime.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const pipSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/pipManager.js'), 'utf-8');
const quickbarSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/quickbar.js'), 'utf-8');
const bridgeSource = readFileSync(resolve(ROOT, 'src/assets/js/ui/electronMenuBridge.js'), 'utf-8');

// ═══════════════════════════════════════════════════════════════════════════
// 1. AUTO-LOCK AL ABRIR PRIMERA PiP
// ═══════════════════════════════════════════════════════════════════════════

describe('PiP auto-lock al abrir primera PiP', () => {

  it('openPip() despacha synth:panLockChange con enabled:true', () => {
    // Extraer la sección de auto-lock en openPip
    const autoLockSection = pipSource.substring(
      pipSource.indexOf('Auto-lock al abrir')
    );
    const panLock = autoLockSection.match(
      /panLockChange[\s\S]*?enabled:\s*true/
    );
    assert.ok(panLock, 'openPip debe despachar synth:panLockChange enabled:true al abrir la primera PiP');
  });

  it('openPip() despacha synth:zoomLockChange con enabled:true', () => {
    const autoLockSection = pipSource.substring(
      pipSource.indexOf('Auto-lock al abrir')
    );
    const zoomLock = autoLockSection.match(
      /zoomLockChange[\s\S]*?enabled:\s*true/
    );
    assert.ok(zoomLock, 'openPip debe despachar synth:zoomLockChange enabled:true al abrir la primera PiP');
  });

  it('los eventos de auto-lock incluyen source: pipAutoLock', () => {
    // Verificar que los eventos despachados tienen source: 'pipAutoLock'
    const panLockWithSource = pipSource.match(
      /panLockChange[\s\S]*?source:\s*'pipAutoLock'/
    );
    const zoomLockWithSource = pipSource.match(
      /zoomLockChange[\s\S]*?source:\s*'pipAutoLock'/
    );
    assert.ok(panLockWithSource, 'synth:panLockChange debe incluir source: pipAutoLock');
    assert.ok(zoomLockWithSource, 'synth:zoomLockChange debe incluir source: pipAutoLock');
  });

  it('solo hace auto-lock al pasar de 0 a 1 PiP (activePips.size === 1)', () => {
    const sizeCheck = pipSource.match(/activePips\.size === 1 && !_isRestoring/);
    assert.ok(sizeCheck, 'El auto-lock debe verificar activePips.size === 1 y no estar restaurando');
  });

  it('no hace auto-lock durante la restauración de sesión (_isRestoring)', () => {
    const restoringGuard = pipSource.match(/activePips\.size === 1 && !_isRestoring/);
    assert.ok(restoringGuard, 'El auto-lock debe excluir restauración de sesión');
  });

  it('hace zoom out a vista general al auto-lock', () => {
    // Antes de bloquear, debe animar al zoom mínimo
    const zoomOut = pipSource.match(
      /auto-lock[\s\S]*?__synthAnimateToPanel[\s\S]*?null/
    );
    assert.ok(zoomOut, 'El auto-lock debe hacer zoom out a vista general (animateToPanel(null))');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. AUTO-UNLOCK AL CERRAR ÚLTIMA PiP
// ═══════════════════════════════════════════════════════════════════════════

describe('PiP auto-unlock al cerrar última PiP', () => {

  it('closePip() despacha synth:panLockChange con enabled:false', () => {
    // Extraer la sección de auto-unlock en closePip
    const closePipSection = pipSource.substring(
      pipSource.indexOf('Auto-unlock al cerrar')
    );
    const panUnlock = closePipSection.match(
      /panLockChange[\s\S]*?enabled:\s*false/
    );
    assert.ok(panUnlock, 'closePip debe despachar synth:panLockChange enabled:false al cerrar la última PiP');
  });

  it('closePip() despacha synth:zoomLockChange con enabled:false', () => {
    const closePipSection = pipSource.substring(
      pipSource.indexOf('Auto-unlock al cerrar')
    );
    const zoomUnlock = closePipSection.match(
      /zoomLockChange[\s\S]*?enabled:\s*false/
    );
    assert.ok(zoomUnlock, 'closePip debe despachar synth:zoomLockChange enabled:false al cerrar la última PiP');
  });

  it('solo hace auto-unlock si _autoLockedByPip es true', () => {
    const guard = pipSource.match(/activePips\.size === 0 && _autoLockedByPip/);
    assert.ok(guard, 'El auto-unlock debe verificar que _autoLockedByPip es true');
  });

  it('los eventos de auto-unlock incluyen source: pipAutoLock', () => {
    // Buscar en la zona de closePip
    const closePipSection = pipSource.substring(
      pipSource.indexOf('function closePip(')
    );
    const panSource = closePipSection.match(
      /panLockChange[\s\S]*?source:\s*'pipAutoLock'/
    );
    const zoomSource = closePipSection.match(
      /zoomLockChange[\s\S]*?source:\s*'pipAutoLock'/
    );
    assert.ok(panSource, 'synth:panLockChange en closePip debe incluir source: pipAutoLock');
    assert.ok(zoomSource, 'synth:zoomLockChange en closePip debe incluir source: pipAutoLock');
  });

  it('resetea _autoLockedByPip a false al hacer auto-unlock', () => {
    const closePipSection = pipSource.substring(
      pipSource.indexOf('function closePip(')
    );
    const resetFlag = closePipSection.match(
      /activePips\.size === 0 && _autoLockedByPip[\s\S]*?_autoLockedByPip = false/
    );
    assert.ok(resetFlag, 'Debe resetear _autoLockedByPip a false al hacer auto-unlock');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. INVALIDACIÓN DE AUTO-LOCK POR CAMBIO MANUAL
// ═══════════════════════════════════════════════════════════════════════════

describe('PiP auto-lock invalidación por cambio manual', () => {

  it('escucha synth:panLockChange para invalidar auto-lock', () => {
    const listener = pipSource.match(
      /addEventListener\('synth:panLockChange',\s*invalidateAutoLock\)/
    );
    assert.ok(listener, 'Debe escuchar synth:panLockChange para invalidar');
  });

  it('escucha synth:zoomLockChange para invalidar auto-lock', () => {
    const listener = pipSource.match(
      /addEventListener\('synth:zoomLockChange',\s*invalidateAutoLock\)/
    );
    assert.ok(listener, 'Debe escuchar synth:zoomLockChange para invalidar');
  });

  it('invalidateAutoLock solo actúa si _autoLockedByPip es true', () => {
    const guard = pipSource.match(/if \(_autoLockedByPip && e\.detail\?\.source !== 'pipAutoLock'\)/);
    assert.ok(guard, 'invalidateAutoLock debe verificar _autoLockedByPip y filtrar por source');
  });

  it('invalidateAutoLock ignora eventos con source pipAutoLock', () => {
    const sourceFilter = pipSource.match(/source !== 'pipAutoLock'/);
    assert.ok(sourceFilter, 'Debe ignorar eventos con source: pipAutoLock (propios)');
  });

  it('invalidateAutoLock pone _autoLockedByPip a false', () => {
    // Buscar dentro de la función invalidateAutoLock
    const invalidateBlock = pipSource.match(
      /invalidateAutoLock[\s\S]*?_autoLockedByPip = false/
    );
    assert.ok(invalidateBlock, 'invalidateAutoLock debe poner _autoLockedByPip a false');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. SINCRONIZACIÓN DE LOCKS ENTRE COMPONENTES
// ═══════════════════════════════════════════════════════════════════════════

describe('Sincronización de locks entre quickbar, pipManager y Electron', () => {

  it('quickbar escucha synth:panLockChange de fuentes externas', () => {
    const listener = quickbarSource.match(
      /addEventListener\('synth:panLockChange'/
    );
    assert.ok(listener, 'Quickbar debe escuchar synth:panLockChange');
  });

  it('quickbar escucha synth:zoomLockChange de fuentes externas', () => {
    const listener = quickbarSource.match(
      /addEventListener\('synth:zoomLockChange'/
    );
    assert.ok(listener, 'Quickbar debe escuchar synth:zoomLockChange');
  });

  it('quickbar actualiza navLocks.panLocked al recibir evento externo', () => {
    const update = quickbarSource.match(
      /synth:panLockChange[\s\S]*?navLocks\.panLocked = e\.detail/
    );
    assert.ok(update, 'Quickbar debe actualizar navLocks.panLocked con el valor del evento');
  });

  it('quickbar actualiza navLocks.zoomLocked al recibir evento externo', () => {
    const update = quickbarSource.match(
      /synth:zoomLockChange[\s\S]*?navLocks\.zoomLocked = e\.detail/
    );
    assert.ok(update, 'Quickbar debe actualizar navLocks.zoomLocked con el valor del evento');
  });

  it('electronMenuBridge tiene handler para setLockPan', () => {
    const handler = bridgeSource.match(/case 'setLockPan'/);
    assert.ok(handler, 'Bridge debe tener handler para setLockPan');
  });

  it('electronMenuBridge tiene handler para setLockZoom', () => {
    const handler = bridgeSource.match(/case 'setLockZoom'/);
    assert.ok(handler, 'Bridge debe tener handler para setLockZoom');
  });

  it('bridge despacha synth:panLockChange al recibir setLockPan', () => {
    const bridgeLockSection = bridgeSource.substring(
      bridgeSource.indexOf("case 'setLockPan'")
    );
    const dispatch = bridgeLockSection.match(
      /panLockChange[\s\S]{0,200}?enabled:\s*locks\.panLocked/
    );
    assert.ok(dispatch, 'Bridge debe despachar synth:panLockChange al manejar setLockPan');
  });

  it('bridge despacha synth:zoomLockChange al recibir setLockZoom', () => {
    const bridgeLockSection = bridgeSource.substring(
      bridgeSource.indexOf("case 'setLockZoom'")
    );
    const dispatch = bridgeLockSection.match(
      /zoomLockChange[\s\S]{0,200}?enabled:\s*locks\.zoomLocked/
    );
    assert.ok(dispatch, 'Bridge debe despachar synth:zoomLockChange al manejar setLockZoom');
  });

  it('el estado global __synthNavLocks se usa de forma consistente', () => {
    // Todos los componentes deben usar el mismo objeto global para locks
    assert.ok(
      pipSource.includes('window.__synthNavLocks'),
      'pipManager debe usar window.__synthNavLocks'
    );
    assert.ok(
      quickbarSource.includes('window.__synthNavLocks'),
      'quickbar debe usar window.__synthNavLocks'
    );
    assert.ok(
      bridgeSource.includes('window.__synthNavLocks'),
      'electronMenuBridge debe usar window.__synthNavLocks'
    );
  });

  it('el objeto navLocks tiene las mismas propiedades en todos los componentes', () => {
    // Todos deben inicializar con { zoomLocked: false, panLocked: false }
    const pattern = /zoomLocked:\s*false,\s*panLocked:\s*false/;
    assert.ok(pattern.test(pipSource), 'pipManager debe inicializar { zoomLocked: false, panLocked: false }');
    assert.ok(pattern.test(quickbarSource), 'quickbar debe inicializar { zoomLocked: false, panLocked: false }');
    assert.ok(pattern.test(bridgeSource), 'bridge debe inicializar { zoomLocked: false, panLocked: false }');
  });
});
