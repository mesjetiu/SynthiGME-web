import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

/**
 * Configuración de Playwright para tests de audio.
 * 
 * Estos tests ejecutan código con Web Audio API real en Chromium headless,
 * permitiendo verificar el procesamiento de audio con OfflineAudioContext
 * y AudioWorklets reales.
 * 
 * NOTA: Antes de ejecutar, iniciar el servidor con:
 *   npx http-server -p 8765 --cors
 * 
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Directorio donde buscar tests
  testDir: './',
  
  // Patrón de archivos de test
  testMatch: '**/*.audio.test.js',
  
  // Timeout por test (audio rendering puede ser lento)
  timeout: 60_000,
  
  // Timeout para expect
  expect: {
    timeout: 10_000
  },
  
  // Ejecutar tests en paralelo
  fullyParallel: true,
  
  // Fallar el build si hay tests.only() en CI
  forbidOnly: !!process.env.CI,
  
  // Reintentos en CI
  retries: process.env.CI ? 2 : 0,
  
  // Número de workers
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(rootDir, 'test-results/audio-report'), open: 'never' }]
  ],
  
  // Directorio de salida para screenshots, videos, etc.
  outputDir: path.join(rootDir, 'test-results/audio'),
  
  // Configuración del servidor web local
  webServer: {
    command: 'npx http-server -p 8766 --cors -c-1',
    port: 8766,
    cwd: rootDir,
    reuseExistingServer: true,  // Siempre reusar si existe
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe'
  },
  
  // Configuración de uso (browser settings)
  use: {
    // URL base para page.goto()
    baseURL: 'http://localhost:8766',
    
    // Capturar trace solo en fallo
    trace: 'on-first-retry',
    
    // Capturar screenshot en fallo
    screenshot: 'only-on-failure',
    
    // Timeouts adicionales
    actionTimeout: 10_000,
    navigationTimeout: 30_000
  },
  
  // Proyectos (browsers)
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // Chromium con Web Audio habilitado
        launchOptions: {
          args: [
            '--autoplay-policy=no-user-gesture-required',
            '--disable-features=AudioServiceOutOfProcess'
          ]
        }
      }
    }
  ]
});
