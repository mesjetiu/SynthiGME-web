/**
 * Wrapper para electron-builder que incluye el build timestamp en el nombre del artifact
 * 
 * Siempre ejecuta un build fresh de la aplicación antes de compilar Electron.
 * Esto garantiza que:
 * - El código empaquetado está actualizado
 * - El timestamp del build es del momento de compilar
 * - No depende de builds previos de docs/
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const swPath = join(projectRoot, 'docs', 'sw.js');

// Leer CACHE_VERSION desde docs/sw.js
function getBuildVersion() {
  try {
    const content = readFileSync(swPath, 'utf8');
    const match = content.match(/const\s+CACHE_VERSION\s*=\s*'([^']+)';/);
    if (match) {
      return match[1];
    }
  } catch (err) {
    console.error('Error leyendo docs/sw.js:', err.message);
  }
  
  // Fallback: usar versión de package.json
  const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  return pkg.version;
}

// Obtener argumentos para electron-builder (--linux, --win, etc.)
const args = process.argv.slice(2).join(' ');

// Siempre hacer build fresh antes de compilar Electron
console.log('Ejecutando build de la aplicación...\n');
execSync('npm run build:skip-tests', {
  cwd: projectRoot,
  stdio: 'inherit'
});
console.log('');

const buildVersion = getBuildVersion();
console.log(`Build version: ${buildVersion}`);

// Ejecutar electron-builder con la variable de entorno
try {
  execSync(`electron-builder ${args}`, {
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
