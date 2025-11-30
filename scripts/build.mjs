import { build as esbuild } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');
const distDir = path.join(projectRoot, 'dist');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function cleanDist() {
  await fs.rm(distDir, { recursive: true, force: true });
  await ensureDir(distDir);
}

async function copyFile(src, dest) {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

async function copyHtml() {
  await copyFile(path.join(srcDir, 'index.html'), path.join(distDir, 'index.html'));
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
    outdir: path.join(distDir, 'assets/js')
  });
}

async function buildCss() {
  return esbuild({
    entryPoints: [path.join(srcDir, 'assets/css/main.css')],
    bundle: true,
    minify: true,
    sourcemap: false,
    outdir: path.join(distDir, 'assets/css')
  });
}

async function run() {
  console.log('Cleaning dist/ …');
  await cleanDist();

  console.log('Building JS bundle …');
  await buildJs();

  console.log('Building CSS bundle …');
  await buildCss();

  console.log('Copying static HTML …');
  await copyHtml();

  console.log('Build finished. Output available in dist/.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
