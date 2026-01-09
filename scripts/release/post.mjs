/**
 * post.mjs - Finalización de release
 * 
 * Este script se ejecuta DESPUÉS de `npm version`. Su propósito:
 * 1. Restaurar CHANGELOG.md desde .release-cache/
 * 2. Añadir CHANGELOG.md y docs/ al commit de release
 * 3. Enmendar el commit para incluir estos archivos
 * 4. Re-crear el tag para que apunte al commit enmendado
 * 
 * Flujo completo de release:
 *   pre.mjs → npm version → hook "version" (build con versión correcta) → commit → post.mjs
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
  return execSync(cmd, { cwd: projectRoot, stdio: 'pipe', encoding: 'utf8' }).trim();
}

async function main() {
  let cachedExists = true;
  try {
    await fs.access(cachedChangelogPath);
  } catch (error) {
    cachedExists = false;
  }

  if (!cachedExists) {
    return;
  }

  const pkgRaw = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const version = pkg.version;

  await fs.copyFile(cachedChangelogPath, changelogPath);
  await fs.rm(cacheDir, { recursive: true, force: true });

  run('git add CHANGELOG.md docs');

  // Si no hay cambios staged, no intentes enmendar.
  try {
    run('git diff --cached --quiet');
    console.log('> No hay cambios en CHANGELOG.md para integrar en el commit de release.');
    return;
  } catch {
    // Continua para enmendar.
  }

  run('git commit --amend --no-edit');
  run(`git tag -f -a v${version} -m "v${version}"`);

  console.log('> CHANGELOG.md reintegrado en el commit de release y tag actualizado.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
