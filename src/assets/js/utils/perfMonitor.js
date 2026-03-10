import { createLogger } from './logger.js';

const log = createLogger('PerfMonitor');

const PERF_STORAGE_KEY = 'synthigme-perf-monitor-enabled';
const PERF_QUERY_KEYS = ['perf', 'profile'];
const MAX_MARKS = 500;
const MAX_SAMPLES = 240;
const MAX_SCENARIOS = 80;

const state = {
  enabled: false,
  marks: [],
  counters: new Map(),
  durations: new Map(),
  scenarios: [],
  activeScenarios: new Map(),
  lastScenario: null,
  longTasks: {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    samples: []
  },
  longTaskObserver: null,
  sessionStart: 0
};

function now() {
  return performance.now();
}

function trimArray(arr, max) {
  while (arr.length > max) arr.shift();
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function cloneJsonSafe(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function percentileFromSorted(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function summarizeSamples(samples = []) {
  if (!samples.length) {
    return {
      count: 0,
      avg: 0,
      min: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0
    };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((acc, value) => acc + value, 0);
  return {
    count: samples.length,
    avg: round(total / samples.length),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    p50: round(percentileFromSorted(sorted, 0.50)),
    p95: round(percentileFromSorted(sorted, 0.95)),
    p99: round(percentileFromSorted(sorted, 0.99))
  };
}

function metricsMapToObject(map) {
  const out = {};
  for (const [key, value] of map.entries()) {
    out[key] = {
      ...value,
      total: round(value.total),
      min: round(value.min),
      max: round(value.max),
      last: round(value.last),
      samples: summarizeSamples(value.samples),
      lastMeta: cloneJsonSafe(value.lastMeta)
    };
    delete out[key].samples.samples;
  }
  return out;
}

function detectEnabledFromEnvironment() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (PERF_QUERY_KEYS.some((key) => {
      const val = params.get(key);
      return val === '1' || val === 'true' || val === 'yes' || val === 'on';
    })) {
      return true;
    }
  } catch {
    // ignore URL parse failures
  }

  try {
    return localStorage.getItem(PERF_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function ensureLongTaskObserver() {
  if (state.longTaskObserver || typeof PerformanceObserver === 'undefined') return;
  try {
    const observer = new PerformanceObserver((list) => {
      if (!state.enabled) return;
      for (const entry of list.getEntries()) {
        const duration = Number(entry.duration) || 0;
        state.longTasks.count += 1;
        state.longTasks.totalMs += duration;
        state.longTasks.maxMs = Math.max(state.longTasks.maxMs, duration);
        state.longTasks.samples.push(round(duration));
        trimArray(state.longTasks.samples, MAX_SAMPLES);
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
    state.longTaskObserver = observer;
  } catch {
    // longtask not available in this browser
  }
}

async function captureSnapshot(label = 'snapshot') {
  const docEl = document.documentElement;
  const viewportOuter = document.getElementById('viewportOuter');
  const viewportInner = document.getElementById('viewportInner');
  const memory = typeof performance.memory === 'object' && performance.memory
    ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize || 0,
        totalJSHeapSize: performance.memory.totalJSHeapSize || 0,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit || 0
      }
    : null;

  return {
    label,
    timeMs: round(now()),
    domNodes: document.getElementsByTagName('*').length,
    svgElements: document.querySelectorAll('svg').length,
    svgNodes: document.querySelectorAll('svg, svg *').length,
    panels: document.querySelectorAll('.panel').length,
    knobs: document.querySelectorAll('.knob').length,
    vernierKnobs: document.querySelectorAll('.knob--vernier').length,
    pipCount: document.querySelectorAll('.pip-container').length,
    pinButtons: document.querySelectorAll('.pin-btn').length,
    notes: document.querySelectorAll('.panel-note').length,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      viewportOuterWidth: viewportOuter?.clientWidth || 0,
      viewportOuterHeight: viewportOuter?.clientHeight || 0,
      viewportInnerWidth: viewportInner?.scrollWidth || 0,
      viewportInnerHeight: viewportInner?.scrollHeight || 0,
      documentWidth: docEl?.clientWidth || 0,
      documentHeight: docEl?.clientHeight || 0
    },
    synthView: cloneJsonSafe(window.__synthViewTransform || null),
    sharpMode: window.__synthSharpMode ? {
      active: !!window.__synthSharpMode.active,
      zoom: round(window.__synthSharpMode.zoom || 0),
      activeZoom: round(window.__synthSharpMode.activeZoom || 0),
      pending: !!window.__synthSharpMode.pending
    } : null,
    navLocks: cloneJsonSafe(window.__synthNavLocks || null),
    gpuTier: cloneJsonSafe(window.__synthGpuTier || null),
    renderMode: window.__synthRenderMode || null,
    browser: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemory: navigator.deviceMemory || null
    },
    memory
  };
}

function enable({ persist = false } = {}) {
  state.enabled = true;
  if (!state.sessionStart) state.sessionStart = now();
  ensureLongTaskObserver();
  if (persist) {
    try {
      localStorage.setItem(PERF_STORAGE_KEY, 'true');
    } catch {
      // ignore storage failures
    }
  }
  return true;
}

function disable({ persist = false } = {}) {
  state.enabled = false;
  if (persist) {
    try {
      localStorage.removeItem(PERF_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
  }
  return false;
}

function isEnabled() {
  return !!state.enabled;
}

function mark(name, data = null) {
  if (!state.enabled) return;
  state.marks.push({
    t: round(now()),
    name,
    data: cloneJsonSafe(data)
  });
  trimArray(state.marks, MAX_MARKS);
}

function incrementCounter(name, by = 1) {
  if (!state.enabled) return;
  state.counters.set(name, (state.counters.get(name) || 0) + by);
}

function recordDuration(name, durationMs, meta = null) {
  if (!state.enabled) return;
  const duration = Number(durationMs);
  if (!Number.isFinite(duration)) return;

  let bucket = state.durations.get(name);
  if (!bucket) {
    bucket = {
      count: 0,
      total: 0,
      min: Number.POSITIVE_INFINITY,
      max: 0,
      last: 0,
      lastMeta: null,
      samples: []
    };
    state.durations.set(name, bucket);
  }

  bucket.count += 1;
  bucket.total += duration;
  bucket.min = Math.min(bucket.min, duration);
  bucket.max = Math.max(bucket.max, duration);
  bucket.last = duration;
  bucket.lastMeta = meta == null ? null : cloneJsonSafe(meta);
  bucket.samples.push(duration);
  trimArray(bucket.samples, MAX_SAMPLES);
}

function getCountersObject() {
  const out = {};
  for (const [key, value] of state.counters.entries()) {
    out[key] = value;
  }
  return out;
}

function diffSnapshots(start, end) {
  if (!start || !end) return null;
  const deltaMemory = start.memory && end.memory ? {
    usedJSHeapSize: (end.memory.usedJSHeapSize || 0) - (start.memory.usedJSHeapSize || 0),
    totalJSHeapSize: (end.memory.totalJSHeapSize || 0) - (start.memory.totalJSHeapSize || 0)
  } : null;

  return {
    domNodes: end.domNodes - start.domNodes,
    svgElements: end.svgElements - start.svgElements,
    svgNodes: end.svgNodes - start.svgNodes,
    knobs: end.knobs - start.knobs,
    vernierKnobs: end.vernierKnobs - start.vernierKnobs,
    pipCount: end.pipCount - start.pipCount,
    pinButtons: end.pinButtons - start.pinButtons,
    memory: deltaMemory
  };
}

async function beginScenario(name, meta = {}) {
  if (!state.enabled) enable();
  const id = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const scenario = {
    id,
    name,
    meta: cloneJsonSafe(meta),
    startTime: now(),
    startSnapshot: await captureSnapshot(`start:${name}`),
    frameTimes: [],
    frames: 0,
    lastFrameTs: null,
    active: true,
    rafId: null
  };

  const onFrame = (ts) => {
    if (!scenario.active) return;
    if (scenario.lastFrameTs != null) {
      scenario.frameTimes.push(ts - scenario.lastFrameTs);
      trimArray(scenario.frameTimes, 2000);
    }
    scenario.lastFrameTs = ts;
    scenario.frames += 1;
    scenario.rafId = requestAnimationFrame(onFrame);
  };

  scenario.rafId = requestAnimationFrame(onFrame);
  state.activeScenarios.set(id, scenario);
  mark('scenario:start', { id, name, meta });
  return id;
}

async function endScenario(id, meta = {}) {
  const scenario = state.activeScenarios.get(id);
  if (!scenario) return null;

  scenario.active = false;
  if (scenario.rafId != null) {
    cancelAnimationFrame(scenario.rafId);
    scenario.rafId = null;
  }

  const durationMs = now() - scenario.startTime;
  const endSnapshot = await captureSnapshot(`end:${scenario.name}`);
  const frameStats = summarizeSamples(scenario.frameTimes);
  const fps = durationMs > 0 ? round((scenario.frames * 1000) / durationMs) : 0;

  const summary = {
    id: scenario.id,
    name: scenario.name,
    meta: cloneJsonSafe({ ...scenario.meta, ...meta }),
    durationMs: round(durationMs),
    frames: scenario.frames,
    fps,
    frameMs: frameStats,
    startSnapshot: scenario.startSnapshot,
    endSnapshot,
    delta: diffSnapshots(scenario.startSnapshot, endSnapshot)
  };

  state.lastScenario = summary;
  state.scenarios.push(summary);
  trimArray(state.scenarios, MAX_SCENARIOS);
  state.activeScenarios.delete(id);
  mark('scenario:end', {
    id,
    name: scenario.name,
    durationMs: summary.durationMs,
    fps: summary.fps
  });
  return summary;
}

async function withScenario(name, meta, fn) {
  const id = await beginScenario(name, meta);
  try {
    await fn();
  } finally {
    return endScenario(id);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dispatchWheelSequence(target, {
  steps = 60,
  deltaX = 0,
  deltaY = 0,
  intervalMs = 16,
  ctrlKey = false,
  metaKey = false,
  clientX = null,
  clientY = null
} = {}) {
  if (!target) throw new Error('Target not found for wheel sequence');
  const rect = target.getBoundingClientRect();
  const x = clientX ?? (rect.left + rect.width / 2);
  const y = clientY ?? (rect.top + rect.height / 2);

  for (let i = 0; i < steps; i += 1) {
    target.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaX,
      deltaY,
      clientX: x,
      clientY: y,
      ctrlKey,
      metaKey
    }));
    await wait(intervalMs);
  }
}

async function runIdleScenario({ name = 'idle', durationMs = 3000 } = {}) {
  return withScenario(name, { type: 'idle', durationMs }, async () => {
    await wait(durationMs);
  });
}

async function runMainViewportWheelScenario({
  name = 'main-wheel',
  mode = 'pan',
  steps = 60,
  deltaX = 0,
  deltaY = 120,
  intervalMs = 16
} = {}) {
  const target = document.getElementById('viewportOuter');
  if (!target) throw new Error('viewportOuter not found');

  const ctrlKey = mode === 'zoom';
  return withScenario(name, { scope: 'main', mode, steps, deltaX, deltaY, intervalMs }, async () => {
    await dispatchWheelSequence(target, {
      steps,
      deltaX,
      deltaY,
      intervalMs,
      ctrlKey
    });
    await wait(250);
  });
}

async function runPipViewportWheelScenario({
  panelId,
  name = null,
  mode = 'pan',
  steps = 60,
  deltaX = 0,
  deltaY = 120,
  intervalMs = 16
} = {}) {
  if (!panelId) throw new Error('panelId is required for PiP scenario');
  const target = document.querySelector(`.pip-container[data-panel-id="${panelId}"] .pip-viewport`);
  if (!target) throw new Error(`PiP viewport not found for ${panelId}`);

  return withScenario(name || `pip-${panelId}-${mode}`, { scope: 'pip', panelId, mode, steps, deltaX, deltaY, intervalMs }, async () => {
    await dispatchWheelSequence(target, {
      steps,
      deltaX,
      deltaY,
      intervalMs,
      ctrlKey: mode === 'zoom'
    });
    await wait(250);
  });
}

function getSummary() {
  return {
    enabled: state.enabled,
    sessionMs: round(state.sessionStart ? now() - state.sessionStart : 0),
    counters: getCountersObject(),
    durations: metricsMapToObject(state.durations),
    marks: state.marks.map((markEntry) => ({
      ...markEntry,
      t: round(markEntry.t)
    })),
    scenarios: state.scenarios.map((scenario) => cloneJsonSafe(scenario)),
    lastScenario: cloneJsonSafe(state.lastScenario),
    longTasks: {
      count: state.longTasks.count,
      totalMs: round(state.longTasks.totalMs),
      maxMs: round(state.longTasks.maxMs),
      samples: summarizeSamples(state.longTasks.samples)
    }
  };
}

async function exportSummary({ label = 'summary' } = {}) {
  const snapshot = await captureSnapshot(label);
  return {
    ...getSummary(),
    snapshot
  };
}

async function downloadSummary(filename = `synthigme-perf-${Date.now()}.json`) {
  const data = await exportSummary({ label: 'download' });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

export const perfMonitor = {
  enable,
  disable,
  isEnabled,
  mark,
  incrementCounter,
  recordDuration,
  captureSnapshot,
  beginScenario,
  endScenario,
  withScenario,
  wait,
  runIdleScenario,
  runMainViewportWheelScenario,
  runPipViewportWheelScenario,
  getSummary,
  exportSummary,
  downloadSummary
};

if (typeof window !== 'undefined') {
  window.__synthPerf = perfMonitor;
  if (detectEnabledFromEnvironment()) {
    enable();
    log.info('Performance monitor enabled');
    mark('perf:enabled', { reason: 'environment' });
  }
}
