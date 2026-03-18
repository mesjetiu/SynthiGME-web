/**
 * panelRouting.js
 *
 * Funciones de ruteo extraídas de app.js para los paneles 5 (Audio Matrix)
 * y 6 (Control Matrix). Gestionan la activación/desactivación de pins,
 * la creación de nodos de audio y el cálculo de ganancias.
 *
 * Cada función recibe `app` como último parámetro en lugar de usar `this`.
 */

import { applyOscStateImmediate, getOrCreateOscState } from './core/oscillatorState.js';
import { safeDisconnect, attachProcessorErrorHandler } from './utils/audio.js';
import { createLogger } from './utils/logger.js';
import { VOLTAGE_DEFAULTS, calculateMatrixPinGain, STANDARD_FEEDBACK_RESISTANCE, createPinFilter, PIN_CUTOFF_FREQUENCIES, DIGITAL_TO_VOLTAGE, KNOB_POT_MAX_VOLTAGE } from './utils/voltageConstants.js';
import { dialToFrequency } from './state/conversions.js';
import { compilePanelBlueprintMappings } from './core/blueprintMapper.js';
import {
  oscillatorConfig,
  audioMatrixConfig,
  controlMatrixConfig
} from './configs/index.js';
import panel5AudioBlueprint from './panelBlueprints/panel5.audio.blueprint.js';
import panel6ControlBlueprint from './panelBlueprints/panel6.control.blueprint.js';
import { STORAGE_KEYS, isMobileDevice } from './utils/constants.js';
import { oscillatorOSCSync } from './osc/oscOscillatorSync.js';
import { matrixOSCSync } from './osc/oscMatrixSync.js';

const log = createLogger('App');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE COORDENADAS (originalmente métodos privados en app.js)
// ─────────────────────────────────────────────────────────────────────────────

function _physicalRowToSynthRow(rowIndex) {
  const mappings = compilePanelBlueprintMappings(panel5AudioBlueprint);
  return mappings.rowBase + rowIndex;
}

function _physicalColToSynthCol(colIndex) {
  const mappings = compilePanelBlueprintMappings(panel5AudioBlueprint);
  return mappings.colBase + colIndex;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Asegura que existan los nodos de audio para un oscilador de panel dado.
 * Crea el oscilador multi-waveform y la cadena de CV si aún no existen.
 *
 * @param {number} panelIndex
 * @param {number} oscIndex
 * @param {object} app - Instancia de la aplicación
 * @returns {object|null} Entrada de nodos del oscilador, o null si no está listo
 */
export function ensurePanelNodes(panelIndex, oscIndex, app) {
  // Panel 1 y 4: Solo visual, sin nodos de audio (módulos dummy)
  if (panelIndex === 1 || panelIndex === 4) return null;

  // Iniciar audio de forma síncrona pero no esperar al worklet
  // Si el worklet no está listo, registramos para reintentar después
  app.engine.start({
    latencyHint: localStorage.getItem(STORAGE_KEYS.LATENCY_MODE) ||
                 (isMobileDevice() ? 'playback' : 'interactive')
  });

  const ctx = app.engine.audioCtx;
  if (!ctx) return null;

  const panelAudio = app._getPanelAudio(panelIndex);
  panelAudio.nodes = panelAudio.nodes || [];
  panelAudio.state = panelAudio.state || [];

  let entry = panelAudio.nodes[oscIndex];
  // Verificar si ya existe con el nuevo formato (multiOsc)
  if (entry && entry.multiOsc && entry.sineSawOut && entry.triPulseOut && entry.freqCVInput) {
    // ─────────────────────────────────────────────────────────────────────
    // VERIFICAR CADENA CV: Si cvThermalSlew debería existir pero no existe,
    // intentar crearla ahora que el worklet puede estar listo
    // ─────────────────────────────────────────────────────────────────────
    if (!entry.cvThermalSlew && app.engine.workletReady) {
      const oscConfig = app._getOscConfig(oscIndex);
      const thermalSlewConfig = oscConfig?.thermalSlew ?? oscillatorConfig.defaults?.thermalSlew ?? {};

      if (thermalSlewConfig.enabled !== false) {
        log.info(`[FM] Osc ${oscIndex}: cvThermalSlew missing, creating now...`);
        try {
          const cvThermalSlew = new AudioWorkletNode(ctx, 'cv-thermal-slew', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            channelCount: 1,
            channelCountMode: 'explicit',
            processorOptions: {
              riseTimeConstant: thermalSlewConfig.riseTimeConstant ?? 0.15,
              fallTimeConstant: thermalSlewConfig.fallTimeConstant ?? 0.5
            }
          });
          attachProcessorErrorHandler(cvThermalSlew, `cv-thermal-slew[osc ${oscIndex} retry]`);

          const thresholdParam = cvThermalSlew.parameters?.get('threshold');
          if (thresholdParam) {
            thresholdParam.value = thermalSlewConfig.threshold ?? 0.5;
          }

          // Reconectar cadena: freqCVInput → cvThermalSlew → [cvSoftClip] → detune
          const detuneParam = entry.multiOsc.parameters?.get('detune');
          if (detuneParam) {
            // Desconectar freqCVInput del destino actual
            try { entry.freqCVInput.disconnect(); } catch(e) {}

            // Conectar nueva cadena
            entry.freqCVInput.connect(cvThermalSlew);

            let lastNode = cvThermalSlew;
            if (entry.cvSoftClip) {
              lastNode.connect(entry.cvSoftClip);
              lastNode = entry.cvSoftClip;
            }
            lastNode.connect(detuneParam);

            entry.cvThermalSlew = cvThermalSlew;
            log.info(`[FM] Osc ${oscIndex}: cvThermalSlew CREATED and chain reconnected ✓`);
          }
        } catch (err) {
          log.warn(`[FM] Failed to create cvThermalSlew for osc ${oscIndex}:`, err);
        }
      }
    }
    return entry;
  }

  const state = getOrCreateOscState(panelAudio, oscIndex);
  const useWorklet = app.engine.workletReady;

  // ─────────────────────────────────────────────────────────────────────────
  // OSCILADOR MULTI-WAVEFORM CON FASE MAESTRA UNIFICADA
  // ─────────────────────────────────────────────────────────────────────────
  // Todas las formas de onda (sine, saw, tri, pulse) se generan desde una
  // única fase maestra en el worklet. Esto garantiza coherencia perfecta
  // entre formas de onda y facilita el hard sync.
  // ─────────────────────────────────────────────────────────────────────────

  if (!useWorklet) {
    // Worklet no está listo aún - programar reintento cuando lo esté
    log.warn(`MultiOscillator requires worklet support - scheduling retry for osc ${oscIndex}`);
    app._scheduleWorkletRetry(panelIndex, oscIndex);
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Obtener configuración de sineShape del oscillator.config.js
  // ─────────────────────────────────────────────────────────────────────────
  const oscConfig = app._getOscConfig(oscIndex);
  const sineShape = oscConfig?.sineShape ?? oscillatorConfig.defaults?.sineShape ?? {};
  const audioConfig = oscConfig?.audio ?? oscillatorConfig.defaults?.audio ?? {};
  // Suavizado inherente del módulo (emula slew rate del CA3140)
  const moduleSlew = oscConfig?.moduleSlew ?? oscillatorConfig.defaults?.moduleSlew ?? {};

  const multiOsc = app.engine.createMultiOscillator({
    frequency: state.freq || 10,
    pulseWidth: state.pulseWidth || 0.5,
    symmetry: state.sineSymmetry || 0.5,
    sineLevel: state.oscLevel || 0,
    sawLevel: state.sawLevel || 0,
    triLevel: state.triLevel || 0,
    pulseLevel: state.pulseLevel || 0,
    // Parámetros de calibración del algoritmo híbrido de seno
    sineShapeAttenuation: sineShape.attenuation ?? 1.0,
    sinePurity: sineShape.purity ?? 0.7,
    saturationK: sineShape.saturationK ?? 1.55,
    maxOffset: sineShape.maxOffset ?? 0.85,
    // Tiempo de suavizado para cambios de parámetros
    smoothingTime: audioConfig.smoothingTime ?? 0.01,
    // Suavizado inherente del módulo (oscillator.config.js moduleSlew)
    moduleSlewCutoff: moduleSlew.cutoffHz ?? 20000,
    moduleSlewEnabled: moduleSlew.enabled ?? true
  });

  if (!multiOsc) return null;

  // Output 0: sine + saw
  const sineSawOut = ctx.createGain();
  sineSawOut.gain.value = 1.0;
  multiOsc.connect(sineSawOut, 0);

  // Output 1: tri + pulse
  const triPulseOut = ctx.createGain();
  triPulseOut.gain.value = 1.0;
  multiOsc.connect(triPulseOut, 1);

  const moduleOut = sineSawOut;
  if (panelIndex !== 3) {
    const bus1 = app.engine.getOutputBusNode(0);
    if (bus1) moduleOut.connect(bus1);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NODO DE ENTRADA CV PARA MODULACIÓN DE FRECUENCIA (Panel 6)
  // ─────────────────────────────────────────────────────────────────────────
  const DIGITAL_TO_VOLTAGE_LOCAL = 4.0; // Coincide con voltageConstants.js
  const CENTS_PER_OCTAVE = 1200;
  const centsGain = CENTS_PER_OCTAVE * DIGITAL_TO_VOLTAGE_LOCAL; // 1200 * 4 = 4800 cents por unidad digital

  const freqCVInput = ctx.createGain();
  freqCVInput.gain.value = centsGain;

  // ─────────────────────────────────────────────────────────────────────────
  // THERMAL SLEW DE CV (Inercia térmica del transistor)
  // ─────────────────────────────────────────────────────────────────────────
  const thermalSlewConfig = oscConfig?.thermalSlew ?? oscillatorConfig.defaults?.thermalSlew ?? {};
  let cvThermalSlew = null;

  log.info(`[FM] Osc ${oscIndex}: thermalSlew.enabled=${thermalSlewConfig.enabled}, workletReady=${app.engine.workletReady}`);

  if (thermalSlewConfig.enabled !== false && app.engine.workletReady) {
    try {
      cvThermalSlew = new AudioWorkletNode(ctx, 'cv-thermal-slew', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
        processorOptions: {
          riseTimeConstant: thermalSlewConfig.riseTimeConstant ?? 0.15,
          fallTimeConstant: thermalSlewConfig.fallTimeConstant ?? 0.5
        }
      });
      attachProcessorErrorHandler(cvThermalSlew, `cv-thermal-slew[osc ${oscIndex}]`);

      const thresholdParam = cvThermalSlew.parameters?.get('threshold');
      if (thresholdParam) {
        thresholdParam.value = thermalSlewConfig.threshold ?? 0.5;
      }
      log.info(`[FM] Osc ${oscIndex}: cvThermalSlew CREATED ✓`);
    } catch (err) {
      log.warn(` Failed to create CVThermalSlew for osc ${oscIndex}:`, err);
      cvThermalSlew = null;
    }
  } else {
    log.info(`[FM] Osc ${oscIndex}: cvThermalSlew SKIPPED (disabled or worklet not ready)`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SOFT CLIPPING DE CV (AudioWorklet - emulación Datanomics/Cuenca)
  // ─────────────────────────────────────────────────────────────────────────
  const softClipConfig = oscConfig?.softClip ?? oscillatorConfig.defaults?.softClip ?? {};
  const softClipCoefficient = softClipConfig.coefficient ?? 0.0001;
  const softClipEnabled = softClipConfig.enabled !== false;

  let cvSoftClip = null;
  if (softClipEnabled && VOLTAGE_DEFAULTS.softClipEnabled && app.engine.workletReady) {
    try {
      cvSoftClip = new AudioWorkletNode(ctx, 'cv-soft-clip', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
        processorOptions: {
          coefficient: softClipCoefficient
        }
      });
      attachProcessorErrorHandler(cvSoftClip, `cv-soft-clip[osc ${oscIndex}]`);
      log.info(`[FM] Osc ${oscIndex}: cvSoftClip CREATED (coefficient=${softClipCoefficient})`);
    } catch (err) {
      log.warn(`[FM] Osc ${oscIndex}: Failed to create cvSoftClip:`, err);
      cvSoftClip = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONSTRUIR CADENA DE CV COMPLETA
  // ─────────────────────────────────────────────────────────────────────────
  // CADENA CV: freqCVInput → [cvThermalSlew] → [cvSoftClip] → detune
  // ─────────────────────────────────────────────────────────────────────────
  const detuneParam = multiOsc.parameters?.get('detune');

  // Nodo de entrada para la cadena CV (declarado fuera del if para poder referenciarlo en entry)
  let cvChainInput = null;

  if (detuneParam) {
    // Crear nodo de entrada para la cadena CV (antes de thermal/softclip)
    cvChainInput = ctx.createGain();
    cvChainInput.gain.value = 1.0; // Ganancia unitaria, solo punto de conexión

    let lastNode = cvChainInput;

    if (cvThermalSlew) {
      log.info(`[FM] Osc ${oscIndex}: Connecting cvChainInput → cvThermalSlew`);
      lastNode.connect(cvThermalSlew);
      lastNode = cvThermalSlew;
    }

    if (cvSoftClip) {
      log.info(`[FM] Osc ${oscIndex}: Connecting → cvSoftClip`);
      lastNode.connect(cvSoftClip);
      lastNode = cvSoftClip;
    }

    // freqCVInput aplica la ganancia de conversión a cents (×4800)
    log.info(`[FM] Osc ${oscIndex}: Connecting → freqCVInput (×${centsGain} cents)`);
    lastNode.connect(freqCVInput);

    // Finalmente conectar al parámetro detune
    log.info(`[FM] Osc ${oscIndex}: Connecting → detune`);
    freqCVInput.connect(detuneParam);
    log.info(`[FM] Osc ${oscIndex}: CV chain complete ✓`);
  } else {
    log.error(`[FM] Osc ${oscIndex}: DETUNE PARAM IS NULL - FM WILL NOT WORK!`);
  }

  // Marcar que la cadena CV está conectada
  const cvChainConnected = !!detuneParam;

  // Crear referencias de compatibilidad para código existente
  entry = {
    // Nuevo: oscilador unificado
    multiOsc,
    sineSawOut,
    triPulseOut,
    moduleOut,
    freqCVInput,
    _cvChainInput: cvChainInput, // Entrada de la cadena CV (antes de thermal/softclip)
    cvThermalSlew,  // Referencia al AudioWorkletNode para debug/ajustes
    cvSoftClip,  // Referencia al AudioWorkletNode para debug/ajustes
    _freqInitialized: true,
    _useWorklet: true,
    _isMultiOsc: true,
    _cvChainConnected: cvChainConnected,  // Flag para saber si freqCVInput → detune está conectado

    // Compatibilidad: aliases para código que espera la estructura antigua
    osc: multiOsc,
    gain: null,
    sawOsc: null,
    sawGain: null,
    triOsc: null,
    triGain: null,
    pulseOsc: null,
    pulseGain: null
  };

  // ─────────────────────────────────────────────────────────────────────────
  // DORMANCY SYSTEM
  // ─────────────────────────────────────────────────────────────────────────
  entry._isDormant = false;
  entry.setDormant = (dormant) => {
    if (entry._isDormant === dormant) return;
    entry._isDormant = dormant;

    // Enviar mensaje al worklet para early exit real (ahorra CPU)
    try {
      multiOsc.port.postMessage({ type: 'setDormant', dormant });
      console.log(`[Dormancy] Oscillator ${oscIndex} on panel ${panelIndex}: ${dormant ? 'DORMANT' : 'ACTIVE'}`);
    } catch (e) {
      console.warn('[Dormancy] Failed to send message to worklet:', e);
    }

    const rampTime = 0.01;

    if (dormant) {
      // DORMANT: Silenciar todos los niveles en el worklet
      try {
        multiOsc.setSineLevel(0, rampTime);
        multiOsc.setSawLevel(0, rampTime);
        multiOsc.setTriLevel(0, rampTime);
        multiOsc.setPulseLevel(0, rampTime);
      } catch { /* Ignorar errores */ }
    } else {
      // ACTIVE: Restaurar niveles desde el estado
      const oscState = panelAudio.state?.[oscIndex];
      if (oscState) {
        try {
          if (Number.isFinite(oscState.oscLevel)) multiOsc.setSineLevel(oscState.oscLevel, rampTime);
          if (Number.isFinite(oscState.sawLevel)) multiOsc.setSawLevel(oscState.sawLevel, rampTime);
          if (Number.isFinite(oscState.triLevel)) multiOsc.setTriLevel(oscState.triLevel, rampTime);
          if (Number.isFinite(oscState.pulseLevel)) multiOsc.setPulseLevel(oscState.pulseLevel, rampTime);
        } catch { /* Ignorar errores */ }
      }
    }
  };

  panelAudio.nodes[oscIndex] = entry;
  panelAudio.sources = panelAudio.sources || [];
  panelAudio.sources[oscIndex] = entry;
  return entry;
}

/**
 * Devuelve las opciones de knob para el oscilador de un panel dado.
 *
 * @param {number} panelIndex
 * @param {number} oscIndex
 * @param {object} app - Instancia de la aplicación
 * @returns {Array} Array de opciones de knob
 */
export function getPanelKnobOptions(panelIndex, oscIndex, app) {
  const config = panelIndex === 3 ? app._getOscConfig(oscIndex) : oscillatorConfig.defaults;
  const knobsConfig = config?.knobs || {};
  const audioConfig = config?.audio || {};

  // ─────────────────────────────────────────────────────────────────────
  // VOLTAJE PARA TOOLTIPS: Usar escala del sistema CV, NO outputLevels
  // ─────────────────────────────────────────────────────────────────────
  const FULL_SCALE_VPP = DIGITAL_TO_VOLTAGE * 2; // 8.0V p-p

  const knobOptions = [];

  // Helpers para verificar preferencias de tooltips (se leen en cada llamada)
  const showVoltage = () => localStorage.getItem(STORAGE_KEYS.TOOLTIP_SHOW_VOLTAGE) !== 'false';
  const showAudio = () => localStorage.getItem(STORAGE_KEYS.TOOLTIP_SHOW_AUDIO_VALUES) !== 'false';

  // Helper para convertir ganancia a dB
  const gainToDb = (gain) => {
    if (gain <= 0) return '-∞ dB';
    return `${(20 * Math.log10(gain)).toFixed(1)} dB`;
  };

  // Helper para crear tooltips de levels
  // Muestra: Vp-p (voltaje), ganancia y dB
  const getLevelTooltipInfo = (maxVpp) => (value, scaleValue) => {
    const parts = [];
    if (showVoltage()) {
      const vpp = (value * maxVpp).toFixed(2);
      parts.push(`${vpp} Vp-p`);
    }
    if (showAudio()) {
      parts.push(`×${value.toFixed(2)}`);
      parts.push(gainToDb(value));
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  };

  const pulseLevelCfg = knobsConfig.pulseLevel || {};
  const pulseVpp = FULL_SCALE_VPP;
  knobOptions[0] = {
    min: pulseLevelCfg.min ?? 0,
    max: pulseLevelCfg.max ?? 1,
    initial: pulseLevelCfg.initial ?? 0,
    pixelsForFullRange: pulseLevelCfg.pixelsForFullRange ?? 900,
    onChange: value => {
      app._updatePanelPulseVolume(panelIndex, oscIndex, value);
      if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
        oscillatorOSCSync.sendKnobChange(oscIndex, 0, value);
      }
    },
    getTooltipInfo: getLevelTooltipInfo(pulseVpp)
  };

  const pulseWidthCfg = knobsConfig.pulseWidth || {};
  knobOptions[1] = {
    min: pulseWidthCfg.min ?? 0,
    max: pulseWidthCfg.max ?? 1,
    initial: pulseWidthCfg.initial ?? 0.5,
    pixelsForFullRange: pulseWidthCfg.pixelsForFullRange ?? 900,
    angleOffset: -150,
    onChange: value => {
      app._updatePanelPulseWidth(panelIndex, oscIndex, value);
      if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
        oscillatorOSCSync.sendKnobChange(oscIndex, 1, value);
      }
    },
    getTooltipInfo: (value) => {
      const parts = [];
      // Voltaje del potenciómetro (0-10V proporcional a la posición del dial)
      if (showVoltage()) {
        parts.push((value * KNOB_POT_MAX_VOLTAGE).toFixed(2) + ' V');
      }
      // Ciclo de trabajo (duty cycle)
      if (showAudio()) {
        let dutyStr = `Duty: ${Math.round(value * 100)}%`;
        const hasPWMCV = app._hasOscillatorPWMCV(oscIndex);
        if (hasPWMCV) dutyStr += ' + CV';
        parts.push(dutyStr);
      }
      return parts.length > 0 ? parts.join(' · ') : null;
    }
  };

  const sineLevelCfg = knobsConfig.sineLevel || {};
  const sineVpp = FULL_SCALE_VPP;
  knobOptions[2] = {
    min: sineLevelCfg.min ?? 0,
    max: sineLevelCfg.max ?? 1,
    initial: sineLevelCfg.initial ?? 0,
    pixelsForFullRange: sineLevelCfg.pixelsForFullRange ?? 900,
    onChange: value => {
      app._updatePanelOscVolume(panelIndex, oscIndex, value);
      if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
        oscillatorOSCSync.sendKnobChange(oscIndex, 2, value);
      }
    },
    getTooltipInfo: getLevelTooltipInfo(sineVpp)
  };

  const sineSymmetryCfg = knobsConfig.sineSymmetry || {};
  knobOptions[3] = {
    min: sineSymmetryCfg.min ?? 0,
    max: sineSymmetryCfg.max ?? 1,
    initial: sineSymmetryCfg.initial ?? 0.5,
    pixelsForFullRange: sineSymmetryCfg.pixelsForFullRange ?? 900,
    angleOffset: -150,
    onChange: value => {
      app._updatePanelSineSymmetry(panelIndex, oscIndex, value);
      if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
        oscillatorOSCSync.sendKnobChange(oscIndex, 3, value);
      }
    },
    getTooltipInfo: (value) => {
      if (!showAudio()) return null;
      const offset = Math.round((value - 0.5) * 200);
      return offset === 0 ? 'Puro' : `Offset: ${offset > 0 ? '+' : ''}${offset}%`;
    }
  };

  const triangleLevelCfg = knobsConfig.triangleLevel || {};
  const triangleVpp = FULL_SCALE_VPP;
  knobOptions[4] = {
    min: triangleLevelCfg.min ?? 0,
    max: triangleLevelCfg.max ?? 1,
    initial: triangleLevelCfg.initial ?? 0,
    pixelsForFullRange: triangleLevelCfg.pixelsForFullRange ?? 900,
    onChange: value => {
      app._updatePanelTriVolume(panelIndex, oscIndex, value);
      if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
        oscillatorOSCSync.sendKnobChange(oscIndex, 4, value);
      }
    },
    getTooltipInfo: getLevelTooltipInfo(triangleVpp)
  };

  const sawtoothLevelCfg = knobsConfig.sawtoothLevel || {};
  const sawtoothVpp = FULL_SCALE_VPP;
  knobOptions[5] = {
    min: sawtoothLevelCfg.min ?? 0,
    max: sawtoothLevelCfg.max ?? 1,
    initial: sawtoothLevelCfg.initial ?? 0,
    pixelsForFullRange: sawtoothLevelCfg.pixelsForFullRange ?? 900,
    onChange: value => {
      app._updatePanelSawVolume(panelIndex, oscIndex, value);
      if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
        oscillatorOSCSync.sendKnobChange(oscIndex, 5, value);
      }
    },
    getTooltipInfo: getLevelTooltipInfo(sawtoothVpp)
  };

  const frequencyCfg = knobsConfig.frequency || {};
  const trackingConfig = config?.tracking || {};

  // Función para generar info del tooltip de frecuencia
  // Muestra: voltaje del dial y frecuencia real calculada
  const getFreqTooltipInfo = (value, scaleValue) => {
    const parts = [];

    // Voltaje del potenciómetro (si está habilitado)
    if (showVoltage()) {
      parts.push(value.toFixed(3) + ' V');
    }

    // Frecuencia real (si está habilitado)
    if (showAudio()) {
      const oscId = `panel${panelIndex}-osc-${oscIndex + 1}`;
      const oscUI = app._oscillatorUIs?.[oscId];
      const isRangeLow = oscUI?.rangeState === 'lo';

      const freq = dialToFrequency(value, {
        rangeLow: isRangeLow,
        trackingConfig: {
          alpha: trackingConfig.alpha ?? 0.01,
          linearHalfRange: trackingConfig.linearHalfRange ?? 2.5
        }
      });

      let freqStr;
      if (freq >= 1000) {
        freqStr = (freq / 1000).toFixed(2) + ' kHz';
      } else {
        freqStr = freq.toFixed(2) + ' Hz';
      }

      // Detectar CV conectado
      const hasFreqCV = app._hasOscillatorFreqCV(oscIndex);
      if (hasFreqCV) {
        freqStr += ' + CV';
      }

      parts.push(freqStr);
    }

    return parts.length > 0 ? parts.join(' · ') : null;
  };

  knobOptions[6] = {
    min: frequencyCfg.min ?? 0,
    max: frequencyCfg.max ?? 10,
    initial: frequencyCfg.initial ?? 5,
    pixelsForFullRange: frequencyCfg.pixelsForFullRange ?? 10000,
    scaleDecimals: frequencyCfg.scaleDecimals ?? 3,
    onChange: value => {
      // Rampa desde config para suavizar cambios manuales del knob (evita saltos audibles)
      const ramp = audioConfig.frequencyRampTime ?? 0.2;
      app._updatePanelOscFreq(panelIndex, oscIndex, value, undefined, { ramp });
      if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
        oscillatorOSCSync.sendKnobChange(oscIndex, 6, value);
      }
    },
    getTooltipInfo: getFreqTooltipInfo
  };

  return knobOptions;
}

/**
 * Calcula la ganancia de un pin de matriz del Panel 5 (Audio).
 *
 * @param {number} rowIndex - Índice de fila física (fuente)
 * @param {number} colIndex - Índice de columna física (destino)
 * @param {object} app - Instancia de la aplicación
 * @param {Object} [destInfo] - Información del destino (opcional, para obtener Rf)
 * @param {string} [userPinType] - Tipo de pin seleccionado por el usuario (WHITE, GREY, GREEN, RED)
 * @returns {number} Factor de ganancia para el GainNode
 */
export function getPanel5PinGain(rowIndex, colIndex, app, destInfo = null, userPinType = null) {
  const cfg = audioMatrixConfig?.audio || {};
  const matrixGain = cfg.matrixGain ?? 1.0;
  const gainRange = cfg.gainRange || { min: 0, max: 2.0 };

  const rowSynth = _physicalRowToSynthRow(rowIndex);
  const colSynth = _physicalColToSynthCol(colIndex);
  const pinKey = `${rowSynth}:${colSynth}`;

  // Prioridad 1: Ganancia explícita por pin (override manual en config)
  const pinGains = audioMatrixConfig?.pinGains || {};
  if (pinKey in pinGains) {
    const pinGain = pinGains[pinKey];
    const clampedPin = Math.max(gainRange.min, Math.min(gainRange.max, pinGain));
    return clampedPin * matrixGain;
  }

  // Prioridad 2: Calcular según modelo de virtual-earth summing
  // Usar tipo de pin del usuario si se proporciona, sino fallback a config o default
  const pinTypes = audioMatrixConfig?.pinTypes || {};
  const pinType = userPinType || pinTypes[pinKey] || VOLTAGE_DEFAULTS.defaultPinType || 'WHITE';

  // Obtener Rf del destino (por defecto 100k estándar)
  let rf = STANDARD_FEEDBACK_RESISTANCE;
  if (destInfo?.rf) {
    rf = destInfo.rf;
  }

  // Determinar si aplicar tolerancia basado en settings
  const applyTolerance = VOLTAGE_DEFAULTS.applyPinTolerance ?? false;

  // Calcular seed único para reproducibilidad de tolerancia
  const seed = rowSynth * 1000 + colSynth;

  // Calcular ganancia base según fórmula de virtual-earth
  const pinGain = calculateMatrixPinGain(pinType, rf, { applyTolerance, seed });

  // Aplicar ganancias adicionales por fila/columna si existen
  const rowGains = audioMatrixConfig?.rowGains || {};
  const colGains = audioMatrixConfig?.colGains || {};
  const rowGain = rowGains[rowSynth] ?? 1.0;
  const colGain = colGains[colSynth] ?? 1.0;

  const clampedRow = Math.max(gainRange.min, Math.min(gainRange.max, rowGain));
  const clampedCol = Math.max(gainRange.min, Math.min(gainRange.max, colGain));

  // Combinar todas las ganancias
  const totalGain = pinGain * clampedRow * clampedCol * matrixGain;

  // Clamp final para evitar valores extremos
  return Math.max(gainRange.min, Math.min(gainRange.max * 40, totalGain)); // Permitir hasta 40x para pines rojos
}

/**
 * Calcula la ganancia de un pin de matriz del Panel 6 (Control).
 *
 * @param {number} rowIndex - Índice de fila física (fuente)
 * @param {number} colIndex - Índice de columna física (destino)
 * @param {object} app - Instancia de la aplicación
 * @param {Object} [destInfo] - Información del destino (opcional, para obtener Rf)
 * @param {string} [userPinType] - Tipo de pin seleccionado por el usuario (WHITE, GREY, GREEN, RED)
 * @returns {number} Factor de ganancia para el GainNode
 */
export function getPanel6PinGain(rowIndex, colIndex, app, destInfo = null, userPinType = null) {
  const config = controlMatrixConfig || {};
  const controlSection = config.control || {};
  const matrixGain = controlSection.matrixGain ?? 1.0;
  const gainRange = controlSection.gainRange || { min: 0, max: 2.0 };
  const rowGains = config.rowGains || {};
  const colGains = config.colGains || {};
  const pinGains = config.pinGains || {};

  // Convertir índices físicos a numeración Synthi para buscar en configs
  const rowSynth = rowIndex + (panel6ControlBlueprint?.grid?.coordSystem?.rowBase || 67);
  const colSynth = colIndex + (panel6ControlBlueprint?.grid?.coordSystem?.colBase || 1);
  const pinKey = `${rowSynth}:${colSynth}`;

  // Prioridad 1: Ganancia explícita de pin (override manual en config)
  if (pinKey in pinGains) {
    return pinGains[pinKey] * matrixGain;
  }

  // Prioridad 2: Calcular según modelo de virtual-earth summing
  // Usar tipo de pin del usuario si se proporciona, sino fallback a config o default
  const pinTypes = config.pinTypes || {};
  const pinType = userPinType || pinTypes[pinKey] || 'GREY'; // Control: gris por defecto (100k, ganancia 1:1)

  // Obtener Rf del destino (por defecto 100k estándar)
  let rf = STANDARD_FEEDBACK_RESISTANCE;
  if (destInfo?.rf) {
    rf = destInfo.rf;
  }

  // Para CV, la tolerancia se aplica según settings pero con mayor cuidado
  const applyTolerance = VOLTAGE_DEFAULTS.applyPinTolerance ?? false;

  // Seed único para reproducibilidad
  const seed = rowSynth * 1000 + colSynth;

  // Calcular ganancia base según fórmula de virtual-earth
  const pinGain = calculateMatrixPinGain(pinType, rf, { applyTolerance, seed });

  // Aplicar ganancias adicionales por fila/columna si existen
  const rowGain = rowGains[rowSynth] ?? 1.0;
  const colGain = colGains[colSynth] ?? 1.0;

  // Combinar todas las ganancias
  return pinGain * rowGain * colGain * matrixGain;
}

/**
 * Maneja la activación/desactivación de un pin en la matriz de audio (Panel 5).
 *
 * @param {number} rowIndex - Índice de fila (0-based)
 * @param {number} colIndex - Índice de columna (0-based)
 * @param {boolean} activate - true para conectar, false para desconectar
 * @param {string|null} pinColor - Color del pin seleccionado
 * @param {object} app - Instancia de la aplicación
 * @returns {boolean} true si la operación fue exitosa
 */
export async function handlePanel5AudioToggle(rowIndex, colIndex, activate, pinColor = null, app) {
  const source = app._panel3Routing?.sourceMap?.get(rowIndex);
  const dest = app._panel3Routing?.destMap?.get(colIndex);
  const key = `${rowIndex}:${colIndex}`;

  if (!source || !dest) return true;

  if (activate) {
    // Si DSP está deshabilitado, no conectar audio (la UI sigue funcionando)
    if (!app.engine.dspEnabled) return true;
    app.ensureAudio();
    const ctx = app.engine.audioCtx;
    if (!ctx) return false;

    // Obtener nodo de salida según tipo de fuente
    let outNode = null;

    if (source.kind === 'panel3Osc') {
      // Fuente: Oscilador de Panel 3
      const oscIndex = source.oscIndex;
      const channelId = source.channelId || 'sineSaw';
      const src = app._ensurePanel3Nodes(oscIndex);
      outNode = channelId === 'triPulse' ? src?.triPulseOut : src?.sineSawOut;

      // Aplicar estado del oscilador
      const state = app._panel3Audio?.state?.[oscIndex];
      applyOscStateImmediate(src, state, ctx);

    } else if (source.kind === 'noiseGen') {
      // Fuente: Noise Generator
      const noiseIndex = source.index;
      // Acceder a los datos de Panel 3 dinámicamente
      const panel3Data = app['_panel3LayoutData'];
      const noiseAudioModules = panel3Data?.noiseAudioModules;

      if (!noiseAudioModules) {
        log.warn(' Noise audio modules not initialized');
        return false;
      }

      const noiseModule = noiseIndex === 0 ? noiseAudioModules.noise1 : noiseAudioModules.noise2;

      // Asegurar que el módulo esté iniciado (lazy init después de user gesture)
      if (noiseModule && !noiseModule.isStarted) {
        noiseModule.start();
      }

      outNode = noiseModule?.getOutputNode?.();

      if (!outNode) {
        log.warn(' NoiseModule output node not available, retrying init');
        noiseModule?.start?.();
        outNode = noiseModule?.getOutputNode?.();
      }

    } else if (source.kind === 'inputAmp') {
      // Fuente: Input Amplifier (canales de entrada del sistema)
      const channel = source.channel;

      if (!app.inputAmplifiers) {
        log.warn(' Input amplifiers module not initialized');
        return false;
      }

      // Asegurar que el módulo esté iniciado
      if (!app.inputAmplifiers.isStarted) {
        await app.inputAmplifiers.start();
      }

      // Asegurar que tengamos audio del sistema conectado
      await app._ensureSystemAudioInput();

      outNode = app.inputAmplifiers.getOutputNode(channel);

      if (!outNode) {
        log.warn(' InputAmplifier output node not available for channel', channel);
        return false;
      }
    } else if (source.kind === 'outputBus') {
      // Fuente: Output Bus (señal POST-VCA, PRE-filtro)
      const busIndex = source.bus - 1; // bus 1-8 → index 0-7

      // Obtener postVcaNode del bus (señal post-VCA directa)
      const busData = app.engine.outputBuses?.[busIndex];
      if (!busData?.postVcaNode) {
        log.warn(' Output bus postVcaNode not available for bus', source.bus);
        return false;
      }

      outNode = busData.postVcaNode;
    } else if (source.kind === 'filterLP' || source.kind === 'filterHP') {
      const filterId = source.kind === 'filterLP'
        ? `flp${(source.index ?? 0) + 1}`
        : `fhp${(source.index ?? 0) + 1}`;
      const filterModule = app._panel1FilterModules?.[filterId];
      outNode = filterModule?.getOutputNode?.() ?? null;
    } else if (source.kind === 'reverberation') {
      const reverbModule = app._panel1ReverbModule;
      if (reverbModule && !reverbModule.isStarted) {
        reverbModule.start();
      }
      outNode = reverbModule?.getOutputNode?.() ?? null;
    } else if (source.kind === 'ringModulator') {
      const rmIndex = source.index ?? 0;
      const rmModule = app._panel1RingModModules[rmIndex];
      if (rmModule && !rmModule.isStarted) {
        rmModule.start();
      }
      outNode = rmModule?.getOutputNode?.() ?? null;
    } else if (source.kind === 'envelopeShaper') {
      const esIndex = source.index ?? 0;
      const esModule = app._envelopeShaperModules[esIndex];
      if (esModule && !esModule.isStarted) {
        esModule.start();
      }
      outNode = esModule?.getOutputNode?.('audio') ?? null;
    } else if (source.kind === 'sequencer') {
      const seqModule = app._sequencerModule;
      if (seqModule && !seqModule.isStarted) {
        seqModule.start();
      }
      const outputId = source.output || (source.channel === 0 ? 'dac1' : 'dac2');
      outNode = seqModule?.getOutputNode?.(outputId) ?? null;
    }

    if (!outNode) {
      log.warn(' No output node for source', source);
      return false;
    }

    // Determinar nodo de destino según tipo
    let destNode = null;
    if (dest.kind === 'outputBus') {
      const busIndex = dest.bus - 1;
      destNode = app.engine.getOutputBusNode(busIndex);
    } else if (dest.kind === 'oscilloscope') {
      // Conectar a la entrada correspondiente del osciloscopio
      if (!app.oscilloscope) {
        log.warn(' Oscilloscope module not ready yet');
        return false;
      }
      destNode = dest.channel === 'X' ? app.oscilloscope.inputX : app.oscilloscope.inputY;
      log.info(` Connecting to oscilloscope ${dest.channel}`);
    } else if (dest.kind === 'oscSync') {
      // ─────────────────────────────────────────────────────────────────────
      // HARD SYNC INPUT
      // ─────────────────────────────────────────────────────────────────────
      const oscIndex = dest.oscIndex;
      const oscNodes = app._ensurePanel3Nodes(oscIndex);

      // El destino es el AudioWorkletNode directamente (input 0 = sync)
      destNode = oscNodes?.multiOsc;

      if (!destNode) {
        log.warn(' multiOsc not available for hard sync, osc', oscIndex);
        return false;
      }

      log.info(` Hard sync → Osc ${oscIndex + 1}`);
    } else if (dest.kind === 'oscPWM') {
      // ─────────────────────────────────────────────────────────────────────
      // PWM INPUT (Pulse Width Modulation)
      // ─────────────────────────────────────────────────────────────────────
      const oscIndex = dest.oscIndex;
      const oscNodes = app._ensurePanel3Nodes(oscIndex);
      const multiOsc = oscNodes?.multiOsc;

      if (!multiOsc) {
        log.warn(' multiOsc not available for PWM, osc', oscIndex);
        return false;
      }

      // Obtener el AudioParam 'pulseWidth' del worklet
      const pwParam = multiOsc.parameters?.get('pulseWidth');
      if (!pwParam) {
        log.warn(' pulseWidth AudioParam not available for osc', oscIndex);
        return false;
      }

      // Guardar referencia al AudioParam como destino especial
      destNode = null; // No hay destNode convencional

      log.info(` PWM → Osc ${oscIndex + 1}`);

      // ─── Crear cadena de audio PWM ───────────────────────────────────
      const pinFilterQ = audioMatrixConfig?.pinFiltering?.filterQ ?? 0.5;
      const pinFilter = createPinFilter(ctx, pinColor || 'GREY', pinFilterQ);

      // GainNode del pin (ganancia de la matriz)
      const gain = ctx.createGain();
      const pinGainValue = app._getPanel5PinGain(rowIndex, colIndex, dest, pinColor);

      const oscCfg = app._getOscConfig(oscIndex);
      const pwCfg = oscCfg?.knobs?.pulseWidth ?? oscillatorConfig.defaults?.knobs?.pulseWidth ?? {};
      const pwMin = pwCfg.min ?? 0.01;
      const pwMax = pwCfg.max ?? 0.99;
      const pwmScale = (pwMax - pwMin) / 2;
      gain.gain.value = pinGainValue * pwmScale;

      // Conectar: source → pinFilter → gain → pulseWidth AudioParam
      outNode.connect(pinFilter);
      pinFilter.connect(gain);
      gain.connect(pwParam);

      app._panel3Routing.connections[key] = {
        filter: pinFilter,
        gain: gain,
        pinColor: pinColor || 'GREY'
      };

      app.dormancyManager?.onConnectionChange();

      if (!matrixOSCSync.shouldIgnoreOSC()) {
        matrixOSCSync.sendAudioPinChange(rowIndex, colIndex, true, pinColor);
      }

      return true;
    } else if (dest.kind === 'filterLPInput' || dest.kind === 'filterHPInput') {
      const filterId = dest.kind === 'filterLPInput'
        ? `flp${(dest.index ?? 0) + 1}`
        : `fhp${(dest.index ?? 0) + 1}`;
      const filterModule = app._panel1FilterModules?.[filterId];
      destNode = filterModule?.getInputNode?.() ?? null;
    } else if (dest.kind === 'reverbInput') {
      const reverbModule = app._panel1ReverbModule;
      if (reverbModule && !reverbModule.isStarted) {
        reverbModule.start();
      }
      destNode = reverbModule?.getInputNode?.() ?? null;
    } else if (dest.kind === 'ringModInputA' || dest.kind === 'ringModInputB') {
      const rmIndex = dest.index ?? 0;
      const rmModule = app._panel1RingModModules[rmIndex];
      if (rmModule && !rmModule.isStarted) {
        rmModule.start();
      }
      const inputId = dest.kind === 'ringModInputA' ? 'A' : 'B';
      destNode = rmModule?.getInputNode?.(inputId) ?? null;
    } else if (dest.kind === 'envelopeShaperSignalInput' || dest.kind === 'envelopeShaperTriggerInput') {
      const esIndex = dest.index ?? 0;
      const esModule = app._envelopeShaperModules[esIndex];
      if (esModule && !esModule.isStarted) {
        esModule.start();
      }
      const inputId = dest.kind === 'envelopeShaperSignalInput' ? 'signal' : 'trigger';
      destNode = esModule?.getInputNode?.(inputId) ?? null;
    } else if (dest.kind === 'sequencerControl') {
      const seqModule = app._sequencerModule;
      if (seqModule && !seqModule.isStarted) {
        seqModule.start();
      }
      destNode = seqModule?.getInputNode?.(dest.controlType) ?? null;
    } else if (dest.kind === 'pitchToVoltageConverterInput') {
      const pvcModule = app._pvcModule;
      if (pvcModule && !pvcModule.isStarted) {
        pvcModule.start();
      }
      destNode = pvcModule?.getInputNode?.('audio') ?? null;
    }

    if (!destNode) {
      log.warn(' No destination node for', dest);
      return false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CADENA DE AUDIO CON FILTRO RC
    // ─────────────────────────────────────────────────────────────────────────

    // Crear filtro RC del pin (BiquadFilter lowpass)
    const pinFilterQ = audioMatrixConfig?.pinFiltering?.filterQ ?? 0.5;
    const pinFilter = createPinFilter(ctx, pinColor || 'GREY', pinFilterQ);

    // Crear nodo de ganancia
    const gain = ctx.createGain();
    const pinGainValue = app._getPanel5PinGain(rowIndex, colIndex, dest, pinColor);
    gain.gain.value = pinGainValue;

    // Conectar cadena: source → pinFilter → gain → dest
    outNode.connect(pinFilter);
    pinFilter.connect(gain);

    // Para hard sync, conectar explícitamente al input 0 del AudioWorkletNode
    if (dest.kind === 'oscSync') {
      gain.connect(destNode, 0, 0); // output 0 del gain → input 0 del worklet
    } else {
      gain.connect(destNode);
    }

    // Guardar referencia a la conexión completa (filtro + gain)
    app._panel3Routing.connections[key] = {
      filter: pinFilter,
      gain: gain,
      pinColor: pinColor || 'GREY'
    };

    // Notificar al DormancyManager del cambio de conexiones
    app.dormancyManager?.onConnectionChange();

    // Enviar cambio de pin via OSC
    if (!matrixOSCSync.shouldIgnoreOSC()) {
      matrixOSCSync.sendAudioPinChange(rowIndex, colIndex, true, pinColor);
    }

    return true;
  }

  const conn = app._panel3Routing.connections?.[key];
  if (conn) {
    safeDisconnect(conn.filter);
    safeDisconnect(conn.gain);
    delete app._panel3Routing.connections[key];

    // Si era una conexión al osciloscopio, verificar si quedan conexiones
    if (dest?.kind === 'oscilloscope' && app.oscilloscope) {
      // Contar conexiones restantes al osciloscopio
      const scopeConnections = app.getScopeConnectionCount ? app.getScopeConnectionCount() : 0;
      if (scopeConnections === 0) {
        // Notificar al display que no hay señal
        app.oscilloscope._notifyNoSignal?.();
      }
    }
  }

  // Notificar al DormancyManager del cambio de conexiones
  app.dormancyManager?.onConnectionChange();

  // Enviar desconexión via OSC
  if (!matrixOSCSync.shouldIgnoreOSC()) {
    matrixOSCSync.sendAudioPinChange(rowIndex, colIndex, false, null);
  }

  return true;
}

/**
 * Maneja la activación/desactivación de un pin en la matriz de control (Panel 6).
 *
 * @param {number} rowIndex - Índice de fila (0-based)
 * @param {number} colIndex - Índice de columna (0-based)
 * @param {boolean} activate - true para conectar, false para desconectar
 * @param {string|null} pinColor - Color del pin seleccionado (WHITE, GREY, GREEN, RED)
 * @param {object} app - Instancia de la aplicación
 * @returns {boolean} true si la operación fue exitosa
 */
export async function handlePanel6ControlToggle(rowIndex, colIndex, activate, pinColor = null, app) {
  const source = app._panel6Routing?.sourceMap?.get(rowIndex);
  const dest = app._panel6Routing?.destMap?.get(colIndex);
  const key = `${rowIndex}:${colIndex}`;

  if (!source || !dest) return true;

  if (activate) {
    app.ensureAudio();
    const ctx = app.engine.audioCtx;
    if (!ctx) return false;

    // ─────────────────────────────────────────────────────────────────────
    // OBTENER NODO DE SALIDA DE LA FUENTE
    // ─────────────────────────────────────────────────────────────────────
    let outNode = null;

    if (source.kind === 'panel3Osc') {
      // Fuente: Oscilador de Panel 3 (usado como LFO/CV source)
      const oscIndex = source.oscIndex;
      const channelId = source.channelId || 'sineSaw';
      const src = app._ensurePanel3Nodes(oscIndex);
      outNode = channelId === 'triPulse' ? src?.triPulseOut : src?.sineSawOut;

      // Aplicar estado del oscilador
      const state = app._panel3Audio?.state?.[oscIndex];
      applyOscStateImmediate(src, state, ctx);
    } else if (source.kind === 'inputAmp') {
      // Fuente: Input Amplifier (canales de entrada como fuente de CV)
      const channel = source.channel;

      if (!app.inputAmplifiers) {
        log.warn(' Input amplifiers module not initialized');
        return false;
      }

      // Asegurar que el módulo esté iniciado
      if (!app.inputAmplifiers.isStarted) {
        await app.inputAmplifiers.start();
      }

      // Asegurar que tengamos audio del sistema conectado
      await app._ensureSystemAudioInput();

      outNode = app.inputAmplifiers.getOutputNode(channel);

      if (!outNode) {
        log.warn(' InputAmplifier output node not available for channel', channel);
        return false;
      }
    } else if (source.kind === 'outputBus') {
      // Fuente: Output Bus (señal POST-VCA como fuente de CV)
      const busIndex = source.bus - 1; // bus 1-8 → index 0-7

      const busData = app.engine.outputBuses?.[busIndex];
      if (!busData?.postVcaNode) {
        log.warn(' Output bus postVcaNode not available for bus', source.bus);
        return false;
      }

      outNode = busData.postVcaNode;
    } else if (source.kind === 'joystick') {
      // Fuente: Joystick (voltaje DC bipolar, eje X o Y)
      const side = source.side; // 'left' o 'right'
      const axis = source.axis; // 'x' o 'y'
      const joyModule = app._joystickModules?.[side];

      if (!joyModule) {
        log.warn(' Joystick module not found for side:', side);
        return false;
      }

      // Asegurar que el módulo esté iniciado
      if (!joyModule.isStarted) {
        joyModule.start();
      }

      outNode = axis === 'x' ? joyModule.getOutputNodeX() : joyModule.getOutputNodeY();

      if (!outNode) {
        log.warn(` Joystick ${side} output node not available for axis ${axis}`);
        return false;
      }
    } else if (source.kind === 'keyboardUpper' || source.kind === 'keyboardLower') {
      // Fuente: Keyboard (Upper o Lower)
      const kbSide = source.kind === 'keyboardUpper' ? 'upper' : 'lower';
      const kbOutput = source.output; // 'pitch', 'velocity' o 'gate'
      const kbModule = app._keyboardModules?.[kbSide];

      if (!kbModule) {
        log.warn(` Keyboard module not found for side: ${kbSide}`);
        return false;
      }

      // Lazy start: arranca el módulo solo al primer pin
      if (!kbModule.isStarted) {
        kbModule.start();
      }

      outNode = kbModule.getOutputNode(kbOutput);

      if (!outNode) {
        log.warn(` Keyboard ${kbSide} output node not available for: ${kbOutput}`);
        return false;
      }
    } else if (source.kind === 'randomCV') {
      // Fuente: Random Control Voltage Generator (placa PC-21)
      const rvgOutput = source.output; // 'voltage1', 'voltage2' o 'key'
      const panel3Data = app['_panel3LayoutData'];
      const rvgModule = panel3Data?.randomCVAudio;

      if (!rvgModule) {
        log.warn(' Random CV module not initialized');
        return false;
      }

      // Lazy start: arranca el módulo solo al primer pin
      if (!rvgModule.isStarted) {
        rvgModule.start();
      }

      outNode = rvgModule.getOutputNode(rvgOutput);

      if (!outNode) {
        log.warn(` Random CV output node not available for: ${rvgOutput}`);
        return false;
      }
    } else if (source.kind === 'envelopeShaper') {
      // Fuente: Envelope Shaper (CV de envolvente ADSR)
      const esIndex = source.index ?? 0;
      const esOutput = source.output || 'envelope';
      const esModule = app._envelopeShaperModules[esIndex];

      if (!esModule) {
        log.warn(' Envelope Shaper module not initialized, index:', esIndex);
        return false;
      }

      if (!esModule.isStarted) {
        esModule.start();
      }

      outNode = esModule.getOutputNode(esOutput);

      if (!outNode) {
        log.warn(` Envelope Shaper ${esIndex} output not available for: ${esOutput}`);
        return false;
      }
    } else if (source.kind === 'sequencer') {
      // Fuente: Sequencer CV output (voltageA-F, key1-4, clockRate)
      const seqModule = app._sequencerModule;
      if (!seqModule) {
        log.warn(' Sequencer module not initialized');
        return false;
      }
      if (!seqModule.isStarted) {
        seqModule.start();
      }
      outNode = seqModule.getOutputNode(source.output);
      if (!outNode) {
        log.warn(` Sequencer output not available for: ${source.output}`);
        return false;
      }
    } else if (source.kind === 'pitchToVoltageConverter') {
      // Fuente: Pitch to Voltage Converter (voltage output)
      const pvcModule = app._pvcModule;
      if (!pvcModule) {
        log.warn(' PVC module not initialized');
        return false;
      }
      if (!pvcModule.isStarted) {
        pvcModule.start();
      }
      outNode = pvcModule.getOutputNode(source.output);
      if (!outNode) {
        log.warn(` PVC output not available for: ${source.output}`);
        return false;
      }
    }

    if (!outNode) {
      log.warn(' No output node for control source', source);
      return false;
    }

    // ─────────────────────────────────────────────────────────────────────
    // OBTENER NODO DE ENTRADA DEL DESTINO
    // ─────────────────────────────────────────────────────────────────────
    let destNode = null;

    if (dest.kind === 'oscFreqCV') {
      // Destino: Entrada CV de frecuencia del oscilador
      const oscIndex = dest.oscIndex;
      const oscNodes = app._ensurePanel3Nodes(oscIndex);

      // Usar _cvChainInput si existe (entrada antes de thermal/softclip),
      // sino fallback a freqCVInput para compatibilidad
      destNode = oscNodes?._cvChainInput || oscNodes?.freqCVInput;

      // ─────────────────────────────────────────────────────────────────────
      // FIX: Verificar y reconectar cadena CV si no está conectada
      // ─────────────────────────────────────────────────────────────────────
      if (oscNodes?.multiOsc && oscNodes?.freqCVInput && !oscNodes._cvChainConnected) {
        const detuneParam = oscNodes.multiOsc.parameters?.get('detune');
        if (detuneParam) {
          log.info(`[FM] Osc ${oscIndex}: Reconnecting freqCVInput → detune`);
          try { oscNodes.freqCVInput.disconnect(); } catch(e) {}
          oscNodes.freqCVInput.connect(detuneParam);
          oscNodes._cvChainConnected = true;
        }
      }

      if (!destNode) {
        log.warn(' freqCVInput not available for osc', oscIndex);
        return false;
      }
    } else if (dest.kind === 'oscilloscope') {
      // Destino: Osciloscopio (visualización de señales CV)
      if (!app.oscilloscope) {
        log.warn(' Oscilloscope module not ready yet');
        return false;
      }
      destNode = dest.channel === 'X' ? app.oscilloscope.inputX : app.oscilloscope.inputY;
      log.info(` Panel 6: Connecting to oscilloscope ${dest.channel}`);
    } else if (dest.kind === 'outputLevelCV') {
      // ─────────────────────────────────────────────────────────────────────
      // Destino: Control de nivel de canal de salida (VCA CEM 3330)
      // ─────────────────────────────────────────────────────────────────────
      const busIndex = dest.busIndex;

      // Verificar que el engine esté disponible y los worklets cargados
      if (!app.engine || !app.engine.workletReady) {
        log.warn(' Engine or worklets not ready for audio-rate CV');
        // Fallback a conexión dummy (el CV no tendrá efecto)
        destNode = ctx.createGain();
        destNode.gain.value = 0;
      } else {
        const cvPassthrough = ctx.createGain();
        cvPassthrough.gain.value = 1;

        // Conectar el passthrough al VCA worklet del engine
        const connected = app.engine.connectOutputLevelCV(busIndex, cvPassthrough);

        if (connected) {
          destNode = cvPassthrough;

          // Guardar referencia para cleanup
          app._outputLevelCVData = {
            cvPassthrough,
            busIndex,
            disconnect: () => {
              app.engine?.disconnectOutputLevelCV(busIndex, cvPassthrough);
            }
          };

          log.info(` Panel 6: Audio-rate CV connected to output level bus ${busIndex + 1}`);
        } else {
          log.warn(' Failed to connect CV to VCA worklet');
          destNode = ctx.createGain();
          destNode.gain.value = 0;
        }
      }
    } else if (dest.kind === 'outputBus') {
      // ─────────────────────────────────────────────────────────────────────
      // Destino: Entrada de audio/voltaje al Output Channel (ANTES del VCA)
      // ─────────────────────────────────────────────────────────────────────
      const busIndex = dest.bus - 1;
      destNode = app.engine.getOutputBusNode(busIndex);

      if (!destNode) {
        log.warn(' Output bus input not available for bus', dest.bus);
        return false;
      }

      log.info(` Panel 6: Voltage input connected to output channel ${dest.bus}`);
    } else if (dest.kind === 'filterLPCutoffCV' || dest.kind === 'filterHPCutoffCV') {
      const filterId = dest.kind === 'filterLPCutoffCV'
        ? `flp${(dest.index ?? 0) + 1}`
        : `fhp${(dest.index ?? 0) + 1}`;
      const filterModule = app._panel1FilterModules?.[filterId];
      destNode = filterModule?.getCutoffCVParam?.() ?? null;
    } else if (dest.kind === 'reverbMixCV') {
      const reverbModule = app._panel1ReverbModule;
      if (reverbModule && !reverbModule.isStarted) {
        reverbModule.start();
      }
      destNode = reverbModule?.getMixCVParam?.() ?? null;
    } else if (dest.kind === 'envelopeShaperKeyCV') {
      // Destino: KEY/Gate del Envelope Shaper (Panel 6)
      const esIndex = dest.index ?? 0;
      const esModule = app._envelopeShaperModules[esIndex];
      if (esModule && !esModule.isStarted) {
        esModule.start();
      }
      destNode = esModule?.getInputNode?.('trigger') ?? null;
    } else if (
      dest.kind === 'envelopeShaperDelayCV' ||
      dest.kind === 'envelopeShaperAttackCV' ||
      dest.kind === 'envelopeShaperDecayCV' ||
      dest.kind === 'envelopeShaperSustainCV' ||
      dest.kind === 'envelopeShaperReleaseCV'
    ) {
      // Destino: CV para parámetros ADSR del Envelope Shaper
      const esIndex = dest.index ?? 0;
      const esModule = app._envelopeShaperModules[esIndex];
      if (esModule && !esModule.isStarted) {
        esModule.start();
      }
      // Crear nodo sink para que la conexión de matriz se registre
      destNode = ctx.createGain();
      destNode.gain.value = 0;
    } else if (dest.kind === 'sequencerInput') {
      // Destino: Entrada de voltaje al secuenciador para grabación
      const seqModule = app._sequencerModule;
      if (seqModule && !seqModule.isStarted) {
        seqModule.start();
      }
      destNode = seqModule?.getInputNode?.(dest.inputType) ?? null;
    }

    if (!destNode) {
      log.warn(' No destination node for control dest', dest);
      return false;
    }

    // ─────────────────────────────────────────────────────────────────────
    // CREAR CONEXIÓN CON FILTRO RC + GAINNODE
    // ─────────────────────────────────────────────────────────────────────

    // Crear filtro RC del pin
    const pinFilterQ = audioMatrixConfig?.pinFiltering?.filterQ ?? 0.5;
    const pinFilter = createPinFilter(ctx, pinColor || 'GREY', pinFilterQ);

    // Crear nodo de ganancia
    const gain = ctx.createGain();
    const pinGainValue = app._getPanel6PinGain(rowIndex, colIndex, dest, pinColor);
    gain.gain.value = pinGainValue;

    // Conectar cadena: source → pinFilter → gain → dest
    outNode.connect(pinFilter);
    pinFilter.connect(gain);
    gain.connect(destNode);

    // Guardar referencia completa (filtro + gain + pinColor)
    const connectionData = {
      filter: pinFilter,
      gain: gain,
      pinColor: pinColor || 'GREY',
      // Fusionar datos de outputLevelCV si existen
      ...(app._outputLevelCVData || {})
    };
    delete app._outputLevelCVData;  // Limpiar temporal

    app._panel6Routing.connections[key] = connectionData;

    log.info(` Panel 6: Connected ${source.kind}[${source.oscIndex ?? source.channel ?? ''}] → ${dest.kind}[${dest.oscIndex ?? dest.busIndex ?? ''}] (gain: ${pinGainValue}, fc: ${PIN_CUTOFF_FREQUENCIES[pinColor || 'GREY']?.toFixed(0)} Hz)`);

    // Notificar al DormancyManager del cambio de conexiones
    app.dormancyManager?.onConnectionChange();

    // Enviar cambio de pin via OSC
    if (!matrixOSCSync.shouldIgnoreOSC()) {
      matrixOSCSync.sendControlPinChange(rowIndex, colIndex, true, pinColor);
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DESCONEXIÓN
  // ─────────────────────────────────────────────────────────────────────────
  const conn = app._panel6Routing.connections?.[key];
  if (conn) {
    // Limpiar nodos de audio
    safeDisconnect(conn.filter);
    safeDisconnect(conn.gain);

    // Sistema nuevo (audio-rate): desconectar del VCA worklet
    if (conn.disconnect) {
      conn.disconnect();
    }
    if (conn.cvPassthrough) {
      safeDisconnect(conn.cvPassthrough);
    }
    // Legacy cleanup (para conexiones existentes antes de la migración)
    if (conn.stopSampling) {
      conn.stopSampling();
    }
    if (conn.cvSampler) {
      safeDisconnect(conn.cvSampler);
    }
    if (conn.analyser) {
      safeDisconnect(conn.analyser);
    }
    if (conn.silencer) {
      safeDisconnect(conn.silencer);
    }

    delete app._panel6Routing.connections[key];
    log.info(` Panel 6: Disconnected ${key}`);

    // Si era una conexión al osciloscopio, verificar si quedan conexiones
    if (dest?.kind === 'oscilloscope' && app.oscilloscope) {
      const scopeConnections = app.getScopeConnectionCount ? app.getScopeConnectionCount() : 0;
      if (scopeConnections === 0) {
        app.oscilloscope._notifyNoSignal?.();
      }
    }
  }

  // Notificar al DormancyManager del cambio de conexiones
  app.dormancyManager?.onConnectionChange();

  // Enviar desconexión via OSC
  if (!matrixOSCSync.shouldIgnoreOSC()) {
    matrixOSCSync.sendControlPinChange(rowIndex, colIndex, false, null);
  }

  return true;
}
