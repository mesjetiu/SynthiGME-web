/**
 * Tests para el sistema de filtrado RC por pin de matriz.
 * 
 * Verifica que cada tipo de pin aplica el filtrado correcto según
 * su resistencia y la capacitancia parásita del bus de la matriz.
 * 
 * Referencia: Manual Datanomics 1982 - "con pines de 100k se produce
 * integración de transitorios rápidos"
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  PIN_RESISTANCES,
  PIN_CUTOFF_FREQUENCIES,
  MATRIX_BUS_CAPACITANCE,
  computePinCutoff,
  computeCombinedCutoff,
  MODULE_INHERENT_CUTOFF,
  createPinFilter,
  updatePinFilter
} from '../../src/assets/js/utils/voltageConstants.js';

// =============================================================================
// MOCK AUDIOCTX PARA TESTS SIN BROWSER
// =============================================================================

/**
 * Mock de BiquadFilterNode para tests en Node.js
 */
class MockBiquadFilter {
  constructor() {
    this.type = 'lowpass';
    this.frequency = {
      value: 350,
      setValueAtTime: function(val, time) { this.value = val; }
    };
    this.Q = {
      value: 1,
      setValueAtTime: function(val, time) { this.value = val; }
    };
    this.gain = {
      value: 0,
      setValueAtTime: function(val, time) { this.value = val; }
    };
  }
}

/**
 * Mock de AudioContext para tests
 */
const mockAudioContext = {
  createBiquadFilter() {
    return new MockBiquadFilter();
  }
};

// =============================================================================
// TESTS DE FRECUENCIAS DE CORTE POR PIN
// =============================================================================

describe('Pin RC Filtering System', () => {
  
  describe('PIN_CUTOFF_FREQUENCIES pre-calculated values', () => {
    
    it('WHITE (100kΩ) debe tener fc ≈ 15.9 kHz', () => {
      const fc = PIN_CUTOFF_FREQUENCIES.WHITE;
      // fc = 1 / (2π × 100k × 100pF) = 15915.49 Hz
      assert.ok(fc > 15900 && fc < 16000, `WHITE fc should be ~15.9kHz, got ${fc}`);
    });
    
    it('GREY (100kΩ) debe ser igual a WHITE', () => {
      // Mismo valor de resistencia, solo difiere en tolerancia
      assert.equal(PIN_CUTOFF_FREQUENCIES.GREY, PIN_CUTOFF_FREQUENCIES.WHITE);
    });
    
    it('GREEN (68kΩ) debe tener fc ≈ 23.4 kHz', () => {
      const fc = PIN_CUTOFF_FREQUENCIES.GREEN;
      // fc = 1 / (2π × 68k × 100pF) = 23404.9 Hz
      assert.ok(fc > 23000 && fc < 24000, `GREEN fc should be ~23.4kHz, got ${fc}`);
    });
    
    it('RED (2.7kΩ) debe tener fc ≈ 589 kHz (bypass efectivo)', () => {
      const fc = PIN_CUTOFF_FREQUENCIES.RED;
      // fc = 1 / (2π × 2.7k × 100pF) = 589463 Hz
      assert.ok(fc > 580000 && fc < 600000, `RED fc should be ~589kHz, got ${fc}`);
    });
    
    it('BLUE (10kΩ) debe tener fc ≈ 159 kHz', () => {
      const fc = PIN_CUTOFF_FREQUENCIES.BLUE;
      // fc = 1 / (2π × 10k × 100pF) = 159154.9 Hz
      assert.ok(fc > 158000 && fc < 160000, `BLUE fc should be ~159kHz, got ${fc}`);
    });
    
    it('YELLOW (22kΩ) debe tener fc ≈ 72 kHz', () => {
      const fc = PIN_CUTOFF_FREQUENCIES.YELLOW;
      // fc = 1 / (2π × 22k × 100pF) = 72343.1 Hz
      assert.ok(fc > 72000 && fc < 73000, `YELLOW fc should be ~72kHz, got ${fc}`);
    });
    
    it('CYAN (250kΩ) debe tener fc ≈ 6.4 kHz', () => {
      const fc = PIN_CUTOFF_FREQUENCIES.CYAN;
      // fc = 1 / (2π × 250k × 100pF) = 6366.2 Hz
      assert.ok(fc > 6300 && fc < 6500, `CYAN fc should be ~6.4kHz, got ${fc}`);
    });
    
    it('PURPLE (1MΩ) debe tener fc ≈ 1.6 kHz', () => {
      const fc = PIN_CUTOFF_FREQUENCIES.PURPLE;
      // fc = 1 / (2π × 1M × 100pF) = 1591.5 Hz
      assert.ok(fc > 1500 && fc < 1700, `PURPLE fc should be ~1.6kHz, got ${fc}`);
    });
    
    it('ORANGE no debe estar definido (resistencia 0)', () => {
      assert.equal(PIN_CUTOFF_FREQUENCIES.ORANGE, undefined);
    });
  });
  
  describe('computePinCutoff()', () => {
    
    it('Debe calcular correctamente para resistencia arbitraria', () => {
      // 50kΩ → fc = 1/(2π×50k×100pF) = 31831 Hz
      const fc = computePinCutoff(50000);
      assert.ok(fc > 31800 && fc < 31900, `50k should give ~31.8kHz, got ${fc}`);
    });
    
    it('Debe aceptar capacitancia personalizada', () => {
      // 100kΩ con 200pF → fc = 1/(2π×100k×200pF) = 7957.7 Hz
      const fc = computePinCutoff(100000, 200e-12);
      assert.ok(fc > 7900 && fc < 8000, `Should give ~8kHz with 200pF, got ${fc}`);
    });
    
    it('Debe retornar Infinity para resistencia 0 (cortocircuito)', () => {
      const fc = computePinCutoff(0);
      assert.equal(fc, Infinity);
    });
    
    it('Debe retornar Infinity para resistencia negativa', () => {
      const fc = computePinCutoff(-100);
      assert.equal(fc, Infinity);
    });
  });
  
  describe('computeCombinedCutoff()', () => {
    
    it('Pin WHITE domina sobre módulo (15.9kHz < 20kHz)', () => {
      const combined = computeCombinedCutoff(MODULE_INHERENT_CUTOFF, PIN_CUTOFF_FREQUENCIES.WHITE);
      assert.equal(combined, PIN_CUTOFF_FREQUENCIES.WHITE);
    });
    
    it('Módulo domina sobre pin RED (20kHz < 589kHz)', () => {
      const combined = computeCombinedCutoff(MODULE_INHERENT_CUTOFF, PIN_CUTOFF_FREQUENCIES.RED);
      assert.equal(combined, MODULE_INHERENT_CUTOFF);
    });
    
    it('Pin PURPLE domina fuertemente (1.6kHz << 20kHz)', () => {
      const combined = computeCombinedCutoff(MODULE_INHERENT_CUTOFF, PIN_CUTOFF_FREQUENCIES.PURPLE);
      assert.equal(combined, PIN_CUTOFF_FREQUENCIES.PURPLE);
    });
    
    it('Pin CYAN también domina (6.4kHz < 20kHz)', () => {
      const combined = computeCombinedCutoff(MODULE_INHERENT_CUTOFF, PIN_CUTOFF_FREQUENCIES.CYAN);
      assert.equal(combined, PIN_CUTOFF_FREQUENCIES.CYAN);
    });
  });
  
  describe('Ordenamiento de cutoffs por efecto de filtrado', () => {
    
    it('Los pines deben ordenarse: PURPLE < CYAN < WHITE/GREY < GREEN < YELLOW < BLUE < RED', () => {
      const cutoffs = PIN_CUTOFF_FREQUENCIES;
      
      // Mayor cutoff = menos filtrado = más "transparente"
      assert.ok(cutoffs.PURPLE < cutoffs.CYAN, 'PURPLE < CYAN');
      assert.ok(cutoffs.CYAN < cutoffs.WHITE, 'CYAN < WHITE');
      assert.ok(cutoffs.WHITE < cutoffs.GREEN, 'WHITE < GREEN');
      assert.ok(cutoffs.GREEN < cutoffs.YELLOW, 'GREEN < YELLOW');
      assert.ok(cutoffs.YELLOW < cutoffs.BLUE, 'YELLOW < BLUE');
      assert.ok(cutoffs.BLUE < cutoffs.RED, 'BLUE < RED');
    });
    
    it('Solo RED tiene cutoff por encima del Nyquist típico (22kHz)', () => {
      const nyquist = 22050; // 44.1kHz sample rate
      const cutoffs = PIN_CUTOFF_FREQUENCIES;
      
      // RED es el único que está muy por encima de Nyquist (bypass efectivo)
      assert.ok(cutoffs.RED > nyquist, 'RED should be above Nyquist');
      
      // BLUE también está por encima de Nyquist, pero menos extremo
      assert.ok(cutoffs.BLUE > nyquist, 'BLUE should be above Nyquist');
      
      // YELLOW también (72kHz > 22kHz)
      assert.ok(cutoffs.YELLOW > nyquist, 'YELLOW should be above Nyquist');
      
      // GREEN está justo en el límite (~23.4kHz)
      assert.ok(cutoffs.GREEN > nyquist, 'GREEN should be just above Nyquist');
      
      // WHITE, GREY, CYAN, PURPLE están por debajo (filtrado audible)
      assert.ok(cutoffs.WHITE < nyquist, 'WHITE should be below Nyquist');
      assert.ok(cutoffs.CYAN < nyquist, 'CYAN should be below Nyquist');
      assert.ok(cutoffs.PURPLE < nyquist, 'PURPLE should be below Nyquist');
    });
  });
  
  describe('Consistencia con PIN_RESISTANCES', () => {
    
    it('Todos los pines estándar deben tener cutoff pre-calculado', () => {
      const standardPins = ['WHITE', 'GREY', 'GREEN', 'RED'];
      for (const pin of standardPins) {
        assert.ok(PIN_CUTOFF_FREQUENCIES[pin] !== undefined, 
          `${pin} should have pre-calculated cutoff`);
        assert.ok(Number.isFinite(PIN_CUTOFF_FREQUENCIES[pin]),
          `${pin} cutoff should be finite number`);
      }
    });
    
    it('Todos los pines especiales deben tener cutoff pre-calculado', () => {
      const specialPins = ['BLUE', 'YELLOW', 'CYAN', 'PURPLE'];
      for (const pin of specialPins) {
        assert.ok(PIN_CUTOFF_FREQUENCIES[pin] !== undefined,
          `${pin} should have pre-calculated cutoff`);
        assert.ok(Number.isFinite(PIN_CUTOFF_FREQUENCIES[pin]),
          `${pin} cutoff should be finite number`);
      }
    });
    
    it('Los cutoffs pre-calculados deben coincidir con cálculo manual', () => {
      for (const [pinType, fc] of Object.entries(PIN_CUTOFF_FREQUENCIES)) {
        const resistance = PIN_RESISTANCES[pinType]?.value;
        if (resistance && resistance > 0) {
          const calculated = computePinCutoff(resistance);
          assert.equal(fc, calculated,
            `${pinType} pre-calculated (${fc}) should match computed (${calculated})`);
        }
      }
    });
  });
});

// =============================================================================
// TESTS DE INTEGRACIÓN CON FILTRO BIQUAD
// =============================================================================
// 
// Estos tests verifican la función helper que crea BiquadFilterNodes
// configurados para emular el filtro RC del pin.
// (Se implementarán cuando se agregue la función a voltageConstants.js)
// =============================================================================

describe('Pin Filter Factory (createPinFilter)', () => {
  
  it('Debe crear BiquadFilterNode con tipo lowpass', () => {
    const filter = createPinFilter(mockAudioContext, 'WHITE');
    assert.equal(filter.type, 'lowpass');
  });
  
  it('Debe configurar frequency.value según el tipo de pin', () => {
    const filterWhite = createPinFilter(mockAudioContext, 'WHITE');
    const filterCyan = createPinFilter(mockAudioContext, 'CYAN');
    const filterRed = createPinFilter(mockAudioContext, 'RED');
    
    assert.equal(filterWhite.frequency.value, PIN_CUTOFF_FREQUENCIES.WHITE);
    assert.equal(filterCyan.frequency.value, PIN_CUTOFF_FREQUENCIES.CYAN);
    assert.equal(filterRed.frequency.value, PIN_CUTOFF_FREQUENCIES.RED);
  });
  
  it('Debe usar Q=0.5 por defecto para emular respuesta de primer orden', () => {
    const filter = createPinFilter(mockAudioContext, 'WHITE');
    assert.equal(filter.Q.value, 0.5);
  });

  it('Debe aceptar filterQ como tercer parámetro (desde audioMatrix.config.js)', () => {
    // Q por defecto
    const filterDefault = createPinFilter(mockAudioContext, 'WHITE');
    assert.equal(filterDefault.Q.value, 0.5, 'Q por defecto debe ser 0.5');

    // Q custom bajo (más parecido a RC pasivo)
    const filterLowQ = createPinFilter(mockAudioContext, 'WHITE', 0.25);
    assert.equal(filterLowQ.Q.value, 0.25, 'Q custom 0.25 debe aplicarse');

    // Q Butterworth
    const filterButterworth = createPinFilter(mockAudioContext, 'WHITE', 0.707);
    assert.equal(filterButterworth.Q.value, 0.707, 'Q Butterworth debe aplicarse');
  });
  
  it('Pin RED debe configurar frecuencia muy alta (bypass efectivo)', () => {
    const filter = createPinFilter(mockAudioContext, 'RED');
    // RED ~589kHz, muy por encima del rango audible
    assert.ok(filter.frequency.value > 500000, 
      `RED filter should have very high cutoff, got ${filter.frequency.value}`);
  });
  });
  
  it('Debe manejar pinType desconocido con fallback a WHITE', () => {
    const filter = createPinFilter(mockAudioContext, 'INVALID_PIN');
    assert.equal(filter.frequency.value, PIN_CUTOFF_FREQUENCIES.WHITE);
  });
  
  it('Debe usar WHITE como default si no se especifica pinType', () => {
    const filter = createPinFilter(mockAudioContext);
    assert.equal(filter.frequency.value, PIN_CUTOFF_FREQUENCIES.WHITE);
  });
});

describe('updatePinFilter()', () => {
  
  it('Debe actualizar frequency.value al nuevo tipo de pin', () => {
    const filter = createPinFilter(mockAudioContext, 'WHITE');
    assert.equal(filter.frequency.value, PIN_CUTOFF_FREQUENCIES.WHITE);
    
    updatePinFilter(filter, 'CYAN');
    assert.equal(filter.frequency.value, PIN_CUTOFF_FREQUENCIES.CYAN);
  });
  
  it('Debe usar setValueAtTime si se proporciona time', () => {
    const filter = createPinFilter(mockAudioContext, 'WHITE');
    let setValueCalled = false;
    filter.frequency.setValueAtTime = (val, time) => {
      setValueCalled = true;
      filter.frequency.value = val;
    };
    
    updatePinFilter(filter, 'PURPLE', 0.5);
    assert.ok(setValueCalled, 'setValueAtTime should be called');
    assert.equal(filter.frequency.value, PIN_CUTOFF_FREQUENCIES.PURPLE);
  });
  
  it('Debe manejar pinType desconocido con fallback a WHITE', () => {
    const filter = createPinFilter(mockAudioContext, 'RED');
    updatePinFilter(filter, 'NONEXISTENT');
    assert.equal(filter.frequency.value, PIN_CUTOFF_FREQUENCIES.WHITE);
  });
});
