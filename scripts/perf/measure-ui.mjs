import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const outputDir = path.join(rootDir, 'test-results/perf');
const serverPort = 8767;
const baseUrl = `http://127.0.0.1:${serverPort}/docs/index.html?perf=1`;
const headless = process.env.PW_HEADLESS !== '0';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
    } catch {
      // keep waiting
    }
    await sleep(250);
  }
  throw new Error(`Timeout esperando servidor en ${url}`);
}

function startServer() {
  const child = spawn('npx', ['http-server', '-p', String(serverPort), '--cors', '-c-1'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[perf-server] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[perf-server] ${chunk}`);
  });

  return child;
}

function killChild(child) {
  if (!child || child.killed) return;
  try {
    child.kill('SIGTERM');
  } catch {
    // ignore
  }
}

function metricsArrayToObject(metrics = []) {
  const out = {};
  for (const metric of metrics) {
    out[metric.name] = metric.value;
  }
  return out;
}

function pickNumeric(obj, keys) {
  const out = {};
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return out;
}

function diffMetricMaps(before, after, deltaKeys) {
  const delta = {};
  for (const key of deltaKeys) {
    const a = before[key];
    const b = after[key];
    if (typeof a === 'number' && typeof b === 'number') {
      delta[key] = +(b - a).toFixed(3);
    }
  }
  return delta;
}

async function getCdpMetrics(client) {
  const { metrics } = await client.send('Performance.getMetrics');
  return metricsArrayToObject(metrics);
}

async function resetMainViewport(page) {
  await page.evaluate(async () => {
    document.dispatchEvent(new Event('synth:zoomReset'));
    await window.__synthPerf.wait(500);
  });
}

async function closeAllPips(page) {
  await page.evaluate(async () => {
    window.__synthPipDebug?.closeAll?.();
    await window.__synthPerf.wait(300);
  });
}

const deltaMetricKeys = [
  'TaskDuration',
  'ScriptDuration',
  'LayoutDuration',
  'RecalcStyleDuration',
  'LayoutCount',
  'RecalcStyleCount',
  'Nodes',
  'JSEventListeners',
  'JSHeapUsedSize',
  'JSHeapTotalSize'
];

const scenarios = [
  {
    name: 'idle-3s',
    prepare: async (page) => {
      await closeAllPips(page);
      await resetMainViewport(page);
    },
    run: async (page) => page.evaluate(() => window.__synthPerf.runIdleScenario({ name: 'idle-3s', durationMs: 3000 }))
  },
  {
    name: 'main-pan-wheel',
    prepare: async (page) => {
      await closeAllPips(page);
      await resetMainViewport(page);
    },
    run: async (page) => page.evaluate(() => window.__synthPerf.runMainViewportWheelScenario({
      name: 'main-pan-wheel',
      mode: 'pan',
      steps: 120,
      deltaX: 0,
      deltaY: 120,
      intervalMs: 8
    }))
  },
  {
    name: 'main-zoom-wheel',
    prepare: async (page) => {
      await closeAllPips(page);
      await resetMainViewport(page);
    },
    run: async (page) => page.evaluate(() => window.__synthPerf.runMainViewportWheelScenario({
      name: 'main-zoom-wheel',
      mode: 'zoom',
      steps: 72,
      deltaX: 0,
      deltaY: -120,
      intervalMs: 10
    }))
  },
  {
    name: 'main-zoom-idle-sharp',
    prepare: async (page) => {
      await closeAllPips(page);
      await resetMainViewport(page);
      await page.evaluate(async () => {
        localStorage.setItem('synthigme-sharp-rasterize-enabled', 'true');
        document.dispatchEvent(new CustomEvent('synth:sharpRasterizeChange', { detail: { enabled: true } }));
        await window.__synthPerf.runMainViewportWheelScenario({
          name: 'prefocus-zoom',
          mode: 'zoom',
          steps: 40,
          deltaY: -120,
          intervalMs: 10
        });
      });
    },
    run: async (page) => page.evaluate(() => window.__synthPerf.runIdleScenario({ name: 'main-zoom-idle-sharp', durationMs: 1800 }))
  },
  {
    name: 'pip-pan-panel-1',
    prepare: async (page) => {
      await closeAllPips(page);
      await resetMainViewport(page);
      await page.evaluate(async () => {
        window.__synthPipDebug.open('panel-1');
        await window.__synthPerf.wait(500);
      });
    },
    run: async (page) => page.evaluate(() => window.__synthPerf.runPipViewportWheelScenario({
      panelId: 'panel-1',
      name: 'pip-pan-panel-1',
      mode: 'pan',
      steps: 120,
      deltaX: 0,
      deltaY: 120,
      intervalMs: 8
    }))
  },
  {
    name: 'pip-zoom-panel-1',
    prepare: async (page) => {
      await closeAllPips(page);
      await resetMainViewport(page);
      await page.evaluate(async () => {
        window.__synthPipDebug.open('panel-1');
        await window.__synthPerf.wait(500);
      });
    },
    run: async (page) => page.evaluate(() => window.__synthPerf.runPipViewportWheelScenario({
      panelId: 'panel-1',
      name: 'pip-zoom-panel-1',
      mode: 'zoom',
      steps: 80,
      deltaX: 0,
      deltaY: -120,
      intervalMs: 10
    }))
  }
];

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const server = startServer();
  let browser;

  try {
    await waitForServer(baseUrl);

    browser = await chromium.launch({
      headless,
      args: [
        '--disable-features=AudioServiceOutOfProcess',
        '--autoplay-policy=no-user-gesture-required'
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await client.send('Performance.enable');

    await page.goto(baseUrl, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__synthPerf, null, { timeout: 30000 });
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 30000 });
    await page.evaluate(() => window.__synthPerf.wait(1200));

    const baselineSnapshot = await page.evaluate(() => window.__synthPerf.captureSnapshot('baseline-ready'));
    const scenarioResults = [];

    for (const scenario of scenarios) {
      if (scenario.prepare) {
        await scenario.prepare(page);
      }

      const cdpBefore = await getCdpMetrics(client);
      const result = await scenario.run(page);
      const cdpAfter = await getCdpMetrics(client);
      const perfSummary = await page.evaluate(() => window.__synthPerf.exportSummary({ label: 'post-scenario-export' }));

      scenarioResults.push({
        name: scenario.name,
        app: result,
        cdpDelta: diffMetricMaps(cdpBefore, cdpAfter, deltaMetricKeys),
        cdpAfter: pickNumeric(cdpAfter, ['Nodes', 'JSEventListeners', 'JSHeapUsedSize', 'JSHeapTotalSize']),
        perfTail: {
          counters: perfSummary.counters,
          durations: perfSummary.durations,
          longTasks: perfSummary.longTasks
        }
      });

      console.log(`\n[perf] ${scenario.name}`);
      console.table([{
        scenario: scenario.name,
        fps: result?.fps ?? 0,
        durationMs: result?.durationMs ?? 0,
        frameAvgMs: result?.frameMs?.avg ?? 0,
        frameP95Ms: result?.frameMs?.p95 ?? 0,
        longTasks: perfSummary.longTasks?.count ?? 0,
        taskDuration: diffMetricMaps(cdpBefore, cdpAfter, ['TaskDuration']).TaskDuration ?? 0,
        layoutDuration: diffMetricMaps(cdpBefore, cdpAfter, ['LayoutDuration']).LayoutDuration ?? 0,
        recalcStyleDuration: diffMetricMaps(cdpBefore, cdpAfter, ['RecalcStyleDuration']).RecalcStyleDuration ?? 0
      }]);
    }

    const finalSummary = await page.evaluate(() => window.__synthPerf.exportSummary({ label: 'final' }));
    const report = {
      generatedAt: new Date().toISOString(),
      platform: process.platform,
      browser: 'chromium',
      headless,
      url: baseUrl,
      baselineSnapshot,
      scenarios: scenarioResults,
      finalSummary
    };

    const fileName = `ui-perf-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2));

    console.log(`\n[perf] Report saved to ${filePath}`);
  } finally {
    if (browser) await browser.close();
    killChild(server);
  }
}

main().catch((error) => {
  console.error('[perf] Error:', error);
  process.exitCode = 1;
});
