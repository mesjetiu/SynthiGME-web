/**
 * Script de prueba manual para comunicación OSC con SuperCollider
 * 
 * Ejecutar con: node tests/osc/manual-test-supercollider.cjs
 * 
 * Este script:
 * 1. Inicia un servidor OSC
 * 2. Escucha mensajes entrantes (de SuperCollider)
 * 3. Envía un mensaje de prueba cada 2 segundos
 * 
 * En SuperCollider, ejecutar:
 * 
 * // Recibir mensajes de SynthiGME-web
 * OSCdef(\synthiTest, { |msg, time, addr|
 *     "Recibido de web: % desde %".format(msg, addr).postln;
 * }, '/SynthiGME/osc/1/frequency');
 * 
 * // Enviar mensaje a SynthiGME-web
 * n = NetAddr("239.255.0.1", 57121);
 * n.sendMsg('/SynthiGME/osc/1/frequency', 7.5);
 */

const { OSCServer } = require('../../electron/oscServer.cjs');

console.log('='.repeat(60));
console.log('SynthiGME-web OSC Test - Comunicación con SuperCollider');
console.log('='.repeat(60));
console.log('');
console.log('Este script permite probar la comunicación OSC bidireccional.');
console.log('');
console.log('En SuperCollider, ejecutar para RECIBIR mensajes:');
console.log('');
console.log(`  OSCdef(\\synthiWebTest, { |msg, time, addr|
      "Recibido: % desde %".format(msg, addr).postln;
  }, '/SynthiGME/osc/1/frequency');`);
console.log('');
console.log('Para ENVIAR mensajes a este script:');
console.log('');
console.log(`  n = NetAddr("239.255.0.1", 57121);
  n.sendMsg('/SynthiGME/osc/1/frequency', 7.5);`);
console.log('');
console.log('='.repeat(60));
console.log('');

const server = new OSCServer();

// Callback cuando se recibe un mensaje
server.onMessage = (address, args, rinfo) => {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.log(`[${timestamp}] RECIBIDO de ${rinfo.address}:${rinfo.port}`);
  console.log(`           Dirección: ${address}`);
  console.log(`           Argumentos: ${JSON.stringify(args)}`);
  console.log('');
};

server.onError = (err) => {
  console.error('ERROR:', err.message);
};

server.onReady = () => {
  console.log('Servidor listo. Esperando mensajes...');
  console.log('Presiona Ctrl+C para salir.');
  console.log('');
  
  // Enviar mensaje de prueba cada 2 segundos
  let frequency = 0;
  const interval = setInterval(() => {
    frequency = (frequency + 0.5) % 10;
    const address = '/SynthiGME/osc/1/frequency';
    
    console.log(`[ENVIANDO] ${address} ${frequency.toFixed(1)}`);
    server.send(address, [frequency]);
  }, 2000);
  
  // Limpiar al salir
  process.on('SIGINT', async () => {
    console.log('\n\nCerrando servidor OSC...');
    clearInterval(interval);
    await server.stop();
    console.log('¡Hasta luego!');
    process.exit(0);
  });
};

// Iniciar servidor
server.start().catch((err) => {
  console.error('Error al iniciar servidor:', err.message);
  process.exit(1);
});
