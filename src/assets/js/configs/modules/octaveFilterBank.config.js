// ═══════════════════════════════════════════════════════════════════════════
// OCTAVE FILTER BANK CONFIG — Synthi 100 Cuenca / Datanomics 1982
// ═══════════════════════════════════════════════════════════════════════════
//
// Banco de Filtros de Ocho Octavas (Eight-Octave Filter Bank).
// Placa PC-22 (D100-22C1), Rack 1.
//
// Manipulador de formantes para coloraciones características del sonido.
// NO está controlado por voltaje — sus parámetros son manuales.
//
// Arquitectura del hardware:
//   - 8 filtros paso-banda individuales en paralelo
//   - Frecuencias centrales a intervalos de una octava:
//     63, 125, 250, 500, 1000, 2000, 4000, 8000 Hz
//   - Tolerancia de afinación: ±10%
//   - Pendiente: 12 dB/octava (2.º orden)
//   - Nivel de entrada máximo: 8V p-p
//   - Ganancia de compensación: hasta 10 dB (±1.5 dB)
//   - Potenciómetros: 10K logarítmicos (nivel por banda)
//   - Op-amps: NE5534, LF355
//
// Comportamiento:
//   - Todos los mandos al máximo → señal prácticamente inalterada (+10 dB)
//   - Ajustes intermedios → característica de "filtro de peine" (comb-like)
//   - Acción esencialmente sustractiva
//   - Ligera resonancia en ajustes altos
//   - Con todos al máximo: respuesta 50 Hz – 12 kHz
//
// Matrices:
//   Panel 5 (audio)
//     Input:  columna 23
//     Output: fila 109
//
//   Panel 6 (control): sin conexiones
//
// Referencia: Manual Datanomics 1982, PC-22 Eight Octave Filter Bank

export default {
  schemaVersion: 1,
  id: 'panel2-octave-filter-bank',
  title: 'Octave Filter Bank',

  // Posiciones en matrices del Synthi 100
  matrix: {
    panel5: {
      input: { colSynth: 23 },
      output: { rowSynth: 109 }
    }
  },

  // Kinds para blueprints y routing
  sourceKind: 'octaveFilterBank',
  inputKind: 'octaveFilterBankInput',

  // Frecuencias centrales de cada banda (Hz)
  centerFrequencies: [63, 125, 250, 500, 1000, 2000, 4000, 8000],

  // Parámetros del DSP
  audio: {
    filterOrder: 2,             // 2.º orden → 12 dB/octava
    filterQ: 1.414,             // √2 — ancho de banda ≈ 1 octava a -3 dB
    makeupGainDb: 10,           // Ganancia de compensación máxima
    levelLogBase: 100           // Base logarítmica para curva de potenciómetro
  },

  // Tiempos de rampa (suavizado de parámetros)
  ramps: {
    bandLevel: 0.03
  },

  // Knobs (8 bandas, rango del dial 0-10)
  knobs: {
    bandLevel: {
      min: 0,
      max: 10,
      initial: 10,
      curve: 'log',
      pixelsForFullRange: 900
    }
  }
};
