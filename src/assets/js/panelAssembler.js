/**
 * Ensambladores de paneles del sintetizador (R7).
 *
 * Extraído de app.js — contiene buildPanel1() y buildPanel2().
 * Cada función recibe el objeto app y popula las referencias de módulos
 * y la estructura DOM del panel.
 *
 * @module panelAssembler
 */

import panel1Blueprint from './panelBlueprints/panel1.blueprint.js';
import panel2Blueprint from './panelBlueprints/panel2.blueprint.js';

import {
  filterConfig,
  oscilloscopeConfig,
  inputAmplifierConfig,
  reverberationConfig,
  ringModulatorConfig,
  envelopeShaperConfig,
  octaveFilterBankConfig
} from './configs/index.js';

import { SynthiFilterModule }           from './modules/synthiFilter.js';
import { SpringReverbModule }           from './modules/springReverb.js';
import { RingModulatorModule }          from './modules/ringModulator.js';
import { EnvelopeShaperModule }         from './modules/envelopeShaper.js';
import { InputAmplifierModule }         from './modules/inputAmplifier.js';
import { OctaveFilterBankModule }      from './modules/octaveFilterBank.js';
import { OscilloscopeModule }           from './modules/oscilloscope.js';

import { Panel1FilterUI }               from './ui/panel1Filter.js';
import { Panel1ReverbUI }               from './ui/panel1Reverb.js';
import { Panel1RingModUI }              from './ui/panel1RingMod.js';
import { InputAmplifierUI }             from './ui/inputAmplifierUI.js';
import { OscilloscopeDisplay }          from './ui/oscilloscopeDisplay.js';
import { ModuleFrame }                  from './ui/moduleFrame.js';
import { Toggle }                       from './ui/toggle.js';
import { Knob }                         from './ui/knob.js';
import { createKnob }                   from './ui/knobFactory.js';
import { applyBox, boxCss, requireBox } from './utils/panelBox.js';

import {
  KNOB_YELLOW, KNOB_WHITE, KNOB_BLUE, KNOB_RED, KNOB_GREEN, KNOB_BLACK
} from './configs/knobColors.js';

import { envelopeShaperOSCSync }        from './osc/oscEnvelopeShaperSync.js';
import { inputAmplifierOSCSync }        from './osc/oscInputAmplifierSync.js';
import { reverbOSCSync }                from './osc/oscReverbSync.js';
import { ringModOSCSync }               from './osc/oscRingModSync.js';

import {
  getFilterFrequencyTooltipInfo, getFilterResponseTooltipInfo, getFilterLevelTooltipInfo,
  getReverbMixTooltipInfo, getReverbLevelTooltipInfo, getRingModLevelTooltipInfo,
  getEnvelopeShaperTimeTooltipInfo, getEnvelopeShaperSustainTooltipInfo,
  getEnvelopeShaperEnvLevelTooltipInfo, getEnvelopeShaperSignalLevelTooltipInfo,
  getEnvelopeShaperModeTooltipInfo,
  getOFBBandTooltipInfo
} from './utils/tooltipUtils.js';

import panel3Blueprint from './panelBlueprints/panel3.blueprint.js';
import panel4Blueprint from './panelBlueprints/panel4.blueprint.js';
import panel5AudioBlueprint from './panelBlueprints/panel5.audio.blueprint.js';
import panel6ControlBlueprint from './panelBlueprints/panel6.control.blueprint.js';
import panel7Blueprint from './panelBlueprints/panel7.blueprint.js';

import { compilePanelBlueprintMappings } from './core/blueprintMapper.js';

import { JoystickModule }                from './modules/joystick.js';
import { KeyboardModule }                from './modules/keyboard.js';
import { NoiseModule }                   from './modules/noise.js';
import { RandomCVModule }                from './modules/randomCV.js';
import { OutputChannelsPanel }           from './modules/outputChannel.js';
import { SequencerModule }               from './modules/sequencerModule.js';
import { PitchToVoltageConverterModule } from './modules/pitchToVoltageConverter.js';

import { SGME_Oscillator }               from './ui/sgmeOscillator.js';
import { NoiseGenerator }                from './ui/noiseGenerator.js';
import { RandomVoltage }                 from './ui/randomVoltage.js';
import { Voltmeter }                     from './ui/voltmeter.js';
import { RotarySwitch }                  from './ui/rotarySwitch.js';
import { VernierKnob, createVernierElements } from './ui/vernierKnob.js';
import { LargeMatrix }                   from './ui/largeMatrix.js';
import { getSharedTooltip }              from './ui/matrixTooltip.js';
import { SignalFlowHighlighter }         from './ui/signalFlowHighlighter.js';
import { keyboardShortcuts }             from './ui/keyboardShortcuts.js';
import {
  registerTooltipHideCallback, hideOtherTooltips, attachControlTooltip
} from './ui/tooltipManager.js';

import {
  joystickOSCSync
} from './osc/oscJoystickSync.js';
import { keyboardOSCSync }               from './osc/oscKeyboardSync.js';
import { noiseGeneratorOSCSync }         from './osc/oscNoiseGeneratorSync.js';
import { randomCVOSCSync }               from './osc/oscRandomCVSync.js';
import { sequencerOSCSync }              from './osc/oscSequencerSync.js';
import pvcOSCSync                        from './osc/oscPitchToVoltageConverterSync.js';
import { matrixOSCSync }                 from './osc/oscMatrixSync.js';

import {
  joystickConfig, keyboardConfig, noiseConfig, randomVoltageConfig,
  sequencerConfig as sequencerModuleConfig, pitchToVoltageConverterConfig,
  oscillatorConfig
} from './configs/index.js';

import { getOscillatorUIDefaults, resolveOscillatorUI, getNoiseUIDefaults, getRandomCVUIDefaults, resolveModuleUI } from './ui/layoutHelpers.js';

import {
  getNoiseColourTooltipInfo, getNoiseLevelTooltipInfo,
  getRandomCVMeanTooltipInfo, getRandomCVVarianceTooltipInfo,
  getRandomCVVoltageLevelTooltipInfo, getRandomCVKeyTooltipInfo,
  getKeyboardPitchSpreadTooltipInfo, getKeyboardVelocityTooltipInfo,
  getKeyboardGateTooltipInfo, getSequencerClockRateTooltipInfo,
  getSequencerVoltageLevelTooltipInfo, getSequencerKeyLevelTooltipInfo,
  getPVCRangeTooltipInfo, showVoltageTooltip, showAudioTooltip,
  formatGain, formatVoltage
} from './utils/tooltipUtils.js';

import { updatePinFilter, PIN_CUTOFF_FREQUENCIES } from './utils/voltageConstants.js';
import { STORAGE_KEYS } from './utils/constants.js';
import { loadSvgInline } from './ui/svgInlineLoader.js';

// Mapa de color → valor hex (mismo que en app.js)
const COLOR_MAP = {
  blue: KNOB_BLUE,
  red: KNOB_RED,
  yellow: KNOB_YELLOW,
  white: KNOB_WHITE,
  green: KNOB_GREEN,
  black: KNOB_BLACK
};

// Oculta módulos marcados con visible:false en el blueprint
function applyModuleVisibility(element, blueprint, moduleKey) {
  const mod = blueprint.modules?.[moduleKey];
  if (mod && mod.visible === false) {
    element.style.visibility = 'hidden';
    element.style.pointerEvents = 'none';
  }
}

// ──────────────────────────────────────────────────
// buildPanel1
// ──────────────────────────────────────────────────

export function buildPanel1(app) {
    if (!app.panel1) return;

    const blueprint = panel1Blueprint;
    const toNum = (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
    const resolveOffset = (offset, fallback = { x: 0, y: 0 }) => ({
      x: toNum(offset?.x, fallback.x),
      y: toNum(offset?.y, fallback.y)
    });
    const applyOffset = (el, offset, fallback = { x: 0, y: 0 }) => {
      if (!el) return;
      const resolved = resolveOffset(offset, fallback);
      if (resolved.x !== 0 || resolved.y !== 0) {
        el.style.transform = `translate(${resolved.x}px, ${resolved.y}px)`;
      }
    };
    const createPanel1Knob = ({ knobSize = 'sm', knobInnerPct = 78, knobColor = '', knobType = 'normal' }) => {
      const sizePreset = typeof knobSize === 'string' ? knobSize : '';
      
      const centerColor = COLOR_MAP[knobColor] || '';
      
      let svgSrc;
      if (knobType === 'bipolar') {
        svgSrc = 'assets/knobs/knob-0-center.svg';
      } else if (knobType === 'vernier') {
        svgSrc = 'assets/knobs/vernier-dial.svg'; 
      } else if (knobType === 'selector') {
        svgSrc = 'assets/knobs/knob-selector.svg';
      }

      // If it's a vernier type, you might use a specific Vernier constructor, 
      // but if we are just creating standard UI knobs for placeholders:
      const knob = createKnob({ size: sizePreset, showValue: false, centerColor, ...(svgSrc && { svgSrc }) });
      if (typeof knobSize === 'number' && Number.isFinite(knobSize) && knobSize > 0) {
        knob.knobEl.style.width = `${knobSize}px`;
        knob.knobEl.style.height = `${knobSize}px`;
      }
      const inner = knob.knobEl.querySelector('.knob-inner');
      if (inner) {
        const pct = toNum(knobInnerPct, 78);
        inner.style.width = `${pct}%`;
        inner.style.height = `${pct}%`;
      }
      return knob;
    };

    // Visibilidad de marcos de módulos (desde blueprint)
    if (blueprint.showFrames === false) {
      app.panel1.element.classList.add('hide-frames');
    }

    // Crear contenedor principal
    const host = document.createElement('div');
    host.id = 'panel1Layout';
    host.className = 'panel1-layout';
    const offset = blueprint.layout.offset || { x: 0, y: 0 };
    host.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      padding: ${blueprint.layout.padding.top}px ${blueprint.layout.padding.right}px 
               ${blueprint.layout.padding.bottom}px ${blueprint.layout.padding.left}px;
      display: flex;
      flex-direction: column;
      gap: ${blueprint.layout.gap ?? 4}px;
      transform: translate(${offset.x}px, ${offset.y}px);
    `;
    app.panel1.appendElement(host);

    // ─────────────────────────────────────────────────────────────────────────
    // FILA 1: FILTROS FLP 1-4 + FHP 1-4
    // ─────────────────────────────────────────────────────────────────────────

    const filtersLayout = blueprint.layout.filtersRow;
    const filtersRow = document.createElement('div');
    filtersRow.className = 'panel1-filters-row';
    filtersRow.style.cssText = `
      display: flex;
      gap: ${filtersLayout.gap}px;
      height: ${filtersLayout.height}px;
      flex: 0 0 auto;
      width: 100%;
    `;
    applyOffset(filtersRow, filtersLayout.offset);
    host.appendChild(filtersRow);

    const filterBanks = [
      {
        ids: filterConfig.lowPass.ids,
        mode: filterConfig.lowPass.mode,
        minCutoffHz: filterConfig.lowPass.minCutoffHz,
        sourceKind: filterConfig.lowPass.sourceKind,
        modulePrefix: 'filter-lp'
      },
      {
        ids: filterConfig.highPass.ids,
        mode: filterConfig.highPass.mode,
        minCutoffHz: filterConfig.highPass.minCutoffHz,
        sourceKind: filterConfig.highPass.sourceKind,
        modulePrefix: 'filter-hp'
      }
    ];
    const filterResponseTooltip = getFilterResponseTooltipInfo(
      filterConfig.audio.maxQ,
      filterConfig.audio.selfOscillationThresholdDial
    );
    const filterLevelTooltip = getFilterLevelTooltipInfo(
      filterConfig.audio.maxSelfOscillationVoltsPP,
      filterConfig.audio.levelLogBase
    );

    app._panel1FilterUIs = {};
    app._panel1FilterModules = {};

    for (const bank of filterBanks) {
      bank.ids.forEach((filterId, bankIndex) => {
        const moduleIndex = bankIndex + 1;
        const filterModuleUI = blueprint.modules?.[filterId]?.ui || {};
        const filterModule = new SynthiFilterModule(app.engine, `${bank.modulePrefix}-${moduleIndex}`, {
          mode: bank.mode,
          index: moduleIndex,
          sourceKind: bank.sourceKind,
          audio: {
            ...filterConfig.audio,
            minCutoffHz: bank.minCutoffHz ?? filterConfig.audio.minCutoffHz
          },
          ramps: filterConfig.ramps,
          initialValues: {
            frequency: filterConfig.knobs.frequency.initial,
            response: filterConfig.knobs.response.initial,
            level: filterConfig.knobs.level.initial
          }
        });
        // NO llamar engine.addModule() — start() se hace lazy en _handlePanel5AudioToggle
        // cuando el usuario conecta un pin (después del user gesture que activa AudioContext)
        app._panel1FilterModules[filterId] = filterModule;

        const ui = new Panel1FilterUI({
          id: `${filterId}-module`,
          knobGap: filterModuleUI.knobGap ?? filtersLayout.knobGap,
          knobSize: filterModuleUI.knobSize ?? filtersLayout.knobSize,
          knobInnerPct: filterModuleUI.knobInnerPct ?? filtersLayout.knobInnerPct,
          knobColors: filterModuleUI.knobColors ?? filtersLayout.knobColors,
          knobTypes: filterModuleUI.knobTypes ?? filtersLayout.knobTypes,
          knobsOffset: filterModuleUI.knobsOffset ?? filtersLayout.knobsOffset,
          offset: filterModuleUI.offset ?? filtersLayout.moduleOffset,
          knobOptions: {
            frequency: {
              ...filterConfig.knobs.frequency,
              onChange: (value) => filterModule.setFrequency(value),
              getTooltipInfo: getFilterFrequencyTooltipInfo({
                referenceCutoffHz: filterConfig.audio.referenceCutoffHz,
                referenceDial: filterConfig.audio.referenceDial,
                octaveDialSpan: filterConfig.audio.octaveDialSpan,
                voltsPerOctave: filterConfig.audio.voltsPerOctave,
                minCutoffHz: bank.minCutoffHz ?? filterConfig.audio.minCutoffHz,
                maxCutoffHz: filterConfig.audio.maxCutoffHz
              })
            },
            response: {
              ...filterConfig.knobs.response,
              onChange: (value) => filterModule.setResponse(value),
              getTooltipInfo: filterResponseTooltip
            },
            level: {
              ...filterConfig.knobs.level,
              onChange: (value) => filterModule.setLevel(value),
              getTooltipInfo: filterLevelTooltip
            }
          }
        });

        const el = ui.createElement();
        el.style.cssText = `flex: 1 1 0; min-width: 0; height: 100%;`;

        applyModuleVisibility(el, blueprint, filterId);
        filtersRow.appendChild(el);
        app._panel1FilterUIs[ui.id] = ui;
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FILAS 2-4: ENVELOPE SHAPERS 1-3
    // ─────────────────────────────────────────────────────────────────────────

    const envLayout = blueprint.layout.envelopeShapers;

    // Tooltips sin dependencia de modo (compartidos por las 3 instancias)
    const esEnvLevelTooltip = getEnvelopeShaperEnvLevelTooltipInfo();
    const esSignalLevelTooltip = getEnvelopeShaperSignalLevelTooltipInfo(
      envelopeShaperConfig.audio.audioMaxVpp,
      envelopeShaperConfig.signalLevelCurve.logBase
    );
    const esModeTooltip = getEnvelopeShaperModeTooltipInfo(
      envelopeShaperConfig.knobs.mode.labels
    );

    for (let i = 1; i <= envLayout.count; i++) {
      const envId = `envelopeShaper${i}`;
      const envModuleUI = blueprint.modules?.[envId]?.ui || {};

      // Knobs se acumulan aquí — el getter de modo los referencia lazy
      const esKnobs = {};
      const getMode = () => esKnobs.mode?.getValue() ?? 2;

      // Tooltips mode-aware (creados por instancia porque dependen del modo actual)
      const esTimeTooltip = getEnvelopeShaperTimeTooltipInfo(
        envelopeShaperConfig.audio.minTimeMs,
        envelopeShaperConfig.audio.maxTimeMs
      );
      const esSustainTooltip = getEnvelopeShaperSustainTooltipInfo({
        getMode, inactiveModes: [0, 1, 3]  // GATED_FR, FREE_RUN, TRIGGERED
      });
      const esReleaseTooltip = getEnvelopeShaperTimeTooltipInfo(
        envelopeShaperConfig.audio.minTimeMs,
        envelopeShaperConfig.audio.maxTimeMs,
        { getMode, inactiveModes: [4] }     // HOLD: sustain indefinido, release nunca ejecuta
      );

      // Definiciones de knobs del envelope shaper (orden horizontal)
      const esKnobDefs = [
        { key: 'mode',          label: 'Mode',       config: envelopeShaperConfig.knobs.mode,          tooltip: esModeTooltip,          type: 'selector' },
        { key: 'delay',         label: 'Delay',      config: envelopeShaperConfig.knobs.delay,         tooltip: esTimeTooltip,          type: 'normal' },
        { key: 'attack',        label: 'Attack',     config: envelopeShaperConfig.knobs.attack,        tooltip: esTimeTooltip,          type: 'normal' },
        { key: 'decay',         label: 'Decay',      config: envelopeShaperConfig.knobs.decay,         tooltip: esTimeTooltip,          type: 'normal' },
        { key: 'sustain',       label: 'Sustain',    config: envelopeShaperConfig.knobs.sustain,       tooltip: esSustainTooltip,       type: 'normal' },
        { key: 'release',       label: 'Release',    config: envelopeShaperConfig.knobs.release,       tooltip: esReleaseTooltip,       type: 'normal' },
        { key: 'envelopeLevel', label: 'Env. Level', config: envelopeShaperConfig.knobs.envelopeLevel, tooltip: esEnvLevelTooltip,      type: 'bipolar' },
        { key: 'signalLevel',   label: 'Sig. Level', config: envelopeShaperConfig.knobs.signalLevel,   tooltip: esSignalLevelTooltip,   type: 'normal' }
      ];

      // Crear módulo de audio
      const esModule = new EnvelopeShaperModule(app.engine, `envelope-shaper-${i}`, {
        ramps: envelopeShaperConfig.ramps
      });
      app._envelopeShaperModules.push(esModule);

      // Crear frame con la misma estructura del layout calibrado
      const frame = new ModuleFrame({
        id: `${envId}-module`,
        title: null,
        className: 'panel1-placeholder panel1-envelope'
      });
      const el = frame.createElement();
      el.style.cssText = `
        width: 100%;
        height: ${envLayout.height}px;
        flex: 0 0 auto;
      `;

      // Crear knobs horizontales en panel1-envelope-knobs (estructura CSS existente)
      const knobsContainer = document.createElement('div');
      knobsContainer.className = 'panel1-envelope-knobs';
      knobsContainer.style.gap = `${toNum(envModuleUI.knobGap, toNum(envLayout.knobGap, 2))}px`;
      applyOffset(knobsContainer, envModuleUI.knobsOffset, envLayout.knobsOffset || { x: 0, y: 0 });

      // Knobs funcionales (con Knob instance para interacción + audio)
      esKnobDefs.forEach((def, idx) => {
        const knobColor = envModuleUI.knobColors?.[idx] ?? envLayout.knobColors?.[idx] ?? '';
        const knobType = def.type;
        const knobSize = envModuleUI.knobSize ?? envLayout.knobSize;

        let svgSrc = 'assets/knobs/knob.svg';
        if (knobType === 'bipolar') svgSrc = 'assets/knobs/knob-0-center.svg';
        else if (knobType === 'selector') svgSrc = 'assets/knobs/knob-selector.svg';

        const centerColor = COLOR_MAP[knobColor] || '';

        // Selector: arco reducido (10→2 o'clock) con cuantización discreta
        const selectorOpts = knobType === 'selector' ? {
          minAngle: 300,
          maxAngle: 420,
          scaleMin: def.config.min ?? 0,
          scaleMax: def.config.max ?? 4,
          scaleDecimals: 0,
          steps: (def.config.max ?? 4) - (def.config.min ?? 0) + 1,
          stepLabels: def.config.labels
        } : {};

        const knob = createKnob({
          showValue: false,
          centerColor,
          svgSrc,
          min: def.config.min ?? 0,
          max: def.config.max ?? 1,
          initial: def.config.initial ?? 0,
          pixelsForFullRange: def.config.pixelsForFullRange ?? 150,
          scaleMin: def.config.scaleMin ?? 0,
          scaleMax: def.config.scaleMax ?? 10,
          scaleDecimals: def.config.scaleDecimals ?? 1,
          ...selectorOpts,
          onChange: (value) => {
            app.ensureAudio();
            esModule[`set${def.key.charAt(0).toUpperCase() + def.key.slice(1)}`](value);
            if (!envelopeShaperOSCSync.shouldIgnoreOSC()) {
              envelopeShaperOSCSync.sendChange(i, def.key, value);
            }
          },
          getTooltipInfo: def.tooltip,
          tooltipLabel: def.label
        });

        // Aplicar tamaño del blueprint
        if (typeof knobSize === 'number' && Number.isFinite(knobSize) && knobSize > 0) {
          knob.knobEl.style.width = `${knobSize}px`;
          knob.knobEl.style.height = `${knobSize}px`;
        }
        const inner = knob.knobEl.querySelector('.knob-inner');
        if (inner) {
          const pct = toNum(envModuleUI.knobInnerPct ?? envLayout.knobInnerPct, 78);
          inner.style.width = `${pct}%`;
          inner.style.height = `${pct}%`;
        }

        // Compensar rotación para knob bipolar
        if (knobType === 'bipolar') {
          knob.knobInstance._angleOffset = -150;
        }

        knobsContainer.appendChild(knob.wrapper);
        esKnobs[def.key] = knob.knobInstance;
      });
      frame.appendToContent(knobsContainer);

      // LED piloto — posición absoluta (arriba a la derecha de delay, según blueprint)
      const ledX = toNum(envModuleUI.ledOffset?.x ?? envLayout.ledOffset?.x, 130);
      const ledY = toNum(envModuleUI.ledOffset?.y ?? envLayout.ledOffset?.y, 8);
      const ledSz = toNum(envModuleUI.ledSize ?? envLayout.ledSize, 10);
      const gateLed = document.createElement('div');
      gateLed.className = 'envelope-shaper__led';
      gateLed.style.cssText = `position:absolute;left:${ledX}px;top:${ledY}px;width:${ledSz}px;height:${ledSz}px;`;
      el.appendChild(gateLed);

      // Gate button — posición absoluta (abajo a la derecha del selector, según blueprint)
      const gateX = toNum(envModuleUI.gateOffset?.x ?? envLayout.gateOffset?.x, 52);
      const gateY = toNum(envModuleUI.gateOffset?.y ?? envLayout.gateOffset?.y, 68);
      const gateSz = toNum(envModuleUI.gateSize ?? envLayout.gateSize, 16);
      const gateBtn = document.createElement('button');
      gateBtn.type = 'button';
      gateBtn.className = 'envelope-shaper__gate-btn';
      gateBtn.textContent = 'GATE';
      gateBtn.style.cssText = `position:absolute;left:${gateX}px;top:${gateY}px;width:${gateSz}px;height:${gateSz}px;`;

      let gateActive = false;
      const setGateActive = async (active) => {
        gateActive = active;
        gateBtn.classList.toggle('envelope-shaper__gate-btn--active', active);
        if (active) {
          await app.ensureAudio();
          // Tras init, enviar gate solo si el usuario sigue pulsando
          esModule.setGate(true);
          if (!gateActive) {
            // El usuario soltó durante la inicialización: enviar release
            esModule.setGate(false);
          }
          if (!envelopeShaperOSCSync.shouldIgnoreOSC()) {
            envelopeShaperOSCSync.sendGate(i, true);
          }
        } else {
          esModule.setGate(false);
          if (!envelopeShaperOSCSync.shouldIgnoreOSC()) {
            envelopeShaperOSCSync.sendGate(i, false);
          }
        }
      };
      gateBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setGateActive(true); });
      gateBtn.addEventListener('pointerup', () => setGateActive(false));
      gateBtn.addEventListener('pointerleave', () => { if (gateActive) setGateActive(false); });

      el.appendChild(gateBtn);

      // El frame necesita position:relative para los hijos absolutos
      el.style.position = 'relative';

      applyOffset(el, envModuleUI.offset, envLayout.moduleOffset || { x: 0, y: 0 });

      applyModuleVisibility(el, blueprint, envId);
      host.appendChild(el);

      // Conectar LED al estado de actividad del worklet
      esModule.onActiveChange = (active) => {
        gateLed.classList.toggle('envelope-shaper__led--active', active);
      };

      // Wrapper UI ligero para serialize/deserialize (compatible con el sistema de estado)
      app._envelopeShaperUIs[envId] = {
        id: `${envId}-module`,
        knobs: esKnobs,
        gateLed,
        serialize() {
          const data = {};
          for (const [key, knob] of Object.entries(esKnobs)) {
            data[key] = knob.getValue();
          }
          return data;
        },
        deserialize(data) {
          if (!data) return;
          for (const [key, val] of Object.entries(data)) {
            if (esKnobs[key] && typeof val === 'number') {
              esKnobs[key].setValue(val);
            }
          }
        },
        getValue(key) { return esKnobs[key]?.getValue() ?? 0; },
        setValue(key, value) { esKnobs[key]?.setValue(value); },
        setLedState(active) { gateLed.classList.toggle('envelope-shaper__led--active', active); }
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FILA 5: RING MODULATORS + REVERB + ECHO
    // ─────────────────────────────────────────────────────────────────────────

    const bottomLayout = blueprint.layout.bottomRow;
    const bottomRow = document.createElement('div');
    bottomRow.className = 'panel1-bottom-row';
    bottomRow.style.cssText = `
      display: flex;
      height: ${bottomLayout.height}px;
      flex: 0 0 auto;
      width: 100%;
    `;
    applyOffset(bottomRow, bottomLayout.offset);
    host.appendChild(bottomRow);

    const bottomFrames = {};

    // Ring Modulators 1-3 (1 knob cada uno: Level) — módulo funcional
    const rmConfig = bottomLayout.ringModulator;
    let isFirstBottomModule = true;

    const rmLevelTooltip = getRingModLevelTooltipInfo(
      ringModulatorConfig.audio.maxInputVpp,
      ringModulatorConfig.audio.levelLogBase
    );

    for (let i = 1; i <= rmConfig.count; i++) {
      const rmId = `ringModulator${i}`;
      const rmModuleUI = blueprint.modules?.[rmId]?.ui || {};

      // Crear módulo de audio
      const rmModule = new RingModulatorModule(app.engine, `ring-mod-${i}`, {
        index: i,
        sourceKind: ringModulatorConfig.sourceKind,
        audio: ringModulatorConfig.audio,
        ramps: ringModulatorConfig.ramps,
        initialValues: {
          level: ringModulatorConfig.knobs.level.initial
        }
      });
      app._panel1RingModModules.push(rmModule);

      // Crear UI funcional
      const ringModUI = new Panel1RingModUI({
        id: `${rmId}-module`,
        knobGap: rmModuleUI.knobGap ?? rmConfig.knobGap,
        knobSize: rmModuleUI.knobSize ?? rmConfig.knobSize,
        knobInnerPct: rmModuleUI.knobInnerPct ?? rmConfig.knobInnerPct,
        knobColors: rmModuleUI.knobColors ?? rmConfig.knobColors,
        knobTypes: rmModuleUI.knobTypes ?? rmConfig.knobTypes,
        knobsOffset: rmModuleUI.knobsOffset ?? rmConfig.knobsOffset,
        offset: rmModuleUI.offset ?? rmConfig.moduleOffset,
        knobOptions: {
          level: {
            ...ringModulatorConfig.knobs.level,
            onChange: (value) => {
              rmModule.setLevel(value);
              if (!ringModOSCSync.shouldIgnoreOSC()) {
                ringModOSCSync.sendChange(i, 'level', value);
              }
            },
            getTooltipInfo: rmLevelTooltip
          }
        }
      });
      app._panel1RingModUIs[rmId] = ringModUI;

      const el = ringModUI.createElement();
      const rmWidthCss = rmConfig.width
        ? `flex: 0 0 auto; width: ${rmConfig.width}px; height: 100%;`
        : `flex: 1 1 0; min-width: 0; height: 100%;`;
      const rmGap = isFirstBottomModule ? 0 : toNum(rmConfig.gap, 3);
      el.style.cssText = `${rmWidthCss} margin-left: ${rmGap}px;`;
      isFirstBottomModule = false;

      applyModuleVisibility(el, blueprint, rmId);
      bottomRow.appendChild(el);
      bottomFrames[rmId] = ringModUI.frame;
    }

    // Reverberation 1 (2 knobs: Mix, Level) — módulo funcional
    const reverbBlueprintConfig = bottomLayout.reverberation;
    const reverbModuleUI = blueprint.modules?.reverberation1?.ui || {};

    const reverbModule = new SpringReverbModule(app.engine, 'reverb-1', {
      index: 1,
      sourceKind: reverberationConfig.sourceKind,
      audio: reverberationConfig.audio,
      ramps: reverberationConfig.ramps,
      initialValues: {
        mix: reverberationConfig.knobs.mix.initial,
        level: reverberationConfig.knobs.level.initial
      }
    });
    app._panel1ReverbModule = reverbModule;

    const reverbMixTooltip = getReverbMixTooltipInfo();
    const reverbLevelTooltip = getReverbLevelTooltipInfo(
      reverberationConfig.audio.maxInputVpp,
      reverberationConfig.audio.levelLogBase
    );

    const reverbUI = new Panel1ReverbUI({
      id: 'reverberation1-module',
      knobGap: reverbModuleUI.knobGap ?? reverbBlueprintConfig.knobGap,
      knobSize: reverbModuleUI.knobSize ?? reverbBlueprintConfig.knobSize,
      knobInnerPct: reverbModuleUI.knobInnerPct ?? reverbBlueprintConfig.knobInnerPct,
      knobColors: reverbModuleUI.knobColors ?? reverbBlueprintConfig.knobColors,
      knobTypes: reverbModuleUI.knobTypes ?? reverbBlueprintConfig.knobTypes,
      knobsOffset: reverbModuleUI.knobsOffset ?? reverbBlueprintConfig.knobsOffset,
      offset: reverbModuleUI.offset ?? reverbBlueprintConfig.moduleOffset,
      knobOptions: {
        mix: {
          ...reverberationConfig.knobs.mix,
          onChange: (value) => {
            reverbModule.setMix(value);
            if (!reverbOSCSync.shouldIgnoreOSC()) {
              reverbOSCSync.sendChange('mix', value);
            }
          },
          getTooltipInfo: reverbMixTooltip
        },
        level: {
          ...reverberationConfig.knobs.level,
          onChange: (value) => {
            reverbModule.setLevel(value);
            if (!reverbOSCSync.shouldIgnoreOSC()) {
              reverbOSCSync.sendChange('level', value);
            }
          },
          getTooltipInfo: reverbLevelTooltip
        }
      }
    });
    app._panel1ReverbUI = reverbUI;

    const reverbEl = reverbUI.createElement();
    const reverbWidthCss = reverbBlueprintConfig.width
      ? `flex: 0 0 auto; width: ${reverbBlueprintConfig.width}px; height: 100%;`
      : `flex: 1 1 0; min-width: 0; height: 100%;`;
    reverbEl.style.cssText = `${reverbWidthCss} margin-left: ${toNum(reverbBlueprintConfig.gap, 3)}px;`;

    applyModuleVisibility(reverbEl, blueprint, 'reverberation1');
    bottomRow.appendChild(reverbEl);
    bottomFrames.reverberation1 = reverbUI.frame;

    // Echo A.D.L. (4 knobs: Delay, Mix, Feedback, Level)
    const echoConfig = bottomLayout.echo;
    const echoFrame = new ModuleFrame({
      id: 'echoADL-module',
      title: null,
      className: 'panel1-placeholder panel1-echo'
    });
    const echoEl = echoFrame.createElement();
    const echoUI = blueprint.modules?.echoADL?.ui || {};
    const echoWidthCss = echoConfig.width
      ? `flex: 0 0 auto; width: ${echoConfig.width}px; height: 100%;`
      : `flex: 1 1 0; min-width: 0; height: 100%;`;
    echoEl.style.cssText = `${echoWidthCss} margin-left: ${toNum(echoConfig.gap, 3)}px;`;

    const echoKnobs = document.createElement('div');
    echoKnobs.className = 'panel1-bottom-knobs';
    echoKnobs.style.gap = `${toNum(echoUI.knobGap, toNum(echoConfig.knobGap, 6))}px`;
    applyOffset(echoKnobs, echoUI.knobsOffset, echoConfig.knobsOffset || { x: 0, y: 0 });
    echoConfig.knobs.forEach((knobName, idx) => {
      const knob = createPanel1Knob({
        knobSize: echoUI.knobSize ?? echoConfig.knobSize,
        knobInnerPct: echoUI.knobInnerPct ?? echoConfig.knobInnerPct,
        knobColor: echoUI.knobColors?.[idx] ?? echoConfig.knobColors?.[idx],
        knobType: echoUI.knobTypes?.[idx] ?? echoConfig.knobTypes?.[idx]
      });
      echoKnobs.appendChild(knob.wrapper);
    });
    echoFrame.appendToContent(echoKnobs);
    applyOffset(echoEl, echoUI.offset, echoConfig.moduleOffset || { x: 0, y: 0 });

    applyModuleVisibility(echoEl, blueprint, 'echoADL');
    bottomRow.appendChild(echoEl);
    bottomFrames.echoADL = echoFrame;

    // ─────────────────────────────────────────────────────────────────────────
    // GUARDAR REFERENCIAS
    // ─────────────────────────────────────────────────────────────────────────

    app._panel1Data = {
      host,
      filtersRow,
      bottomRow,
      bottomFrames
    };
  }


// ──────────────────────────────────────────────────
// buildPanel2
// ──────────────────────────────────────────────────

export function buildPanel2(app) {
    if (!app.panel2) return;

    const blueprint = panel2Blueprint;
    const toNum = (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
    const resolveOffset = (offset, fallback = { x: 0, y: 0 }) => ({
      x: toNum(offset?.x, fallback.x),
      y: toNum(offset?.y, fallback.y)
    });
    // Config de osciloscopio (oscilloscopeConfig) se usa internamente en OscilloscopeDisplay
    
    // Visibilidad de marcos de módulos (desde blueprint)
    if (blueprint.showFrames === false) {
      app.panel2.element.classList.add('hide-frames');
    }
    
    // Contenedor principal: ocupa el panel entero; cada módulo va en su caja
    // absoluta { x, y, w, h } en px del panel (utils/panelBox.js).
    const host = document.createElement('div');
    host.id = 'panel2Layout';
    host.className = 'panel2-layout';
    host.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    `;
    app.panel2.appendElement(host);
    
    // ─────────────────────────────────────────────────────────────────────────
    // OSCILLOSCOPE (módulo funcional, toma el espacio restante)
    // ─────────────────────────────────────────────────────────────────────────
    
    const scopeLayout = blueprint.layout.oscilloscope;
    const oscUIConfig = blueprint.modules?.oscilloscope?.ui || {};
    
    const scopeSection = document.createElement('div');
    scopeSection.className = 'panel2-oscilloscope-section';
    scopeSection.style.cssText = boxCss(requireBox(scopeLayout.box, 'panel 2 oscilloscope'));
    host.appendChild(scopeSection);
    
    // Crear módulo de audio primero (necesitamos referencia para el toggle)
    const scopeModule = new OscilloscopeModule(app.engine, 'oscilloscope');
    
    // Configurar parámetros de audio desde config ANTES de iniciar
    const audioConfig = oscilloscopeConfig.audio;
    scopeModule.setBufferSize(audioConfig.bufferSize);
    scopeModule.setTriggerHysteresis(audioConfig.triggerHysteresis);
    scopeModule.setSchmittHysteresis(audioConfig.schmittHysteresis);
    // Sensibilidad de entrada: compensar ganancia del pin rojo (×37)
    if (audioConfig.inputSensitivity) {
      scopeModule.setInputSensitivity(audioConfig.inputSensitivity);
    }
    
    app.engine.addModule(scopeModule);
    app.oscilloscope = scopeModule;
    
    // Crear el frame usando ModuleFrame
    const frameConfig = scopeLayout.frame;
    const moduleFrame = new ModuleFrame({
      id: 'oscilloscope-module',
      title: null, // Sin título por ahora
      className: 'synth-module--oscilloscope'
    });
    
    const frameElement = moduleFrame.createElement();
    frameElement.style.cssText = `
      width: 100%;
      height: 100%;
      border-radius: ${frameConfig.borderRadius}px;
      padding: ${frameConfig.padding.top}px ${frameConfig.padding.right}px 
               ${frameConfig.padding.bottom}px ${frameConfig.padding.left}px;
    `;
    scopeSection.appendChild(frameElement);
    
    // Crear contenedor principal (posicionamiento relativo para offset del display)
    const displayConfig = scopeLayout.display;
    const displaySize = displayConfig.size || { width: 200, height: 150 };
    const displayOffset = displayConfig.offset || { x: 0, y: 0 };
    const mainContainer = document.createElement('div');
    mainContainer.className = 'oscilloscope-main';
    mainContainer.style.cssText = `
      position: relative;
      width: 100%;
      height: 100%;
    `;
    moduleFrame.appendToContent(mainContainer);
    
    // Crear contenedor del display (posición absoluta dentro del frame)
    const displayContainer = document.createElement('div');
    displayContainer.className = 'oscilloscope-display-container';
    displayContainer.style.cssText = `
      position: absolute;
      left: ${displayOffset.x}px;
      top: ${displayOffset.y}px;
      width: ${displaySize.width}px;
      height: ${displaySize.height}px;
      border-radius: 4px;
      overflow: hidden;
    `;
    mainContainer.appendChild(displayContainer);
    
    // Crear display con resolución interna fija
    const displayStyles = oscilloscopeConfig.display;
    const isTransparent = displayConfig.transparent === true;
    const beamOffsets = displayConfig.beamOffsets || { beam1Y: 0, beam2Y: 0 };
    const centerOffset = displayConfig.centerOffset || { x: 0, y: 0 };
    const display = new OscilloscopeDisplay({
      container: displayContainer,
      internalWidth: displayStyles.internalWidth,
      internalHeight: displayStyles.internalHeight,
      useDevicePixelRatio: displayStyles.useDevicePixelRatio,
      mode: oscilloscopeConfig.audio.mode,
      lineColor: displayStyles.lineColor,
      bgColor: isTransparent ? 'transparent' : displayStyles.bgColor,
      gridColor: displayStyles.gridColor,
      centerColor: displayStyles.centerColor,
      lineWidth: displayStyles.lineWidth,
      showGrid: isTransparent ? false : displayStyles.showGrid,
      showTriggerIndicator: displayStyles.showTriggerIndicator,
      beam1OffsetY: beamOffsets.beam1Y || 0,
      beam2OffsetY: beamOffsets.beam2Y || 0,
      centerOffsetX: centerOffset.x || 0,
      centerOffsetY: centerOffset.y || 0
    });
    
    // Crear contenedor de knobs (a la derecha del display)
    const knobsConfig = oscilloscopeConfig.knobs;
    const knobsContainer = document.createElement('div');
    knobsContainer.className = 'oscilloscope-knobs';
    mainContainer.appendChild(knobsContainer);
    
    // Definir configuración visual desde el blueprint
    const timeKnobColorName = oscUIConfig.knobColors?.[0] || 'black';
    const ampKnobColorName = oscUIConfig.knobColors?.[1] || 'black';
    const levelKnobColorName = oscUIConfig.knobColors?.[2] || 'black';
    
    const timeKnobType = oscUIConfig.knobTypes?.[0] || 'normal';
    const ampKnobType = oscUIConfig.knobTypes?.[1] || 'normal';
    const levelKnobType = oscUIConfig.knobTypes?.[2] || 'normal';

    const getSvgSrc = (type) => {
      if (type === 'bipolar') return 'assets/knobs/knob-0-center.svg';
      if (type === 'vernier') return 'assets/knobs/vernier-dial.svg';
      return 'assets/knobs/knob.svg';
    };

    // Knob TIME (escala horizontal)
    const timeKnob = createKnob({
      label: 'TIME',
      size: 'sm',
      centerColor: COLOR_MAP[timeKnobColorName] || KNOB_BLACK,
      svgSrc: getSvgSrc(timeKnobType),
      ...knobsConfig.timeScale,
      onChange: (value) => display.setTimeScale(value)
    });
    knobsContainer.appendChild(timeKnob.wrapper);
    
    // Knob AMP (escala vertical)
    const ampKnob = createKnob({
      label: 'AMP',
      size: 'sm',
      centerColor: COLOR_MAP[ampKnobColorName] || KNOB_BLACK,
      svgSrc: getSvgSrc(ampKnobType),
      ...knobsConfig.ampScale,
      onChange: (value) => display.setAmpScale(value)
    });
    knobsContainer.appendChild(ampKnob.wrapper);
    
    // Knob LEVEL (nivel de trigger)
    const levelKnob = createKnob({
      label: 'LEVEL',
      size: 'sm',
      centerColor: COLOR_MAP[levelKnobColorName] || KNOB_BLACK,
      svgSrc: getSvgSrc(levelKnobType),
      ...knobsConfig.triggerLevel,
      onChange: (value) => scopeModule.setTriggerLevel(value)
    });
    knobsContainer.appendChild(levelKnob.wrapper);
    
    // Crear toggle para modo Y-T / X-Y (Lissajous)
    const modeToggle = new Toggle({
      id: 'scope-mode-toggle',
      labelA: 'Y-T',
      labelB: 'X-Y',
      name: 'Mode',
      initial: oscilloscopeConfig.audio.mode === 'xy' ? 'b' : 'a',
      onChange: (state) => {
        const mode = state === 'a' ? 'yt' : 'xy';
        display.setMode(mode);
        if (scopeModule.setMode) scopeModule.setMode(mode);
      }
    });
    moduleFrame.appendToControls(modeToggle.createElement());
    
    // ─────────────────────────────────────────────────────────────────────────
    // CONEXIÓN DISPLAY ↔ MÓDULO CON SINCRONIZACIÓN
    // ─────────────────────────────────────────────────────────────────────────
    display.startRenderLoop();
    scopeModule.onData(data => display.draw(data));
    
    // ─────────────────────────────────────────────────────────────────────────
    // FREQUENCY METER (placeholder)
    // ─────────────────────────────────────────────────────────────────────────
    
    const freqMeterLayout = blueprint.layout.frequencyMeter;
    const freqMeterFrame = new ModuleFrame({
      id: 'frequency-meter',
      title: 'Frequency Meter',
      className: 'panel2-placeholder'
    });
    const freqMeterEl = freqMeterFrame.createElement();
    freqMeterEl.style.cssText = boxCss(requireBox(freqMeterLayout.box, 'panel 2 frequencyMeter'));
    applyModuleVisibility(freqMeterEl, blueprint, 'frequencyMeter');
    host.appendChild(freqMeterEl);
    
    // ─────────────────────────────────────────────────────────────────────────
    // OCTAVE FILTER BANK (8 knobs de frecuencia central)
    // ─────────────────────────────────────────────────────────────────────────

    const ofbLayout = blueprint.layout.octaveFilterBank || {};
    const ofbModuleUI = blueprint.modules?.octaveFilterBank?.ui || {};
    const ofbKnobGap = Array.isArray(ofbLayout.knobGap)
      ? toNum(ofbLayout.knobGap[0], 8)
      : toNum(ofbLayout.knobGap, 8);
    const ofbUIDefaults = {
      knobGap: ofbKnobGap,
      knobSize: ofbLayout.knobSize ?? 'sm',
      knobInnerPct: toNum(ofbLayout.knobInnerPct, 78),
      knobsRowOffset: resolveOffset(ofbLayout.knobsRowOffset, { x: 0, y: 0 }),
      knobOffsets: Array.isArray(ofbLayout.knobOffsets) ? ofbLayout.knobOffsets : []
    };
    const ofbUIConfig = {
      ...ofbUIDefaults,
      ...ofbModuleUI,
      knobGap: toNum(ofbModuleUI.knobGap, ofbUIDefaults.knobGap),
      knobSize: ofbModuleUI.knobSize ?? ofbUIDefaults.knobSize,
      knobInnerPct: toNum(ofbModuleUI.knobInnerPct, ofbUIDefaults.knobInnerPct),
      knobsRowOffset: resolveOffset(ofbModuleUI.knobsRowOffset, ofbUIDefaults.knobsRowOffset),
      knobOffsets: Array.isArray(ofbModuleUI.knobOffsets)
        ? ofbModuleUI.knobOffsets
        : ofbUIDefaults.knobOffsets,
      knobColor: ofbModuleUI.knobColor ?? ofbLayout.knobColor ?? 'blue',
      knobType: ofbModuleUI.knobType ?? ofbLayout.knobType ?? 'normal'
    };

    // Formato de etiquetas: "63", "125", ..., "1k", "2k", "4k", "8k"
    const ofbLabels = (ofbLayout.knobLabels || [63, 125, 250, 500, 1000, 2000, 4000, 8000])
      .map(f => f >= 1000 ? `${f / 1000}k` : String(f));

    // Sección contenedora
    const ofbSection = document.createElement('div');
    ofbSection.className = 'panel2-octave-filter-section';
    ofbSection.style.cssText = boxCss(requireBox(ofbLayout.box, 'panel 2 octaveFilterBank'));
    applyModuleVisibility(ofbSection, blueprint, 'octaveFilterBank');
    host.appendChild(ofbSection);

    // Módulo de audio (8 BiquadFilter nativos en paralelo, sin worklet)
    const ofbModule = new OctaveFilterBankModule(app.engine, octaveFilterBankConfig.id, {
      sourceKind: octaveFilterBankConfig.sourceKind,
      audio: octaveFilterBankConfig.audio,
      ramps: octaveFilterBankConfig.ramps,
      initialBandLevel: octaveFilterBankConfig.knobs.bandLevel.initial
    });
    app.engine.addModule(ofbModule);
    app.octaveFilterBank = ofbModule;

    // UI con knobs (reutiliza InputAmplifierUI con labels personalizados)
    const ofbBandTooltip = getOFBBandTooltipInfo(
      octaveFilterBankConfig.centerFrequencies,
      octaveFilterBankConfig.audio.levelLogBase
    );
    const ofbUI = new InputAmplifierUI({
      id: 'octave-filter-bank',
      title: 'Octave Filter Bank',
      channels: 8,
      knobLabels: ofbLabels,
      tooltipLabels: ofbLabels.map(l => `${l} Hz`),
      knobConfig: octaveFilterBankConfig.knobs.bandLevel,
      getTooltipInfo: ofbBandTooltip,
      layout: {
        knobGap: ofbUIConfig.knobGap,
        knobSize: ofbUIConfig.knobSize,
        knobInnerPct: ofbUIConfig.knobInnerPct,
        knobsRowOffset: ofbUIConfig.knobsRowOffset,
        knobOffsets: ofbUIConfig.knobOffsets,
        knobColor: ofbUIConfig.knobColor,
        knobType: ofbUIConfig.knobType
      },
      onLevelChange: (bandIndex, value) => {
        ofbModule.setBandLevel(bandIndex, value);
      }
    });

    ofbSection.appendChild(ofbUI.createElement());
    app._octaveFilterBankUI = ofbUI;
    
    // ─────────────────────────────────────────────────────────────────────────
    // INPUT AMPLIFIER LEVEL (8 canales de entrada)
    // ─────────────────────────────────────────────────────────────────────────

    const inputAmpLayout = blueprint.layout.inputAmplifierLevel || {};
    const inputAmpModuleUI = blueprint.modules?.inputAmplifierLevel?.ui || {};
    const inputAmpKnobGap = Array.isArray(inputAmpLayout.knobGap)
      ? toNum(inputAmpLayout.knobGap[0], toNum(inputAmpLayout.knobsGap, 8))
      : toNum(inputAmpLayout.knobGap, toNum(inputAmpLayout.knobsGap, 8));
    const inputAmpUIDefaults = {
      knobGap: inputAmpKnobGap,
      knobSize: inputAmpLayout.knobSize ?? 'sm',
      knobInnerPct: toNum(inputAmpLayout.knobInnerPct, 78),
      knobsRowOffset: resolveOffset(inputAmpLayout.knobsRowOffset, { x: 0, y: 0 }),
      knobOffsets: Array.isArray(inputAmpLayout.knobOffsets) ? inputAmpLayout.knobOffsets : []
    };
    const inputAmpModuleKnobGap = Array.isArray(inputAmpModuleUI.knobGap)
      ? toNum(inputAmpModuleUI.knobGap[0], inputAmpUIDefaults.knobGap)
      : toNum(inputAmpModuleUI.knobGap, inputAmpUIDefaults.knobGap);
    const inputAmpUIConfig = {
      ...inputAmpUIDefaults,
      ...inputAmpModuleUI,
      knobGap: inputAmpModuleKnobGap,
      knobSize: inputAmpModuleUI.knobSize ?? inputAmpUIDefaults.knobSize,
      knobInnerPct: toNum(inputAmpModuleUI.knobInnerPct, inputAmpUIDefaults.knobInnerPct),
      knobsRowOffset: resolveOffset(inputAmpModuleUI.knobsRowOffset, inputAmpUIDefaults.knobsRowOffset),
      knobOffsets: Array.isArray(inputAmpModuleUI.knobOffsets)
        ? inputAmpModuleUI.knobOffsets
        : inputAmpUIDefaults.knobOffsets,
      knobColor: inputAmpModuleUI.knobColor ?? inputAmpLayout.knobColor ?? 'white',
      knobType: inputAmpModuleUI.knobType ?? inputAmpLayout.knobType ?? 'normal'
    };
    
    // Crear sección para Input Amplifier Level
    const inputAmpSection = document.createElement('div');
    inputAmpSection.className = 'panel2-input-amp-section';
    inputAmpSection.style.cssText = boxCss(requireBox(inputAmpLayout.box, 'panel 2 inputAmplifierLevel'));
    host.appendChild(inputAmpSection);
    
    // Crear módulo de audio (channels y parámetros desde config)
    const inputAmpModule = new InputAmplifierModule(app.engine, 'input-amplifiers', {
      channels: inputAmplifierConfig.count,
      initialLevel: inputAmplifierConfig.knobs.level.initial,
      levelSmoothingTime: inputAmplifierConfig.audio.levelSmoothingTime
    });
    app.engine.addModule(inputAmpModule);
    app.inputAmplifiers = inputAmpModule;
    
    // Crear UI (título e id hardcoded, no del blueprint)
    const inputAmpUI = new InputAmplifierUI({
      id: 'input-amplifiers',
      title: 'Input Amplifier Level',
      channels: inputAmplifierConfig.count,
      knobConfig: inputAmplifierConfig.knobs.level,
      layout: {
        knobGap: inputAmpUIConfig.knobGap,
        knobSize: inputAmpUIConfig.knobSize,
        knobInnerPct: inputAmpUIConfig.knobInnerPct,
        knobsRowOffset: inputAmpUIConfig.knobsRowOffset,
        knobOffsets: inputAmpUIConfig.knobOffsets,
        knobColor: inputAmpUIConfig.knobColor,
        knobType: inputAmpUIConfig.knobType
      },
      onLevelChange: (channel, value) => {
        inputAmpModule.setLevel(channel, value);
        if (!inputAmplifierOSCSync.shouldIgnoreOSC()) {
          inputAmplifierOSCSync.sendLevelChange(channel, value);
        }
      }
    });
    
    inputAmpSection.appendChild(inputAmpUI.createElement());
    
    // Guardar referencia para serialización
    app._inputAmplifierUIs['input-amplifiers'] = inputAmpUI;
    
    // ─────────────────────────────────────────────────────────────────────────
    // EXTERNAL TREATMENT DEVICES (última fila, dos módulos lado a lado)
    // ─────────────────────────────────────────────────────────────────────────
    
    // ── Send Level ──
    const extSendFrame = new ModuleFrame({
      id: 'ext-treatment-send',
      title: 'Send Level',
      className: 'panel2-placeholder'
    });
    const extSendEl = extSendFrame.createElement();
    extSendEl.style.cssText = boxCss(requireBox(blueprint.layout.extTreatmentSend?.box, 'panel 2 extTreatmentSend'));
    applyModuleVisibility(extSendEl, blueprint, 'extTreatmentSend');
    host.appendChild(extSendEl);
    
    // ── Return Level ──
    const extReturnFrame = new ModuleFrame({
      id: 'ext-treatment-return',
      title: 'Return Level',
      className: 'panel2-placeholder'
    });
    const extReturnEl = extReturnFrame.createElement();
    extReturnEl.style.cssText = boxCss(requireBox(blueprint.layout.extTreatmentReturn?.box, 'panel 2 extTreatmentReturn'));
    applyModuleVisibility(extReturnEl, blueprint, 'extTreatmentReturn');
    host.appendChild(extReturnEl);
    
    // ─────────────────────────────────────────────────────────────────────────
    // GUARDAR REFERENCIAS
    // ─────────────────────────────────────────────────────────────────────────
    
    app._panel2Data = {
      host,
      scopeSection,
      moduleFrame,
      displayContainer,
      scopeModule,
      display,
      modeToggle,
      timeKnob,
      ampKnob,
      levelKnob,
      inputAmpSection,
      inputAmpModule,
      inputAmpUI,
      freqMeterFrame,
      ofbSection,
      ofbModule,
      ofbUI,
      extSendFrame,
      extReturnFrame
    };
    
    // Estado inicial
    app._panel2ScopeStarted = false;
    
    // Dibujar estado vacío inicial
    display.drawEmpty();
  }


export function setupOutputFaders(app) {
    const blueprint = panel7Blueprint;
    const layout = blueprint.layout;

    const channelUI = blueprint.outputChannelUI || {};
    const moduleOverrides = blueprint.modules || {};

    const toNum = (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };

    const resolveOffset = (offset, fallback = { x: 0, y: 0 }) => ({
      x: toNum(offset?.x, fallback.x),
      y: toNum(offset?.y, fallback.y)
    });

    const applyOffset = (el, offset, fallback = { x: 0, y: 0 }) => {
      if (!el) return;
      const resolved = resolveOffset(offset, fallback);
      if (resolved.x !== 0 || resolved.y !== 0) {
        el.style.transform = `translate(${resolved.x}px, ${resolved.y}px)`;
      }
    };

    const mergePanel7UI = (defaults, moduleUI = {}) => {
      return {
        ...defaults,
        ...moduleUI,
        padOffset: resolveOffset(moduleUI.padOffset, defaults.padOffset || { x: 0, y: 0 }),
        knobsOffset: resolveOffset(moduleUI.knobsOffset, defaults.knobsOffset || { x: 0, y: 0 }),
        switchesOffset: resolveOffset(moduleUI.switchesOffset, defaults.switchesOffset || { x: 0, y: 0 }),
        buttonsOffset: resolveOffset(moduleUI.buttonsOffset, defaults.buttonsOffset || { x: 0, y: 0 }),
        knobOffsets: Array.isArray(moduleUI.knobOffsets) ? moduleUI.knobOffsets : (defaults.knobOffsets || []),
        switchOffsets: Array.isArray(moduleUI.switchOffsets) ? moduleUI.switchOffsets : (defaults.switchOffsets || []),
        buttonOffsets: Array.isArray(moduleUI.buttonOffsets) ? moduleUI.buttonOffsets : (defaults.buttonOffsets || [])
      };
    };
    
    // Visibilidad de marcos de módulos (desde blueprint)
    if (blueprint.showFrames === false) {
      app.outputPanel.element.classList.add('hide-frames');
    }
    
    // Contenedor del layout: ocupa el panel entero; cada módulo va en su caja
    // absoluta { x, y, w, h } en px del panel (utils/panelBox.js).
    const panel7Layout = document.createElement('div');
    panel7Layout.id = 'panel7Layout';
    panel7Layout.className = 'panel7-layout';
    panel7Layout.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      z-index: 1;
    `;
    app.outputPanel.appendElement(panel7Layout);

    // ── Fila superior: Joystick Left | Sequencer | Joystick Right ──────
    const joystickLeftConfig = layout.joystickLeft;
    const joystickRightConfig = layout.joystickRight;
    const sequencerConfig = layout.sequencer;
    const joystickLeftBox = requireBox(joystickLeftConfig?.box, 'panel 7 joystickLeft');
    const sequencerBox = requireBox(sequencerConfig?.box, 'panel 7 sequencer');
    const joystickRightBox = requireBox(joystickRightConfig?.box, 'panel 7 joystickRight');
    const channelBoxes = layout.outputChannels?.boxes || [];
    channelBoxes.forEach((box, i) => requireBox(box, `panel 7 outputChannels[${i}]`));

    const buildJoystickDefaults = (joystickConfig) => ({
      ...joystickConfig,
      layoutGap: joystickConfig.layoutGap ?? 6,
      knobsGap: joystickConfig.knobsGap ?? 8,
      padSize: toNum(joystickConfig.padSize, 100),
      knobsOffset: resolveOffset(joystickConfig.knobsOffset, { x: 0, y: 0 }),
      padOffset: resolveOffset(joystickConfig.padOffset, { x: 0, y: 0 }),
      knobOffsets: Array.isArray(joystickConfig.knobOffsets) ? joystickConfig.knobOffsets : []
    });
    const joystickLeftDefaults = buildJoystickDefaults(joystickLeftConfig);
    const joystickRightDefaults = buildJoystickDefaults(joystickRightConfig);

    const sequencerDefaults = {
      ...sequencerConfig,
      contentPadding: sequencerConfig.contentPadding || { top: 4, right: 4, bottom: 4, left: 4 },
      rowsGap: sequencerConfig.rowsGap ?? 8,
      switchesGap: sequencerConfig.switchesGap ?? 4,
      buttonsGap: sequencerConfig.buttonsGap ?? 4,
      switchesOffset: resolveOffset(sequencerConfig.switchesOffset, { x: 0, y: 0 }),
      buttonsOffset: resolveOffset(sequencerConfig.buttonsOffset, { x: 0, y: 0 }),
      clockRateOffset: resolveOffset(
        sequencerConfig.clockRateOffset,
        sequencerConfig.clockRate?.rowOffset || { x: 0, y: 0 }
      ),
      clockRateKnobOffset: resolveOffset(
        sequencerConfig.clockRateKnobOffset,
        sequencerConfig.clockRate?.knobOffset || { x: 0, y: 0 }
      ),
      switchOffsets: Array.isArray(sequencerConfig.switchOffsets) ? sequencerConfig.switchOffsets : [],
      buttonOffsets: Array.isArray(sequencerConfig.buttonOffsets) ? sequencerConfig.buttonOffsets : [],
      clockRate: {
        label: sequencerConfig.clockRate?.label || 'Clock Rate',
        knobSize: sequencerConfig.clockRate?.knobSize || 'sm',
        rowOffset: resolveOffset(sequencerConfig.clockRate?.rowOffset, { x: 0, y: 0 }),
        knobOffset: resolveOffset(sequencerConfig.clockRate?.knobOffset, { x: 0, y: 0 })
      }
    };

    const joystickLeftUI = mergePanel7UI(joystickLeftDefaults, moduleOverrides.joystickLeft?.ui);
    const joystickRightUI = mergePanel7UI(joystickRightDefaults, moduleOverrides.joystickRight?.ui);
    const sequencerUI = mergePanel7UI(sequencerDefaults, moduleOverrides.sequencer?.ui);
    const sequencerClockOverride = moduleOverrides.sequencer?.ui?.clockRate || {};
    sequencerUI.clockRateOffset = resolveOffset(
      moduleOverrides.sequencer?.ui?.clockRateOffset,
      sequencerDefaults.clockRateOffset
    );
    sequencerUI.clockRateKnobOffset = resolveOffset(
      moduleOverrides.sequencer?.ui?.clockRateKnobOffset,
      sequencerDefaults.clockRateKnobOffset
    );
    sequencerUI.clockRate = {
      ...sequencerDefaults.clockRate,
      ...sequencerClockOverride,
      rowOffset: resolveOffset(sequencerClockOverride.rowOffset, sequencerDefaults.clockRate.rowOffset),
      knobOffset: resolveOffset(sequencerClockOverride.knobOffset, sequencerDefaults.clockRate.knobOffset)
    };

    // ── Inicializar módulos de audio de joystick ──────────────────────────
    const joyRamps = joystickConfig.defaults?.ramps || { position: 0.01, range: 0.05 };
    app._joystickModules = {
      left: new JoystickModule(app.engine, 'joystick-left', { ramps: joyRamps }),
      right: new JoystickModule(app.engine, 'joystick-right', { ramps: joyRamps })
    };

    // ── Inicializar módulo de audio del secuenciador ──────────────────────
    app._sequencerModule = new SequencerModule(app.engine, 'sequencer');

    // Wire sequencer display callbacks (display update function stored by _buildPanel4)
    if (app._sequencerDisplayUpdate) {
      const update = app._sequencerDisplayUpdate;
      const render = app._sequencerDisplayRender;
      app._sequencerModule.onCounterChange = (value, text) => update(value, text);
      app._sequencerModule.onReset = (value, text) => update(value, text);
      app._sequencerModule.onOverflow = (isOverflow) => {
        if (isOverflow) render('ofof');
      };
      app._sequencerModule.onTestMode = (active) => {
        if (active) render('CAll');
      };
    }

    // Escuchar cambio de formato del display del secuenciador desde Settings
    document.addEventListener('synth:seqDisplayFormatChange', (e) => {
      if (app._setSeqDisplayFormat) {
        app._setSeqDisplayFormat(e.detail.format);
      }
    });

    // Switch names → worklet switch IDs mapping
    const seqSwitchNames = ['abKey1', 'b', 'cdKey2', 'd', 'efKey3', 'f', 'key4', 'runClock'];
    const seqButtonNames = ['masterReset', 'runForward', 'runReverse', 'stop', 'resetSequence', 'stepForward', 'stepReverse', 'testOP'];

    // Joystick Left (knobs + pad conectados al módulo de audio)
    const joystickLeftFrame = new ModuleFrame({
      id: 'joystick-left',
      title: null,
      className: 'panel7-placeholder panel7-joystick'
    });
    const joystickLeftEl = joystickLeftFrame.createElement();
    applyBox(joystickLeftEl, joystickLeftBox);
    joystickLeftEl.dataset.moduleName = joystickConfig.left.title;

    const joyLeftContent = document.createElement('div');
    joyLeftContent.className = 'panel7-joystick-layout';
    joyLeftContent.style.gap = `${toNum(joystickLeftUI.layoutGap, 6)}px`;

    const joyLeftKnobs = document.createElement('div');
    joyLeftKnobs.className = 'panel7-joystick-knobs';
    joyLeftKnobs.style.gap = `${toNum(joystickLeftUI.knobsGap, 8)}px`;
    applyOffset(joyLeftKnobs, joystickLeftUI.knobsOffset);

    // Knob superior: Range Y
    const leftCfgY = joystickConfig.left.knobs.rangeY;
    const leftRangeYColorName = joystickLeftUI.knobColors?.[0] || 'yellow';
    const leftRangeYColor = COLOR_MAP[leftRangeYColorName] || KNOB_YELLOW;
    const leftRangeYType = joystickLeftUI.knobTypes?.[0] || 'normal';
    
    let leftRangeYSvgSrc = 'assets/knobs/knob.svg';
    if (leftRangeYType === 'bipolar') leftRangeYSvgSrc = 'assets/knobs/knob-0-center.svg';
    else if (leftRangeYType === 'vernier') leftRangeYSvgSrc = 'assets/knobs/vernier-dial.svg';

    const leftRangeYKnob = createKnob({
      size: joystickLeftUI.knobSize || 'sm',
      centerColor: leftRangeYColor,
      svgSrc: leftRangeYSvgSrc,
      showValue: false,
      initial: leftCfgY.initial / leftCfgY.max,
      scaleMin: leftCfgY.min,
      scaleMax: leftCfgY.max,
      pixelsForFullRange: leftCfgY.pixelsForFullRange,
      getTooltipInfo: app._getJoystickRangeTooltipInfo(app._joystickModules.left, 'y'),
      onChange: v => {
        app.ensureAudio();
        app._joystickModules.left.setRangeY(v * leftCfgY.max);
        if (!joystickOSCSync.shouldIgnoreOSC()) {
          joystickOSCSync.sendRangeYChange(0, v * leftCfgY.max);
        }
      }
    });
    leftRangeYKnob.knobInstance.tooltipLabel = 'Range Y';
    leftRangeYKnob.wrapper.dataset.knob = 'rangeY';
    applyOffset(leftRangeYKnob.wrapper, joystickLeftUI.knobOffsets?.[0]);
    joyLeftKnobs.appendChild(leftRangeYKnob.wrapper);

    // Knob inferior: Range X
    const leftCfgX = joystickConfig.left.knobs.rangeX;
    const leftRangeXColorName = joystickLeftUI.knobColors?.[1] || 'yellow';
    const leftRangeXColor = COLOR_MAP[leftRangeXColorName] || KNOB_YELLOW;
    const leftRangeXType = joystickLeftUI.knobTypes?.[1] || 'normal';
    
    let leftRangeXSvgSrc = 'assets/knobs/knob.svg';
    if (leftRangeXType === 'bipolar') leftRangeXSvgSrc = 'assets/knobs/knob-0-center.svg';
    else if (leftRangeXType === 'vernier') leftRangeXSvgSrc = 'assets/knobs/vernier-dial.svg';

    const leftRangeXKnob = createKnob({
      size: joystickLeftUI.knobSize || 'sm',
      centerColor: leftRangeXColor,
      svgSrc: leftRangeXSvgSrc,
      showValue: false,
      initial: leftCfgX.initial / leftCfgX.max,
      scaleMin: leftCfgX.min,
      scaleMax: leftCfgX.max,
      pixelsForFullRange: leftCfgX.pixelsForFullRange,
      getTooltipInfo: app._getJoystickRangeTooltipInfo(app._joystickModules.left, 'x'),
      onChange: v => {
        app.ensureAudio();
        app._joystickModules.left.setRangeX(v * leftCfgX.max);
        if (!joystickOSCSync.shouldIgnoreOSC()) {
          joystickOSCSync.sendRangeXChange(0, v * leftCfgX.max);
        }
      }
    });
    leftRangeXKnob.knobInstance.tooltipLabel = 'Range X';
    leftRangeXKnob.wrapper.dataset.knob = 'rangeX';
    applyOffset(leftRangeXKnob.wrapper, joystickLeftUI.knobOffsets?.[1]);
    joyLeftKnobs.appendChild(leftRangeXKnob.wrapper);
    joyLeftContent.appendChild(joyLeftKnobs);

    const joyLeftPad = document.createElement('div');
    joyLeftPad.className = 'panel7-joystick-pad';
    if (Number.isFinite(joystickLeftUI.padSize) && joystickLeftUI.padSize > 0) {
      joyLeftPad.style.width = `${joystickLeftUI.padSize}px`;
      joyLeftPad.style.height = `${joystickLeftUI.padSize}px`;
      joyLeftPad.style.maxWidth = `${joystickLeftUI.padSize}px`;
      joyLeftPad.style.maxHeight = `${joystickLeftUI.padSize}px`;
      joyLeftPad.style.flex = '0 0 auto';
    }
    applyOffset(joyLeftPad, joystickLeftUI.padOffset);
    setupJoystickPad(joyLeftPad, app._joystickModules.left, 0, app);
    joyLeftContent.appendChild(joyLeftPad);

    joystickLeftFrame.appendToContent(joyLeftContent);
    panel7Layout.appendChild(joystickLeftEl);
    
    // Sequencer Operational Control (placeholder con switches + botones)
    const sequencerFrame = new ModuleFrame({
      id: 'sequencer-control',
      title: null,
      className: 'panel7-placeholder panel7-sequencer'
    });
    const sequencerEl = sequencerFrame.createElement();
    applyBox(sequencerEl, sequencerBox);
    sequencerEl.dataset.moduleName = 'Sequencer';
    
    const seqContent = document.createElement('div');
    seqContent.className = 'panel7-sequencer-layout';
    const seqPad = sequencerUI.contentPadding || { top: 4, right: 4, bottom: 4, left: 4 };
    seqContent.style.padding = `${toNum(seqPad.top)}px ${toNum(seqPad.right)}px ${toNum(seqPad.bottom)}px ${toNum(seqPad.left)}px`;
    seqContent.style.gap = `${toNum(sequencerUI.rowsGap, 8)}px`;
    
    // Fila de switches
    const switchRow = document.createElement('div');
    switchRow.className = 'panel7-sequencer-switches';
    switchRow.style.gap = `${toNum(sequencerUI.switchesGap, 4)}px`;
    applyOffset(switchRow, sequencerUI.switchesOffset);
    for (const [idx, label] of sequencerConfig.switches.entries()) {
      const sw = document.createElement('div');
      sw.className = 'panel7-seq-switch';
      applyOffset(sw, sequencerUI.switchOffsets?.[idx]);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'output-channel__switch output-channel__switch--svg';
      btn.dataset.preventPan = 'true';
      const svgContainer = document.createElement('div');
      svgContainer.className = 'toggle-svg-container';
      btn.appendChild(svgContainer);
      // Wire toggle click → sequencer module
      const switchName = seqSwitchNames[idx];
      let switchState = switchName === 'runClock';  // runClock starts true
      let leverGroup = null;
      const getSwitchTitle = () => {
        if (switchName === 'runClock') return switchState ? 'Run Clock' : 'Stop Clock';
        return switchState ? `${label}: Play` : `${label}: Record`;
      };
      const updateLever = () => {
        if (!leverGroup) return;
        leverGroup.setAttribute('transform', switchState ? '' : 'translate(0,200) scale(1,-1)');
      };
      btn.title = '';
      const switchTooltip = attachControlTooltip(btn, getSwitchTitle());
      loadSvgInline('assets/knobs/toggle-switch.svg', svgContainer).then(({ svg, prefix }) => {
        if (svg) {
          leverGroup = svg.getElementById(`${prefix}toggle-lever`);
          updateLever();
        }
      });
      if (switchState) btn.classList.add('is-on');
      btn.addEventListener('click', () => {
        switchState = !switchState;
        btn.classList.toggle('is-on', switchState);
        updateLever();
        switchTooltip.update(getSwitchTitle());
        flashGlow(btn);
        app._sequencerModule?.setSwitch(switchName, switchState);
        sequencerOSCSync.sendSwitchChange(switchName, switchState);
      });
      btn.dataset.switchName = switchName;
      // Store switch UI reference for programmatic state updates
      if (!app._sequencerSwitchUIs) app._sequencerSwitchUIs = {};
      app._sequencerSwitchUIs[switchName] = {
        setState: (newState) => {
          switchState = newState;
          btn.classList.toggle('is-on', switchState);
          updateLever();
          switchTooltip.update(getSwitchTitle());
        }
      };
      sw.appendChild(btn);
      switchRow.appendChild(sw);
    }
    seqContent.appendChild(switchRow);
    
    // Fila de botones
    const buttonRow = document.createElement('div');
    buttonRow.className = 'panel7-sequencer-buttons';
    buttonRow.style.gap = `${toNum(sequencerUI.buttonsGap, 4)}px`;
    applyOffset(buttonRow, sequencerUI.buttonsOffset);
    for (const [idx, label] of sequencerConfig.buttons.entries()) {
      const btn = document.createElement('button');
      btn.className = 'panel7-seq-button';
      btn.type = 'button';
      btn.dataset.preventPan = 'true';
      applyOffset(btn, sequencerUI.buttonOffsets?.[idx]);
      attachControlTooltip(btn, label);
      // Wire button click → sequencer module
      const buttonName = seqButtonNames[idx];
      btn.addEventListener('click', () => {
        app._sequencerModule?.pressButton(buttonName);
        sequencerOSCSync.sendButtonPress(buttonName);
      });
      btn.dataset.buttonName = buttonName;
      buttonRow.appendChild(btn);
    }
    seqContent.appendChild(buttonRow);

    // Fila de knob central: Clock Rate
    const clockRow = document.createElement('div');
    clockRow.className = 'panel7-sequencer-clock';
    applyOffset(clockRow, sequencerUI.clockRateOffset || sequencerUI.clockRate?.rowOffset);

    const clockRateColorName = sequencerUI.clockRateKnobColor || 'black';
    const clockRateColor = COLOR_MAP[clockRateColorName] || KNOB_BLACK;
    const clockRateType = sequencerUI.clockRateKnobType || 'normal';

    let clockRateKnob;
    if (clockRateType === 'vernier') {
      const elements = createVernierElements({ showValue: false });
      const vernierSize = toNum(sequencerUI.clockRate?.knobSize === 'sm' ? 30 : 55, 30);
      elements.knobEl.style.width = `${vernierSize}px`;
      elements.knobEl.style.height = `${vernierSize}px`;
      const knobInstance = new VernierKnob(elements.knobEl, {
        min: 0, max: 1, initial: 0.5,
        scaleMin: 0, scaleMax: 10,
        pixelsForFullRange: 10000,
        scaleDecimals: 1
      });
      knobInstance.onChange = (v) => {
        const dial = v * 10;
        app._sequencerModule?.setClockRate(dial);
        sequencerOSCSync.sendKnobChange('clockRate', dial);
      };
      knobInstance.getTooltipInfo = getSequencerClockRateTooltipInfo();
      knobInstance.tooltipLabel = 'Clock Rate';
      clockRateKnob = { wrapper: elements.wrapper, knobInstance };
    } else {
      let clockRateSvgSrc = 'assets/knobs/knob.svg';
      if (clockRateType === 'bipolar') clockRateSvgSrc = 'assets/knobs/knob-0-center.svg';

      clockRateKnob = createKnob({
        label: sequencerUI.clockRate?.label || 'Clock Rate',
        size: sequencerUI.clockRate?.knobSize || 'sm',
        centerColor: clockRateColor,
        svgSrc: clockRateSvgSrc,
        showValue: false,
        initial: 0.5,
        getTooltipInfo: getSequencerClockRateTooltipInfo(),
        onChange: (v) => {
          const dial = v * 10;
          app._sequencerModule?.setClockRate(dial);
          sequencerOSCSync.sendKnobChange('clockRate', dial);
        }
      });
    }
    app._sequencerKnobs.clockRate = clockRateKnob.knobInstance;
    clockRateKnob.wrapper.classList.add('panel7-seq-clock-knob');
    clockRateKnob.wrapper.dataset.knob = 'clockRate';
    applyOffset(clockRateKnob.wrapper, sequencerUI.clockRateKnobOffset || sequencerUI.clockRate?.knobOffset);
    clockRow.appendChild(clockRateKnob.wrapper);
    seqContent.appendChild(clockRow);
    
    sequencerFrame.appendToContent(seqContent);
    applyModuleVisibility(sequencerEl, blueprint, 'sequencer');
    panel7Layout.appendChild(sequencerEl);
    
    // Joystick Right (knobs + pad conectados al módulo de audio, columnas invertidas)
    const joystickRightFrame = new ModuleFrame({
      id: 'joystick-right',
      title: null,
      className: 'panel7-placeholder panel7-joystick panel7-joystick-right'
    });
    const joystickRightEl = joystickRightFrame.createElement();
    applyBox(joystickRightEl, joystickRightBox);
    joystickRightEl.dataset.moduleName = joystickConfig.right.title;
    
    const joyRightContent = document.createElement('div');
    joyRightContent.className = 'panel7-joystick-layout';
    joyRightContent.style.gap = `${toNum(joystickRightUI.layoutGap, 6)}px`;
    
    const joyRightKnobs = document.createElement('div');
    joyRightKnobs.className = 'panel7-joystick-knobs';
    joyRightKnobs.style.gap = `${toNum(joystickRightUI.knobsGap, 8)}px`;
    applyOffset(joyRightKnobs, joystickRightUI.knobsOffset);

    // Knob superior: Range Y
    const rightCfgY = joystickConfig.right.knobs.rangeY;
    const rightRangeYColorName = joystickRightUI.knobColors?.[0] || 'yellow';
    const rightRangeYColor = COLOR_MAP[rightRangeYColorName] || KNOB_YELLOW;
    const rightRangeYType = joystickRightUI.knobTypes?.[0] || 'normal';
    
    let rightRangeYSvgSrc = 'assets/knobs/knob.svg';
    if (rightRangeYType === 'bipolar') rightRangeYSvgSrc = 'assets/knobs/knob-0-center.svg';
    else if (rightRangeYType === 'vernier') rightRangeYSvgSrc = 'assets/knobs/vernier-dial.svg';

    const rightRangeYKnob = createKnob({
      size: joystickRightUI.knobSize || 'sm',
      centerColor: rightRangeYColor,
      svgSrc: rightRangeYSvgSrc,
      showValue: false,
      initial: rightCfgY.initial / rightCfgY.max,
      scaleMin: rightCfgY.min,
      scaleMax: rightCfgY.max,
      pixelsForFullRange: rightCfgY.pixelsForFullRange,
      getTooltipInfo: app._getJoystickRangeTooltipInfo(app._joystickModules.right, 'y'),
      onChange: v => {
        app.ensureAudio();
        app._joystickModules.right.setRangeY(v * rightCfgY.max);
        if (!joystickOSCSync.shouldIgnoreOSC()) {
          joystickOSCSync.sendRangeYChange(1, v * rightCfgY.max);
        }
      }
    });
    rightRangeYKnob.knobInstance.tooltipLabel = 'Range Y';
    rightRangeYKnob.wrapper.dataset.knob = 'rangeY';
    applyOffset(rightRangeYKnob.wrapper, joystickRightUI.knobOffsets?.[0]);
    joyRightKnobs.appendChild(rightRangeYKnob.wrapper);

    // Knob inferior: Range X
    const rightCfgX = joystickConfig.right.knobs.rangeX;
    const rightRangeXColorName = joystickRightUI.knobColors?.[1] || 'yellow';
    const rightRangeXColor = COLOR_MAP[rightRangeXColorName] || KNOB_YELLOW;
    const rightRangeXType = joystickRightUI.knobTypes?.[1] || 'normal';
    
    let rightRangeXSvgSrc = 'assets/knobs/knob.svg';
    if (rightRangeXType === 'bipolar') rightRangeXSvgSrc = 'assets/knobs/knob-0-center.svg';
    else if (rightRangeXType === 'vernier') rightRangeXSvgSrc = 'assets/knobs/vernier-dial.svg';

    const rightRangeXKnob = createKnob({
      size: joystickRightUI.knobSize || 'sm',
      centerColor: rightRangeXColor,
      svgSrc: rightRangeXSvgSrc,
      showValue: false,
      initial: rightCfgX.initial / rightCfgX.max,
      scaleMin: rightCfgX.min,
      scaleMax: rightCfgX.max,
      pixelsForFullRange: rightCfgX.pixelsForFullRange,
      getTooltipInfo: app._getJoystickRangeTooltipInfo(app._joystickModules.right, 'x'),
      onChange: v => {
        app.ensureAudio();
        app._joystickModules.right.setRangeX(v * rightCfgX.max);
        if (!joystickOSCSync.shouldIgnoreOSC()) {
          joystickOSCSync.sendRangeXChange(1, v * rightCfgX.max);
        }
      }
    });
    rightRangeXKnob.knobInstance.tooltipLabel = 'Range X';
    rightRangeXKnob.wrapper.dataset.knob = 'rangeX';
    applyOffset(rightRangeXKnob.wrapper, joystickRightUI.knobOffsets?.[1]);
    joyRightKnobs.appendChild(rightRangeXKnob.wrapper);
    joyRightContent.appendChild(joyRightKnobs);
    
    const joyRightPad = document.createElement('div');
    joyRightPad.className = 'panel7-joystick-pad';
    if (Number.isFinite(joystickRightUI.padSize) && joystickRightUI.padSize > 0) {
      joyRightPad.style.width = `${joystickRightUI.padSize}px`;
      joyRightPad.style.height = `${joystickRightUI.padSize}px`;
      joyRightPad.style.maxWidth = `${joystickRightUI.padSize}px`;
      joyRightPad.style.maxHeight = `${joystickRightUI.padSize}px`;
      joyRightPad.style.flex = '0 0 auto';
    }
    applyOffset(joyRightPad, joystickRightUI.padOffset);
    setupJoystickPad(joyRightPad, app._joystickModules.right, 1, app);
    joyRightContent.appendChild(joyRightPad);
    
    joystickRightFrame.appendToContent(joyRightContent);
    panel7Layout.appendChild(joystickRightEl);

    // Guardar referencias de knobs para serialización
    app._joystickKnobs = {
      left: { rangeY: leftRangeYKnob, rangeX: leftRangeXKnob },
      right: { rangeY: rightRangeYKnob, rangeX: rightRangeXKnob }
    };

    // Mapa de UI para reinicio contextual (módulo + knobs + pad + config)
    app._joystickUIs = {
      'joystick-left': {
        module: app._joystickModules.left,
        knobs: app._joystickKnobs.left,
        padEl: joyLeftPad,
        config: joystickConfig.left
      },
      'joystick-right': {
        module: app._joystickModules.right,
        knobs: app._joystickKnobs.right,
        padEl: joyRightPad,
        config: joystickConfig.right
      }
    };
    
    // ── Fila inferior: Output Channels ─────────────────────────────────
    // Medidas interiores de los canales como CSS custom properties de cada
    // canal (no del contenedor: los interruptores del secuenciador usan las
    // mismas clases y heredarían, p. ej., --oc-button-scale).
    const contentPadding = channelUI.contentPadding || { top: 6, right: 4, bottom: 8, left: 4 };
    const sliderSize = channelUI.sliderSize || {};
    const buttonSize = channelUI.buttonSize || {};
    const knobGapValue = Array.isArray(channelUI.knobGap)
      ? toNum(channelUI.knobGap[0], 8)
      : toNum(channelUI.knobGap, 8);
    const shellW = toNum(sliderSize.shellWidth, 0);
    const ocVars = {
      '--oc-slider-height': `${toNum(sliderSize.height, 250)}px`,
      '--oc-slider-shell-height': `${toNum(sliderSize.shellHeight, 270)}px`,
      '--oc-slider-shell-width': shellW > 0 ? `${shellW}px` : '100%',
      '--oc-slider-width': `${toNum(sliderSize.width, 24)}px`,
      '--oc-knob-button-gap': `${toNum(channelUI.knobButtonGap, 2)}px`,
      '--oc-button-slider-gap': `${toNum(channelUI.buttonSliderGap, 2)}px`,
      '--oc-button-width': `${toNum(buttonSize.width, 18)}px`,
      '--oc-button-height': `${toNum(buttonSize.height, 30)}px`,
      '--oc-button-indicator-size': `${toNum(buttonSize.indicator, 8)}px`,
      '--oc-button-scale': `${toNum(buttonSize.scale, 1)}`,
      '--oc-knob-size': `${toNum(channelUI.knobSize, 42)}px`,
      '--oc-knob-inner-pct': `${toNum(channelUI.knobInnerPct, 78)}%`,
      '--oc-knob-gap': `${knobGapValue}px`,
      '--oc-knob-row-offset-x': `${toNum(channelUI.knobRowOffsetX, 0)}px`,
      '--oc-knob-row-offset-y': `${toNum(channelUI.knobRowOffsetY, 0)}px`,
      '--oc-content-padding':
        `${contentPadding.top}px ${contentPadding.right}px ${contentPadding.bottom}px ${contentPadding.left}px`
    };
    
    // Crear panel de output channels (channelCount viene del config, no del blueprint)
    app._outputChannelsPanel = new OutputChannelsPanel(app.engine, undefined, {
      knobColors: channelUI.knobColors,
      knobTypes: channelUI.knobTypes
    });
    app._outputChannelsPanel.createPanel(panel7Layout, channelBoxes);
    for (const channel of app._outputChannelsPanel.channels) {
      for (const [name, value] of Object.entries(ocVars)) {
        channel.frame.element.style.setProperty(name, value);
      }
    }
    
    // Mantener referencia como _outputFadersModule para compatibilidad con serialización
    app._outputFadersModule = app._outputChannelsPanel;
  }


export function setupJoystickPad(padEl, module, joyIndex = 0, app) {
    const handle = document.createElement('div');
    handle.className = 'joystick-handle';
    padEl.appendChild(handle);

    let tooltipEl = null;
    let padHideCallback = null; // Se asigna más abajo, tras definir las funciones que usa
    const showPadTooltip = () => {
      if (tooltipEl) return;
      // Ocultar otros tooltips (knobs, matrix, sliders) para evitar superposición
      hideOtherTooltips(padHideCallback);
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'knob-tooltip';
      tooltipEl.innerHTML = app._getJoystickPadTooltipContent(module);
      document.body.appendChild(tooltipEl);
      positionPadTooltip();
      tooltipEl.offsetHeight;
      tooltipEl.classList.add('is-visible');
    };

    const positionPadTooltip = () => {
      if (!tooltipEl) return;
      const rect = padEl.getBoundingClientRect();
      const ttRect = tooltipEl.getBoundingClientRect();

      let left = rect.left + rect.width / 2 - ttRect.width / 2;
      let top = rect.top - ttRect.height - 8;

      if (left < 4) left = 4;
      if (left + ttRect.width > window.innerWidth - 4) {
        left = window.innerWidth - ttRect.width - 4;
      }
      if (top < 4) {
        top = rect.bottom + 8;
      }

      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.top = `${top}px`;
    };

    const updatePadTooltip = () => {
      if (!tooltipEl) return;
      tooltipEl.innerHTML = app._getJoystickPadTooltipContent(module);
      positionPadTooltip();
    };

    const hidePadTooltip = () => {
      if (!tooltipEl) return;
      const tooltip = tooltipEl;
      tooltip.classList.remove('is-visible');
      setTimeout(() => {
        if (tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
      }, 150);
      tooltipEl = null;
    };

    let pointerActive = false;
    let hoverMouse = false;
    let tooltipAutoHideTimer = null;
    const TOOLTIP_AUTO_HIDE_DELAY = 3000; // 3s, igual que sliders
    const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const scheduleTooltipAutoHide = () => {
      if (tooltipAutoHideTimer) clearTimeout(tooltipAutoHideTimer);
      tooltipAutoHideTimer = setTimeout(() => {
        tooltipAutoHideTimer = null;
        hidePadTooltip();
        pointerActive = false;
        refreshPadGlow();
      }, TOOLTIP_AUTO_HIDE_DELAY);
    };

    const cancelTooltipAutoHide = () => {
      if (tooltipAutoHideTimer) {
        clearTimeout(tooltipAutoHideTimer);
        tooltipAutoHideTimer = null;
      }
    };

    const refreshPadGlow = () => {
      // tooltipAutoHideTimer: tras un tap táctil, el glow debe persistir durante
      // el periodo de auto-hide (3s) aunque otro handler limpie pointerActive.
      padEl.classList.toggle('is-tooltip-active', pointerActive || hoverMouse || !!tooltipAutoHideTimer);
    };

    // Callback de ocultación para tooltipManager (exclusión mutua con otros tooltips)
    padHideCallback = () => {
      cancelTooltipAutoHide();
      hidePadTooltip();
      pointerActive = false;
      refreshPadGlow();
    };
    registerTooltipHideCallback(padHideCallback);

    // Factor de escala visual: ~5/6 del recorrido total
    const handleScale = 0.83;
    const updateHandle = (nx, ny) => {
      const px = (nx * handleScale + 1) / 2;
      const py = (1 - ny * handleScale) / 2;
      handle.style.left = (px * 100) + '%';
      handle.style.top = (py * 100) + '%';
      handle.style.transform = 'translate(-50%, -50%)';
    };

    // ─────────────────────────────────────────────────────────────────────
    // Handle-only drag: solo permitir arrastre si el pointer toca el handle.
    // Si se toca la superficie del pad fuera del handle, solo se muestra
    // tooltip pero el handle no se mueve. Usa tracking relativo para
    // arrastre suave sin saltos.
    // ─────────────────────────────────────────────────────────────────────
    let handleGrabbed = false;
    let dragOffsetNx = 0;
    let dragOffsetNy = 0;
    let dragConfirmed = false; // touch: requiere movimiento mínimo
    let dragStartX = 0;
    let dragStartY = 0;
    const HANDLE_HIT_MARGIN = 8; // px extra alrededor del handle (32px + margen)
    const TOUCH_DRAG_THRESHOLD = 6; // px mínimo antes de confirmar drag (evita pinch)

    const pointerToNormalized = (ev) => {
      const rect = padEl.getBoundingClientRect();
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top) / rect.height;
      return {
        nx: Math.max(-1, Math.min(1, x * 2 - 1)),
        ny: Math.max(-1, Math.min(1, 1 - y * 2))
      };
    };

    const isPointerOnHandle = (ev) => {
      const handleRect = handle.getBoundingClientRect();
      const cx = handleRect.left + handleRect.width / 2;
      const cy = handleRect.top + handleRect.height / 2;
      const hitRadius = handleRect.width / 2 + HANDLE_HIT_MARGIN;
      const dx = ev.clientX - cx;
      const dy = ev.clientY - cy;
      return (dx * dx + dy * dy) <= (hitRadius * hitRadius);
    };

    const applyPosition = (nx, ny) => {
      const clampedNx = Math.max(-1, Math.min(1, nx / handleScale));
      const clampedNy = Math.max(-1, Math.min(1, ny / handleScale));
      module.setPosition(clampedNx, clampedNy);
      updateHandle(clampedNx, clampedNy);
      updatePadTooltip();
      if (!joystickOSCSync.shouldIgnoreOSC()) {
        joystickOSCSync.sendPositionChange(joyIndex, clampedNx, clampedNy);
      }
    };

    // ─────────────────────────────────────────────────────────────────────
    // Protección pinch: rastrear pointers activos en el pad. Si se detecta
    // un segundo dedo, cancelar drag y liberar captura del primero para
    // que el navegador pueda iniciar el gesto de zoom/pan.
    // ─────────────────────────────────────────────────────────────────────
    const activePointers = new Set();
    let capturedPointerId = null;
    let padTooltipDelayTimer = null;

    padEl.addEventListener('pointerdown', ev => {
      if (ev.button === 2) return; // Click derecho: no mover stick
      activePointers.add(ev.pointerId);
      // Protección pinch: si hay más de un dedo en el pad, cancelar
      if (activePointers.size > 1) {
        handleGrabbed = false;
        if (padTooltipDelayTimer) {
          clearTimeout(padTooltipDelayTimer);
          padTooltipDelayTimer = null;
        }
        if (capturedPointerId !== null) {
          try { padEl.releasePointerCapture(capturedPointerId); } catch { /* */ }
          capturedPointerId = null;
        }
        pointerActive = false;
        refreshPadGlow();
        hidePadTooltip();
        return;
      }
      ev.stopPropagation();
      ev.preventDefault();
      app.ensureAudio();
      cancelTooltipAutoHide();
      pointerActive = true;
      refreshPadGlow();
      // En táctil, retrasar tooltip para dar tiempo a detectar pinch
      if (ev.pointerType === 'touch') {
        if (padTooltipDelayTimer) clearTimeout(padTooltipDelayTimer);
        padTooltipDelayTimer = setTimeout(() => {
          padTooltipDelayTimer = null;
          if (activePointers.size <= 1 && !window.__synthNavGestureActive && !window.__synthPipGestureActive) {
            showPadTooltip();
          }
        }, 120);
      } else {
        showPadTooltip();
      }
      // Iniciar módulo de audio si no lo está
      if (!module.isStarted) module.start();
      // Comprobar si el pointer está sobre el handle
      handleGrabbed = isPointerOnHandle(ev);
      if (handleGrabbed) {
        padEl.setPointerCapture(ev.pointerId);
        capturedPointerId = ev.pointerId;
        // Guardar offset para tracking relativo (en espacio visual con handleScale)
        const pointer = pointerToNormalized(ev);
        dragOffsetNx = pointer.nx - module.getX() * handleScale;
        dragOffsetNy = pointer.ny - module.getY() * handleScale;
        // Touch: requiere movimiento mínimo antes de mover handle.
        // Esto da tiempo al segundo dedo del pinch para llegar sin
        // que los micro-movimientos del primer dedo muevan el handle.
        dragStartX = ev.clientX;
        dragStartY = ev.clientY;
        dragConfirmed = (ev.pointerType !== 'touch');
      }
    });

    padEl.addEventListener('pointermove', ev => {
      if (!handleGrabbed || ev.buttons === 0 || ev.buttons === 2) return;
      // Protección pinch: múltiples pointers locales O gesto de navegación/PiP global
      if (activePointers.size > 1 || window.__synthNavGestureActive || window.__synthPipGestureActive) {
        handleGrabbed = false;
        if (capturedPointerId !== null) {
          try { padEl.releasePointerCapture(capturedPointerId); } catch { /* */ }
          capturedPointerId = null;
        }
        if (padTooltipDelayTimer) {
          clearTimeout(padTooltipDelayTimer);
          padTooltipDelayTimer = null;
        }
        pointerActive = false;
        refreshPadGlow();
        hidePadTooltip();
        return;
      }
      ev.stopPropagation();
      ev.preventDefault();
      // Touch: no mover handle hasta superar umbral mínimo de movimiento.
      // Permite al segundo dedo del pinch llegar sin cambiar el valor.
      if (!dragConfirmed) {
        const dx = ev.clientX - dragStartX;
        const dy = ev.clientY - dragStartY;
        if (dx * dx + dy * dy < TOUCH_DRAG_THRESHOLD * TOUCH_DRAG_THRESHOLD) return;
        dragConfirmed = true;
      }
      // Aplicar posición relativa: pointer actual menos offset inicial
      const pointer = pointerToNormalized(ev);
      applyPosition(pointer.nx - dragOffsetNx, pointer.ny - dragOffsetNy);
    });

    padEl.addEventListener('pointerup', ev => {
      activePointers.delete(ev.pointerId);
      if (capturedPointerId === ev.pointerId) {
        try { padEl.releasePointerCapture(ev.pointerId); } catch { /* ya liberado */ }
        capturedPointerId = null;
      }
      handleGrabbed = false;
      // En táctil: mantener glow pulsante activo mientras el tooltip esté visible.
      // scheduleTooltipAutoHide() lo quitará tras 3s (igual que los knobs).
      // En desktop: quitar inmediatamente si no hay hover.
      if (ev.pointerType !== 'touch') {
        pointerActive = false;
        refreshPadGlow();
      }
      // Notificar interacción al soltar (una vez por gesto, para undo/redo)
      document.dispatchEvent(new CustomEvent('synth:userInteraction'));
      // Si el timer de tooltip estaba pendiente (tap rápido), mostrar ahora
      const tooltipWasPending = !!padTooltipDelayTimer;
      if (padTooltipDelayTimer) {
        clearTimeout(padTooltipDelayTimer);
        padTooltipDelayTimer = null;
      }
      if (tooltipWasPending && activePointers.size === 0) {
        showPadTooltip();
      }
      // En táctil: auto-ocultar tooltip tras 3s. En desktop: ocultar si no hay hover.
      if (isTouchDevice()) {
        scheduleTooltipAutoHide();
      } else if (!hoverMouse) {
        hidePadTooltip();
      }
    });

    padEl.addEventListener('pointercancel', ev => {
      activePointers.delete(ev.pointerId);
      if (padTooltipDelayTimer) {
        clearTimeout(padTooltipDelayTimer);
        padTooltipDelayTimer = null;
      }
      handleGrabbed = false;
      cancelTooltipAutoHide();
      pointerActive = false;
      refreshPadGlow();
      if (!hoverMouse) hidePadTooltip();
    });

    padEl.addEventListener('pointerenter', ev => {
      if (ev.pointerType === 'mouse') {
        hoverMouse = true;
        cancelTooltipAutoHide();
        refreshPadGlow();
        showPadTooltip();
        updatePadTooltip();
      }
    });

    // Forzar cierre del tooltip y cancelar drag cuando el viewport
    // detecta gesto de navegación (multi-touch, zoom a panel, etc.).
    document.addEventListener('synth:dismissTooltips', () => {
      if (padTooltipDelayTimer) {
        clearTimeout(padTooltipDelayTimer);
        padTooltipDelayTimer = null;
      }
      // Cancelar drag activo para que el handle no se mueva
      handleGrabbed = false;
      if (capturedPointerId !== null) {
        try { padEl.releasePointerCapture(capturedPointerId); } catch { /* */ }
        capturedPointerId = null;
      }
      cancelTooltipAutoHide();
      hidePadTooltip();
      pointerActive = false;
      refreshPadGlow();
    });

    padEl.addEventListener('pointerleave', ev => {
      if (ev.pointerType === 'mouse') {
        hoverMouse = false;
        if (ev.buttons === 0) {
          refreshPadGlow();
          hidePadTooltip();
          return;
        }
      }
      if (ev.buttons === 0) return;
      try { padEl.releasePointerCapture(ev.pointerId); } catch { /* ya liberado */ }
      pointerActive = false;
      refreshPadGlow();
      if (!hoverMouse) hidePadTooltip();
    });

    // Guardar referencia para poder actualizar el handle desde deserialización
    padEl._joystickUpdateHandle = updateHandle;

    updateHandle(0, 0);
  }


export function buildPanel4(app) {
    if (!app.panel4) return;

    const blueprint = panel4Blueprint;
    const toNum = (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };

    const knobUI = blueprint.panel4KnobUI || {};

    // Visibilidad de marcos de módulos (desde blueprint)
    if (blueprint.showFrames === false) {
      app.panel4.element.classList.add('hide-frames');
    }

    // Contenedor del layout: ocupa el panel entero; cada módulo va en su caja
    // absoluta { x, y, w, h } en px del panel (utils/panelBox.js).
    const host = document.createElement('div');
    host.id = 'panel4Layout';
    host.className = 'panel4-layout';
    host.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    `;
    app.panel4.appendElement(host);

    const layout = blueprint.layout;
    /** Caja de un módulo del layout (rompe al cargar si falta) */
    const boxOf = (moduleId) => requireBox(layout[moduleId]?.box, `panel 4 ${moduleId}`);

    // ─────────────────────────────────────────────────────────────────────────
    // FILA 1: 8 VOLTÍMETROS
    // ─────────────────────────────────────────────────────────────────────────

    const voltmeterBoxes = layout.voltmeters?.boxes || [];
    const voltmeterFrames = {};
    const voltmeters = {};
    for (let i = 1; i <= voltmeterBoxes.length; i++) {
      const vmId = `voltmeter${i}`;
      const frame = new ModuleFrame({
        id: `${vmId}-module`,
        title: null,
        className: 'panel4-placeholder panel4-voltmeter'
      });
      const el = frame.createElement();
      applyBox(el, requireBox(voltmeterBoxes[i - 1], `panel 4 voltmeters[${i - 1}]`));

      // Crear voltímetro funcional dentro del frame
      const vm = new Voltmeter({
        id: vmId,
        channelIndex: i - 1
      });
      frame.appendToContent(vm.createElement());

      applyModuleVisibility(el, blueprint, vmId);
      host.appendChild(el);
      voltmeterFrames[vmId] = frame;
      voltmeters[vmId] = vm;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FILA 2: SEQUENCER EVENT TIME
    // ─────────────────────────────────────────────────────────────────────────

    const seqFrame = new ModuleFrame({
      id: 'sequencerEventTime-module',
      title: null,
      className: 'panel4-placeholder panel4-sequencer-event-time'
    });
    const seqEl = seqFrame.createElement();
    applyBox(seqEl, boxOf('sequencerEventTime'));

    // ── LED display retro de 4 dígitos (7-segment real) ────────────────────
    const displayContainer = document.createElement('div');
    displayContainer.className = 'seq-event-time-display';
    const bezel = document.createElement('div');
    bezel.className = 'seq-event-time-display__bezel';

    const SEG_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const segDigits = [];
    for (let i = 0; i < 4; i++) {
      const digitEl = document.createElement('div');
      digitEl.className = 'seq-7seg';
      const segs = {};
      for (const name of SEG_NAMES) {
        const seg = document.createElement('div');
        seg.className = `seq-7seg__seg --${name}`;
        digitEl.appendChild(seg);
        segs[name] = seg;
      }
      bezel.appendChild(digitEl);
      segDigits.push(segs);
    }
    displayContainer.appendChild(bezel);
    seqFrame.appendToContent(displayContainer);

    // 7-segment character map: which segments are ON for each character
    //   a
    //  f b
    //   g
    //  e c
    //   d
    const SEG_MAP = {
      '0': 'abcdef', '1': 'bc',     '2': 'abdeg', '3': 'abcdg',
      '4': 'bcfg',   '5': 'acdfg',  '6': 'acdefg','7': 'abc',
      '8': 'abcdefg','9': 'abcdfg',
      'a': 'abcefg', 'b': 'cdefg',  'c': 'adeg',  'd': 'bcdeg',
      'e': 'adefg',  'f': 'aefg',
      'A': 'abcefg', 'B': 'cdefg',  'C': 'adef',  'D': 'bcdeg',
      'E': 'adefg',  'F': 'aefg',   'l': 'def',   'o': 'cdeg',
      ' ': ''
    };

    /** Set a single digit's segments ON/OFF */
    const setDigitChar = (segs, ch) => {
      const onSegs = SEG_MAP[ch] || '';
      for (const name of SEG_NAMES) {
        segs[name].classList.toggle('--on', onSegs.includes(name));
      }
    };

    /** Update display with leading zero suppression.
     *  @param {string} text - 4-char string to display (hex, decimal, or special)
     */
    const renderSeqDisplay = (text) => {
      const padded = (text || '0000').padStart(4, ' ').slice(-4);
      // Special strings shown as-is (no suppression)
      const isSpecial = padded === 'ofof' || padded === 'CAll';
      // Leading zero suppression + uppercase hex (A,C,E,F upper; b,d stay lower)
      let display = padded;
      if (!isSpecial) {
        const upper = padded.toUpperCase();
        display = '';
        let leadingZero = true;
        for (let i = 0; i < 4; i++) {
          const ch = upper[i];
          if (leadingZero && ch === '0' && i < 3) {
            display += ' ';
          } else {
            leadingZero = false;
            display += ch;
          }
        }
      }
      for (let i = 0; i < 4; i++) {
        setDigitChar(segDigits[i], display[i]);
      }
    };

    // Formato actual del display: 'decimal' (por defecto) o 'hex'
    let seqDisplayFormat = localStorage.getItem(STORAGE_KEYS.SEQUENCER_DISPLAY_FORMAT) || 'decimal';
    let lastCounterValue = 0;

    /** Formatea y muestra el counter según el formato actual */
    const updateSeqDisplay = (value, text) => {
      lastCounterValue = value;
      if (seqDisplayFormat === 'hex') {
        renderSeqDisplay(text);
      } else {
        renderSeqDisplay(String(value));
      }
    };

    /** Permite cambiar el formato en caliente desde ajustes */
    app._setSeqDisplayFormat = (format) => {
      seqDisplayFormat = format;
      const hex = lastCounterValue.toString(16).padStart(4, '0');
      updateSeqDisplay(lastCounterValue, hex);
    };

    // Initialize display
    renderSeqDisplay('   0');

    // Store for callback wiring
    app._sequencerDisplayUpdate = updateSeqDisplay;
    app._sequencerDisplayRender = renderSeqDisplay;

    applyModuleVisibility(seqEl, blueprint, 'sequencerEventTime');
    host.appendChild(seqEl);

    // ─────────────────────────────────────────────────────────────────────────
    // FILA 3: KEYBOARD OUTPUT RANGE (7 columnas)
    // ─────────────────────────────────────────────────────────────────────────

    const korFrames = {};

    // ── Helper: crear un knob estándar ───────────────────────────────────
    const createPanel4Knob = (knobDef) => {
      const centerColor = COLOR_MAP[knobDef.color] || '';
      
      let svgSrc;
      if (knobDef.type === 'bipolar') {
        svgSrc = 'assets/knobs/knob-0-center.svg';
      } else if (knobDef.type === 'vernier') {
        svgSrc = 'assets/knobs/vernier-dial.svg'; 
      }
      
      return createKnob({
        size: '',
        showValue: false,
        centerColor: centerColor,
        ...(svgSrc && { svgSrc })
      });
    };

    // ── Helper: crear un knob vernier ───────────────────────────────────
    const createPanel4Vernier = () => {
      const elements = createVernierElements({ showValue: false });
      const vernierSize = toNum(knobUI.vernierKnobSize, 55);
      elements.knobEl.style.width = `${vernierSize}px`;
      elements.knobEl.style.height = `${vernierSize}px`;
      const knobInstance = new VernierKnob(elements.knobEl, {
        min: 0, max: 1, initial: 0,
        scaleMin: 0, scaleMax: 10,
        pixelsForFullRange: 10000,
        scaleDecimals: 3
      });
      return { wrapper: elements.wrapper, knobInstance };
    };

    // ── Helper: crear un toggle ─────────────────────────────────────────
    const createPanel4Toggle = (toggleDef, moduleId, idx) => {
      const toggle = new Toggle({
        id: `${moduleId}-toggle-${idx}`,
        labelA: toggleDef.labelA || 'Off',
        labelB: toggleDef.labelB || 'On',
        name: toggleDef.name || '',
        initial: 'a'
      });
      return toggle;
    };

    // ── Helper: crear un selector rotativo ──────────────────────────────
    const createPanel4RotarySwitch = (switchDef, moduleId, idx) => {
      return new RotarySwitch({
        id: `${moduleId}-rotary-switch-${idx}`,
        labelA: switchDef.labelA || 'A',
        labelB: switchDef.labelB || 'B',
        name: switchDef.name || '',
        initial: 'a'
      });
    };

    // ── Colocación de cada mando dentro de la caja de su módulo ─────────
    // Cada mando lleva en el blueprint su centro { x, y } en px relativos a
    // la caja del módulo (la medida sobre la foto). Los mandos van en una
    // capa que cubre la caja entera: el marco tiene 1 px de borde, de ahí
    // el inset de −1 px.
    const stdKnobSize = toNum(knobUI.standardKnobSize, 45);
    const vernierKnobSize = toNum(knobUI.vernierKnobSize, 55);
    const ROTARY_SWITCH_SIZE = 32;   // cuerpo del selector (.rotary-switch__svg-container)
    const createControlsLayer = () => {
      const layer = document.createElement('div');
      layer.className = 'panel4-controls';
      layer.style.cssText = 'position: absolute; inset: -1px;';
      return layer;
    };
    const placeControl = (el, def, size, moduleId) => {
      if (!Number.isFinite(def?.x) || !Number.isFinite(def?.y)) {
        throw new Error(`[panel 4] ${moduleId}: falta el centro { x, y } del mando ${def?.name ?? ''}`);
      }
      el.style.position = 'absolute';
      el.style.left = `${def.x - size / 2}px`;
      el.style.top = `${def.y - size / 2}px`;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.minWidth = '0';
      el.style.flex = 'none';
    };

    // ── Columna 1: PVC + Envelope Followers (3 módulos apilados) ────────
    for (const subId of ['pitchVoltageConverter', 'envelopeFollower1', 'envelopeFollower2']) {
      const subDef = layout[subId];
      const frame = new ModuleFrame({
        id: `${subId}-module`,
        title: null,
        className: `panel4-placeholder panel4-${subId}`
      });
      const el = frame.createElement();
      applyBox(el, boxOf(subId));

      // Crear knobs del submódulo
      const knobsContainer = createControlsLayer();

      for (const knobDef of subDef.knobs) {
        if (knobDef.type === 'vernier') {
          const { wrapper, knobInstance } = createPanel4Vernier();
          placeControl(wrapper, knobDef, vernierKnobSize, subId);
          knobsContainer.appendChild(wrapper);
          // Capturar vernier del PVC para wiring posterior
          if (subId === 'pitchVoltageConverter') {
            app._pvcVernierInstance = knobInstance;
          }
        } else {
          const knob = createPanel4Knob(knobDef);
          const stdSize = toNum(knobUI.standardKnobSize, 45);
          knob.knobEl.style.width = `${stdSize}px`;
          knob.knobEl.style.height = `${stdSize}px`;
          const inner = knob.knobEl.querySelector('.knob-inner');
          if (inner) {
            const pct = toNum(knobUI.knobInnerPct, 76);
            inner.style.width = `${pct}%`;
            inner.style.height = `${pct}%`;
          }
          placeControl(knob.wrapper, knobDef, stdKnobSize, subId);
          knobsContainer.appendChild(knob.wrapper);
        }
      }

      frame.appendToContent(knobsContainer);
      applyModuleVisibility(el, blueprint, subId);
      host.appendChild(el);
      korFrames[subId] = frame;
    }

    // ── Helper: construir columna de teclado (Upper/Lower Keyboard) ─────
    const buildKeyboardColumn = (colId) => {
      const colLayout = layout[colId];
      const frame = new ModuleFrame({
        id: `${colId}-module`,
        title: null,
        className: `panel4-placeholder panel4-${colId}`
      });
      const el = frame.createElement();
      el.dataset.moduleName = colId === 'upperKeyboard' ? 'Upper Keyboard' : 'Lower Keyboard';
      applyBox(el, boxOf(colId));

      const content = createControlsLayer();

      // Knobs — guardar referencias para wiring posterior
      const knobElements = [];
      for (const knobDef of colLayout.knobs) {
        if (knobDef.type === 'vernier') {
          const { wrapper, knobInstance } = createPanel4Vernier();
          placeControl(wrapper, knobDef, vernierKnobSize, colId);
          content.appendChild(wrapper);
          knobElements.push({ type: 'vernier', knobInstance, wrapper });
        } else {
          const knob = createPanel4Knob(knobDef);
          const stdSize = toNum(knobUI.standardKnobSize, 45);
          knob.knobEl.style.width = `${stdSize}px`;
          knob.knobEl.style.height = `${stdSize}px`;
          const inner = knob.knobEl.querySelector('.knob-inner');
          if (inner) {
            const pct = toNum(knobUI.knobInnerPct, 76);
            inner.style.width = `${pct}%`;
            inner.style.height = `${pct}%`;
          }
          placeControl(knob.wrapper, knobDef, stdKnobSize, colId);
          content.appendChild(knob.wrapper);
          knobElements.push({ type: 'standard', knobEl: knob.knobEl, wrapper: knob.wrapper });
        }
      }

      // Switches — guardar referencias
      const switchElements = [];
      if (colLayout.switches) {
        for (let i = 0; i < colLayout.switches.length; i++) {
          const switchDef = colLayout.switches[i];
          const switchWrapper = document.createElement('div');
          switchWrapper.className = 'panel4-switch-wrapper';
          // Se coloca por el centro del cuerpo; las etiquetas, a los lados (CSS)
          placeControl(switchWrapper, switchDef, ROTARY_SWITCH_SIZE, colId);

          if (switchDef.type === 'rotarySwitch') {
            const rs = createPanel4RotarySwitch(switchDef, colId, i);
            switchWrapper.appendChild(rs.createElement());
            switchElements.push({ type: 'rotarySwitch', instance: rs });
          } else {
            // Fallback: toggle clásico
            const toggle = createPanel4Toggle(switchDef, colId, i);
            switchWrapper.style.transform = `scale(${toNum(knobUI.toggleScale, 0.7)})`;
            switchWrapper.appendChild(toggle.createElement());
            switchElements.push({ type: 'toggle', instance: toggle });
          }
          content.appendChild(switchWrapper);
        }
      }

      frame.appendToContent(content);
      applyModuleVisibility(el, blueprint, colId);
      return { el, frame, knobElements, switchElements };
    };

    // ── Columna 2: Upper Keyboard ───────────────────────────────────────
    const upperKb = buildKeyboardColumn('upperKeyboard');
    host.appendChild(upperKb.el);
    korFrames.upperKeyboard = upperKb.frame;

    // ── Columna 3: Lower Keyboard ───────────────────────────────────────
    const lowerKb = buildKeyboardColumn('lowerKeyboard');
    host.appendChild(lowerKb.el);
    korFrames.lowerKeyboard = lowerKb.frame;

    // ── Crear módulos de audio de los teclados ──────────────────────────
    const kbCfg = keyboardConfig;
    app._keyboardModules.upper = new KeyboardModule(
      app.engine, 'panel4-keyboard-upper', 'upper',
      { ramps: { level: kbCfg.ramps?.level || 0.06 } }
    );
    app._keyboardModules.lower = new KeyboardModule(
      app.engine, 'panel4-keyboard-lower', 'lower',
      { ramps: { level: kbCfg.ramps?.level || 0.06 } }
    );

    // ── Crear módulo de audio del PVC ───────────────────────────────────
    const pvcCfg = pitchToVoltageConverterConfig;
    app._pvcModule = new PitchToVoltageConverterModule(
      app.engine, 'panel4-pvc',
      { ramps: { level: pvcCfg.ramps?.level || 0.06 } }
    );

    // ── Conectar vernier del PVC al módulo de audio ─────────────────────
    if (app._pvcVernierInstance) {
      const pvcRangeCfg = pvcCfg.knobs?.range || {};
      const rMin = pvcRangeCfg.min ?? 0;
      const rMax = pvcRangeCfg.max ?? 10;
      const rInitial = pvcRangeCfg.initial ?? 7;
      const vernierInst = app._pvcVernierInstance;
      const toScale = (v, mn, mx) => mn + v * (mx - mn);

      vernierInst.value = (rInitial - rMin) / (rMax - rMin);
      vernierInst.initialValue = vernierInst.value;
      vernierInst.onChange = (value) => {
        const scaleValue = toScale(value, rMin, rMax);
        app._pvcModule.setRange(scaleValue);
        if (!pvcOSCSync.isIgnoring) {
          pvcOSCSync.sendChange('range', scaleValue);
        }
      };
      vernierInst.tooltipLabel = 'Range';
      vernierInst.getTooltipInfo = getPVCRangeTooltipInfo();
      vernierInst._updateVisual();
      app._pvcKnobs.range = vernierInst;
    }

    // ── Conectar knobs/switches del Panel 4 a los módulos de teclado ────
    const kbKnobs = kbCfg.knobs || {};
    const kbSwitches = kbCfg.switches || {};

    const wireKeyboardColumn = (kbResult, side) => {
      const mod = app._keyboardModules[side];
      if (!mod) return;

      const knobRefs = {};

      // Helper: convertir posición interna (0..1) a escala del dial
      const toScale = (internalVal, cfgMin, cfgMax) =>
        cfgMin + internalVal * (cfgMax - cfgMin);
      // Helper: convertir escala del dial a posición interna (0..1)
      const toInternal = (scaleVal, cfgMin, cfgMax) =>
        (scaleVal - cfgMin) / (cfgMax - cfgMin);

      // Knob 0: Pitch Spread (vernier) — rango de afinación
      if (kbResult.knobElements[0]?.type === 'vernier') {
        const vernierInst = kbResult.knobElements[0].knobInstance;
        const ps = kbKnobs.pitchSpread || {};
        const psMin = ps.min ?? 0;
        const psMax = ps.max ?? 10;
        const psInitial = ps.initial ?? 9;
        // Vernier ya tiene min=0, max=1, scaleMin=0, scaleMax=10
        vernierInst.value = toInternal(psInitial, psMin, psMax);
        vernierInst.initialValue = vernierInst.value;
        vernierInst.onChange = (value) => {
          const scaleValue = toScale(value, psMin, psMax);
          mod.setPitchSpread(scaleValue);
          if (!keyboardOSCSync.shouldIgnoreOSC()) {
            keyboardOSCSync.sendChange(side, 'pitchSpread', scaleValue);
          }
        };
        vernierInst.getTooltipInfo = getKeyboardPitchSpreadTooltipInfo();
        vernierInst.tooltipLabel = 'Pitch Spread';
        vernierInst._updateVisual();
        knobRefs.pitchSpread = vernierInst;
        if (kbResult.knobElements[0]?.wrapper) kbResult.knobElements[0].wrapper.dataset.knob = 'pitchSpread';
      }

      // Knob 1: Key Velocity (amarillo) — nivel de velocidad
      if (kbResult.knobElements[1]?.type === 'standard') {
        const vl = kbKnobs.velocityLevel || {};
        const vlMin = vl.min ?? -5;
        const vlMax = vl.max ?? 5;
        const vlInitial = vl.initial ?? 0;
        const vlKnob = new Knob(kbResult.knobElements[1].knobEl, {
          min: 0,
          max: 1,
          initial: toInternal(vlInitial, vlMin, vlMax),
          pixelsForFullRange: 150,
          scaleMin: vlMin,
          scaleMax: vlMax,
          scaleDecimals: 1,
          angleOffset: -150,
          getTooltipInfo: getKeyboardVelocityTooltipInfo(),
          tooltipLabel: 'Key Velocity',
          onChange: (value) => {
            const scaleValue = toScale(value, vlMin, vlMax);
            mod.setVelocityLevel(scaleValue);
            if (!keyboardOSCSync.shouldIgnoreOSC()) {
              keyboardOSCSync.sendChange(side, 'velocityLevel', scaleValue);
            }
          }
        });
        knobRefs.velocityLevel = vlKnob;
        if (kbResult.knobElements[1]?.wrapper) kbResult.knobElements[1].wrapper.dataset.knob = 'velocityLevel';
      }

      // Knob 2: Env. Control (blanco) — nivel de gate
      if (kbResult.knobElements[2]?.type === 'standard') {
        const gl = kbKnobs.gateLevel || {};
        const glMin = gl.min ?? -5;
        const glMax = gl.max ?? 5;
        const glInitial = gl.initial ?? 0;
        const glKnob = new Knob(kbResult.knobElements[2].knobEl, {
          min: 0,
          max: 1,
          initial: toInternal(glInitial, glMin, glMax),
          pixelsForFullRange: 150,
          scaleMin: glMin,
          scaleMax: glMax,
          scaleDecimals: 1,
          angleOffset: -150,
          getTooltipInfo: getKeyboardGateTooltipInfo(),
          tooltipLabel: 'Env. Control',
          onChange: (value) => {
            const scaleValue = toScale(value, glMin, glMax);
            mod.setGateLevel(scaleValue);
            if (!keyboardOSCSync.shouldIgnoreOSC()) {
              keyboardOSCSync.sendChange(side, 'gateLevel', scaleValue);
            }
          }
        });
        knobRefs.gateLevel = glKnob;
        if (kbResult.knobElements[2]?.wrapper) kbResult.knobElements[2].wrapper.dataset.knob = 'gateLevel';
      }

      // Switch 0: Retrigger (rotarySwitch)
      //   State A (On)  = mode 1 (Key Release or New Pitch)
      //   State B (Kbd)  = mode 0 (Retrigger Key Release)
      if (kbResult.switchElements[0]?.type === 'rotarySwitch') {
        const rsInst = kbResult.switchElements[0].instance;
        const rtrInitial = kbSwitches.retrigger?.initial ?? 0;
        rsInst.setState(rtrInitial === 1 ? 'a' : 'b');
        rsInst.onChange = (state) => {
          const mode = state === 'a' ? 1 : 0;
          mod.setRetrigger(mode);
          if (!keyboardOSCSync.shouldIgnoreOSC()) {
            keyboardOSCSync.sendChange(side, 'retrigger', mode);
          }
        };
        knobRefs.retrigger = rsInst;
      }

      app._keyboardKnobs[side] = knobRefs;
    };

    wireKeyboardColumn(upperKb, 'upper');
    wireKeyboardColumn(lowerKb, 'lower');

    // ── Escuchar eventos MIDI de teclado (desde midiLearnManager) ───────
    document.addEventListener('synth:keyboardMIDI', (e) => {
      const { keyboardId, type, note, velocity } = e.detail;
      const side = keyboardId === 'keyboard-upper' ? 'upper' : 'lower';
      const kbModule = app._keyboardModules[side];
      if (!kbModule) return;

      // Evitar bucle: si el evento viene de OSC, no reenviar por OSC
      if (keyboardOSCSync.shouldIgnoreOSC()) return;

      // Lazy start: arranca el módulo solo si no está iniciado
      if (!kbModule.isStarted) {
        kbModule.start();
      }

      if (type === 'noteon' && velocity > 0) {
        kbModule.noteOn(note, velocity);
        keyboardOSCSync.sendNoteOn(side, note, velocity);
      } else {
        // noteoff o noteon con velocity 0
        kbModule.noteOff(note);
        keyboardOSCSync.sendNoteOff(side, note);
      }
    });

    // ── Columnas 4-7: Sequencer Section ────────────────────────────────
    // Arriba Sequencer Output Range × 3 e Invertor/Buffer + Key 4; debajo
    // Slew Limiter × 3 y Option 1. Cada uno en su caja.

    // ── Helper: map knob name → sequencer param name ───────────────────
    const seqKnobNameMap = {
      'Voltage A': 'voltageA', 'Voltage B': 'voltageB', 'Voltage C': 'voltageC',
      'Voltage D': 'voltageD', 'Voltage E': 'voltageE', 'Voltage F': 'voltageF',
      'Key 1': 'key1', 'Key 2': 'key2', 'Key 3': 'key3', 'Key 4': 'key4'
    };
    const seqVoltageTooltip = getSequencerVoltageLevelTooltipInfo();
    const seqKeyTooltip = getSequencerKeyLevelTooltipInfo();
    const getSeqKnobTooltip = (pName) => pName?.startsWith('key') ? seqKeyTooltip : seqVoltageTooltip;

    // ── Helper: módulo con knobs apilados verticalmente (enlazados al
    //    secuenciador por su nombre, si lo son)
    const buildKnobColumn = (colId) => {
      const colDef = layout[colId];
      const frame = new ModuleFrame({
        id: `${colId}-module`,
        title: null,
        className: `panel4-placeholder panel4-${colId}`
      });
      const el = frame.createElement();
      if (colDef.knobs.some(k => seqKnobNameMap[k.name])) el.dataset.moduleName = 'Sequencer';
      applyBox(el, boxOf(colId));

      const knobsContainer = createControlsLayer();

      for (const knobDef of colDef.knobs) {
        const paramName = seqKnobNameMap[knobDef.name];
        if (knobDef.type === 'vernier') {
          const { wrapper, knobInstance } = createPanel4Vernier();
          if (paramName && knobInstance) {
            app._sequencerKnobs[paramName] = knobInstance;
            knobInstance.onChange = (v) => {
              const dial = v * 10;
              app._sequencerModule?.setKnob(paramName, dial);
              sequencerOSCSync.sendKnobChange(paramName, dial);
            };
            knobInstance.getTooltipInfo = getSeqKnobTooltip(paramName);
            knobInstance.tooltipLabel = knobDef.name;
          }
          if (paramName) wrapper.dataset.knob = paramName;
          placeControl(wrapper, knobDef, vernierKnobSize, colId);
          knobsContainer.appendChild(wrapper);
        } else {
          const isBipolar = knobDef.type === 'bipolar';
          const knob = createKnob({
            size: '',
            showValue: false,
            centerColor: COLOR_MAP[knobDef.color] || '',
            svgSrc: isBipolar ? 'assets/knobs/knob-0-center.svg' : undefined,
            min: 0,
            max: 1,
            initial: isBipolar ? 0.5 : 0,
            scaleMin: isBipolar ? -5 : 0,
            scaleMax: isBipolar ? 5 : 10,
            angleOffset: isBipolar ? -150 : undefined,
            getTooltipInfo: paramName ? getSeqKnobTooltip(paramName) : undefined,
            onChange: paramName ? (v) => {
              const dial = isBipolar ? (v - 0.5) * 10 : v * 10;
              app._sequencerModule?.setKnob(paramName, dial);
              sequencerOSCSync.sendKnobChange(paramName, dial);
            } : undefined
          });
          if (paramName && knob.knobInstance) {
            app._sequencerKnobs[paramName] = knob.knobInstance;
            knob.knobInstance.tooltipLabel = knobDef.name;
          }
          const stdSize = toNum(knobUI.standardKnobSize, 45);
          knob.knobEl.style.width = `${stdSize}px`;
          knob.knobEl.style.height = `${stdSize}px`;
          const inner = knob.knobEl.querySelector('.knob-inner');
          if (inner) {
            const pct = toNum(knobUI.knobInnerPct, 76);
            inner.style.width = `${pct}%`;
            inner.style.height = `${pct}%`;
          }
          if (paramName) knob.wrapper.dataset.knob = paramName;
          placeControl(knob.wrapper, knobDef, stdKnobSize, colId);
          knobsContainer.appendChild(knob.wrapper);
        }
      }

      frame.appendToContent(knobsContainer);
      applyModuleVisibility(el, blueprint, colId);
      host.appendChild(el);
      korFrames[colId] = frame;
    };

    for (const colId of ['seqOutputRangeL1', 'seqOutputRangeL2', 'seqOutputRangeL3', 'invertorBuffer', 'key4']) {
      buildKnobColumn(colId);
    }

    // ── Slew Limiters × 3 + Option 1 (marcos de un solo knob) ──────────
    for (const modId of ['slewLimiter1', 'slewLimiter2', 'slewLimiter3', 'option1']) {
      const modDef = layout[modId];
      const frame = new ModuleFrame({
        id: `${modId}-module`,
        title: null,
        className: `panel4-placeholder panel4-${modId}`
      });
      const el = frame.createElement();
      applyBox(el, boxOf(modId));

      const knobsContainer = createControlsLayer();

      for (const knobDef of modDef.knobs) {
        const knob = createPanel4Knob(knobDef);
        const stdSize = toNum(knobUI.standardKnobSize, 45);
        knob.knobEl.style.width = `${stdSize}px`;
        knob.knobEl.style.height = `${stdSize}px`;
        const inner = knob.knobEl.querySelector('.knob-inner');
        if (inner) {
          const pct = toNum(knobUI.knobInnerPct, 76);
          inner.style.width = `${pct}%`;
          inner.style.height = `${pct}%`;
        }
        placeControl(knob.wrapper, knobDef, stdKnobSize, modId);
        knobsContainer.appendChild(knob.wrapper);
      }

      frame.appendToContent(knobsContainer);
      applyModuleVisibility(el, blueprint, modId);
      host.appendChild(el);
      korFrames[modId] = frame;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GUARDAR REFERENCIAS
    // ─────────────────────────────────────────────────────────────────────────

    app._panel4Data = {
      host,
      voltmeterFrames,
      voltmeters,
      seqFrame,
      korFrames
    };
  }


export function buildOscillatorPanel(panelIndex, panel, panelAudio, app) {
    if (!panel) return;

    // Contenedor principal: ocupa el panel entero; cada módulo va en su caja
    // absoluta { x, y, w, h } en px del panel (utils/panelBox.js).
    const host = document.createElement('div');
    host.id = `panel${panelIndex}Layout`;
    host.className = 'panel3-layout';
    
    // Visibilidad de marcos de módulos (desde blueprint)
    if (panel3Blueprint?.showFrames === false) {
      host.classList.add('hide-frames');
    }
    panel.appendElement(host);

    const oscUIDefaults = getOscillatorUIDefaults();

    // Slots de osciladores: cada uno con su caja en el blueprint
    // (oscIndex 0-based; la UI usa index 1-based).
    const oscillatorSlots = (panel3Blueprint?.oscillatorSlots || []).map(slot => ({
      index: slot.oscIndex + 1,
      box: requireBox(slot.box, `panel 3 osc ${slot.oscIndex + 1}`),
      slotUI: slot.ui || null     // overrides de UI por oscilador
    }));

    const oscComponents = oscillatorSlots.map(slot => {
      const oscIndex = slot.index - 1;  // Convertir de 1-based a 0-based
      const knobOptions = app._getPanelKnobOptions(panelIndex, oscIndex);
      const oscId = `panel${panelIndex}-osc-${slot.index}`;
      
      // Resolver UI para este oscilador: defaults + overrides del slot
      const oscUI = resolveOscillatorUI(oscUIDefaults, slot.slotUI);
      
      const osc = new SGME_Oscillator({
        id: oscId,
        title: `Osc ${slot.index}`,
        size: { width: slot.box.w, height: slot.box.h },
        knobGap: oscUI.knobGap,
        buttonSize: oscUI.buttonSize,
        buttonScale: oscUI.buttonScale,
        switchOffset: oscUI.switchOffset,
        knobSize: oscUI.knobSize,
        knobRowOffsetX: oscUI.knobRowOffsetX,
        knobRowOffsetY: oscUI.knobRowOffsetY,
        knobInnerPct: oscUI.knobInnerPct,
        knobOffsets: oscUI.knobOffsets,
        knobOptions,
        // Callback para recalcular frecuencia cuando cambia el switch HI/LO
        onRangeChange: (rangeState) => app._onOscRangeChange(panelIndex, oscIndex, rangeState)
      });
      const el = osc.createElement();
      applyBox(el, slot.box);
      
      // Añadir data-attribute para dormancy debug (solo Panel 3 usa índices 0-8)
      if (panelIndex === 3) {
        el.dataset.oscIndex = String(slot.index - 1);
      }
      
      host.appendChild(el);
      
      // Guardar referencia para serialización
      app._oscillatorUIs[oscId] = osc;
      
      return { osc, element: el, slot, oscIndex };
    });
    
    // ─────────────────────────────────────────────────────────────────────
    // SINCRONIZAR ESTADO DE AUDIO CON VALORES INICIALES DE UI
    // ─────────────────────────────────────────────────────────────────────
    // Los knobs se inicializan con valores de la config (ej: freq dial=5).
    // Debemos sincronizar el estado de audio para que coincida con la UI.
    // NO creamos nodos de audio aquí (eso se hace lazy en la matriz).
    // Solo actualizamos el estado interno que se usará cuando se creen los nodos.
    // ─────────────────────────────────────────────────────────────────────
    oscComponents.forEach(({ osc, oscIndex }) => {
      app._syncOscillatorStateFromUI(panelIndex, oscIndex, osc);
    });

    // Fila inferior: ruidos y Random CV (solo para Panel 3), cada uno en su
    // caja del blueprint, colgando del panel igual que los osciladores.
    let noiseModules = null;
    let noiseAudioModules = null;
    let randomCVAudio = null;
    
    if (panelIndex === 3) {
      const bottomLayout = panel3Blueprint?.layout || {};
      const placeBottomModule = (el, name, ui) => {
        applyBox(el, requireBox(bottomLayout[name]?.box, `panel 3 ${name}`));
        const pad = ui.padding;
        if (pad) el.style.padding = `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`;
        host.appendChild(el);
      };
      
      // Leer configuración de módulos desde los configs de módulos
      const noiseDefaults = noiseConfig.defaults || {};
      const noise1Cfg = noiseConfig.noise1 || {};
      const noise2Cfg = noiseConfig.noise2 || {};
      const randomCVCfg = randomVoltageConfig || {};
      
      // ─────────────────────────────────────────────────────────────────────
      // Crear módulos de audio para Noise Generators
      // Los módulos se inicializan bajo demanda cuando el usuario interactúa
      // con la matriz (después del user gesture que activa el AudioContext)
      // ─────────────────────────────────────────────────────────────────────
      const noise1Audio = new NoiseModule(app.engine, noise1Cfg.id || 'noise-1', {
        initialColour: noise1Cfg.knobs?.colour?.initial ?? 5,
        initialLevel: noise1Cfg.knobs?.level?.initial ?? 0,
        levelSmoothingTime: noise1Cfg.audio?.levelSmoothingTime ?? noiseDefaults.levelSmoothingTime ?? 0.03,
        colourSmoothingTime: noise1Cfg.audio?.colourSmoothingTime ?? noiseDefaults.colourSmoothingTime ?? 0.01,
        colourFilter: noiseConfig.colourFilter,
        levelCurve: noiseConfig.levelCurve,
        ramps: noiseDefaults.ramps
      });
      
      const noise2Audio = new NoiseModule(app.engine, noise2Cfg.id || 'noise-2', {
        initialColour: noise2Cfg.knobs?.colour?.initial ?? 5,
        initialLevel: noise2Cfg.knobs?.level?.initial ?? 0,
        levelSmoothingTime: noise2Cfg.audio?.levelSmoothingTime ?? noiseDefaults.levelSmoothingTime ?? 0.03,
        colourSmoothingTime: noise2Cfg.audio?.colourSmoothingTime ?? noiseDefaults.colourSmoothingTime ?? 0.01,
        colourFilter: noiseConfig.colourFilter,
        levelCurve: noiseConfig.levelCurve,
        ramps: noiseDefaults.ramps
      });
      
      // NO llamar start() aquí - se hace lazy en _handlePanel5AudioToggle
      // cuando el usuario hace click en la matriz (después del user gesture)
      
      noiseAudioModules = { noise1: noise1Audio, noise2: noise2Audio };
      
      // Aplicar estado inicial de filter bypass (mismo setting que output channels).
      // Leemos de localStorage porque settingsModal aún no se ha creado en este punto.
      const savedBypass = localStorage.getItem(STORAGE_KEYS.FILTER_BYPASS_ENABLED);
      const bypassEnabled = savedBypass === null ? true : savedBypass === 'true';
      noise1Audio.setFilterBypassEnabled(bypassEnabled);
      noise2Audio.setFilterBypassEnabled(bypassEnabled);
      
      // ─────────────────────────────────────────────────────────────────────
      // Crear UI con callbacks vinculados a audio
      // ─────────────────────────────────────────────────────────────────────
      
      // Tooltips para knobs del noise generator
      const cf = noiseConfig.colourFilter || {};
      const noiseTau = (cf.potResistance || 10000) * (cf.capacitance || 33e-9);
      const noiseFc = 1 / (Math.PI * noiseTau);  // LP fc(-3dB) ≈ 965 Hz
      const noiseColourTooltip = getNoiseColourTooltipInfo(noiseFc);
      const lc = noiseConfig.levelCurve || {};
      const noiseLevelTooltip = getNoiseLevelTooltipInfo(3.0, lc.logBase || 100);
      
      // Resolver UI config del blueprint para noise generators
      const noiseUIDefaults = getNoiseUIDefaults();
      const noise1BlueprintUI = panel3Blueprint?.modules?.noise1?.ui || {};
      const noise2BlueprintUI = panel3Blueprint?.modules?.noise2?.ui || {};
      const noise1UI = resolveModuleUI(noiseUIDefaults, noise1BlueprintUI);
      const noise2UI = resolveModuleUI(noiseUIDefaults, noise2BlueprintUI);

      // Noise Generator 1 UI
      const noise1Id = noise1Cfg.id || 'panel3-noise-1';
      const noise1 = new NoiseGenerator({
        id: noise1Id,
        title: noise1Cfg.title || 'Noise 1',
        knobOptions: {
          colour: {
            ...noise1Cfg.knobs?.colour,
            onChange: (value) => {
              noise1Audio.setColour(value);
              if (!noiseGeneratorOSCSync.shouldIgnoreOSC()) {
                noiseGeneratorOSCSync.sendColourChange(0, value);
              }
            },
            getTooltipInfo: noiseColourTooltip
          },
          level: {
            ...noise1Cfg.knobs?.level,
            onChange: (value) => {
              noise1Audio.setLevel(value);
              if (!noiseGeneratorOSCSync.shouldIgnoreOSC()) {
                noiseGeneratorOSCSync.sendLevelChange(0, value);
              }
            },
            getTooltipInfo: noiseLevelTooltip
          }
        },
        ...noise1UI
      });
      placeBottomModule(noise1.createElement(), 'noise1', noise1UI);
      app._noiseUIs[noise1Id] = noise1;
      
      // Noise Generator 2 UI
      const noise2Id = noise2Cfg.id || 'panel3-noise-2';
      const noise2 = new NoiseGenerator({
        id: noise2Id,
        title: noise2Cfg.title || 'Noise 2',
        knobOptions: {
          colour: {
            ...noise2Cfg.knobs?.colour,
            onChange: (value) => {
              noise2Audio.setColour(value);
              if (!noiseGeneratorOSCSync.shouldIgnoreOSC()) {
                noiseGeneratorOSCSync.sendColourChange(1, value);
              }
            },
            getTooltipInfo: noiseColourTooltip
          },
          level: {
            ...noise2Cfg.knobs?.level,
            onChange: (value) => {
              noise2Audio.setLevel(value);
              if (!noiseGeneratorOSCSync.shouldIgnoreOSC()) {
                noiseGeneratorOSCSync.sendLevelChange(1, value);
              }
            },
            getTooltipInfo: noiseLevelTooltip
          }
        },
        ...noise2UI
      });
      placeBottomModule(noise2.createElement(), 'noise2', noise2UI);
      app._noiseUIs[noise2Id] = noise2;
      
      // ─────────────────────────────────────────────────────────────────────
      // Random Control Voltage Generator (placa PC-21, D100-21 C1)
      // ─────────────────────────────────────────────────────────────────────
      
      // Crear módulo de audio
      const rvgAudioConfig = randomVoltageConfig.audio || {};
      const rvgLevelCurve = randomVoltageConfig.levelCurve || {};
      const rvgRamps = randomVoltageConfig.ramps || {};
      randomCVAudio = new RandomCVModule(app.engine, 'panel3-random-cv', {
        levelCurve: { logBase: rvgLevelCurve.logBase || 100 },
        ramps: { level: rvgRamps.level || 0.06, mean: rvgRamps.mean || 0.05 }
      });
      
      // Tooltips para knobs del Random CV
      const rvgMeanTooltip = getRandomCVMeanTooltipInfo(rvgAudioConfig.voltsPerOctave || 0.55);
      const rvgVarianceTooltip = getRandomCVVarianceTooltipInfo();
      const rvgVoltageLevelTooltip = getRandomCVVoltageLevelTooltipInfo(
        rvgAudioConfig.maxVoltage || 2.5, rvgLevelCurve.logBase || 100
      );
      const rvgKeyTooltip = getRandomCVKeyTooltipInfo(
        (rvgAudioConfig.keyPulseWidth || 0.005) * 1000
      );
      
      // Resolver UI config del blueprint para random CV
      const randomCVUIDefaults = getRandomCVUIDefaults();
      const randomCVBlueprintUI = panel3Blueprint?.modules?.randomCV?.ui || {};
      const randomCVResolvedUI = resolveModuleUI(randomCVUIDefaults, randomCVBlueprintUI);
      
      const randomCVId = randomCVCfg.id || 'panel3-random-cv';
      const randomCV = new RandomVoltage({
        id: randomCVId,
        title: randomCVCfg.title || 'Random Control Voltage',
        knobOptions: {
          mean: {
            ...randomCVCfg.knobs?.mean,
            onChange: (value) => {
              randomCVAudio.setMean(value);
              if (!randomCVOSCSync.shouldIgnoreOSC()) {
                randomCVOSCSync.sendChange('mean', value);
              }
            },
            getTooltipInfo: rvgMeanTooltip
          },
          variance: {
            ...randomCVCfg.knobs?.variance,
            onChange: (value) => {
              randomCVAudio.setVariance(value);
              if (!randomCVOSCSync.shouldIgnoreOSC()) {
                randomCVOSCSync.sendChange('variance', value);
              }
            },
            getTooltipInfo: rvgVarianceTooltip
          },
          voltage1: {
            ...randomCVCfg.knobs?.voltage1,
            onChange: (value) => {
              randomCVAudio.setVoltage1Level(value);
              if (!randomCVOSCSync.shouldIgnoreOSC()) {
                randomCVOSCSync.sendChange('voltage1', value);
              }
            },
            getTooltipInfo: rvgVoltageLevelTooltip
          },
          voltage2: {
            ...randomCVCfg.knobs?.voltage2,
            onChange: (value) => {
              randomCVAudio.setVoltage2Level(value);
              if (!randomCVOSCSync.shouldIgnoreOSC()) {
                randomCVOSCSync.sendChange('voltage2', value);
              }
            },
            getTooltipInfo: rvgVoltageLevelTooltip
          },
          key: {
            ...randomCVCfg.knobs?.key,
            onChange: (value) => {
              randomCVAudio.setKeyLevel(value);
              if (!randomCVOSCSync.shouldIgnoreOSC()) {
                randomCVOSCSync.sendChange('key', value);
              }
            },
            getTooltipInfo: rvgKeyTooltip
          }
        },
        ...randomCVResolvedUI
      });
      app._randomVoltageUIs[randomCVId] = randomCV;
      const randomCVEl = randomCV.createElement();
      applyModuleVisibility(randomCVEl, panel3Blueprint, 'randomCV');
      placeBottomModule(randomCVEl, 'randomCV', randomCVResolvedUI);
      
      noiseModules = { noise1, noise2, randomCV };
    }

    // Guardar datos del panel (los usan el ruteo, la dormancia y OSC)
    app[`_panel${panelIndex}LayoutData`] = {
      host,
      oscillatorSlots,
      oscComponents,
      noiseModules,
      noiseAudioModules,
      randomCVAudio
    };
    panelAudio.nodes = new Array(oscComponents.length).fill(null);
  }


export function initSignalFlowHighlighter(app) {
    const signalFlowBinding = keyboardShortcuts.get('signalFlow');
    
    app._signalFlowHighlighter = new SignalFlowHighlighter({
      panel5Routing: app._panel3Routing,
      panel6Routing: app._panel6Routing,
      matrixAudio: app.largeMatrixAudio,
      matrixControl: app.largeMatrixControl
    });
    
    // Configurar la tecla modificadora según el shortcut
    if (signalFlowBinding?.key) {
      app._signalFlowHighlighter.setModifierKey(signalFlowBinding.key);
    }
    
    app._signalFlowHighlighter.init();
    
    // Escuchar cambios de tecla modificadora desde settings
    document.addEventListener('synth:signalFlowKeyChanged', (e) => {
      if (e.detail?.key) {
        app._signalFlowHighlighter.setModifierKey(e.detail.key);
      }
    });
    
    // Escuchar cambios de modo (con/sin modificador) desde settings
    document.addEventListener('synth:signalFlowModeChanged', (e) => {
      if (typeof e.detail?.requireModifier === 'boolean') {
        app._signalFlowHighlighter.setRequireModifier(e.detail.requireModifier);
      }
    });
    
    // Escuchar activación/desactivación desde settings
    document.addEventListener('synth:signalFlowEnabledChanged', (e) => {
      if (typeof e.detail?.enabled === 'boolean') {
        app._signalFlowHighlighter.setEnabled(e.detail.enabled);
      }
    });
  }


export function buildLargeMatrices(app) {
    app.panel5MatrixEl = app.panel5.addSection({ id: 'panel5Matrix', type: 'matrix' });
    app.panel6MatrixEl = app.panel6.addSection({ id: 'panel6Matrix', type: 'matrix' });

    // El marco de cada matriz en su caja, en px del panel (utils/panelBox.js).
    const LARGE_MATRIX_BOX_PANEL5 = requireBox(panel5AudioBlueprint.ui.box, 'panel 5: marco de la matriz');
    const LARGE_MATRIX_BOX_PANEL6 = requireBox(panel6ControlBlueprint.ui.box, 'panel 6: marco de la matriz');

    // Compile blueprints to get routing maps for tooltips and hidden pins
    const panel5Maps = compilePanelBlueprintMappings(panel5AudioBlueprint);
    const panel6Maps = compilePanelBlueprintMappings(panel6ControlBlueprint);

    const { hiddenCols: HIDDEN_COLS_PANEL5, hiddenRows: HIDDEN_ROWS_PANEL5 } = panel5Maps;
    const { hiddenCols: HIDDEN_COLS_PANEL6, hiddenRows: HIDDEN_ROWS_PANEL6 } = panel6Maps;

    // Función para determinar color por defecto dinámico (osciloscopio = RED)
    const getPanel5DefaultColor = (row, col) => {
      const dest = panel5Maps.destMap.get(col);
      if (dest?.kind === 'oscilloscope') return 'RED';
      return null;  // Usa el default del panel (WHITE)
    };
    
    const getPanel6DefaultColor = (row, col) => {
      const dest = panel6Maps.destMap.get(col);
      if (dest?.kind === 'oscilloscope') return 'RED';
      return null;  // Usa el default del panel (GREEN)
    };

    app.largeMatrixAudio = new LargeMatrix(app.panel5MatrixEl, {
      rows: panel5AudioBlueprint.grid.rows,
      cols: panel5AudioBlueprint.grid.cols,
      box: LARGE_MATRIX_BOX_PANEL5,
      hiddenCols: HIDDEN_COLS_PANEL5,
      hiddenRows: HIDDEN_ROWS_PANEL5,
      sourceMap: panel5Maps.sourceMap,
      destMap: panel5Maps.destMap,
      panelId: 'panel-5',
      defaultPinColor: 'WHITE',  // Audio: pin blanco por defecto
      getDefaultPinColor: getPanel5DefaultColor
    });

    app.largeMatrixControl = new LargeMatrix(app.panel6MatrixEl, {
      rows: panel6ControlBlueprint.grid.rows,
      cols: panel6ControlBlueprint.grid.cols,
      box: LARGE_MATRIX_BOX_PANEL6,
      hiddenCols: HIDDEN_COLS_PANEL6,
      hiddenRows: HIDDEN_ROWS_PANEL6,
      sourceMap: panel6Maps.sourceMap,
      destMap: panel6Maps.destMap,
      panelId: 'panel-6',
      defaultPinColor: 'GREEN',  // Control: pin verde por defecto
      getDefaultPinColor: getPanel6DefaultColor
    });

    app.largeMatrixAudio.build();
    app.largeMatrixControl.build();
    
    // ─────────────────────────────────────────────────────────────────────────
    // PIN CONTEXT DETECTION
    // ─────────────────────────────────────────────────────────────────────────
    // Determina el contexto de un pin para usar el color correcto.
    // Contextos: 'audio', 'control', 'oscilloscope'
    //
    app.largeMatrixAudio.getPinContext = (row, col) => {
      const dest = panel5Maps.destMap.get(col);
      if (dest?.kind === 'oscilloscope') return 'oscilloscope';
      return 'audio';
    };
    
    app.largeMatrixControl.getPinContext = (row, col) => {
      const dest = panel6Maps.destMap.get(col);
      if (dest?.kind === 'oscilloscope') return 'oscilloscope';
      return 'control';
    };
    
    // ─────────────────────────────────────────────────────────────────────────
    // PIN COLOR CHANGE CALLBACK
    // ─────────────────────────────────────────────────────────────────────────
    // Cuando el usuario cambia el color de un pin activo, actualizar:
    // 1. La frecuencia de corte del filtro RC (emula cambio de resistencia)
    // 2. La ganancia (fórmula de tierra virtual Rf/Rpin)
    //
    app.largeMatrixAudio.onPinColorChange = (row, col, newColor, btn) => {
      const key = `${row}:${col}`;
      const conn = app._panel3Routing?.connections?.[key];
      
      if (conn) {
        const dest = app._panel3Routing?.destMap?.get(col);
        const currentTime = app.engine.audioCtx.currentTime;
        
        // Actualizar filtro RC
        updatePinFilter(conn.filter, newColor, currentTime);
        conn.pinColor = newColor;
        
        // Actualizar ganancia
        const newGain = app._getPanel5PinGain(row, col, dest, newColor);
        conn.gain.gain.setValueAtTime(newGain, currentTime);
        log.info(` Panel 5: Pin color changed [${row}:${col}] → ${newColor} (gain: ${newGain.toFixed(3)}, fc: ${PIN_CUTOFF_FREQUENCIES[newColor]?.toFixed(0)} Hz)`);
        
        // Enviar cambio de color via OSC
        if (!matrixOSCSync.shouldIgnoreOSC()) {
          matrixOSCSync.sendAudioPinChange(row, col, true, newColor);
        }
      }
    };
    
    app.largeMatrixControl.onPinColorChange = (row, col, newColor, btn) => {
      const key = `${row}:${col}`;
      const conn = app._panel6Routing?.connections?.[key];
      
      if (conn) {
        const dest = app._panel6Routing?.destMap?.get(col);
        const currentTime = app.engine.audioCtx.currentTime;
        
        // Actualizar filtro RC
        updatePinFilter(conn.filter, newColor, currentTime);
        conn.pinColor = newColor;
        
        // Actualizar ganancia
        const newGain = app._getPanel6PinGain(row, col, dest, newColor);
        conn.gain.gain.setValueAtTime(newGain, currentTime);
        log.info(` Panel 6: Pin color changed [${row}:${col}] → ${newColor} (gain: ${newGain.toFixed(3)}, fc: ${PIN_CUTOFF_FREQUENCIES[newColor]?.toFixed(0)} Hz)`);
        
        // Enviar cambio de color via OSC
        if (!matrixOSCSync.shouldIgnoreOSC()) {
          matrixOSCSync.sendControlPinChange(row, col, true, newColor);
        }
      }
    };
    
    // ─────────────────────────────────────────────────────────────────────────
    // INACTIVE PINS VISIBILITY
    // ─────────────────────────────────────────────────────────────────────────
    // Apply initial preference for inactive pins (dim by default).
    // Listen for changes to update in real-time.
    //
    const savedShowInactive = localStorage.getItem(STORAGE_KEYS.SHOW_INACTIVE_PINS) === 'true';
    app.largeMatrixAudio.setShowInactivePins(savedShowInactive);
    app.largeMatrixControl.setShowInactivePins(savedShowInactive);
    
    document.addEventListener('synth:showInactivePinsChange', (e) => {
      const show = e.detail?.show ?? false;
      app.largeMatrixAudio?.setShowInactivePins(show);
      app.largeMatrixControl?.setShowInactivePins(show);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // MATRIX PIN TOOLTIPS
    // ─────────────────────────────────────────────────────────────────────────
    // Attach tooltip system to both matrices.
    // Tooltips show "Source → Destination" on hover (desktop) or tap (mobile).
    // Uses sourceMap/destMap from compiled blueprints for label generation.
    //
    const tooltip = getSharedTooltip();
    tooltip.attachToMatrix(app.panel5MatrixEl, {
      sourceMap: panel5Maps.sourceMap,
      destMap: panel5Maps.destMap,
      rowBase: panel5Maps.rowBase,
      colBase: panel5Maps.colBase
    });
    tooltip.attachToMatrix(app.panel6MatrixEl, {
      sourceMap: panel6Maps.sourceMap,
      destMap: panel6Maps.destMap,
      rowBase: panel6Maps.rowBase,
      colBase: panel6Maps.colBase
    });
  }

