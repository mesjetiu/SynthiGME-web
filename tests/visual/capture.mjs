#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Captura visual de los paneles (red de seguridad para refactorizar el layout)
// ═══════════════════════════════════════════════════════════════════════════
//
// Arranca la web desde src/ en Chromium headless y, para cada panel, guarda:
//   - <panel>.png        imagen del panel a escala 1 (760×760 CSS px)
//   - <panel>.geom.json  caja de cada elemento del panel en coordenadas
//                        locales del panel (px CSS, sin la escala del visor)
//
// Uso:
//   node tests/visual/capture.mjs [carpetaSalida]     (por defecto tests/visual/current)
//   node tests/visual/compare.mjs                      compara current con baseline
//
// La referencia (tests/visual/baseline/) se tomó antes de unificar los
// blueprints: cualquier refactor del layout debe dejar la geometría idéntica.
//
// Chromium: usa el de Playwright; si la versión instalada no casa con la de
// la librería, se puede forzar con PW_EXE=/ruta/al/chrome-headless-shell.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'current'));

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm'
};

function serve() {
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(SRC, url === '/' ? 'index.html' : url);
    if (!file.startsWith(SRC)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function findChromium() {
  if (process.env.PW_EXE) return process.env.PW_EXE;
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  if (!existsSync(cache)) return undefined;
  const shells = readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of shells) {
    const exe = path.join(cache, d, 'chrome-headless-shell-linux64/chrome-headless-shell');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

const server = await serve();
const port = server.address().port;
const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

// Congelar el tiempo aleatorio y las animaciones para que la captura sea estable
await page.addInitScript(() => {
  let seed = 12345;
  Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  try {
    localStorage.clear();
    localStorage.setItem('synthigme-telemetry-enabled', 'false');  // sin diálogo de consentimiento
    localStorage.setItem('synthigme-language', 'es');
  } catch {}
});

await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => document.querySelectorAll('.panel').length >= 7, null, { timeout: 30000 });
await page.waitForTimeout(4000);
await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });

// Fuera todo lo que no es el visor de paneles: overlays, diálogos, avisos…
// (se ocultan los hermanos de cada antecesor de #viewportInner) y los badges.
await page.evaluate(() => {
  let el = document.getElementById('viewportInner');
  while (el && el !== document.body) {
    for (const sib of el.parentElement.children) {
      if (sib !== el) sib.style.setProperty('visibility', 'hidden', 'important');
    }
    el = el.parentElement;
  }
  document.querySelectorAll('.panel-build-version').forEach(el => { el.style.visibility = 'hidden'; });
});

const panelIds = await page.evaluate(() => [...document.querySelectorAll('.panel')].map(p => p.id));

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const id of panelIds) {
  // Visor a escala 1 con el panel en el origen
  const pos = await page.evaluate((id) => {
    const inner = document.getElementById('viewportInner');
    inner.style.transform = 'none';
    const p = document.getElementById(id);
    const r = p.getBoundingClientRect();
    inner.style.transform = `translate(${-r.left}px, ${-r.top}px)`;
    const r2 = p.getBoundingClientRect();
    return { x: r2.left, y: r2.top };
  }, id);
  await page.waitForTimeout(150);

  const geom = await page.evaluate((id) => {
    const p = document.getElementById(id);
    const pr = p.getBoundingClientRect();
    const out = [];
    const walk = (el, key) => {
      const kids = [...el.children];
      const counts = {};
      for (const k of kids) {
        const tag = k.tagName.toLowerCase();
        const name = k.id ? `#${k.id}` : `${tag}${k.classList.length ? '.' + [...k.classList].sort().join('.') : ''}`;
        counts[name] = (counts[name] || 0) + 1;
        const ckey = `${key}>${name}[${counts[name]}]`;
        const r = k.getBoundingClientRect();
        const cs = getComputedStyle(k);
        out.push({
          k: ckey,
          r: [r.left - pr.left, r.top - pr.top, r.width, r.height],
          v: cs.visibility === 'hidden' || cs.display === 'none' ? 0 : 1
        });
        if (tag !== 'svg') walk(k, ckey);
      }
    };
    walk(p, id);
    return out;
  }, id);
  for (const g of geom) g.r = g.r.map(v => Math.round(v * 100) / 100);

  await writeFile(path.join(OUT, `${id}.geom.json`), JSON.stringify(geom, null, 0).replace(/\},\{/g, '},\n{'));
  await page.screenshot({ path: path.join(OUT, `${id}.png`), clip: { x: pos.x, y: pos.y, width: 760, height: 760 } });
  console.log(`${id}: ${geom.length} elementos`);
}

await browser.close();
server.close();
console.log(`Captura en ${path.relative(ROOT, OUT)}`);
