/**
 * Gestión de módulos del sintetizador (R7).
 *
 * Extraído de app.js — contiene findModuleById(), getModulesForPanel(),
 * reflowOscillatorPanel().
 *
 * @module moduleManager
 */

import panel3Blueprint from './panelBlueprints/panel3.blueprint.js';
import { flashGlow } from './ui/glowManager.js';
import { sessionManager } from './state/sessionManager.js';
import { undoRedoManager } from './state/undoRedoManager.js';
import { createLogger } from './utils/logger.js';
import { clearRememberedPipConfigs } from './ui/pipManager.js';
import { showToast } from './ui/toast.js';
import { t } from './i18n/index.js';
import {
  reverberationConfig,
  ringModulatorConfig,
  joystickConfig,
  sequencerConfig as sequencerModuleConfig,
} from './configs/index.js';

const log = createLogger('App');


// ─── findModuleById ───────────────────────────────────────────────────────────

export function findModuleById(moduleId, app) {
    // Osciladores
    if (app._oscillatorUIs[moduleId]) {
      return { type: 'oscillator', ui: app._oscillatorUIs[moduleId] };
    }
    // Noise
    if (app._noiseUIs[moduleId]) {
      return { type: 'noise', ui: app._noiseUIs[moduleId] };
    }
    // Random voltage
    if (app._randomVoltageUIs[moduleId]) {
      return { type: 'randomVoltage', ui: app._randomVoltageUIs[moduleId] };
    }
    // Envelope Shapers
    if (app._envelopeShaperUIs[moduleId]) {
      return { type: 'envelopeShaper', ui: app._envelopeShaperUIs[moduleId] };
    }
    // Panel 1 filters
    if (app._panel1FilterUIs[moduleId]) {
      return { type: 'filter', ui: app._panel1FilterUIs[moduleId] };
    }
    // Panel 1 reverberation
    if (moduleId === 'reverberation1-module' && app._panel1ReverbUI) {
      return { type: 'reverberation', ui: app._panel1ReverbUI };
    }
    // Panel 1 ring modulators
    if (app._panel1RingModUIs[moduleId]) {
      return { type: 'ringModulator', ui: app._panel1RingModUIs[moduleId] };
    }
    // Oscilloscope
    if (moduleId === 'oscilloscope-module' && app._panel2Data) {
      return { type: 'oscilloscope', ui: app._panel2Data };
    }
    // Input amplifiers
    if (app._inputAmplifierUIs[moduleId]) {
      return { type: 'inputAmplifiers', ui: app._inputAmplifierUIs[moduleId] };
    }
    // Output channel individual (ID: output-channel-1..8)
    if (app._outputFadersModule && moduleId.startsWith('output-channel-')) {
      const idx = parseInt(moduleId.replace('output-channel-', ''), 10) - 1;
      const channel = app._outputFadersModule.getChannel(idx);
      if (channel) {
        return { type: 'outputChannel', ui: channel };
      }
    }
    // Joystick (ID: joystick-left, joystick-right)
    if (app._joystickUIs?.[moduleId]) {
      return { type: 'joystick', ui: app._joystickUIs[moduleId] };
    }
    // Teclados (módulo de audio con serialize/deserialize)
    if (moduleId === 'keyboard-upper' && app._keyboardModules?.upper) {
      return { type: 'keyboard', ui: app._keyboardModules.upper };
    }
    if (moduleId === 'keyboard-lower' && app._keyboardModules?.lower) {
      return { type: 'keyboard', ui: app._keyboardModules.lower };
    }
    // Sequencer
    if (moduleId === 'sequencer' && app._sequencerModule) {
      return { type: 'sequencer', ui: app._sequencerModule };
    }
    // Panel 4 keyboard frames (DOM IDs: upperKeyboard-module, lowerKeyboard-module)
    if (moduleId === 'upperKeyboard-module' && app._keyboardModules?.upper) {
      return { type: 'keyboard', ui: app._keyboardModules.upper };
    }
    if (moduleId === 'lowerKeyboard-module' && app._keyboardModules?.lower) {
      return { type: 'keyboard', ui: app._keyboardModules.lower };
    }
    // Panel 4 PVC frame (DOM ID: pitchVoltageConverter-module)
    if (moduleId === 'pitchVoltageConverter-module' && app._pvcModule) {
      return { type: 'pitchToVoltageConverter', ui: app._pvcModule };
    }
    // Panel 4/7 sequencer frames (DOM IDs from ModuleFrame)
    const seqFrameIds = [
      'sequencer-control',
      'seqOutputRangeL1-module', 'seqOutputRangeL2-module', 'seqOutputRangeL3-module',
      'key4-module'
    ];
    if (seqFrameIds.includes(moduleId) && app._sequencerModule) {
      return { type: 'sequencer', ui: app._sequencerModule };
    }
    return null;
  }

// ─── getModulesForPanel ───────────────────────────────────────────────────────────

export function getModulesForPanel(panelId, app) {
    const modules = [];
    
    switch (panelId) {
      case 'panel-1': {
        for (const [id, ui] of Object.entries(app._panel1FilterUIs || {})) {
          modules.push({ type: 'filter', id, ui });
        }
        break;
      }
      case 'panel-3': {
        // Osciladores
        for (const [id, ui] of Object.entries(app._oscillatorUIs)) {
          if (id.startsWith('panel3-osc-')) modules.push({ type: 'oscillator', id, ui });
        }
        // Noise generators
        for (const [id, ui] of Object.entries(app._noiseUIs)) {
          if (id.startsWith('panel3-noise-')) modules.push({ type: 'noise', id, ui });
        }
        // Random voltage
        for (const [id, ui] of Object.entries(app._randomVoltageUIs)) {
          if (id.startsWith('panel3-random')) modules.push({ type: 'randomVoltage', id, ui });
        }
        // Envelope Shapers
        for (const [id, ui] of Object.entries(app._envelopeShaperUIs)) {
          if (id.startsWith('panel3-es')) modules.push({ type: 'envelopeShaper', id, ui });
        }
        break;
      }
      case 'panel-2': {
        // Osciloscopio
        if (app._panel2Data) {
          modules.push({ type: 'oscilloscope', id: 'oscilloscope-module', ui: app._panel2Data });
        }
        // Input amplifiers
        for (const [id, ui] of Object.entries(app._inputAmplifierUIs)) {
          modules.push({ type: 'inputAmplifiers', id, ui });
        }
        break;
      }
      case 'panel-output': {
        // Output channels
        if (app._outputFadersModule) {
          modules.push({ type: 'outputChannels', id: 'output-channels', ui: app._outputFadersModule });
        }
        // Joysticks
        for (const [id, joyUI] of Object.entries(app._joystickUIs || {})) {
          modules.push({ type: 'joystick', id, ui: joyUI });
        }
        // Keyboards
        for (const [side, mod] of Object.entries(app._keyboardModules || {})) {
          modules.push({ type: 'keyboard', id: `keyboard-${side}`, ui: mod });
        }
        // Sequencer (controles en Panel 7: clock rate, switches, botones)
        if (app._sequencerModule) {
          modules.push({ type: 'sequencer', id: 'sequencer', ui: app._sequencerModule });
        }
        break;
      }
      case 'panel-5': {
        // Matriz de audio — reset = limpiar conexiones
        if (app.largeMatrixAudio) {
          modules.push({ type: 'matrixAudio', id: 'matrix-audio', ui: app.largeMatrixAudio });
        }
        break;
      }
      case 'panel-6': {
        // Matriz de control — reset = limpiar conexiones
        if (app.largeMatrixControl) {
          modules.push({ type: 'matrixControl', id: 'matrix-control', ui: app.largeMatrixControl });
        }
        break;
      }
      case 'panel-4': {
        // Sequencer (knobs de output range en Panel 4)
        if (app._sequencerModule) {
          modules.push({ type: 'sequencer', id: 'sequencer', ui: app._sequencerModule });
        }
        // Keyboards (knobs en Panel 4, columnas 2 y 3)
        for (const [side, mod] of Object.entries(app._keyboardModules || {})) {
          modules.push({ type: 'keyboard', id: `keyboard-${side}`, ui: mod });
        }
        // PVC (knob en Panel 4, columna 1)
        if (app._pvcModule) {
          modules.push({ type: 'pitchToVoltageConverter', id: 'pvc', ui: app._pvcModule });
        }
        break;
      }
    }
    return modules;
  }

// ─── reflowOscillatorPanel ───────────────────────────────────────────────────────────

export function reflowOscillatorPanel(panelIndex, app) {
    const layoutDataKey = `_panel${panelIndex}LayoutData`;
    const rafKey = `_panel${panelIndex}LayoutRaf`;
    const writeRafKey = `_panel${panelIndex}LayoutWriteRaf`;
    
    const data = app[layoutDataKey];
    if (!data) return;

    if (app[rafKey]) {
      cancelAnimationFrame(app[rafKey]);
    }
    if (app[writeRafKey]) {
      cancelAnimationFrame(app[writeRafKey]);
    }

    app[rafKey] = requestAnimationFrame(() => {
      app[rafKey] = null;

      const { host, layout, oscillatorSlots, oscComponents, reserved, noiseModules } = data;
      if (!host || !host.isConnected) return;

      const { oscSize, gap, airOuter = 0, airOuterY = 0, topOffset, rowsPerColumn } = layout;
      
      const availableWidth = host.clientWidth;
      const availableHeight = host.clientHeight;
      
      const columnWidth = oscSize.width;
      const blockWidth = columnWidth * 2 + gap.x + airOuter * 2;
      const baseLeft = Math.max(0, (availableWidth - blockWidth) / 2) + airOuter;
      
      const blockHeight = rowsPerColumn * (oscSize.height + gap.y) - gap.y;
      const totalHeight = blockHeight + layout.reservedHeight + gap.y;
      const usableHeight = availableHeight - airOuterY * 2;
      const baseTop = (usableHeight - totalHeight) / 2 + airOuterY + topOffset;

      const oscillatorTransforms = oscComponents.map(({ element, slot }) => {
        const col = slot.col;
        const row = slot.row;
        const slotOffset = slot.slotUI?.slotOffset || layout.oscUIDefaults?.slotOffset || { x: 0, y: 0 };
        const x = baseLeft + col * (columnWidth + gap.x) + (slotOffset.x || 0);
        const y = baseTop + row * (oscSize.height + gap.y) + (slotOffset.y || 0);
        return { element, transform: `translate(${x}px, ${y}px)` };
      });

      const reservedTop = reserved ? baseTop + blockHeight + gap.y : 0;
      const reservedWidth = columnWidth * 2 + gap.x;

      app[writeRafKey] = requestAnimationFrame(() => {
        app[writeRafKey] = null;
        if (!host || !host.isConnected) return;
      
        oscillatorTransforms.forEach(({ element, transform }) => {
          element.style.transform = transform;
        });

        if (reserved) {
          reserved.style.transform = `translate(${baseLeft}px, ${reservedTop}px)`;
          reserved.style.width = `${reservedWidth}px`;
        
          // Aplicar altura y proporciones del blueprint si es Panel 3
          if (panelIndex === 3) {
            const blueprintModulesRow = panel3Blueprint?.layout?.modulesRow || {};
            const modulesGap = blueprintModulesRow.gap ?? 4;
            reserved.style.setProperty('--modules-row-gap', `${modulesGap}px`);
            
            // Aplicar tamaños fijos y padding desde el blueprint
            if (noiseModules) {
              const noiseSize = blueprintModulesRow.noiseSize || { width: 80, height: 110 };
              const randomCVSize = blueprintModulesRow.randomCVSize || { width: 210, height: 110 };
              const pad = blueprintModulesRow.padding || { top: 0, right: 4, bottom: 0, left: 4 };
              const padStyle = `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`;
              
              for (const mod of [noiseModules.noise1, noiseModules.noise2]) {
                if (mod?.element) {
                  mod.element.style.width = `${noiseSize.width}px`;
                  mod.element.style.height = `${noiseSize.height}px`;
                  mod.element.style.padding = padStyle;
                  mod.element.style.flex = 'none';
                }
              }
              
              if (noiseModules.randomCV?.element) {
                noiseModules.randomCV.element.style.width = `${randomCVSize.width}px`;
                noiseModules.randomCV.element.style.height = `${randomCVSize.height}px`;
                noiseModules.randomCV.element.style.padding = padStyle;
                noiseModules.randomCV.element.style.flex = 'none';
              }
              
              const rowHeight = Math.max(noiseSize.height, randomCVSize.height);
              reserved.style.height = `${rowHeight}px`;
            }
          } else {
            reserved.style.height = `${layout.reservedHeight}px`;
          }
        }
      });
    });
  }


// ─── resetModule ──────────────────────────────────────────────────────────────

export function resetModule(type, ui, app) {
    if (!ui) return;

    // Joystick: reset especial (no usa deserialize)
    if (type === 'joystick') {
      const { module, knobs, padEl, config } = ui;
      const defRangeX = config?.knobs?.rangeX?.initial ?? 0;
      const defRangeY = config?.knobs?.rangeY?.initial ?? 0;
      const maxX = config?.knobs?.rangeX?.max || 10;
      const maxY = config?.knobs?.rangeY?.max || 10;
      const wasAtOrigin = module.getX() === 0 && module.getY() === 0;
      module.setPosition(0, 0);
      module.setRangeX(defRangeX);
      module.setRangeY(defRangeY);
      if (knobs?.rangeX?.knobInstance) knobs.rangeX.knobInstance.setValue(defRangeX / maxX);
      if (knobs?.rangeY?.knobInstance) knobs.rangeY.knobInstance.setValue(defRangeY / maxY);
      if (padEl?._joystickUpdateHandle) {
        padEl._joystickUpdateHandle(0, 0);
        if (!wasAtOrigin) flashGlow(padEl);
      }
      return;
    }

    const defaults = app._defaultValues;

    // Osciloscopio: reset especial (no usa deserialize genérico)
    if (type === 'oscilloscope') {
      const { timeKnob, ampKnob, levelKnob, modeToggle, display, scopeModule } = ui;
      const scopeDefaults = defaults.oscilloscope;
      if (timeKnob?.knobInstance) timeKnob.knobInstance.setValue(scopeDefaults.timeScale);
      if (ampKnob?.knobInstance) ampKnob.knobInstance.setValue(scopeDefaults.ampScale);
      if (levelKnob?.knobInstance) levelKnob.knobInstance.setValue(scopeDefaults.triggerLevel);
      if (modeToggle) {
        modeToggle.setState(scopeDefaults.mode);
        const mode = scopeDefaults.mode === 'a' ? 'yt' : 'xy';
        if (display) display.setMode(mode);
        if (scopeModule?.setMode) scopeModule.setMode(mode);
      }
      return;
    }

    // Sequencer: reset audio module + knob UI + switch visuals + counter
    if (type === 'sequencer') {
      const seqKnobs = sequencerModuleConfig.knobs;
      for (const [name, cfg] of Object.entries(seqKnobs)) {
        if (name === 'clockRate') {
          ui.setClockRate(cfg.initial);
        } else {
          ui.setKnob(name, cfg.initial);
        }
        const knobInstance = app._sequencerKnobs[name];
        if (knobInstance) {
          const min = cfg.min ?? 0;
          const max = cfg.max ?? 10;
          knobInstance.setValue((cfg.initial - min) / (max - min));
        }
      }
      const seqSwitches = sequencerModuleConfig.switches;
      for (const [name, cfg] of Object.entries(seqSwitches)) {
        ui.setSwitch(name, cfg.initial);
        app._sequencerSwitchUIs?.[name]?.setState(cfg.initial);
      }
      if (app._sequencerDisplayUpdate) {
        app._sequencerDisplayUpdate('0000');
      }
      return;
    }

    // Keyboard: reset audio module + UI knobs
    if (type === 'keyboard') {
      const kbDefaults = defaults.keyboard;
      if (typeof ui.deserialize === 'function') ui.deserialize(kbDefaults);
      const side = ui === app._keyboardModules?.upper ? 'upper' : 'lower';
      app._resetKeyboardKnobs(side);
      return;
    }

    // PVC: reset audio module + UI knob
    if (type === 'pitchToVoltageConverter') {
      const pvcDefaults = defaults.pitchToVoltageConverter;
      if (typeof ui.deserialize === 'function') ui.deserialize(pvcDefaults);
      if (app._pvcKnobs.range) {
        app._pvcKnobs.range.resetToDefault();
      }
      return;
    }

    if (typeof ui.deserialize !== 'function') return;
    
    switch (type) {
      case 'oscillator':
        ui.deserialize(defaults.oscillator);
        break;
      case 'noise':
        ui.deserialize(defaults.noise);
        break;
      case 'randomVoltage':
        ui.deserialize(defaults.randomVoltage);
        break;
      case 'envelopeShaper':
        ui.deserialize(defaults.envelopeShaper);
        break;
      case 'filter':
        ui.deserialize(defaults.filters);
        break;
      case 'inputAmplifiers':
        ui.deserialize(defaults.inputAmplifiers);
        break;
      case 'outputChannels':
        ui.deserialize(defaults.outputChannels);
        break;
      case 'outputChannel': {
        // Canal individual: construir defaults de un solo canal
        const singleChDefaults = defaults.outputChannels.channels[0];
        ui.deserialize(singleChDefaults);
        break;
      }
      case 'matrixAudio':
        ui.deserialize({ connections: [] });
        break;
      case 'matrixControl':
        ui.deserialize({ connections: [] });
        break;
    }
  }


// ─── resetToDefaults ──────────────────────────────────────────────────────────

export async function resetToDefaults(app) {
    log.info(' Resetting to defaults...');
    
    // Deshabilitar tracking de cambios durante el reset
    sessionManager.applyingPatch(true);
    
    // Leer valores por defecto de los configs (fuente única de verdad)
    const defaults = app._defaultValues;
    
    // Resetear osciladores
    if (app._oscillatorUIs) {
      for (const ui of Object.values(app._oscillatorUIs)) {
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize(defaults.oscillator);
        }
      }
    }
    
    // Resetear generadores de ruido
    if (app._noiseUIs) {
      for (const ui of Object.values(app._noiseUIs)) {
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize(defaults.noise);
        }
      }
    }
    
    // Resetear Random Voltage
    if (app._randomVoltageUIs) {
      for (const ui of Object.values(app._randomVoltageUIs)) {
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize(defaults.randomVoltage);
        }
      }
    }

    // Resetear Envelope Shapers
    if (app._envelopeShaperUIs) {
      for (const ui of Object.values(app._envelopeShaperUIs)) {
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize(defaults.envelopeShaper);
        }
      }
    }

    // Resetear filtros Panel 1
    if (app._panel1FilterUIs) {
      for (const ui of Object.values(app._panel1FilterUIs)) {
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize(defaults.filters);
        }
      }
    }

    // Resetear Reverberation
    if (app._panel1ReverbUI) {
      app._panel1ReverbUI.deserialize({
        mix: reverberationConfig.knobs.mix.initial,
        level: reverberationConfig.knobs.level.initial
      });
    }

    // Resetear Ring Modulators
    if (app._panel1RingModUIs) {
      for (const ui of Object.values(app._panel1RingModUIs)) {
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize({
            level: ringModulatorConfig.knobs.level.initial
          });
        }
      }
    }

    // Resetear Keyboards
    if (app._keyboardModules) {
      for (const [side, mod] of Object.entries(app._keyboardModules)) {
        if (mod && typeof mod.deserialize === 'function') {
          mod.deserialize(defaults.keyboard);
        }
        app._resetKeyboardKnobs(side);
      }
    }

    // Resetear PVC
    if (app._pvcModule && typeof app._pvcModule.deserialize === 'function') {
      app._pvcModule.deserialize(defaults.pitchToVoltageConverter);
      if (app._pvcKnobs.range) {
        app._pvcKnobs.range.resetToDefault();
      }
    }
    
    // Resetear Input Amplifiers
    if (app._inputAmplifierUIs) {
      for (const ui of Object.values(app._inputAmplifierUIs)) {
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize(defaults.inputAmplifiers);
        }
      }
    }
    
    // Resetear Output Faders / Output Channels
    if (app._outputFadersModule && typeof app._outputFadersModule.deserialize === 'function') {
      app._outputFadersModule.deserialize(defaults.outputChannels);
    }
    
    // Limpiar matrices de conexiones
    if (app.largeMatrixAudio && typeof app.largeMatrixAudio.deserialize === 'function') {
      app.largeMatrixAudio.deserialize({ connections: [] });
    }
    
    if (app.largeMatrixControl && typeof app.largeMatrixControl.deserialize === 'function') {
      app.largeMatrixControl.deserialize({ connections: [] });
    }
    
    // Resetear osciloscopio
    if (app._panel2Data) {
      const { timeKnob, ampKnob, levelKnob, modeToggle, display, scopeModule } = app._panel2Data;
      const scopeDefaults = defaults.oscilloscope;
      if (timeKnob?.knobInstance) timeKnob.knobInstance.setValue(scopeDefaults.timeScale);
      if (ampKnob?.knobInstance) ampKnob.knobInstance.setValue(scopeDefaults.ampScale);
      if (levelKnob?.knobInstance) levelKnob.knobInstance.setValue(scopeDefaults.triggerLevel);
      if (modeToggle) {
        modeToggle.setState(scopeDefaults.mode);
        const mode = scopeDefaults.mode === 'a' ? 'yt' : 'xy';
        if (display) display.setMode(mode);
        if (scopeModule?.setMode) scopeModule.setMode(mode);
      }
    }
    
    // Resetear voltímetros a modo Signal (por defecto)
    if (app._panel4Data?.voltmeters) {
      for (const vm of Object.values(app._panel4Data.voltmeters)) {
        vm.deserialize({ mode: 'signal' });
      }
    }
    
    // Resetear joysticks a posición central y rango por defecto
    if (app._joystickModules) {
      for (const [side, module] of Object.entries(app._joystickModules)) {
        const sideConfig = joystickConfig[side];
        const defaultRangeX = sideConfig?.knobs?.rangeX?.initial ?? 5;
        const defaultRangeY = sideConfig?.knobs?.rangeY?.initial ?? 5;
        const wasAtOrigin = module.getX() === 0 && module.getY() === 0;
        module.setPosition(0, 0);
        module.setRangeX(defaultRangeX);
        module.setRangeY(defaultRangeY);
        // Actualizar knobs de la UI
        const knobs = app._joystickKnobs?.[side];
        if (knobs) {
          if (knobs.rangeX?.knobInstance) knobs.rangeX.knobInstance.setValue(defaultRangeX / 10);
          if (knobs.rangeY?.knobInstance) knobs.rangeY.knobInstance.setValue(defaultRangeY / 10);
        }
        // Actualizar handle visual del pad (flash solo si posición cambió)
        const joystickKey = `joystick-${side}`;
        const padEl = app._joystickUIs?.[joystickKey]?.padEl;
        if (padEl?._joystickUpdateHandle) {
          padEl._joystickUpdateHandle(0, 0);
          if (!wasAtOrigin) flashGlow(padEl);
        }
      }
    }
    
    // Resetear secuenciador digital
    if (app._sequencerModule) {
      const seqKnobs = sequencerModuleConfig.knobs;
      for (const [name, cfg] of Object.entries(seqKnobs)) {
        if (name === 'clockRate') {
          app._sequencerModule.setClockRate(cfg.initial);
        } else {
          app._sequencerModule.setKnob(name, cfg.initial);
        }
        const knobInstance = app._sequencerKnobs[name];
        if (knobInstance) {
          const min = cfg.min ?? 0;
          const max = cfg.max ?? 10;
          knobInstance.setValue((cfg.initial - min) / (max - min));
        }
      }
      const seqSwitches = sequencerModuleConfig.switches;
      for (const [name, cfg] of Object.entries(seqSwitches)) {
        app._sequencerModule.setSwitch(name, cfg.initial);
        app._sequencerSwitchUIs?.[name]?.setState(cfg.initial);
      }
    }
    
    // Rehabilitar tracking de cambios
    sessionManager.applyingPatch(false);
    
    // Forzar actualización síncrona de dormancy (misma razón que en _applyPatch)
    app.dormancyManager?.flushPendingUpdate();
    
    // Limpiar estado guardado (no preguntar al reiniciar si no hay cambios)
    sessionManager.clearLastState();
    
    // Limpiar memoria de posiciones PiP (se reabrirán en posición default)
    clearRememberedPipConfigs();
    
    // Limpiar historial de undo (nuevo punto de partida)
    undoRedoManager.clear();
    
    // Mostrar toast de confirmación
    showToast(t('toast.reset'));
    
    log.info(' Reset to defaults complete');
  }

