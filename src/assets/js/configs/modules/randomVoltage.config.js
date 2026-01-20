// ═══════════════════════════════════════════════════════════════════════════
// RANDOM CONTROL VOLTAGE GENERATOR CONFIG
// ═══════════════════════════════════════════════════════════════════════════
//
// Configuración del generador de voltaje aleatorio del Synthi 100.
//
// Nota: Este módulo aún no tiene implementación de audio.
// La UI está lista, pero la lógica de generación de CV aleatorio
// se implementará en una fase posterior.
//
// @see TODO.md - "Random Voltage: definir filas de matriz"
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,
  
  id: 'panel3-random-cv',
  title: 'Random Voltage',
  
  // matrixRow pendiente: { voltage1: ??, voltage2: ?? },
  
  knobs: {
    mean: {
      min: -1,
      max: 1,
      initial: 0,
      curve: 'linear'
    },
    variance: {
      min: 0,
      max: 1,
      initial: 0.5,
      curve: 'linear'
    },
    voltage1: {
      min: 0,
      max: 1,
      initial: 0,
      curve: 'linear'
    },
    voltage2: {
      min: 0,
      max: 1,
      initial: 0,
      curve: 'linear'
    },
    key: {
      min: 0,
      max: 1,
      initial: 0,
      curve: 'linear'
    }
  }
};
