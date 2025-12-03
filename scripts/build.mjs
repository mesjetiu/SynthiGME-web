import { build as esbuild } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');
const docsDir = path.join(projectRoot, 'docs');
const packageJsonPath = path.join(projectRoot, 'package.json');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function cleanDocs() {
  await fs.rm(docsDir, { recursive: true, force: true });
  await ensureDir(docsDir);
}

async function copyFile(src, dest) {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

async function copyHtml() {
  await copyFile(path.join(srcDir, 'index.html'), path.join(docsDir, 'index.html'));
}

async function copyManifest() {
  await copyFile(path.join(srcDir, 'manifest.webmanifest'), path.join(docsDir, 'manifest.webmanifest'));
}

async function copyDirectory(src, dest) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await ensureDir(dest);
  await Promise.all(entries.map(async entry => {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }));
}

async function copyPwaAssets() {
  const pwaDir = path.join(srcDir, 'assets/pwa');
  try {
    await fs.access(pwaDir);
    await copyDirectory(pwaDir, path.join(docsDir, 'assets/pwa'));
  } catch {
    // optional assets
  }
}

async function buildServiceWorker(version) {
  const swSrc = path.join(srcDir, 'sw.js');
  try {
    const swContent = await fs.readFile(swSrc, 'utf8');
    const replaced = swContent.replace(/__BUILD_VERSION__/g, version);
    const swDest = path.join(docsDir, 'sw.js');
    await ensureDir(path.dirname(swDest));
    await fs.writeFile(swDest, replaced, 'utf8');
  } catch {
    // no service worker present
  }
}

async function buildJs() {
  return esbuild({
    entryPoints: [path.join(srcDir, 'assets/js/app.js')],
    bundle: true,
    minify: true,
    sourcemap: false,
    platform: 'browser',
    format: 'esm',
    target: ['es2020'],
    outdir: path.join(docsDir, 'assets/js')
  });
}

async function buildCss() {
  return esbuild({
    entryPoints: [path.join(srcDir, 'assets/css/main.css')],
    bundle: true,
    minify: true,
    sourcemap: false,
    outdir: path.join(docsDir, 'assets/css')
  });
}

async function run() {
  const pkgRaw = await fs.readFile(packageJsonPath, 'utf8');
  const { version = '0.0.0' } = JSON.parse(pkgRaw);

  console.log('Cleaning docs/ …');
  await cleanDocs();

  console.log('Building JS bundle …');
  await buildJs();

  console.log('Building CSS bundle …');
  await buildCss();

  console.log('Copying static HTML …');
  await copyHtml();

  console.log('Copying manifest and PWA assets …');
  await copyManifest();
  await copyPwaAssets();

  console.log('Generating service worker …');
  await buildServiceWorker(version);

  console.log('Build finished. Output available in docs/.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
