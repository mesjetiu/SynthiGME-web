#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Compara una captura visual con la referencia (ver capture.mjs)
// ═══════════════════════════════════════════════════════════════════════════
//
// Uso:
//   node tests/visual/compare.mjs [actual] [referencia]
//     actual      por defecto tests/visual/current
//     referencia  por defecto tests/visual/baseline
//
// Geometría: cada elemento debe estar en el mismo sitio y con el mismo
// tamaño (tolerancia 0,01 px). Imagen: se cuentan los píxeles distintos y se
// deja <panel>.diff.png en la carpeta actual marcando en rojo dónde cambian.
// Sale con código 1 si hay cualquier diferencia.

import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CUR = path.resolve(process.argv[2] || path.join(__dirname, 'current'));
const REF = path.resolve(process.argv[3] || path.join(__dirname, 'baseline'));
const TOL = 0.01;

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

const panels = readdirSync(REF).filter(f => f.endsWith('.geom.json')).map(f => f.replace('.geom.json', ''));
let failed = false;

// ── Geometría ──────────────────────────────────────────────────────────────
for (const id of panels) {
  const curFile = path.join(CUR, `${id}.geom.json`);
  if (!existsSync(curFile)) { console.log(`✗ ${id}: falta en la captura actual`); failed = true; continue; }
  const ref = new Map(JSON.parse(await readFile(path.join(REF, `${id}.geom.json`), 'utf8')).map(g => [g.k, g]));
  const cur = new Map(JSON.parse(await readFile(curFile, 'utf8')).map(g => [g.k, g]));
  const moved = [], missing = [], added = [];
  for (const [k, g] of ref) {
    const c = cur.get(k);
    if (!c) { if (g.v) missing.push(k); continue; }
    if (!g.v && !c.v) continue;
    if (g.v !== c.v || g.r.some((v, i) => Math.abs(v - c.r[i]) > TOL)) moved.push({ k, ref: g.r, cur: c.r, v: [g.v, c.v] });
  }
  for (const [k, c] of cur) if (!ref.has(k) && c.v) added.push(k);
  if (!moved.length && !missing.length && !added.length) {
    console.log(`✓ ${id}: geometría idéntica (${ref.size} elementos)`);
    continue;
  }
  failed = true;
  console.log(`✗ ${id}: ${moved.length} movidos, ${missing.length} desaparecidos, ${added.length} nuevos`);
  for (const m of moved.slice(0, 15)) console.log(`    movido  ${m.k}\n            ${JSON.stringify(m.ref)} → ${JSON.stringify(m.cur)}${m.v[0] !== m.v[1] ? ` visible ${m.v[0]}→${m.v[1]}` : ''}`);
  for (const k of missing.slice(0, 10)) console.log(`    falta   ${k}`);
  for (const k of added.slice(0, 10)) console.log(`    nuevo   ${k}`);
}

// ── Imagen ─────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage();
for (const id of panels) {
  const a = path.join(REF, `${id}.png`), b = path.join(CUR, `${id}.png`);
  if (!existsSync(b)) continue;
  const toUrl = async f => 'data:image/png;base64,' + (await readFile(f)).toString('base64');
  const res = await page.evaluate(async ([ua, ub]) => {
    const load = u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    const [ia, ib] = await Promise.all([load(ua), load(ub)]);
    const w = ia.width, h = ia.height;
    const ctx = (img) => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h); };
    const da = ctx(ia), db = ctx(ib);
    const out = new OffscreenCanvas(w, h), ox = out.getContext('2d');
    ox.globalAlpha = 0.25; ox.drawImage(ia, 0, 0); ox.globalAlpha = 1;
    const od = ox.getImageData(0, 0, w, h);
    let n = 0;
    for (let i = 0; i < da.data.length; i += 4) {
      const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
      if (d > 0) { n++; od.data[i] = 255; od.data[i + 1] = 0; od.data[i + 2] = 0; od.data[i + 3] = 255; }
    }
    ox.putImageData(od, 0, 0);
    const blob = await out.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (const x of buf) bin += String.fromCharCode(x);
    return { n, total: w * h, diff: btoa(bin), sameSize: ia.width === ib.width && ia.height === ib.height };
  }, [await toUrl(a), await toUrl(b)]);
  if (res.n === 0 && res.sameSize) { console.log(`✓ ${id}: imagen idéntica`); continue; }
  failed = true;
  await writeFile(path.join(CUR, `${id}.diff.png`), Buffer.from(res.diff, 'base64'));
  console.log(`✗ ${id}: ${res.n} píxeles distintos (${(100 * res.n / res.total).toFixed(3)} %) → ${id}.diff.png`);
}
await browser.close();

process.exit(failed ? 1 : 0);
