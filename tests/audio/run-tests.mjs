#!/usr/bin/env node
/**
 * Script para ejecutar tests de audio con mejor logging
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('=== Ejecutando Tests de Audio ===\n');

try {
  const result = execSync(
    'npx playwright test --config=tests/audio/playwright.config.js sanity.audio.test.js --reporter=line',
    {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 120000
    }
  );
  console.log(result);
  console.log('\n✅ Tests completados exitosamente');
} catch (error) {
  console.error('Error ejecutando tests:');
  console.error(error.stdout || '');
  console.error(error.stderr || '');
  console.error(error.message);
  process.exit(1);
}
