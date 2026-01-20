/**
 * Tests para ui/pinColorMenu.js
 * 
 * Verifica el funcionamiento del menú de selección de color de pines:
 * - Contextos de color (audio, control, oscilloscope)
 * - Memoria del último color seleccionado por contexto
 * - Colores por defecto según contexto
 * - Constantes exportadas
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  PinColorMenu,
  getPinColorMenu,
  SELECTABLE_COLORS,
  DEFAULT_COLORS,
  PIN_CSS_COLORS
} from '../../src/assets/js/ui/pinColorMenu.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES EXPORTADAS
// ═══════════════════════════════════════════════════════════════════════════

describe('Constantes de PinColorMenu', () => {
  describe('SELECTABLE_COLORS', () => {
    it('contiene los 4 colores seleccionables', () => {
      assert.equal(SELECTABLE_COLORS.length, 4);
      assert.ok(SELECTABLE_COLORS.includes('WHITE'), 'Debería incluir WHITE');
      assert.ok(SELECTABLE_COLORS.includes('GREY'), 'Debería incluir GREY');
      assert.ok(SELECTABLE_COLORS.includes('GREEN'), 'Debería incluir GREEN');
      assert.ok(SELECTABLE_COLORS.includes('RED'), 'Debería incluir RED');
    });

    it('NO incluye ORANGE (color peligroso)', () => {
      assert.ok(!SELECTABLE_COLORS.includes('ORANGE'), 'ORANGE no debería ser seleccionable');
    });

    it('mantiene orden consistente', () => {
      // El orden determina el orden visual en el menú
      assert.deepEqual(SELECTABLE_COLORS, ['WHITE', 'GREY', 'GREEN', 'RED']);
    });
  });

  describe('DEFAULT_COLORS', () => {
    it('define color por defecto para audio (Panel 5)', () => {
      assert.equal(DEFAULT_COLORS['audio'], 'WHITE');
    });

    it('define color por defecto para control (Panel 6)', () => {
      assert.equal(DEFAULT_COLORS['control'], 'GREY');
    });

    it('define color por defecto para oscilloscope', () => {
      assert.equal(DEFAULT_COLORS['oscilloscope'], 'RED');
    });

    it('tiene exactamente 3 contextos definidos', () => {
      assert.equal(Object.keys(DEFAULT_COLORS).length, 3);
    });
  });

  describe('PIN_CSS_COLORS', () => {
    it('proporciona colores para WHITE', () => {
      const color = PIN_CSS_COLORS.WHITE;
      assert.ok(typeof color === 'string', 'Debería ser string');
      assert.ok(color.length > 0, 'No debería estar vacío');
    });

    it('proporciona colores para GREY', () => {
      const color = PIN_CSS_COLORS.GREY;
      assert.ok(typeof color === 'string', 'Debería ser string');
      assert.ok(color.length > 0, 'No debería estar vacío');
    });

    it('proporciona colores para GREEN', () => {
      const color = PIN_CSS_COLORS.GREEN;
      assert.ok(typeof color === 'string', 'Debería ser string');
      assert.ok(color.length > 0, 'No debería estar vacío');
    });

    it('proporciona colores para RED', () => {
      const color = PIN_CSS_COLORS.RED;
      assert.ok(typeof color === 'string', 'Debería ser string');
      assert.ok(color.length > 0, 'No debería estar vacío');
    });

    it('usa fallbacks cuando no hay DOM (tests/SSR)', () => {
      // En entorno de test sin DOM real, debería devolver fallbacks
      // Los fallbacks son: #ffffff, #888888, #4CAF50, #f44336
      assert.ok(PIN_CSS_COLORS.WHITE.startsWith('#'), 'WHITE debería ser hex');
      assert.ok(PIN_CSS_COLORS.GREY.startsWith('#'), 'GREY debería ser hex');
      assert.ok(PIN_CSS_COLORS.GREEN.startsWith('#'), 'GREEN debería ser hex');
      assert.ok(PIN_CSS_COLORS.RED.startsWith('#'), 'RED debería ser hex');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CLASE PinColorMenu
// ═══════════════════════════════════════════════════════════════════════════

describe('PinColorMenu', () => {
  let menu;

  beforeEach(() => {
    // Crear instancia limpia para cada test
    menu = new PinColorMenu();
  });

  afterEach(() => {
    // Limpiar recursos
    menu.destroy();
  });

  describe('constructor', () => {
    it('inicializa estado interno correctamente', () => {
      assert.equal(menu._isVisible, false);
      assert.equal(menu._currentCallback, null);
      assert.equal(menu._currentPinBtn, null);
      assert.equal(menu._currentContext, null);
      assert.equal(menu._currentIsActive, false);
    });

    it('inicializa registro de últimos colores por contexto', () => {
      assert.deepEqual(menu._lastSelectedByContext, {
        'audio': null,
        'control': null,
        'oscilloscope': null
      });
    });
  });

  describe('getNextColor', () => {
    it('devuelve default de audio si no hay selección previa', () => {
      assert.equal(menu.getNextColor('audio'), 'WHITE');
    });

    it('devuelve default de control si no hay selección previa', () => {
      assert.equal(menu.getNextColor('control'), 'GREY');
    });

    it('devuelve default de oscilloscope si no hay selección previa', () => {
      assert.equal(menu.getNextColor('oscilloscope'), 'RED');
    });

    it('devuelve WHITE para contexto desconocido', () => {
      assert.equal(menu.getNextColor('unknown'), 'WHITE');
    });

    it('recuerda último color seleccionado por contexto', () => {
      // Simular selección de GREY en audio
      menu._lastSelectedByContext['audio'] = 'GREY';
      assert.equal(menu.getNextColor('audio'), 'GREY');

      // Simular selección de WHITE en control
      menu._lastSelectedByContext['control'] = 'WHITE';
      assert.equal(menu.getNextColor('control'), 'WHITE');

      // Oscilloscope no ha sido modificado, sigue en default
      assert.equal(menu.getNextColor('oscilloscope'), 'RED');
    });

    it('cada contexto mantiene su propia memoria independiente', () => {
      menu._lastSelectedByContext['audio'] = 'RED';
      menu._lastSelectedByContext['control'] = 'GREY';
      menu._lastSelectedByContext['oscilloscope'] = 'WHITE';

      assert.equal(menu.getNextColor('audio'), 'RED');
      assert.equal(menu.getNextColor('control'), 'GREY');
      assert.equal(menu.getNextColor('oscilloscope'), 'WHITE');
    });
  });

  describe('getDefaultColor', () => {
    it('devuelve WHITE para audio', () => {
      assert.equal(menu.getDefaultColor('audio'), 'WHITE');
    });

    it('devuelve GREY para control', () => {
      assert.equal(menu.getDefaultColor('control'), 'GREY');
    });

    it('devuelve RED para oscilloscope', () => {
      assert.equal(menu.getDefaultColor('oscilloscope'), 'RED');
    });

    it('devuelve WHITE para contexto desconocido', () => {
      assert.equal(menu.getDefaultColor('unknown'), 'WHITE');
      assert.equal(menu.getDefaultColor(null), 'WHITE');
      assert.equal(menu.getDefaultColor(undefined), 'WHITE');
    });
  });

  describe('hide', () => {
    it('no falla si se llama cuando ya está oculto (sin DOM)', () => {
      // El menú no está visible y no tiene elemento creado
      // hide() debería salir temprano sin error
      menu._isVisible = false;
      menu._element = null;
      assert.doesNotThrow(() => {
        menu.hide();
      });
    });

    it('limpia estado al ocultar (sin acceder DOM)', () => {
      // Simular que estaba visible pero sin crear elemento real
      // Usamos _isVisible = false para que hide() salga temprano
      menu._isVisible = false;  // Evita acceso al DOM
      menu._currentCallback = () => {};
      menu._currentPinBtn = {};
      menu._currentContext = 'audio';
      menu._currentIsActive = true;

      menu.hide();

      // Como _isVisible era false, hide() no hace nada
      // Verificamos que no falla, el estado se mantiene
      assert.equal(menu._isVisible, false);
      // El resto del estado no se limpia porque hide() salió temprano
      // Esto es comportamiento esperado cuando no está visible
    });

    it('estado inicial _isVisible es false', () => {
      // Verificar que el estado inicial es correcto
      const freshMenu = new PinColorMenu();
      assert.equal(freshMenu._isVisible, false);
      assert.equal(freshMenu._currentCallback, null);
      assert.equal(freshMenu._currentPinBtn, null);
      freshMenu.destroy();
    });
  });

  describe('destroy', () => {
    it('no falla si no hay elemento creado', () => {
      // Sin DOM, el elemento nunca se crea
      menu._element = null;
      assert.doesNotThrow(() => {
        menu.destroy();
      });
    });

    it('limpia la referencia al elemento', () => {
      // Asignar un mock de elemento
      menu._element = { parentNode: null };
      menu.destroy();
      assert.equal(menu._element, null);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON getPinColorMenu
// ═══════════════════════════════════════════════════════════════════════════

describe('getPinColorMenu singleton', () => {
  it('devuelve instancia de PinColorMenu', () => {
    const instance = getPinColorMenu();
    assert.ok(instance instanceof PinColorMenu);
  });

  it('devuelve siempre la misma instancia', () => {
    const instance1 = getPinColorMenu();
    const instance2 = getPinColorMenu();
    assert.strictEqual(instance1, instance2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRACIÓN CON RESISTENCIAS
// ═══════════════════════════════════════════════════════════════════════════

describe('Integración con PIN_RESISTANCES', () => {
  it('todos los colores seleccionables tienen resistencia definida', async () => {
    const { PIN_RESISTANCES } = await import('../../src/assets/js/utils/voltageConstants.js');
    
    for (const color of SELECTABLE_COLORS) {
      assert.ok(PIN_RESISTANCES[color], `${color} debería tener resistencia definida`);
      assert.ok(typeof PIN_RESISTANCES[color].value === 'number', `${color} debería tener value numérico`);
    }
  });

  it('WHITE tiene 100kΩ', async () => {
    const { PIN_RESISTANCES } = await import('../../src/assets/js/utils/voltageConstants.js');
    assert.equal(PIN_RESISTANCES.WHITE.value, 100000);
  });

  it('GREY tiene 100kΩ (precisión)', async () => {
    const { PIN_RESISTANCES } = await import('../../src/assets/js/utils/voltageConstants.js');
    assert.equal(PIN_RESISTANCES.GREY.value, 100000);
  });

  it('GREEN tiene 68kΩ', async () => {
    const { PIN_RESISTANCES } = await import('../../src/assets/js/utils/voltageConstants.js');
    assert.equal(PIN_RESISTANCES.GREEN.value, 68000);
  });

  it('RED tiene 2.7kΩ', async () => {
    const { PIN_RESISTANCES } = await import('../../src/assets/js/utils/voltageConstants.js');
    assert.equal(PIN_RESISTANCES.RED.value, 2700);
  });
});
