/**
 * Wrapper para electron-builder que incluye el build timestamp en el nombre del artifact
 * 
 * Lee la versión de build desde docs/sw.js y la pasa como variable de entorno
 * para que electron-builder la use en artifactName.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Leer CACHE_VERSION desde docs/sw.js
function getBuildVersion() {
  const swPath = join(projectRoot, 'docs', 'sw.js');
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
