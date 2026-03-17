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
  envelopeShaperConfig
} from './configs/index.js';

import { SynthiFilterModule }           from './modules/synthiFilter.js';
import { SpringReverbModule }           from './modules/springReverb.js';
import { RingModulatorModule }          from './modules/ringModulator.js';
import { EnvelopeShaperModule }         from './modules/envelopeShaper.js';
import { InputAmplifierModule }         from './modules/inputAmplifier.js';
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
  getEnvelopeShaperModeTooltipInfo
} from './utils/tooltipUtils.js';

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
    const applyOffset = (el, offset, fallback = { x: 0, y: 0 }) => {
      if (!el) return;
      const resolved = resolveOffset(offset, fallback);
      if (resolved.x !== 0 || resolved.y !== 0) {
        el.style.transform = `translate(${resolved.x}px, ${resolved.y}px)`;
      }
    };
    // Config de osciloscopio (oscilloscopeConfig) se usa internamente en OscilloscopeDisplay
    
    // Visibilidad de marcos de módulos (desde blueprint)
    if (blueprint.showFrames === false) {
      app.panel2.element.classList.add('hide-frames');
    }
    
    // Crear contenedor principal
    const host = document.createElement('div');
    host.id = 'panel2Layout';
    host.className = 'panel2-layout';
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
      transform: translate(${offset.x}px, ${offset.y}px);
    `;
    app.panel2.appendElement(host);
    
    // ─────────────────────────────────────────────────────────────────────────
    // OSCILLOSCOPE (módulo funcional, toma el espacio restante)
    // ─────────────────────────────────────────────────────────────────────────
    
    const scopeLayout = blueprint.layout.oscilloscope;
    const scopeSize = scopeLayout.size;
    const scopeOffset = scopeLayout.offset || { x: 0, y: 0 };
    const oscUIConfig = blueprint.modules?.oscilloscope?.ui || {};
    
    const scopeSection = document.createElement('div');
    scopeSection.className = 'panel2-oscilloscope-section';
    scopeSection.style.cssText = `
      width: ${scopeSize.width}px;
      height: ${scopeSize.height}px;
      box-sizing: border-box;
      margin-bottom: ${blueprint.layout.gap ?? 6}px;
    `;
    applyOffset(scopeSection, scopeOffset);
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
    const freqMeterSize = freqMeterLayout.size;
    const freqMeterFrame = new ModuleFrame({
      id: 'frequency-meter',
      title: 'Frequency Meter',
      className: 'panel2-placeholder'
    });
    const freqMeterEl = freqMeterFrame.createElement();
    freqMeterEl.style.cssText = `
      width: ${freqMeterSize.width}px;
      height: ${freqMeterSize.height}px;
      box-sizing: border-box;
      margin-bottom: ${blueprint.layout.gap ?? 6}px;
    `;
    applyOffset(freqMeterEl, freqMeterLayout.offset);
    applyModuleVisibility(freqMeterEl, blueprint, 'frequencyMeter');
    host.appendChild(freqMeterEl);
    
    // ─────────────────────────────────────────────────────────────────────────
    // OCTAVE FILTER BANK (placeholder)
    // ─────────────────────────────────────────────────────────────────────────
    
    const octaveFilterLayout = blueprint.layout.octaveFilterBank;
    const octaveFilterSize = octaveFilterLayout.size;
    const octaveFilterFrame = new ModuleFrame({
      id: 'octave-filter-bank',
      title: 'Octave Filter Bank',
      className: 'panel2-placeholder'
    });
    const octaveFilterEl = octaveFilterFrame.createElement();
    octaveFilterEl.style.cssText = `
      width: ${octaveFilterSize.width}px;
      height: ${octaveFilterSize.height}px;
      box-sizing: border-box;
      margin-bottom: ${blueprint.layout.gap ?? 6}px;
    `;
    applyOffset(octaveFilterEl, octaveFilterLayout.offset);
    applyModuleVisibility(octaveFilterEl, blueprint, 'octaveFilterBank');
    host.appendChild(octaveFilterEl);
    
    // ─────────────────────────────────────────────────────────────────────────
    // INPUT AMPLIFIER LEVEL (8 canales de entrada)
    // ─────────────────────────────────────────────────────────────────────────

    const inputAmpLayout = blueprint.layout.inputAmplifierLevel || {};
    const inputAmpModuleUI = blueprint.modules?.inputAmplifierLevel?.ui || {};
    const inputAmpKnobGap = Array.isArray(inputAmpLayout.knobGap)
      ? toNum(inputAmpLayout.knobGap[0], toNum(inputAmpLayout.knobsGap, 8))
      : toNum(inputAmpLayout.knobGap, toNum(inputAmpLayout.knobsGap, 8));
    const inputAmpUIDefaults = {
      offset: resolveOffset(inputAmpLayout.offset, { x: 0, y: 0 }),
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
      offset: resolveOffset(inputAmpModuleUI.offset, inputAmpUIDefaults.offset),
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
    const inputAmpSize = inputAmpLayout.size || { width: 730, height: 90 };
    inputAmpSection.style.cssText = `
      width: ${inputAmpSize.width}px;
      height: ${inputAmpSize.height}px;
      box-sizing: border-box;
      margin-bottom: ${blueprint.layout.gap ?? 6}px;
    `;
    applyOffset(inputAmpSection, inputAmpUIConfig.offset);
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
    
    const extRow = blueprint.layout.externalTreatmentRow;
    const extRowGap = toNum(extRow?.gap, 6);
    
    // Contenedor de fila (flex horizontal)
    const extRowSection = document.createElement('div');
    extRowSection.className = 'panel2-ext-treatment-row';
    extRowSection.style.cssText = `
      display: flex;
      gap: ${extRowGap}px;
      box-sizing: border-box;
    `;
    host.appendChild(extRowSection);
    
    // ── Send Level ──
    const extSendLayout = extRow?.extTreatmentSend || {};
    const extSendSize = extSendLayout.size || { width: 362, height: 60 };
    const extSendFrame = new ModuleFrame({
      id: 'ext-treatment-send',
      title: 'Send Level',
      className: 'panel2-placeholder'
    });
    const extSendEl = extSendFrame.createElement();
    extSendEl.style.cssText = `
      width: ${extSendSize.width}px;
      height: ${extSendSize.height}px;
      box-sizing: border-box;
    `;
    applyOffset(extSendEl, extSendLayout.offset);
    applyModuleVisibility(extSendEl, blueprint, 'extTreatmentSend');
    extRowSection.appendChild(extSendEl);
    
    // ── Return Level ──
    const extReturnLayout = extRow?.extTreatmentReturn || {};
    const extReturnSize = extReturnLayout.size || { width: 362, height: 60 };
    const extReturnFrame = new ModuleFrame({
      id: 'ext-treatment-return',
      title: 'Return Level',
      className: 'panel2-placeholder'
    });
    const extReturnEl = extReturnFrame.createElement();
    extReturnEl.style.cssText = `
      width: ${extReturnSize.width}px;
      height: ${extReturnSize.height}px;
      box-sizing: border-box;
    `;
    applyOffset(extReturnEl, extReturnLayout.offset);
    applyModuleVisibility(extReturnEl, blueprint, 'extTreatmentReturn');
    extRowSection.appendChild(extReturnEl);
    
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
      octaveFilterFrame,
      extSendFrame,
      extReturnFrame
    };
    
    // Estado inicial
    app._panel2ScopeStarted = false;
    
    // Dibujar estado vacío inicial
    display.drawEmpty();
  }

