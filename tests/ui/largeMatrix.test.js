/**
 * Tests para ui/largeMatrix.js
 * 
 * Verifica el funcionamiento de la matriz grande 63×67:
 * - Serialización y deserialización de estado (con colores de pines)
 * - Gestión de colores de pines (_pinColors Map)
 * - Color efectivo según contexto y defaults
 * - Determinación del contexto de pin
 */
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { LargeMatrix } from '../../src/assets/js/ui/largeMatrix.js';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea una matriz mínima para tests (sin DOM real).
 * @param {Object} opts - Opciones adicionales
 * @returns {LargeMatrix}
 */
function createTestMatrix(opts = {}) {
  // Mock mínimo de table para evitar errores null
  const mockTable = {
    classList: { add: () => {}, remove: () => {} },
    style: { setProperty: () => {} },
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    innerHTML: ''
  };

  return new LargeMatrix(mockTable, {
    rows: 63,
    cols: 67,
    panelId: opts.panelId || 'panel-5',
    defaultPinColor: opts.defaultPinColor || 'WHITE',
    getDefaultPinColor: opts.getDefaultPinColor || null,
    getPinContext: opts.getPinContext || null,
    ...opts
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCTOR
// ═══════════════════════════════════════════════════════════════════════════

describe('LargeMatrix constructor', () => {
  it('inicializa dimensiones correctas', () => {
    const matrix = createTestMatrix();
    assert.equal(matrix.rows, 63);
    assert.equal(matrix.cols, 67);
  });

  it('inicializa panelId', () => {
    const matrix = createTestMatrix({ panelId: 'panel-6' });
    assert.equal(matrix.panelId, 'panel-6');
  });

  it('inicializa defaultPinColor', () => {
    const matrix = createTestMatrix({ defaultPinColor: 'GREEN' });
    assert.equal(matrix.defaultPinColor, 'GREEN');
  });

  it('acepta getDefaultPinColor como función', () => {
    const fn = () => 'RED';
    const matrix = createTestMatrix({ getDefaultPinColor: fn });
    assert.strictEqual(matrix.getDefaultPinColor, fn);
  });

  it('inicializa _pinColors como Map vacío', () => {
    const matrix = createTestMatrix();
    assert.ok(matrix._pinColors instanceof Map);
    assert.equal(matrix._pinColors.size, 0);
  });

  it('inicializa onPinColorChange como null', () => {
    const matrix = createTestMatrix();
    assert.equal(matrix.onPinColorChange, null);
  });

  it('inicializa getPinContext como null por defecto', () => {
    const matrix = createTestMatrix();
    assert.equal(matrix.getPinContext, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// _getPinContext
// ═══════════════════════════════════════════════════════════════════════════

describe('LargeMatrix._getPinContext', () => {
  it('devuelve audio para panel-5 sin función externa', () => {
    const matrix = createTestMatrix({ panelId: 'panel-5' });
    assert.equal(matrix._getPinContext(0, 0), 'audio');
  });

  it('devuelve control para panel-6 sin función externa', () => {
    const matrix = createTestMatrix({ panelId: 'panel-6' });
    assert.equal(matrix._getPinContext(0, 0), 'control');
  });

  it('devuelve audio como fallback para panel desconocido', () => {
    const matrix = createTestMatrix({ panelId: 'panel-99' });
    assert.equal(matrix._getPinContext(0, 0), 'audio');
  });

  it('usa función externa getPinContext si está definida', () => {
    const matrix = createTestMatrix({
      panelId: 'panel-5',
      getPinContext: (row, col) => {
        // Simular: columna > 60 es osciloscopio
        if (col > 60) return 'oscilloscope';
        return 'audio';
      }
    });

    // Pero la configuramos después ya que el constructor la asigna:
    matrix.getPinContext = (row, col) => {
      if (col > 60) return 'oscilloscope';
      return 'audio';
    };

    assert.equal(matrix._getPinContext(0, 30), 'audio');
    assert.equal(matrix._getPinContext(0, 65), 'oscilloscope');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// _getEffectivePinColor
// ═══════════════════════════════════════════════════════════════════════════

describe('LargeMatrix._getEffectivePinColor', () => {
  it('devuelve color almacenado si existe', () => {
    const matrix = createTestMatrix({ defaultPinColor: 'WHITE' });
    matrix._pinColors.set('5:10', 'GREEN');
    assert.equal(matrix._getEffectivePinColor(5, 10), 'GREEN');
  });

  it('devuelve defaultPinColor si no hay color almacenado', () => {
    const matrix = createTestMatrix({ defaultPinColor: 'GREY' });
    assert.equal(matrix._getEffectivePinColor(5, 10), 'GREY');
  });

  it('devuelve WHITE si no hay ni stored ni default', () => {
    const matrix = createTestMatrix({ defaultPinColor: null });
    assert.equal(matrix._getEffectivePinColor(5, 10), 'WHITE');
  });

  it('usa getDefaultPinColor dinámico si está definido', () => {
    const matrix = createTestMatrix({
      defaultPinColor: 'WHITE',
      getDefaultPinColor: (row, col) => {
        // Simular: row == 0 devuelve RED
        if (row === 0) return 'RED';
        return null; // Usar default estático
      }
    });

    // row 0 usa función dinámica
    assert.equal(matrix._getEffectivePinColor(0, 5), 'RED');
    // row 1 usa default estático
    assert.equal(matrix._getEffectivePinColor(1, 5), 'WHITE');
  });

  it('color almacenado tiene prioridad sobre getDefaultPinColor', () => {
    const matrix = createTestMatrix({
      getDefaultPinColor: () => 'RED'
    });
    matrix._pinColors.set('0:5', 'GREEN');
    assert.equal(matrix._getEffectivePinColor(0, 5), 'GREEN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getPinColor (método público)
// ═══════════════════════════════════════════════════════════════════════════

describe('LargeMatrix.getPinColor', () => {
  it('devuelve color almacenado si existe', () => {
    const matrix = createTestMatrix();
    matrix._pinColors.set('10:20', 'GREY');
    assert.equal(matrix.getPinColor(10, 20), 'GREY');
  });

  it('devuelve null si no hay color almacenado', () => {
    const matrix = createTestMatrix();
    assert.equal(matrix.getPinColor(10, 20), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// serialize
// ═══════════════════════════════════════════════════════════════════════════

describe('LargeMatrix.serialize', () => {
  it('devuelve objeto con array connections vacío si no hay tabla', () => {
    const matrix = new LargeMatrix(null);
    const state = matrix.serialize();
    assert.deepEqual(state, { connections: [] });
  });

  it('devuelve objeto con array connections vacío si no está construida', () => {
    const matrix = createTestMatrix();
    matrix._built = false;
    const state = matrix.serialize();
    assert.deepEqual(state, { connections: [] });
  });

  describe('formato de conexiones', () => {
    it('formato [row, col] para conexión sin color específico', () => {
      const matrix = createTestMatrix();
      matrix._built = true;

      // Mock querySelectorAll para devolver un botón activo
      const mockBtn = {
        dataset: { row: '5', col: '10' },
        classList: { contains: () => false }
      };
      matrix.table.querySelectorAll = () => [mockBtn];

      const state = matrix.serialize();
      assert.equal(state.connections.length, 1);
      assert.deepEqual(state.connections[0], [5, 10]);
    });

    it('formato [row, col, pinType] para conexión con color específico', () => {
      const matrix = createTestMatrix();
      matrix._built = true;
      matrix._pinColors.set('5:10', 'GREEN');

      const mockBtn = {
        dataset: { row: '5', col: '10' },
        classList: { contains: () => false }
      };
      matrix.table.querySelectorAll = () => [mockBtn];

      const state = matrix.serialize();
      assert.equal(state.connections.length, 1);
      assert.deepEqual(state.connections[0], [5, 10, 'GREEN']);
    });

    it('serializa múltiples conexiones correctamente', () => {
      const matrix = createTestMatrix();
      matrix._built = true;
      matrix._pinColors.set('0:0', 'WHITE');
      matrix._pinColors.set('10:20', 'RED');
      // 30:40 sin color

      const mockBtns = [
        { dataset: { row: '0', col: '0' } },
        { dataset: { row: '10', col: '20' } },
        { dataset: { row: '30', col: '40' } }
      ];
      matrix.table.querySelectorAll = () => mockBtns;

      const state = matrix.serialize();
      assert.equal(state.connections.length, 3);
      assert.deepEqual(state.connections[0], [0, 0, 'WHITE']);
      assert.deepEqual(state.connections[1], [10, 20, 'RED']);
      assert.deepEqual(state.connections[2], [30, 40]); // Sin color
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// deserialize
// ═══════════════════════════════════════════════════════════════════════════

describe('LargeMatrix.deserialize', () => {
  it('no falla con data null', () => {
    const matrix = createTestMatrix();
    assert.doesNotThrow(() => matrix.deserialize(null));
  });

  it('no falla con data sin connections', () => {
    const matrix = createTestMatrix();
    assert.doesNotThrow(() => matrix.deserialize({}));
  });

  it('no falla con connections no array', () => {
    const matrix = createTestMatrix();
    assert.doesNotThrow(() => matrix.deserialize({ connections: 'invalid' }));
  });

  it('limpia _pinColors antes de restaurar', () => {
    const matrix = createTestMatrix();
    matrix._built = true;
    matrix._pinColors.set('99:99', 'GREY');

    matrix.deserialize({ connections: [] });

    assert.equal(matrix._pinColors.size, 0);
  });

  describe('restauración de colores', () => {
    it('restaura conexión formato antiguo [row, col]', () => {
      const matrix = createTestMatrix();
      matrix._built = true;

      let activatedConnections = [];
      const mockBtn = {
        disabled: false,
        classList: {
          contains: (cls) => cls === 'is-hidden-pin' ? false : false,
          add: () => {},
          remove: () => {}
        }
      };
      matrix.table.querySelector = () => mockBtn;
      matrix.table.querySelectorAll = () => []; // Para clearAll inicial
      matrix.onToggle = (row, col, active, btn, color) => {
        if (active) activatedConnections.push({ row, col, color });
        return true;
      };

      matrix.deserialize({ connections: [[5, 10]] });

      assert.equal(activatedConnections.length, 1);
      assert.equal(activatedConnections[0].row, 5);
      assert.equal(activatedConnections[0].col, 10);
      // Sin color específico, usa _getEffectivePinColor (default)
    });

    it('restaura conexión formato nuevo [row, col, pinType]', () => {
      const matrix = createTestMatrix();
      matrix._built = true;

      const mockBtn = {
        disabled: false,
        classList: {
          contains: () => false,
          add: () => {},
          remove: () => {}
        }
      };
      matrix.table.querySelector = () => mockBtn;
      matrix.table.querySelectorAll = () => [];
      
      let savedColor = null;
      matrix.onToggle = (row, col, active, btn, color) => {
        if (active) savedColor = color;
        return true;
      };

      matrix.deserialize({ connections: [[5, 10, 'GREEN']] });

      // El color debe estar guardado en _pinColors
      assert.equal(matrix._pinColors.get('5:10'), 'GREEN');
      assert.equal(savedColor, 'GREEN');
    });

    it('ignora pines disabled', () => {
      const matrix = createTestMatrix();
      matrix._built = true;

      const mockBtn = {
        disabled: true,
        classList: { contains: () => false }
      };
      matrix.table.querySelector = () => mockBtn;
      matrix.table.querySelectorAll = () => [];
      
      let toggleCalled = false;
      matrix.onToggle = () => { toggleCalled = true; return true; };

      matrix.deserialize({ connections: [[5, 10]] });

      assert.equal(toggleCalled, false);
    });

    it('ignora pines hidden', () => {
      const matrix = createTestMatrix();
      matrix._built = true;

      const mockBtn = {
        disabled: false,
        classList: {
          contains: (cls) => cls === 'is-hidden-pin'
        }
      };
      matrix.table.querySelector = () => mockBtn;
      matrix.table.querySelectorAll = () => [];
      
      let toggleCalled = false;
      matrix.onToggle = () => { toggleCalled = true; return true; };

      matrix.deserialize({ connections: [[5, 10]] });

      assert.equal(toggleCalled, false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// clearAll
// ═══════════════════════════════════════════════════════════════════════════

describe('LargeMatrix.clearAll', () => {
  it('limpia _pinColors', () => {
    const matrix = createTestMatrix();
    matrix._built = true;
    matrix._pinColors.set('5:10', 'GREEN');
    matrix._pinColors.set('15:20', 'RED');

    matrix.clearAll();

    assert.equal(matrix._pinColors.size, 0);
  });

  it('no falla si no hay tabla', () => {
    const matrix = new LargeMatrix(null);
    assert.doesNotThrow(() => matrix.clearAll());
  });

  it('no falla si no está construida', () => {
    const matrix = createTestMatrix();
    matrix._built = false;
    assert.doesNotThrow(() => matrix.clearAll());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// _applyPinColorClass / _removePinColorClasses
// ═══════════════════════════════════════════════════════════════════════════

describe('LargeMatrix clases de color', () => {
  describe('_removePinColorClasses', () => {
    it('elimina todas las clases de color', () => {
      const matrix = createTestMatrix();
      const removed = [];
      const mockBtn = {
        classList: {
          remove: (...classes) => removed.push(...classes)
        }
      };

      matrix._removePinColorClasses(mockBtn);

      // Colores estándar
      assert.ok(removed.includes('pin-white'));
      assert.ok(removed.includes('pin-grey'));
      assert.ok(removed.includes('pin-green'));
      assert.ok(removed.includes('pin-red'));
      // Colores especiales
      assert.ok(removed.includes('pin-blue'));
      assert.ok(removed.includes('pin-yellow'));
      assert.ok(removed.includes('pin-cyan'));
      assert.ok(removed.includes('pin-purple'));
    });
  });

  describe('_applyPinColorClass', () => {
    it('añade clase pin-{color} en minúsculas', () => {
      const matrix = createTestMatrix();
      let addedClass = null;
      const mockBtn = {
        classList: {
          remove: () => {},
          add: (cls) => { addedClass = cls; }
        }
      };

      matrix._applyPinColorClass(mockBtn, 'GREEN');

      assert.equal(addedClass, 'pin-green');
    });

    it('no añade clase si color es null', () => {
      const matrix = createTestMatrix();
      let addCalled = false;
      const mockBtn = {
        classList: {
          remove: () => {},
          add: () => { addCalled = true; }
        }
      };

      matrix._applyPinColorClass(mockBtn, null);

      assert.equal(addCalled, false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRACIÓN: Roundtrip serialize -> deserialize
// ═══════════════════════════════════════════════════════════════════════════

describe('Roundtrip serialize/deserialize', () => {
  it('preserva colores en el ciclo completo', () => {
    // Este test verifica que los colores se mantienen tras save/load
    const connections = [
      [0, 0, 'WHITE'],
      [5, 10, 'GREEN'],
      [20, 30, 'RED'],
      [40, 50] // Sin color (usará default)
    ];

    const matrix1 = createTestMatrix({ defaultPinColor: 'GREY' });
    matrix1._built = true;

    // Simular estado de serialize
    const mockBtns = connections.map(([row, col, color]) => {
      if (color) {
        matrix1._pinColors.set(`${row}:${col}`, color);
      }
      return { dataset: { row: String(row), col: String(col) } };
    });
    matrix1.table.querySelectorAll = () => mockBtns;

    const serialized = matrix1.serialize();

    // Crear nueva matriz y deserializar
    const matrix2 = createTestMatrix({ defaultPinColor: 'GREY' });
    matrix2._built = true;
    
    // Mock para deserialize
    const restoredColors = new Map();
    matrix2.table.querySelectorAll = () => [];
    matrix2.table.querySelector = (selector) => {
      return {
        disabled: false,
        classList: {
          contains: () => false,
          add: () => {},
          remove: () => {}
        }
      };
    };
    matrix2.onToggle = (row, col, active, btn, color) => {
      if (active) restoredColors.set(`${row}:${col}`, color);
      return true;
    };

    matrix2.deserialize(serialized);

    // Verificar que los colores se restauraron
    assert.equal(matrix2._pinColors.get('0:0'), 'WHITE');
    assert.equal(matrix2._pinColors.get('5:10'), 'GREEN');
    assert.equal(matrix2._pinColors.get('20:30'), 'RED');
    // 40:50 no tiene color específico guardado
    assert.equal(matrix2._pinColors.get('40:50'), undefined);
  });
});
