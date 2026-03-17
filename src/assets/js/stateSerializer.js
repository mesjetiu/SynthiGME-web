/**
 * Serialización y restauración del estado del sintetizador.
 *
 * Extraído de app.js (R7) para aislar la lógica de patch:
 *   - serializeCurrentState(app)         → objeto de estado
 *   - applyPatch(patchData, app, deps)    → restaura módulos
 *
 * El parámetro `app` es la instancia de App (o cualquier objeto con las
 * mismas propiedades). El parámetro opcional `deps` permite inyectar
 * dependencias en tests: { sessionManager, flashGlow }.
 *
 * @module stateSerializer
 */

import { createLogger } from './utils/logger.js';
import { sessionManager as defaultSessionManager } from './state/sessionManager.js';
import { flashGlow as defaultFlashGlow } from './ui/glowManager.js';
import { keyboardConfig, pitchToVoltageConverterConfig } from './configs/index.js';

const log = createLogger('StateSerializer');

// ─────────────────────────────────────────────────────────────────────────────
// serializeCurrentState
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serializa el estado actual del sintetizador a un objeto de patch.
 * @param {object} app - Instancia de App
 * @returns {{ modules: object }} Estado serializado
 */
export function serializeCurrentState(app) {
  const state = {
    modules: {}
  };

  // Serializar osciladores
  if (app._oscillatorUIs) {
    state.modules.oscillators = {};
    for (const [id, ui] of Object.entries(app._oscillatorUIs)) {
      if (ui && typeof ui.serialize === 'function') {
        state.modules.oscillators[id] = ui.serialize();
      }
    }
  }

  // Serializar generadores de ruido
  if (app._noiseUIs) {
    state.modules.noise = {};
    for (const [id, ui] of Object.entries(app._noiseUIs)) {
      if (ui && typeof ui.serialize === 'function') {
        state.modules.noise[id] = ui.serialize();
      }
    }
  }

  // Serializar Random Voltage
  if (app._randomVoltageUIs) {
    state.modules.randomVoltage = {};
    for (const [id, ui] of Object.entries(app._randomVoltageUIs)) {
      if (ui && typeof ui.serialize === 'function') {
        state.modules.randomVoltage[id] = ui.serialize();
      }
    }
  }

  // Serializar Envelope Shapers
  if (app._envelopeShaperUIs) {
    state.modules.envelopeShaper = {};
    for (const [id, ui] of Object.entries(app._envelopeShaperUIs)) {
      if (ui && typeof ui.serialize === 'function') {
        state.modules.envelopeShaper[id] = ui.serialize();
      }
    }
  }

  // Serializar filtros del Panel 1
  if (app._panel1FilterUIs) {
    state.modules.filters = {};
    for (const [id, ui] of Object.entries(app._panel1FilterUIs)) {
      if (ui && typeof ui.serialize === 'function') {
        state.modules.filters[id.replace(/-module$/, '')] = ui.serialize();
      }
    }
  }

  // Serializar Reverberation
  if (app._panel1ReverbUI) {
    state.modules.reverberation = app._panel1ReverbUI.serialize();
  }

  // Serializar Ring Modulators
  if (app._panel1RingModUIs) {
    state.modules.ringModulators = {};
    for (const [id, ui] of Object.entries(app._panel1RingModUIs)) {
      if (ui && typeof ui.serialize === 'function') {
        state.modules.ringModulators[id] = ui.serialize();
      }
    }
  }

  // Serializar Keyboards
  if (app._keyboardModules) {
    state.modules.keyboards = {};
    for (const [side, mod] of Object.entries(app._keyboardModules)) {
      if (mod && typeof mod.serialize === 'function') {
        state.modules.keyboards[side] = mod.serialize();
      }
    }
  }

  // Serializar PVC
  if (app._pvcModule && typeof app._pvcModule.serialize === 'function') {
    state.modules.pitchToVoltageConverter = app._pvcModule.serialize();
  }

  // Serializar Output Faders
  if (app._outputFadersModule && typeof app._outputFadersModule.serialize === 'function') {
    state.modules.outputFaders = app._outputFadersModule.serialize();
  }

  // Serializar Input Amplifiers
  if (app._inputAmplifierUIs) {
    state.modules.inputAmplifiers = {};
    for (const [id, ui] of Object.entries(app._inputAmplifierUIs)) {
      if (ui && typeof ui.serialize === 'function') {
        state.modules.inputAmplifiers[id] = ui.serialize();
      }
    }
  }

  // Serializar matriz de conexiones de audio
  if (app.largeMatrixAudio && typeof app.largeMatrixAudio.serialize === 'function') {
    state.modules.matrixAudio = app.largeMatrixAudio.serialize();
  }

  // Serializar matriz de conexiones de control
  if (app.largeMatrixControl && typeof app.largeMatrixControl.serialize === 'function') {
    state.modules.matrixControl = app.largeMatrixControl.serialize();
  }

  // Serializar estado de joysticks (posición + rangos)
  if (app._joystickModules) {
    state.modules.joysticks = {};
    for (const [side, module] of Object.entries(app._joystickModules)) {
      state.modules.joysticks[side] = {
        x: module.getX(),
        y: module.getY(),
        rangeX: module.getRangeX(),
        rangeY: module.getRangeY()
      };
    }
  }

  // Serializar secuenciador digital (knobs + switches)
  if (app._sequencerModule) {
    state.modules.sequencer = {
      values:   { ...app._sequencerModule.values },
      switches: { ...app._sequencerModule.switches }
    };
  }

  // Serializar osciloscopio (knobs + modo)
  if (app._panel2Data) {
    const { timeKnob, ampKnob, levelKnob, modeToggle } = app._panel2Data;
    state.modules.oscilloscope = {
      timeScale:    timeKnob?.knobInstance?.getValue() ?? 1.0,
      ampScale:     ampKnob?.knobInstance?.getValue() ?? 1.0,
      triggerLevel: levelKnob?.knobInstance?.getValue() ?? 0.0,
      mode:         modeToggle?.getState() ?? 'a'
    };
  }

  // Serializar voltímetros (modo signal/control)
  if (app._panel4Data?.voltmeters) {
    state.modules.voltmeters = {};
    for (const [id, vm] of Object.entries(app._panel4Data.voltmeters)) {
      state.modules.voltmeters[id] = vm.serialize();
    }
  }

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// applyPatch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aplica un patch cargado al sintetizador.
 * @param {object|null} patchData - Datos del patch a aplicar
 * @param {object} app - Instancia de App
 * @param {{ sessionManager?, flashGlow? }} [deps] - Dependencias inyectables (tests)
 */
export async function applyPatch(patchData, app, deps = {}) {
  const sm         = deps.sessionManager ?? defaultSessionManager;
  const doFlashGlow = deps.flashGlow    ?? defaultFlashGlow;

  log.info('applyPatch called with:', patchData);

  if (!patchData || !patchData.modules) {
    log.warn('Invalid patch data - missing modules');
    return;
  }

  // Asegurar que el worklet esté listo antes de aplicar el patch
  if (app.engine?.dspEnabled) {
    await app.ensureAudio?.();
  }

  // Deshabilitar tracking de cambios durante la aplicación del patch
  sm.applyingPatch(true);

  const { modules } = patchData;
  log.info('Modules to restore:', Object.keys(modules));

  // Restaurar osciladores
  if (modules.oscillators && app._oscillatorUIs) {
    for (const [id, data] of Object.entries(modules.oscillators)) {
      const ui = app._oscillatorUIs[id];
      if (ui && typeof ui.deserialize === 'function') {
        ui.deserialize(data);
      } else {
        log.warn(`Oscillator UI not found for ${id}`);
      }
    }
  }

  // Restaurar generadores de ruido
  if (modules.noise && app._noiseUIs) {
    for (const [id, data] of Object.entries(modules.noise)) {
      const ui = app._noiseUIs[id];
      if (ui && typeof ui.deserialize === 'function') {
        ui.deserialize(data);
      }
    }
  }

  // Restaurar Random Voltage
  if (modules.randomVoltage && app._randomVoltageUIs) {
    for (const [id, data] of Object.entries(modules.randomVoltage)) {
      const ui = app._randomVoltageUIs[id];
      if (ui && typeof ui.deserialize === 'function') {
        ui.deserialize(data);
      }
    }
  }

  // Restaurar Envelope Shapers
  if (modules.envelopeShaper && app._envelopeShaperUIs) {
    for (const [id, data] of Object.entries(modules.envelopeShaper)) {
      const ui = app._envelopeShaperUIs[id];
      if (ui && typeof ui.deserialize === 'function') {
        ui.deserialize(data);
      }
    }
  }

  // Restaurar filtros Panel 1
  if (modules.filters && app._panel1FilterUIs) {
    for (const [id, data] of Object.entries(modules.filters)) {
      const ui = app._panel1FilterUIs[`${id}-module`];
      if (ui && typeof ui.deserialize === 'function') {
        ui.deserialize(data);
      }
    }
  }

  // Restaurar Reverberation
  if (modules.reverberation && app._panel1ReverbUI) {
    app._panel1ReverbUI.deserialize(modules.reverberation);
  }

  // Restaurar Ring Modulators
  if (modules.ringModulators && app._panel1RingModUIs) {
    for (const [id, data] of Object.entries(modules.ringModulators)) {
      const ui = app._panel1RingModUIs[id];
      if (ui && typeof ui.deserialize === 'function') {
        ui.deserialize(data);
      }
    }
  }

  // Restaurar Keyboards
  if (modules.keyboards && app._keyboardModules) {
    for (const [side, data] of Object.entries(modules.keyboards)) {
      const mod = app._keyboardModules[side];
      if (mod && typeof mod.deserialize === 'function') {
        mod.deserialize(data);
      }
      // Actualizar knobs de la UI
      const knobRefs = app._keyboardKnobs?.[side];
      if (knobRefs && data) {
        const kbKnobs = keyboardConfig.knobs;
        if (data.pitchSpread !== undefined && knobRefs.pitchSpread) {
          knobRefs.pitchSpread.setValue(data.pitchSpread / (kbKnobs.pitchSpread.max ?? 10));
        }
        if (data.velocityLevel !== undefined && knobRefs.velocityLevel) {
          const vl = kbKnobs.velocityLevel;
          knobRefs.velocityLevel.setValue((data.velocityLevel - (vl.min ?? -5)) / ((vl.max ?? 5) - (vl.min ?? -5)));
        }
        if (data.gateLevel !== undefined && knobRefs.gateLevel) {
          const gl = kbKnobs.gateLevel;
          knobRefs.gateLevel.setValue((data.gateLevel - (gl.min ?? -5)) / ((gl.max ?? 5) - (gl.min ?? -5)));
        }
        if (data.retrigger !== undefined && knobRefs.retrigger) {
          knobRefs.retrigger.setState(data.retrigger === 1 ? 'a' : 'b');
        }
      }
    }
  }

  // Restaurar PVC
  if (modules.pitchToVoltageConverter && app._pvcModule) {
    app._pvcModule.deserialize(modules.pitchToVoltageConverter);
    const pvcData = modules.pitchToVoltageConverter;
    if (pvcData.range !== undefined && app._pvcKnobs?.range) {
      const rCfg = pitchToVoltageConverterConfig.knobs?.range || {};
      const rMin = rCfg.min ?? 0;
      const rMax = rCfg.max ?? 10;
      app._pvcKnobs.range.setValue((pvcData.range - rMin) / (rMax - rMin));
    }
  }

  // Restaurar Output Faders
  if (modules.outputFaders && app._outputFadersModule && typeof app._outputFadersModule.deserialize === 'function') {
    app._outputFadersModule.deserialize(modules.outputFaders);
  }

  // Restaurar Input Amplifiers
  if (modules.inputAmplifiers && app._inputAmplifierUIs) {
    for (const [id, data] of Object.entries(modules.inputAmplifiers)) {
      const ui = app._inputAmplifierUIs[id];
      if (ui && typeof ui.deserialize === 'function') {
        ui.deserialize(data);
      }
    }
  }

  // Restaurar matriz de conexiones de audio
  if (modules.matrixAudio && app.largeMatrixAudio && typeof app.largeMatrixAudio.deserialize === 'function') {
    app.largeMatrixAudio.deserialize(modules.matrixAudio);
  }

  // Restaurar matriz de conexiones de control
  if (modules.matrixControl && app.largeMatrixControl && typeof app.largeMatrixControl.deserialize === 'function') {
    app.largeMatrixControl.deserialize(modules.matrixControl);
  }

  // Restaurar osciloscopio
  if (modules.oscilloscope && app._panel2Data) {
    const data = modules.oscilloscope;
    const { timeKnob, ampKnob, levelKnob, modeToggle, display, scopeModule } = app._panel2Data;
    if (typeof data.timeScale === 'number' && timeKnob?.knobInstance) {
      timeKnob.knobInstance.setValue(data.timeScale);
    }
    if (typeof data.ampScale === 'number' && ampKnob?.knobInstance) {
      ampKnob.knobInstance.setValue(data.ampScale);
    }
    if (typeof data.triggerLevel === 'number' && levelKnob?.knobInstance) {
      levelKnob.knobInstance.setValue(data.triggerLevel);
    }
    if (data.mode && modeToggle) {
      modeToggle.setState(data.mode);
      const mode = data.mode === 'a' ? 'yt' : 'xy';
      if (display) display.setMode(mode);
      if (scopeModule?.setMode) scopeModule.setMode(mode);
    }
  }

  // Restaurar voltímetros (modo signal/control)
  if (modules.voltmeters && app._panel4Data?.voltmeters) {
    for (const [id, data] of Object.entries(modules.voltmeters)) {
      const vm = app._panel4Data.voltmeters[id];
      if (vm) vm.deserialize(data);
    }
  }

  // Restaurar estado de joysticks
  if (modules.joysticks && app._joystickModules) {
    for (const [side, data] of Object.entries(modules.joysticks)) {
      const module = app._joystickModules[side];
      if (module && data) {
        // Aplicar rangos primero (para que estén listos cuando se aplique posición)
        if (data.rangeX !== undefined) module.setRangeX(data.rangeX);
        if (data.rangeY !== undefined) module.setRangeY(data.rangeY);
        // Aplicar posición
        if (data.x !== undefined && data.y !== undefined) {
          module.setPosition(data.x, data.y);
        }
        // Actualizar handle visual del pad (flash solo si posición cambió)
        const joystickUI = Object.values(app._joystickUIs || {}).find(ui => ui.module === module);
        if (joystickUI?.padEl?._joystickUpdateHandle) {
          joystickUI.padEl._joystickUpdateHandle(module.getX(), module.getY());
          if (data.x !== undefined || data.y !== undefined) doFlashGlow(joystickUI.padEl);
        }
        // Actualizar knobs de la UI
        const knobs = app._joystickKnobs?.[side];
        if (knobs) {
          if (data.rangeX !== undefined && knobs.rangeX?.knobInstance) {
            knobs.rangeX.knobInstance.setValue(data.rangeX / 10);
          }
          if (data.rangeY !== undefined && knobs.rangeY?.knobInstance) {
            knobs.rangeY.knobInstance.setValue(data.rangeY / 10);
          }
        }
      }
    }
  }

  // Restaurar secuenciador digital
  if (modules.sequencer && app._sequencerModule) {
    const seqData = modules.sequencer;
    // Restaurar switches
    if (seqData.switches) {
      for (const [name, value] of Object.entries(seqData.switches)) {
        app._sequencerModule.setSwitch(name, value);
        app._sequencerSwitchUIs?.[name]?.setState(value);
      }
    }
    // Restaurar knobs (valores normalizados)
    if (seqData.values) {
      for (const [name, dial] of Object.entries(seqData.values)) {
        if (name === 'clockRate') {
          app._sequencerModule.setClockRate(dial);
        } else {
          app._sequencerModule.setKnob(name, dial);
        }
        // Actualizar knob UI
        const knobInstance = app._sequencerKnobs?.[name];
        if (knobInstance) {
          knobInstance.setValue(dial / 10);
        }
      }
    }
  }

  // Rehabilitar tracking de cambios
  sm.applyingPatch(false);

  // Forzar actualización síncrona de dormancy para que los módulos se
  // resincronicen inmediatamente (fix: noise level no se restauraba porque
  // setLevel() durante dormancy salta el AudioParam y el wake-up dependía
  // de un requestAnimationFrame que podía deduplicarse o retrasarse)
  app.dormancyManager?.flushPendingUpdate();

  log.info('Patch applied successfully');
}
