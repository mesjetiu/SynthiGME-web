/**
 * Wrapper para electron-builder que incluye el build timestamp en el nombre del artifact
 * 
 * Genera el build de la aplicación en dist-app/ (separado de docs/).
 * docs/ es exclusivo para GitHub Pages.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const APP_DIR = 'dist-app';
const buildInfoPath = join(projectRoot, APP_DIR, 'build-info.json');

// Leer versión desde build-info.json generado por el build
function getBuildVersion() {
  try {
    const buildInfo = JSON.parse(readFileSync(buildInfoPath, 'utf8'));
    return buildInfo.cacheVersion;
  } catch (err) {
    console.error('Error leyendo build-info.json:', err.message);
  }
  
  // Fallback: usar versión de package.json
  const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  return pkg.version;
}

// Obtener argumentos para electron-builder (--linux, --win, etc.)
const args = process.argv.slice(2).join(' ');

// Hacer build a dist-app/ (separado de docs/)
console.log(`Ejecutando build de la aplicación en ${APP_DIR}/...\n`);
execSync(`node scripts/build.mjs --outdir=${APP_DIR}`, {
  cwd: projectRoot,
  stdio: 'inherit'
});
console.log('');

const buildVersion = getBuildVersion();
console.log(`Build version: ${buildVersion}`);

// Ejecutar electron-builder con la variable de entorno
try {
  execSync(`npx electron-builder ${args}`, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      BUILD_VERSION: buildVersion
    }
  });
  
  // Ejecutar generate-requirements después
  execSync('node scripts/release/generate-requirements.mjs', {
    cwd: projectRoot,
    stdio: 'inherit'
  });
} catch (err) {
  process.exit(1);
}
