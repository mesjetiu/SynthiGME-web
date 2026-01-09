/**
 * pre.mjs - Preparación para release
 * 
 * Este script se ejecuta ANTES de `npm version`. Su propósito:
 * 1. Verificar que solo CHANGELOG.md tenga cambios pendientes
 * 2. Guardar temporalmente CHANGELOG.md en .release-cache/
 * 3. Limpiar el árbol de trabajo para que npm version encuentre repo limpio
 * 
 * Flujo completo de release:
 *   pre.mjs → npm version (actualiza package.json) → hook "version" (build) → commit → post.mjs
 * 
 * El hook "version" en package.json ejecuta el build DESPUÉS de actualizar
 * package.json, garantizando que el build contenga la versión correcta.
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const changelogPath = path.join(projectRoot, 'CHANGELOG.md');
const cacheDir = path.join(projectRoot, '.release-cache');
const cachedChangelogPath = path.join(cacheDir, 'CHANGELOG.md');

function run(cmd) {
  return execSync(cmd, { cwd: projectRoot, stdio: 'pipe', encoding: 'utf8' });
}

function parseStatus(output) {
  if (!output) {
    return [];
  }
  return output
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const status = line.slice(0, 2).trim();
      const file = line.slice(3).trim();
      return { status, file };
    });
}

async function main() {
  try {
    await fs.access(cachedChangelogPath);
    console.error('Aborting release: se encontró un backup previo de CHANGELOG.md (¿release interrumpido?). Ejecuta `node scripts/release/post.mjs` o elimina .release-cache manualmente.');
    process.exit(1);
  } catch (error) {
    // No backup pendiente, continuar.
  }

  const statusRaw = run('git status --porcelain');
  const entries = parseStatus(statusRaw);

  if (!entries.length) {
    return;
  }

  const allowedFiles = new Set(['CHANGELOG.md']);
  const disallowed = entries.filter(entry => !allowedFiles.has(entry.file));

  if (disallowed.length) {
    console.error('Aborting release: el árbol contiene cambios ajenos a CHANGELOG.md.');
    disallowed.forEach(entry => console.error(` - ${entry.file} (${entry.status.trim()})`));
    process.exit(1);
  }

  // Solo hay cambios en CHANGELOG.md → guárdalos temporalmente y limpia el árbol.
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.copyFile(changelogPath, cachedChangelogPath);

  // Restaura el archivo en el working tree para que npm version encuentre el repo limpio.
  run('git checkout -- CHANGELOG.md');

  console.log('> Se guardó temporalmente CHANGELOG.md y se limpió el árbol para continuar con el release.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
