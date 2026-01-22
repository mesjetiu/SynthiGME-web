#!/usr/bin/env node
/**
 * test-all.mjs - Ejecuta todos los tests (unitarios + audio) y muestra un resumen final
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Colores ANSI
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  white: '\x1b[37m'
};

/**
 * Ejecuta un comando y captura información sobre el resultado
 */
function runCommand(command, args, label) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = '';
    
    const proc = spawn(command, args, {
      cwd: projectRoot,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    proc.stdout.on('data', (data) => {
      const str = data.toString();
      output += str;
      process.stdout.write(str);
    });
    
    proc.stderr.on('data', (data) => {
      const str = data.toString();
      output += str;
      process.stderr.write(str);
    });
    
    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        label,
        success: code === 0,
        exitCode: code,
        duration,
        output
      });
    });
    
    proc.on('error', (err) => {
      const duration = Date.now() - startTime;
      resolve({
        label,
        success: false,
        exitCode: 1,
        duration,
        output: err.message,
        error: err
      });
    });
  });
}

/**
 * Extrae estadísticas de los tests unitarios del output
 */
function parseUnitTestStats(output) {
  // Buscar líneas como: ℹ tests 1034, ℹ pass 1034, ℹ fail 0
  const testsMatch = output.match(/ℹ tests (\d+)/);
  const passMatch = output.match(/ℹ pass (\d+)/);
  const failMatch = output.match(/ℹ fail (\d+)/);
  
  return {
    total: testsMatch ? parseInt(testsMatch[1]) : 0,
    passed: passMatch ? parseInt(passMatch[1]) : 0,
    failed: failMatch ? parseInt(failMatch[1]) : 0
  };
}

/**
 * Extrae estadísticas de los tests de audio (Playwright) del output
 */
function parseAudioTestStats(output) {
  // Buscar líneas como: 86 passed (45.2s)
  const passedMatch = output.match(/(\d+) passed/);
  const failedMatch = output.match(/(\d+) failed/);
  const skippedMatch = output.match(/(\d+) skipped/);
  
  const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
  const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;
  
  return {
    total: passed + failed + skipped,
    passed,
    failed,
    skipped
  };
}

/**
 * Formatea duración en formato legible
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  if (ms < 60000) return `${seconds}s`;
  const minutes = Math.floor(ms / 60000);
  const remainingSeconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Imprime el resumen final
 */
function printSummary(results, totalDuration) {
  const { c } = { c: colors };
  const line = '═'.repeat(60);
  const thinLine = '─'.repeat(60);
  
  console.log('\n');
  console.log(`${c.cyan}${line}${c.reset}`);
  console.log(`${c.bold}${c.cyan}                    📊 RESUMEN DE TESTS${c.reset}`);
  console.log(`${c.cyan}${line}${c.reset}`);
  
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  
  for (const result of results) {
    const icon = result.success ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
    const status = result.success 
      ? `${c.green}PASSED${c.reset}` 
      : `${c.red}FAILED${c.reset}`;
    
    console.log(`\n${c.bold}${result.label}${c.reset}`);
    console.log(`${c.dim}${thinLine}${c.reset}`);
    console.log(`  ${icon} Estado: ${status}`);
    console.log(`  ⏱  Tiempo: ${c.yellow}${formatDuration(result.duration)}${c.reset}`);
    
    if (result.stats) {
      const { stats } = result;
      totalTests += stats.total;
      totalPassed += stats.passed;
      totalFailed += stats.failed;
      
      console.log(`  📋 Tests:  ${c.bold}${stats.total}${c.reset} total`);
      if (stats.passed > 0) {
        console.log(`             ${c.green}${stats.passed} passed${c.reset}`);
      }
      if (stats.failed > 0) {
        console.log(`             ${c.red}${stats.failed} failed${c.reset}`);
      }
      if (stats.skipped > 0) {
        console.log(`             ${c.yellow}${stats.skipped} skipped${c.reset}`);
      }
    }
  }
  
  // Totales
  console.log(`\n${c.cyan}${line}${c.reset}`);
  console.log(`${c.bold}                       📈 TOTALES${c.reset}`);
  console.log(`${c.cyan}${line}${c.reset}`);
  
  const allPassed = results.every(r => r.success);
  const statusBg = allPassed ? c.bgGreen : c.bgRed;
  const statusText = allPassed ? ' ALL PASSED ' : '  FAILED  ';
  
  console.log(`\n  ${statusBg}${c.bold}${c.white}${statusText}${c.reset}`);
  console.log(`\n  📊 Tests totales: ${c.bold}${totalTests}${c.reset}`);
  console.log(`     ${c.green}✓ Passed: ${totalPassed}${c.reset}`);
  if (totalFailed > 0) {
    console.log(`     ${c.red}✗ Failed: ${totalFailed}${c.reset}`);
  }
  console.log(`\n  ⏱  Tiempo total: ${c.bold}${c.yellow}${formatDuration(totalDuration)}${c.reset}`);
  console.log(`${c.cyan}${line}${c.reset}\n`);
  
  return allPassed;
}

async function main() {
  const startTime = Date.now();
  const results = [];
  
  console.log(`\n${colors.bold}${colors.cyan}🧪 Ejecutando suite completa de tests...${colors.reset}\n`);
  console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);
  
  // 1. Tests unitarios (Node.js)
  console.log(`${colors.bold}📦 Tests Unitarios (Node.js)${colors.reset}\n`);
  const unitResult = await runCommand('npm', ['test'], 'Tests Unitarios (Node.js)');
  unitResult.stats = parseUnitTestStats(unitResult.output);
  results.push(unitResult);
  
  console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);
  
  // 2. Tests de audio (Playwright)
  console.log(`${colors.bold}🔊 Tests de Audio (Playwright)${colors.reset}\n`);
  const audioResult = await runCommand('npm', ['run', 'test:audio'], 'Tests de Audio (Playwright)');
  audioResult.stats = parseAudioTestStats(audioResult.output);
  results.push(audioResult);
  
  // Resumen final
  const totalDuration = Date.now() - startTime;
  const allPassed = printSummary(results, totalDuration);
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
