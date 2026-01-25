/**
 * Test de integración para electronAudio API
 * 
 * Ejecutar este script en la consola de DevTools de la app Electron:
 *   1. Abre DevTools (Ctrl+Shift+I)
 *   2. Copia y pega el contenido del script
 *   3. Los resultados se mostrarán en la consola
 * 
 * También se puede cargar como módulo si se añade al HTML.
 */

async function testElectronAudio() {
  console.log('=== Test de electronAudio API ===\n');
  
  // 1. Verificar que estamos en Electron
  if (!window.electronAPI?.isElectron) {
    console.error('❌ No estás en Electron. Este test solo funciona en la app de escritorio.');
    return;
  }
  console.log('✓ Ejecutando en Electron, plataforma:', window.electronAPI.platform);
  
  // 2. Verificar que electronAudio está disponible
  if (!window.electronAudio) {
    console.error('❌ window.electronAudio no está disponible. Verifica preload.cjs');
    return;
  }
  console.log('✓ electronAudio API disponible');
  
  // 3. Comprobar disponibilidad de multicanal
  console.log('\n--- Verificando disponibilidad multicanal ---');
  const availability = await window.electronAudio.isMultichannelAvailable();
  console.log('Resultado:', availability);
  
  if (!availability.available) {
    console.warn('⚠ Multicanal no disponible:', availability.reason);
    if (availability.suggestion) {
      console.info('Sugerencia:', availability.suggestion);
    }
    return;
  }
  console.log('✓ Multicanal disponible, backend:', availability.backend);
  
  // 4. Abrir stream de 8 canales
  console.log('\n--- Abriendo stream de 8 canales ---');
  const openResult = await window.electronAudio.openStream({
    channels: 8,
    sampleRate: 48000,
    deviceName: 'SynthiGME-Test'
  });
  
  if (!openResult.success) {
    console.error('❌ Error abriendo stream:', openResult.error);
    return;
  }
  console.log('✓ Stream abierto');
  
  // 5. Obtener info del stream
  const streamInfo = await window.electronAudio.getStreamInfo();
  console.log('Info del stream:', streamInfo);
  
  // 6. Escribir un tono de prueba (1 segundo de 440Hz en canal 0)
  console.log('\n--- Generando tono de prueba (440Hz, 1s, solo canal FL) ---');
  const sampleRate = 48000;
  const duration = 1.0; // segundos
  const channels = 8;
  const numSamples = sampleRate * duration;
  const buffer = new Float32Array(numSamples * channels);
  
  const frequency = 440; // Hz
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = 0.3 * Math.sin(2 * Math.PI * frequency * t);
    
    // Solo en canal 0 (FL)
    buffer[i * channels + 0] = sample;
  }
  
  console.log('Escribiendo', buffer.length, 'samples...');
  const writeResult = await window.electronAudio.write(buffer);
  console.log('Resultado escritura:', writeResult);
  
  // 7. Esperar un momento y cerrar
  console.log('\n--- Esperando 1.5s y cerrando stream ---');
  await new Promise(r => setTimeout(r, 1500));
  
  await window.electronAudio.closeStream();
  console.log('✓ Stream cerrado');
  
  console.log('\n=== Test completado ===');
  console.log('Si todo funcionó, deberías haber escuchado un tono de 440Hz');
  console.log('y deberías ver "SynthiGME-Test" en qpwgraph/pavucontrol');
}

// Ejecutar test
testElectronAudio();
