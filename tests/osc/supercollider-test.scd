// ============================================================
// SynthiGME-web - Test de comunicación OSC con SuperCollider
// ============================================================
//
// Este script permite probar la comunicación bidireccional entre
// SynthiGME-web (Electron/Node) y SuperCollider.
//
// REQUISITOS:
// - SynthiGME-web corriendo con OSC habilitado, o
// - El script de test: node tests/osc/manual-test-supercollider.cjs
//
// PUERTOS:
// - Node/Electron escucha en: 57121
// - SuperCollider escucha en: 57120 (por defecto)
// - Grupo multicast: 239.255.0.1
//
// ============================================================

// ────────────────────────────────────────────────────────────
// INICIALIZACIÓN - Ejecutar este bloque primero (Ctrl+Enter)
// ────────────────────────────────────────────────────────────
(
// 1. Configurar NetAddr para envío al grupo multicast
// Node/Electron escucha en puerto 57121
~oscAddr = NetAddr("239.255.0.1", 57121);

// 2. Mostrar puerto de SC
("SuperCollider escucha en puerto: " ++ NetAddr.langPort).postln;

// 3. Listener para RECIBIR mensajes de SynthiGME-web
// Frecuencia del oscilador 1
OSCdef(\synthiWebFreq, { |msg, time, addr|
    "─────────────────────────────────────".postln;
    "RECIBIDO de SynthiGME-web:".postln;
    ("  Dirección: " ++ msg[0]).postln;
    ("  Valor: " ++ msg[1]).postln;
    ("  Desde: " ++ addr).postln;
}, '/SynthiGME/osc/1/frequency');

// Listener genérico para cualquier mensaje /SynthiGME/
OSCdef(\synthiWebAll, { |msg, time, addr|
    "─────────────────────────────────────".postln;
    "RECIBIDO (genérico):".postln;
    ("  Mensaje completo: " ++ msg).postln;
}, '/SynthiGME');

"".postln;
"============================================================".postln;
"SynthiGME OSC Test iniciado".postln;
"============================================================".postln;
"".postln;
("SuperCollider escucha en puerto: " ++ NetAddr.langPort).postln;
"Enviando a: 239.255.0.1:57121 (grupo multicast)".postln;
"".postln;
"Comandos disponibles:".postln;
"  ~oscAddr.sendMsg('/SynthiGME/osc/1/frequency', 7.5);".postln;
"  ~sendFreq.(5.0);  // atajo".postln;
"============================================================".postln;

// 4. Atajos útiles
~sendFreq = { |val| ~oscAddr.sendMsg('/SynthiGME/osc/1/frequency', val) };
~sendPatch = { |row, col, val| ~oscAddr.sendMsg('/SynthiGME/patchA/' ++ row ++ '/' ++ col, val) };
)

// ────────────────────────────────────────────────────────────
// COMANDOS DE PRUEBA - Ejecutar línea por línea (Ctrl+Enter)
// ────────────────────────────────────────────────────────────

// Osciladores
~oscAddr.sendMsg('/SynthiGME/osc/1/frequency', 5.0);
~oscAddr.sendMsg('/SynthiGME/osc/1/pulselevel', 7.0);
~oscAddr.sendMsg('/SynthiGME/osc/1/sinelevel', 3.5);
~oscAddr.sendMsg('/SynthiGME/osc/1/pulseshape', 2.0);
~oscAddr.sendMsg('/SynthiGME/osc/2/frequency', 2.0);

// Usando atajos
~sendFreq.(8.5);

// Patchbay Audio (conectar/desconectar)
~oscAddr.sendMsg('/SynthiGME/patchA/91/36', 1);  // conectar
~oscAddr.sendMsg('/SynthiGME/patchA/91/36', 0);  // desconectar
~sendPatch.(91, 36, 1);  // usando atajo

// Filtros
~oscAddr.sendMsg('/SynthiGME/filter/1/frequency', 8.0);
~oscAddr.sendMsg('/SynthiGME/filter/1/response', 6.5);
~oscAddr.sendMsg('/SynthiGME/filter/1/level', 5.0);

// Reverb
~oscAddr.sendMsg('/SynthiGME/reverb/mix', 4.0);
~oscAddr.sendMsg('/SynthiGME/reverb/level', 7.0);

// Echo
~oscAddr.sendMsg('/SynthiGME/echo/delay', 5.0);
~oscAddr.sendMsg('/SynthiGME/echo/feedback', 3.0);

// Noise
~oscAddr.sendMsg('/SynthiGME/noise/1/colour', 5.0);
~oscAddr.sendMsg('/SynthiGME/noise/1/level', 6.0);

// Envelope
~oscAddr.sendMsg('/SynthiGME/env/1/attack', 3.0);
~oscAddr.sendMsg('/SynthiGME/env/1/decay', 5.0);
~oscAddr.sendMsg('/SynthiGME/env/1/sustain', 7.0);
~oscAddr.sendMsg('/SynthiGME/env/1/release', 4.0);

// ────────────────────────────────────────────────────────────
// AUTOMATIZACIÓN - Rampa de valores
// ────────────────────────────────────────────────────────────
(
Routine({
    "Iniciando rampa de frecuencia...".postln;
    20.do { |i|
        var freq = i.linlin(0, 19, 0, 10);
        ~oscAddr.sendMsg('/SynthiGME/osc/1/frequency', freq);
        ("  Frecuencia: " ++ freq.round(0.1)).postln;
        0.25.wait;
    };
    "Rampa completada".postln;
}).play;
)

// ────────────────────────────────────────────────────────────
// LIMPIEZA - Liberar listeners
// ────────────────────────────────────────────────────────────
(
OSCdef(\synthiWebFreq).free;
OSCdef(\synthiWebAll).free;
"Listeners liberados".postln;
)
