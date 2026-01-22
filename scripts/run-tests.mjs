/**
 * run-tests.mjs - Ejecuta tests y opcionalmente pregunta al usuario si quiere continuar
 * 
 * Uso:
 *   node scripts/run-tests.mjs [--require-pass]
 * 
 * Opciones:
 *   --require-pass   Si los tests fallan, pregunta al usuario si quiere continuar.
 *                    Si el usuario dice "no", el script termina con exit code 1.
 *                    Sin esta opción, los tests se ejecutan pero no bloquean.
 * 
 * Exit codes:
 *   0 - Tests pasaron, o el usuario eligió continuar
 *   1 - Tests fallaron y el usuario eligió abortar (o stdin no es TTY)
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const requirePass = process.argv.includes('--require-pass');

/**
 * Ejecuta los tests y devuelve una promesa con el código de salida.
 */
function runTests() {
  return new Promise((resolve) => {
    console.log('\n🧪 Ejecutando tests (unitarios + audio)...\n');
    
    const testProcess = spawn('npm', ['run', 'test:all'], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true
    });
    
    testProcess.on('close', (code) => {
      resolve(code);
    });
    
    testProcess.on('error', (err) => {
      console.error('Error ejecutando tests:', err);
      resolve(1);
    });
  });
}

/**
 * Pregunta al usuario si quiere continuar.
 * @returns {Promise<boolean>} true si el usuario quiere continuar
 */
function askToContinue() {
  return new Promise((resolve) => {
    // Si no hay TTY (ej: CI), no continuar
    if (!process.stdin.isTTY) {
      console.log('\n⚠️  No hay terminal interactiva. Abortando.\n');
      resolve(false);
      return;
    }
    
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('\n⚠️  Los tests han fallado. ¿Deseas continuar de todos modos? (s/N): ', (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 's' || normalized === 'si' || normalized === 'sí' || normalized === 'y' || normalized === 'yes');
    });
  });
}

async function main() {
  const exitCode = await runTests();
  
  if (exitCode === 0) {
    console.log('\n✅ Todos los tests pasaron.\n');
    process.exit(0);
  }
  
  // Tests fallaron
  console.log('\n❌ Algunos tests han fallado.');
  
  if (!requirePass) {
    // Sin --require-pass, solo informar y continuar
    process.exit(0);
  }
  
  // Con --require-pass, preguntar al usuario
  const shouldContinue = await askToContinue();
  
  if (shouldContinue) {
    console.log('\n⚡ Continuando a pesar de los tests fallidos...\n');
    process.exit(0);
  } else {
    console.log('\n🛑 Operación cancelada.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
