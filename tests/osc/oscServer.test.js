/**
 * Tests para el servidor OSC
 * 
 * Verifica la codificación/decodificación de mensajes OSC
 * y la comunicación UDP básica.
 * 
 * @module tests/osc/oscServer.test
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';

// Cargar módulo CommonJS desde ESM
const require = createRequire(import.meta.url);
const { OSCServer, DEFAULT_CONFIG } = require('../../electron/oscServer.cjs');

describe('OSCServer', () => {
  
  describe('Configuración', () => {
    it('debe usar configuración por defecto', () => {
      const server = new OSCServer();
      assert.strictEqual(server.config.port, 57121);
      assert.strictEqual(server.config.multicastGroup, '224.0.1.1');
      // El prefijo se almacena sin barras, se formatean al enviar
      assert.strictEqual(server.config.prefix, 'SynthiGME');
    });
    
    it('debe permitir configuración personalizada', () => {
      const server = new OSCServer({ port: 9000, prefix: 'Test' });
      assert.strictEqual(server.config.port, 9000);
      assert.strictEqual(server.config.prefix, 'Test');
      // Valores no especificados mantienen default
      assert.strictEqual(server.config.multicastGroup, '224.0.1.1');
    });
  });

  describe('Codificación OSC', () => {
    let server;
    
    before(() => {
      server = new OSCServer();
    });

    it('debe codificar strings con padding a 4 bytes', () => {
      // "hi" = 2 bytes + 1 null = 3, padding a 4
      const buf1 = server._encodeString('hi');
      assert.strictEqual(buf1.length, 4);
      assert.strictEqual(buf1[0], 'h'.charCodeAt(0));
      assert.strictEqual(buf1[1], 'i'.charCodeAt(0));
      assert.strictEqual(buf1[2], 0); // null terminator
      assert.strictEqual(buf1[3], 0); // padding
      
      // "test" = 4 bytes + 1 null = 5, padding a 8
      const buf2 = server._encodeString('test');
      assert.strictEqual(buf2.length, 8);
    });

    it('debe codificar float32 en big-endian', () => {
      const buf = server._encodeFloat32(440.0);
      assert.strictEqual(buf.length, 4);
      // 440.0 en IEEE 754 big-endian
      assert.strictEqual(buf.readFloatBE(0), 440.0);
    });

    it('debe codificar int32 en big-endian', () => {
      const buf = server._encodeInt32(12345);
      assert.strictEqual(buf.length, 4);
      assert.strictEqual(buf.readInt32BE(0), 12345);
    });

    it('debe construir mensaje OSC completo', () => {
      const buf = server._buildOSCMessage('/test/addr', [1.5, 42]);
      assert.ok(Buffer.isBuffer(buf));
      assert.ok(buf.length > 0);
      
      // Verificar que se puede parsear
      const parsed = server._parseOSCMessage(buf);
      assert.strictEqual(parsed.address, '/test/addr');
      assert.strictEqual(parsed.args.length, 2);
      assert.ok(Math.abs(parsed.args[0] - 1.5) < 0.0001);
      assert.strictEqual(parsed.args[1], 42);
    });
  });

  describe('Decodificación OSC', () => {
    let server;
    
    before(() => {
      server = new OSCServer();
    });

    it('debe decodificar strings con padding', () => {
      const original = 'hello';
      const encoded = server._encodeString(original);
      const { value, newOffset } = server._decodeString(encoded, 0);
      assert.strictEqual(value, original);
      assert.strictEqual(newOffset, 8); // "hello" + null = 6, padded to 8
    });

    it('debe decodificar mensaje OSC de SuperCollider', () => {
      // Mensaje OSC típico: /SynthiGME/osc/1/frequency ,f 5.0
      const msg = server._buildOSCMessage('/SynthiGME/osc/1/frequency', [5.0]);
      const parsed = server._parseOSCMessage(msg);
      
      assert.strictEqual(parsed.address, '/SynthiGME/osc/1/frequency');
      assert.strictEqual(parsed.args.length, 1);
      assert.ok(Math.abs(parsed.args[0] - 5.0) < 0.0001);
    });

    it('debe manejar múltiples argumentos', () => {
      const msg = server._buildOSCMessage('/test', [1.0, 2, 'hello']);
      const parsed = server._parseOSCMessage(msg);
      
      assert.strictEqual(parsed.address, '/test');
      assert.strictEqual(parsed.args.length, 3);
      assert.ok(Math.abs(parsed.args[0] - 1.0) < 0.0001);
      assert.strictEqual(parsed.args[1], 2);
      assert.strictEqual(parsed.args[2], 'hello');
    });

    it('debe rechazar mensajes sin "/" inicial', () => {
      // Crear buffer con dirección inválida manualmente
      const invalidBuf = Buffer.from('invalid\0');
      const parsed = server._parseOSCMessage(invalidBuf);
      assert.strictEqual(parsed, null);
    });
  });

  describe('Ciclo de vida del servidor', () => {
    let server;
    
    // Usar puerto diferente para evitar conflictos
    before(() => {
      server = new OSCServer({ port: 57199 });
    });
    
    after(async () => {
      if (server.running) {
        await server.stop();
      }
    });

    it('debe reportar estado inicial correcto', () => {
      const status = server.getStatus();
      assert.strictEqual(status.running, false);
      assert.strictEqual(status.port, 57199);
    });

    it('debe iniciar y reportar running=true', async () => {
      await server.start();
      assert.strictEqual(server.running, true);
      
      const status = server.getStatus();
      assert.strictEqual(status.running, true);
    });

    it('debe ignorar múltiples llamadas a start()', async () => {
      // Ya está corriendo, no debe fallar
      await server.start();
      assert.strictEqual(server.running, true);
    });

    it('debe detenerse correctamente', async () => {
      await server.stop();
      assert.strictEqual(server.running, false);
    });

    it('debe ignorar múltiples llamadas a stop()', async () => {
      await server.stop();
      assert.strictEqual(server.running, false);
    });
  });

  describe('Envío y recepción (peer-to-peer)', () => {
    let server;
    
    before(async () => {
      server = new OSCServer({ port: 57198 });
      await server.start();
    });
    
    after(async () => {
      server.onMessage = null;
      await server.stop();
    });

    it('debe rechazar envío cuando servidor no está corriendo', async () => {
      const stoppedServer = new OSCServer({ port: 57197 });
      const result = stoppedServer.send('/test', [1.0]);
      assert.strictEqual(result, false);
    });

    it('debe filtrar mensajes propios (eco multicast)', async () => {
      // Cuando enviamos un mensaje multicast, el loopback nos lo devuelve.
      // El servidor debe filtrarlo porque rinfo.address es una IP local.
      const testAddress = '/SynthiGME/test/echo/' + Date.now();
      
      let receivedCount = 0;
      server.onMessage = (address) => {
        if (address === testAddress) receivedCount++;
      };
      
      // Enviar mensaje (se recibirá por loopback pero debe ser filtrado)
      server.send(testAddress, [42.5]);
      
      // Esperar tiempo suficiente para que el loopback llegue
      await new Promise(r => setTimeout(r, 200));
      
      assert.strictEqual(receivedCount, 0, 'Los mensajes propios deben ser filtrados por IP local');
    });

    it('debe tener IPs locales calculadas', () => {
      assert.ok(server._localAddresses.size > 0, 'Debe haber al menos una IP local');
      assert.ok(server._localAddresses.has('127.0.0.1'), 'Debe incluir loopback');
    });

    it('debe enviar mensaje sin error', () => {
      server.onMessage = null;
      const result = server.send('/SynthiGME/osc/1/frequency', [5.5]);
      assert.strictEqual(result, true);
    });
  });
});
