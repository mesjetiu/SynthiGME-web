import { build as esbuild } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');
const packageJsonPath = path.join(projectRoot, 'package.json');
const bundledAssetDirs = new Set(['js', 'css']);

// Carpeta destino configurable via argumento --outdir=<path>
// Por defecto: docs/ (para GitHub Pages)
function getOutputDir() {
  const args = process.argv.slice(2);
  const outdirArg = args.find(arg => arg.startsWith('--outdir='));
  if (outdirArg) {
    const dir = outdirArg.split('=')[1];
    return path.isAbsolute(dir) ? dir : path.join(projectRoot, dir);
  }
  return path.join(projectRoot, 'docs');
}

const outDir = getOutputDir();

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function cleanOutDir() {
  await fs.rm(outDir, { recursive: true, force: true });
  await ensureDir(outDir);
}

async function copyFile(src, dest) {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

async function copyHtml() {
  await copyFile(path.join(srcDir, 'index.html'), path.join(outDir, 'index.html'));
}

async function copyManifest() {
  await copyFile(path.join(srcDir, 'manifest.webmanifest'), path.join(outDir, 'manifest.webmanifest'));
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

async function copyStaticAssets() {
  const assetsDir = path.join(srcDir, 'assets');
  try {
    const entries = await fs.readdir(assetsDir, { withFileTypes: true });
    await Promise.all(entries.map(async entry => {
      if (bundledAssetDirs.has(entry.name)) {
        return;
      }
      const srcPath = path.join(assetsDir, entry.name);
      const destPath = path.join(outDir, 'assets', entry.name);
      if (entry.isDirectory()) {
        await copyDirectory(srcPath, destPath);
      } else if (entry.isFile()) {
        await copyFile(srcPath, destPath);
      }
    }));
  } catch {
    // no static assets to copy
  }
}

async function buildServiceWorker(version) {
  const swSrc = path.join(srcDir, 'sw.js');
  try {
    const swContent = await fs.readFile(swSrc, 'utf8');
    const replaced = swContent.replace(/__BUILD_VERSION__/g, version);
    const swDest = path.join(outDir, 'sw.js');
    await ensureDir(path.dirname(swDest));
    await fs.writeFile(swDest, replaced, 'utf8');
  } catch {
    // no service worker present
  }
}

async function computeCacheVersion() {
  const pkgRaw = await fs.readFile(packageJsonPath, 'utf8');
  const { version = '0.0.0' } = JSON.parse(pkgRaw);

  // Usar fecha y hora como sufijo en lugar de contador consecutivo
  // Formato: YYYYMMDD.HHmmss (ej: 20260128.143052)
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  
  const cacheVersion = `${version}-${timestamp}`;

  return { version, cacheVersion };
}

async function buildJs(cacheVersion) {
  return esbuild({
    entryPoints: [path.join(srcDir, 'assets/js/app.js')],
    bundle: true,
    minify: true,
    sourcemap: false,
    platform: 'browser',
    format: 'esm',
    target: ['es2020'],
    outdir: path.join(outDir, 'assets/js'),
    define: {
      __BUILD_VERSION__: JSON.stringify(cacheVersion),
      __LOG_LEVEL__: '1' // LogLevel.ERROR en producción
    }
  });
}

async function buildCss() {
  const externalizePanelSvgs = {
    name: 'externalize-panel-svgs',
    setup(build) {
      build.onResolve({ filter: /\.svg$/ }, args => {
        // Solo para URLs dentro de CSS (url(...)).
        if (args.kind !== 'url-token') return;
        // Mantenemos estables los SVG de paneles como assets estáticos.
        // copyStaticAssets() ya copia src/assets/panels -> docs/assets/panels.
        if (args.path.startsWith('../panels/')) {
          return { path: args.path, external: true };
        }
      });
    }
  };

  return esbuild({
    entryPoints: [path.join(srcDir, 'assets/css/main.css')],
    bundle: true,
    minify: true,
    sourcemap: false,
    outdir: path.join(outDir, 'assets/css'),
    plugins: [externalizePanelSvgs]
  });
}

async function copyWorklets() {
  const workletsDir = path.join(srcDir, 'assets/js/worklets');
  const destDir = path.join(outDir, 'assets/js/worklets');
  try {
    await copyDirectory(workletsDir, destDir);
  } catch {
    // no worklets to copy
  }
}

async function run() {
  const { version, cacheVersion } = await computeCacheVersion();
  const outDirName = path.relative(projectRoot, outDir);

  console.log(`Cleaning ${outDirName}/ …`);
  await cleanOutDir();

  console.log('Building JS bundle …');
  await buildJs(cacheVersion);

  console.log('Building CSS bundle …');
  await buildCss();

  console.log('Copying static HTML …');
  await copyHtml();

  console.log('Copying manifest and asset folders …');
  await copyManifest();
  await copyStaticAssets();

  console.log('Copying AudioWorklet modules …');
  await copyWorklets();

  console.log('Generating service worker …');
  await buildServiceWorker(cacheVersion);

  // Guardar información del build
  const buildInfo = { version, cacheVersion, timestamp: new Date().toISOString() };
  await fs.writeFile(path.join(outDir, 'build-info.json'), JSON.stringify(buildInfo, null, 2), 'utf8');

  console.log(`Build finished. Output in ${outDirName}/. BUILD_VERSION=${cacheVersion}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
