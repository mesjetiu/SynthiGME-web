// ═══════════════════════════════════════════════════════════════════════════
// MODULE CONFIGS INDEX
// ═══════════════════════════════════════════════════════════════════════════
//
// Índice centralizado de todas las configuraciones de módulos del Synthi 100.
//
// Uso:
//   import { oscillatorConfig, noiseConfig } from './configs/index.js';
//   // o
//   import configs from './configs/index.js';
//   configs.oscillator.defaults.knobs.frequency
//
// ═══════════════════════════════════════════════════════════════════════════

// Módulos de generación de sonido
export { default as oscillatorConfig } from './modules/oscillator.config.js';
export { default as noiseConfig } from './modules/noise.config.js';
export { default as randomVoltageConfig } from './modules/randomVoltage.config.js';
export { default as filterConfig } from './modules/filter.config.js';
export { default as reverberationConfig } from './modules/reverberation.config.js';
export { default as ringModulatorConfig } from './modules/ringModulator.config.js';
export { default as envelopeShaperConfig } from './modules/envelopeShaper.config.js';

// Teclados
export { default as keyboardConfig } from './modules/keyboard.config.js';

// Módulos de control manual
export { default as joystickConfig } from './modules/joystick.config.js';

// Módulos de entrada/salida
export { default as inputAmplifierConfig } from './modules/inputAmplifier.config.js';
export { default as outputChannelConfig } from './modules/outputChannel.config.js';

// Módulos de visualización
export { default as oscilloscopeConfig } from './modules/oscilloscope.config.js';

// Matrices de routing
export { default as audioMatrixConfig } from './modules/audioMatrix.config.js';
export { default as controlMatrixConfig } from './modules/controlMatrix.config.js';

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN AGRUPADA (para acceso por nombre de módulo)
// ─────────────────────────────────────────────────────────────────────────────

import oscillatorConfig from './modules/oscillator.config.js';
import noiseConfig from './modules/noise.config.js';
import randomVoltageConfig from './modules/randomVoltage.config.js';
import filterConfig from './modules/filter.config.js';
import keyboardConfig from './modules/keyboard.config.js';
import joystickConfig from './modules/joystick.config.js';
import inputAmplifierConfig from './modules/inputAmplifier.config.js';
import outputChannelConfig from './modules/outputChannel.config.js';
import oscilloscopeConfig from './modules/oscilloscope.config.js';
import audioMatrixConfig from './modules/audioMatrix.config.js';
import controlMatrixConfig from './modules/controlMatrix.config.js';
import reverberationConfig from './modules/reverberation.config.js';
import ringModulatorConfig from './modules/ringModulator.config.js';
import envelopeShaperConfig from './modules/envelopeShaper.config.js';

export default {
  oscillator: oscillatorConfig,
  noise: noiseConfig,
  randomVoltage: randomVoltageConfig,
  filter: filterConfig,
  keyboard: keyboardConfig,
  inputAmplifier: inputAmplifierConfig,
  outputChannel: outputChannelConfig,
  oscilloscope: oscilloscopeConfig,
  audioMatrix: audioMatrixConfig,
  controlMatrix: controlMatrixConfig,
  joystick: joystickConfig,
  reverberation: reverberationConfig,
  ringModulator: ringModulatorConfig,
  envelopeShaper: envelopeShaperConfig
};
