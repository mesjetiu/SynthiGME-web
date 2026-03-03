/**
 * Tests del módulo MIDI Access y MIDI Learn Manager.
 * 
 * Estilo: tests unitarios de lógica pura (parsing de mensajes, buildMIDIKey,
 * conversión de valores, gestión de mappings). Sin importar módulos con
 * side effects de browser (navigator.requestMIDIAccess).
 * 
 * @module tests/midi/midiLearn.test
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS REPLICADOS (sin importar módulos con side effects de browser)
// La lógica de parsing y key-building se replica aquí para testear el contrato.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera la clave única para un mensaje MIDI (réplica de midiLearnManager.js)
 */
function buildMIDIKey(deviceId, channel, type, number) {
  const normalizedType = type === 'noteoff' ? 'noteon' : type;
  const num = normalizedType === 'pitchbend' ? 0 : number;
  return `${deviceId}:${channel}:${normalizedType}:${num}`;
}

/**
 * Genera el identificador único de un control destino (réplica)
 */
function buildControlId(target) {
  if (target.controlKey) {
    return `${target.moduleId}:${target.controlType || 'knob'}:${target.controlKey}`;
  }
  return `${target.moduleId}:${target.controlType || 'knob'}:${target.knobIndex}`;
}

/**
 * Parsea un mensaje MIDI raw (réplica de midiAccess.js _parseMessage)
 */
function parseMessage(data) {
  if (!data || data.length < 1) return null;

  const statusByte = data[0];
  const channel = statusByte & 0x0F;
  const command = statusByte & 0xF0;

  switch (command) {
    case 0x80:
      return { type: 'noteoff', channel, note: data[1], velocity: data[2] };

    case 0x90: {
      const velocity = data[2];
      if (velocity === 0) {
        return { type: 'noteoff', channel, note: data[1], velocity: 0 };
      }
      return { type: 'noteon', channel, note: data[1], velocity };
    }

    case 0xB0:
      return { type: 'cc', channel, cc: data[1], value: data[2] };

    case 0xE0: {
      const value = (data[2] << 7) | data[1];
      return { type: 'pitchbend', channel, value };
    }

    default:
      return null;
  }
}

/**
 * Convierte nota MIDI a nombre (réplica)
 */
function noteNumberToName(noteNumber) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(noteNumber / 12) - 1;
  const name = names[noteNumber % 12];
  return `${name}${octave}`;
}

/**
 * Convierte valor MIDI CC (0–127) a rango de knob
 */
function ccToKnobValue(ccValue, min, max) {
  const normalized = ccValue / 127;
  return min + normalized * (max - min);
}

/**
 * Convierte valor de pitch bend (0–16383) a rango de knob
 */
function pitchBendToKnobValue(bendValue, min, max) {
  const normalized = bendValue / 16383;
  return min + normalized * (max - min);
}


// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('MIDI — Parsing de mensajes', () => {

  // ── Control Change ──────────────────────────────────────────────────────

  describe('Control Change (CC)', () => {
    it('parsea CC en canal 0 correctamente', () => {
      // Status 0xB0 = CC, canal 0
      const msg = parseMessage(new Uint8Array([0xB0, 74, 100]));
      assert.strictEqual(msg.type, 'cc');
      assert.strictEqual(msg.channel, 0);
      assert.strictEqual(msg.cc, 74);
      assert.strictEqual(msg.value, 100);
    });

    it('parsea CC en canal 15', () => {
      const msg = parseMessage(new Uint8Array([0xBF, 1, 64]));
      assert.strictEqual(msg.type, 'cc');
      assert.strictEqual(msg.channel, 15);
      assert.strictEqual(msg.cc, 1);
      assert.strictEqual(msg.value, 64);
    });

    it('parsea CC con valor 0 (mínimo)', () => {
      const msg = parseMessage(new Uint8Array([0xB0, 7, 0]));
      assert.strictEqual(msg.value, 0);
    });

    it('parsea CC con valor 127 (máximo)', () => {
      const msg = parseMessage(new Uint8Array([0xB0, 7, 127]));
      assert.strictEqual(msg.value, 127);
    });
  });

  // ── Note On / Off ──────────────────────────────────────────────────────

  describe('Note On / Off', () => {
    it('parsea Note On correctamente', () => {
      const msg = parseMessage(new Uint8Array([0x90, 60, 100]));
      assert.strictEqual(msg.type, 'noteon');
      assert.strictEqual(msg.channel, 0);
      assert.strictEqual(msg.note, 60);
      assert.strictEqual(msg.velocity, 100);
    });

    it('Note On con velocity 0 se interpreta como Note Off', () => {
      const msg = parseMessage(new Uint8Array([0x90, 60, 0]));
      assert.strictEqual(msg.type, 'noteoff');
      assert.strictEqual(msg.velocity, 0);
    });

    it('parsea Note Off correctamente', () => {
      const msg = parseMessage(new Uint8Array([0x80, 48, 64]));
      assert.strictEqual(msg.type, 'noteoff');
      assert.strictEqual(msg.note, 48);
    });

    it('parsea Note On en canal 9 (percusión)', () => {
      const msg = parseMessage(new Uint8Array([0x99, 36, 127]));
      assert.strictEqual(msg.channel, 9);
      assert.strictEqual(msg.type, 'noteon');
    });
  });

  // ── Pitch Bend ─────────────────────────────────────────────────────────

  describe('Pitch Bend', () => {
    it('parsea pitch bend centro (8192)', () => {
      // Centro: LSB=0, MSB=64 → (64 << 7) | 0 = 8192
      const msg = parseMessage(new Uint8Array([0xE0, 0, 64]));
      assert.strictEqual(msg.type, 'pitchbend');
      assert.strictEqual(msg.value, 8192);
    });

    it('parsea pitch bend mínimo (0)', () => {
      const msg = parseMessage(new Uint8Array([0xE0, 0, 0]));
      assert.strictEqual(msg.value, 0);
    });

    it('parsea pitch bend máximo (16383)', () => {
      // Max: LSB=127, MSB=127 → (127 << 7) | 127 = 16383
      const msg = parseMessage(new Uint8Array([0xE0, 127, 127]));
      assert.strictEqual(msg.value, 16383);
    });

    it('parsea pitch bend en canal 5', () => {
      const msg = parseMessage(new Uint8Array([0xE5, 0, 64]));
      assert.strictEqual(msg.channel, 5);
    });
  });

  // ── Mensajes no soportados ─────────────────────────────────────────────

  describe('Mensajes no soportados', () => {
    it('ignora Program Change', () => {
      const msg = parseMessage(new Uint8Array([0xC0, 5]));
      assert.strictEqual(msg, null);
    });

    it('ignora Channel Aftertouch', () => {
      const msg = parseMessage(new Uint8Array([0xD0, 100]));
      assert.strictEqual(msg, null);
    });

    it('devuelve null para data vacía', () => {
      assert.strictEqual(parseMessage(null), null);
      assert.strictEqual(parseMessage(new Uint8Array([])), null);
    });
  });
});


describe('MIDI — Claves de mapping', () => {

  describe('buildMIDIKey', () => {
    it('genera clave para CC', () => {
      const key = buildMIDIKey('device1', 0, 'cc', 74);
      assert.strictEqual(key, 'device1:0:cc:74');
    });

    it('genera clave para Note On', () => {
      const key = buildMIDIKey('device1', 0, 'noteon', 60);
      assert.strictEqual(key, 'device1:0:noteon:60');
    });

    it('normaliza noteoff a noteon', () => {
      const keyOn = buildMIDIKey('device1', 0, 'noteon', 60);
      const keyOff = buildMIDIKey('device1', 0, 'noteoff', 60);
      assert.strictEqual(keyOn, keyOff);
    });

    it('pitch bend usa número 0', () => {
      const key = buildMIDIKey('device1', 3, 'pitchbend', 999);
      assert.strictEqual(key, 'device1:3:pitchbend:0');
    });

    it('claves de distintos canales son diferentes', () => {
      const key1 = buildMIDIKey('device1', 0, 'cc', 74);
      const key2 = buildMIDIKey('device1', 1, 'cc', 74);
      assert.notStrictEqual(key1, key2);
    });

    it('claves de distintos dispositivos son diferentes', () => {
      const key1 = buildMIDIKey('devA', 0, 'cc', 74);
      const key2 = buildMIDIKey('devB', 0, 'cc', 74);
      assert.notStrictEqual(key1, key2);
    });
  });

  describe('buildControlId', () => {
    it('genera ID para oscilador knob por índice', () => {
      const id = buildControlId({ moduleId: 'panel1-osc-1', knobIndex: 3 });
      assert.strictEqual(id, 'panel1-osc-1:knob:3');
    });

    it('genera ID para knob con controlKey (noise)', () => {
      const id = buildControlId({ moduleId: 'noise-gen-1', controlType: 'knob', controlKey: 'colour' });
      assert.strictEqual(id, 'noise-gen-1:knob:colour');
    });

    it('genera ID para slider (output)', () => {
      const id = buildControlId({ moduleId: 'output-channel-1', controlType: 'slider', knobIndex: -1 });
      assert.strictEqual(id, 'output-channel-1:slider:-1');
    });

    it('controlKey tiene prioridad sobre knobIndex', () => {
      const id = buildControlId({ moduleId: 'mod', controlType: 'knob', controlKey: 'rangeX', knobIndex: 5 });
      assert.strictEqual(id, 'mod:knob:rangeX');
    });
  });
});


describe('MIDI — Conversión de valores', () => {

  describe('CC → Rango de knob', () => {
    it('CC 0 → valor mínimo del knob', () => {
      assert.strictEqual(ccToKnobValue(0, 0, 1), 0);
    });

    it('CC 127 → valor máximo del knob', () => {
      assert.strictEqual(ccToKnobValue(127, 0, 1), 1);
    });

    it('CC 64 ≈ centro del rango (0–10)', () => {
      const val = ccToKnobValue(64, 0, 10);
      assert.ok(Math.abs(val - 5.04) < 0.1, `Esperado ~5.04, recibido ${val}`);
    });

    it('maneja rangos negativos (-5 a +5)', () => {
      const min = ccToKnobValue(0, -5, 5);
      const max = ccToKnobValue(127, -5, 5);
      assert.strictEqual(min, -5);
      assert.strictEqual(max, 5);
    });

    it('rango 0–1 (dial normalizado)', () => {
      const mid = ccToKnobValue(63, 0, 1);
      assert.ok(mid > 0.49 && mid < 0.51, `Esperado ~0.496, recibido ${mid}`);
    });
  });

  describe('Pitch Bend → Rango de knob', () => {
    it('bend 0 → valor mínimo', () => {
      assert.strictEqual(pitchBendToKnobValue(0, 0, 1), 0);
    });

    it('bend 16383 → valor máximo', () => {
      assert.strictEqual(pitchBendToKnobValue(16383, 0, 1), 1);
    });

    it('bend 8192 ≈ centro', () => {
      const val = pitchBendToKnobValue(8192, -1, 1);
      assert.ok(Math.abs(val) < 0.01, `Esperado ~0, recibido ${val}`);
    });

    it('resolución 14 bits supera a 7 bits (CC)', () => {
      // Con pitch bend, distinguimos 16384 valores vs 128 del CC
      const a = pitchBendToKnobValue(8192, 0, 1);
      const b = pitchBendToKnobValue(8193, 0, 1);
      const diff = Math.abs(b - a);
      const ccStep = 1 / 127;
      assert.ok(diff < ccStep, 'Pitch bend debe tener más resolución que CC');
    });
  });
});


describe('MIDI — Nombres de notas', () => {
  it('nota 60 = C4 (Do central)', () => {
    assert.strictEqual(noteNumberToName(60), 'C4');
  });

  it('nota 69 = A4 (La 440Hz)', () => {
    assert.strictEqual(noteNumberToName(69), 'A4');
  });

  it('nota 0 = C-1', () => {
    assert.strictEqual(noteNumberToName(0), 'C-1');
  });

  it('nota 127 = G9', () => {
    assert.strictEqual(noteNumberToName(127), 'G9');
  });

  it('nota 61 = C#4', () => {
    assert.strictEqual(noteNumberToName(61), 'C#4');
  });

  it('nota 66 = F#4', () => {
    assert.strictEqual(noteNumberToName(66), 'F#4');
  });
});


describe('MIDI — Simulación de mapa de mappings', () => {
  let mappings;
  let controlIndex;

  beforeEach(() => {
    mappings = new Map();
    controlIndex = new Map();
  });

  function addMapping(deviceId, channel, type, number, target) {
    const midiKey = buildMIDIKey(deviceId, channel, type, number);
    const controlId = buildControlId(target);

    // Si ya existía un mapping con esta clave MIDI, limpiar índice
    if (mappings.has(midiKey)) {
      const old = mappings.get(midiKey);
      controlIndex.delete(buildControlId(old.target));
    }

    // Si el control ya tenía mapping, limpiar
    const prevMidiKey = controlIndex.get(controlId);
    if (prevMidiKey && prevMidiKey !== midiKey) {
      mappings.delete(prevMidiKey);
    }

    mappings.set(midiKey, { midiKey, deviceId, channel, type, number, target });
    controlIndex.set(controlId, midiKey);
  }

  it('añade un mapping correctamente', () => {
    const target = { moduleId: 'panel1-osc-1', knobIndex: 0 };
    addMapping('dev1', 0, 'cc', 74, target);
    assert.strictEqual(mappings.size, 1);
    assert.strictEqual(controlIndex.size, 1);
  });

  it('reemplaza mapping si el mismo CC se reasigna', () => {
    const target1 = { moduleId: 'panel1-osc-1', knobIndex: 0 };
    const target2 = { moduleId: 'panel1-osc-1', knobIndex: 1 };
    
    addMapping('dev1', 0, 'cc', 74, target1);
    addMapping('dev1', 0, 'cc', 74, target2);
    
    assert.strictEqual(mappings.size, 1);
    assert.strictEqual(mappings.get('dev1:0:cc:74').target.knobIndex, 1);
  });

  it('reemplaza mapping si el mismo control se reasigna a otro CC', () => {
    const target = { moduleId: 'panel1-osc-1', knobIndex: 0 };
    
    addMapping('dev1', 0, 'cc', 74, target);
    addMapping('dev1', 0, 'cc', 75, target);
    
    // Solo debe quedar el CC 75
    assert.strictEqual(mappings.size, 1);
    assert.ok(mappings.has('dev1:0:cc:75'));
    assert.ok(!mappings.has('dev1:0:cc:74'));
  });

  it('permite mappings de distintos dispositivos al mismo CC', () => {
    const target1 = { moduleId: 'panel1-osc-1', knobIndex: 0 };
    const target2 = { moduleId: 'panel1-osc-2', knobIndex: 0 };
    
    addMapping('devA', 0, 'cc', 74, target1);
    addMapping('devB', 0, 'cc', 74, target2);
    
    assert.strictEqual(mappings.size, 2);
  });

  it('eliminar mapping por clave MIDI', () => {
    const target = { moduleId: 'panel1-osc-1', knobIndex: 0 };
    addMapping('dev1', 0, 'cc', 74, target);
    
    const midiKey = 'dev1:0:cc:74';
    const controlId = buildControlId(target);
    controlIndex.delete(controlId);
    mappings.delete(midiKey);
    
    assert.strictEqual(mappings.size, 0);
    assert.strictEqual(controlIndex.size, 0);
  });

  it('serialización/deserialización round-trip', () => {
    const target = { moduleId: 'panel1-osc-1', controlType: 'knob', knobIndex: 3, label: 'Shape 1' };
    addMapping('dev1', 0, 'cc', 21, target);
    addMapping('dev1', 1, 'pitchbend', 0, { moduleId: 'panel1-osc-2', knobIndex: 0 });
    
    // Serializar
    const exported = Array.from(mappings.values()).map(m => ({
      midiKey: m.midiKey,
      channel: m.channel,
      type: m.type,
      number: m.number,
      target: m.target
    }));
    const json = JSON.stringify({ version: 1, mappings: exported });
    
    // Deserializar
    const data = JSON.parse(json);
    const restored = new Map();
    for (const m of data.mappings) {
      restored.set(m.midiKey, m);
    }
    
    assert.strictEqual(restored.size, 2);
    assert.ok(restored.has('dev1:0:cc:21'));
    assert.ok(restored.has('dev1:1:pitchbend:0'));
    assert.strictEqual(restored.get('dev1:0:cc:21').target.label, 'Shape 1');
  });
});
