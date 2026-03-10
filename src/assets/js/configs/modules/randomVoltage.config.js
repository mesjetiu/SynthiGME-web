// ═══════════════════════════════════════════════════════════════════════════
// RANDOM CONTROL VOLTAGE GENERATOR CONFIG
// ═══════════════════════════════════════════════════════════════════════════
//
// Configuración del generador de voltaje de control aleatorio del Synthi 100
// (modelo Cuenca/Datanomics 1982, placa PC-21).
//
// Genera tres salidas simultáneas y sincronizadas:
//   - Voltage 1 (V1): DC aleatorio ±2.5V, distribución uniforme
//   - Voltage 2 (V2): DC aleatorio ±2.5V, distribución uniforme (independiente de V1)
//   - Key Pulse: pulso de disparo de ~5ms, amplitud ajustable ±5V
//
// Reloj interno: 0.2 Hz – 20 Hz, con jitter temporal configurable.
// Entrada CV de Mean Rate: 0.55V/octava (solo voltaje interno, sin entrada de matriz).
//
// Referencia: Planos D100-21 C1 (circuito), D100-21 W1 (cableado)
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,
  
  id: 'panel3-random-cv',
  title: 'Random Control Voltage',
  
  // Filas de la matriz de control (Panel 6) — placa de control derecha
  matrixRow: {
    key: 89,
    voltage1: 90,
    voltage2: 91
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // PARÁMETROS DE AUDIO (worklet)
  // ─────────────────────────────────────────────────────────────────────────
  audio: {
    minFreq: 0.2,           // Hz — un evento cada 5 segundos
    maxFreq: 20,            // Hz — 50 ms por evento (zumbido bajo)
    keyPulseWidth: 0.005,   // 5 ms — suficiente para disparar envolventes
    maxVoltage: 2.5,        // ±2.5V por salida de voltaje (5V pico a pico)
    keyMaxVoltage: 5.0,     // ±5V para pulso key
    voltsPerOctave: 0.55    // Sensibilidad CV del Mean Rate
  },
  
  // Curva logarítmica para potenciómetros de nivel (10K LOG, como D100-21 W1)
  levelCurve: {
    type: 'log',
    logBase: 100
  },
  
  // Tiempos de rampa para suavizado de parámetros
  ramps: {
    level: 0.06,    // Rampa de nivel (60ms)
    mean: 0.05      // Rampa de mean rate (50ms)
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // KNOBS (rangos del dial, mapeados desde la escala del panel)
  // ─────────────────────────────────────────────────────────────────────────
  knobs: {
    mean: {
      min: -5,
      max: 5,
      initial: 0,
      curve: 'linear',
      scaleMin: -5,
      scaleMax: 5
    },
    variance: {
      min: -5,
      max: 5,
      initial: 0,
      curve: 'linear',
      scaleMin: -5,
      scaleMax: 5
    },
    voltage1: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'linear'
    },
    voltage2: {
      min: 0,
      max: 10,
      initial: 0,
      curve: 'linear'
    },
    key: {
      min: -5,
      max: 5,
      initial: 0,
      curve: 'linear',
      scaleMin: -5,
      scaleMax: 5
    }
  }
};
