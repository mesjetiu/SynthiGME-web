/**
 * Tests del worklet real `vca-processor` (VCA CEM 3330 de los Output Channels).
 *
 * Hasta septiembre de 2026 este fichero replicaba las fórmulas del VCA
 * (curva 10 dB/V, saturación, slew) y las probaba a sí mismas. Ahora se
 * carga el worklet de verdad en Node y se le hace procesar bloques:
 *
 * - voltageToGain / applySaturation: la curva del chip, medida en la clase.
 * - process(): corte mecánico, ganancia en régimen permanente, suma
 *   fader + CV, cvScale, filtro anti-click (τ = 5 ms medido en muestras),
 *   resync por mensaje, estéreo, error interno → silencio + aviso.
 *
 * La conversión dial → voltaje no vive aquí (es del hilo principal,
 * vcaDialToVoltage en voltageConstants.js, ya cubierta en
 * tests/utils/voltageConstants.test.js).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const SAMPLE_RATE = 48000;
const BLOCK = 128;

// ═══════════════════════════════════════════════════════════════════════════
// Entorno de worklet en Node
// ═══════════════════════════════════════════════════════════════════════════

function createWorkletEnvironment() {
  globalThis.sampleRate = SAMPLE_RATE;
  globalThis.currentTime = 0;
  globalThis.currentFrame = 0;
  if (!globalThis.AudioWorkletProcessor) {
    globalThis.AudioWorkletProcessor = class AudioWorkletProcessor {
      constructor() {
        this.port = { onmessage: null, _messages: [], postMessage(m) { this._messages.push(m); } };
      }
    };
  }
  const registered = {};
  globalThis.registerProcessor = (name, cls) => { registered[name] = cls; };
  return registered;
}

let VCAProcessor;

async function loadProcessor() {
  const registered = createWorkletEnvironment();
  await import(`../../src/assets/js/worklets/vcaProcessor.worklet.js?t=${Date.now()}`);
  VCAProcessor = registered['vca-processor'];
  assert.ok(VCAProcessor, 'el worklet debe registrarse como "vca-processor"');
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function createProcessor(processorOptions) {
  const proc = new VCAProcessor(processorOptions ? { processorOptions } : undefined);
  if (!proc.port._messages) {
    proc.port._messages = [];
    proc.port.postMessage = m => proc.port._messages.push(m);
  }
  return proc;
}

function params({ dialVoltage = 0, cvScale = 4, cutoffEnabled = 1, slewTime = 0.005 } = {}) {
  return {
    dialVoltage: new Float32Array([dialVoltage]),
    cvScale: new Float32Array([cvScale]),
    cutoffEnabled: new Float32Array([cutoffEnabled]),
    slewTime: new Float32Array([slewTime])
  };
}

/**
 * Procesa un bloque. `audio` es un array de canales; `cv` (opcional) un
 * Float32Array mono en escala normalizada (-1..+1).
 */
function processBlock(proc, audio, p, cv = null) {
  const inputs = cv ? [audio, [cv]] : [audio];
  const outputs = [audio.map(ch => new Float32Array(ch.length))];
  const ok = proc.process(inputs, outputs, p);
  assert.equal(ok, true);
  return outputs[0];
}

/** Deja que el slew se asiente (≫ 5τ) y devuelve la ganancia en régimen permanente. */
function steadyGain(proc, p, cv = null, blocks = 40) {
  const dc = [new Float32Array(BLOCK).fill(1)];
  let out;
  for (let i = 0; i < blocks; i++) out = processBlock(proc, dc, p, cv);
  return out[0][BLOCK - 1];
}

const dB = g => 20 * Math.log10(g);

// ═══════════════════════════════════════════════════════════════════════════

describe('vca-processor worklet', () => {
  beforeEach(loadProcessor);

  describe('Registro y parámetros', () => {
    it('cuatro AudioParams k-rate con los rangos del hardware', () => {
      const desc = Object.fromEntries(VCAProcessor.parameterDescriptors.map(d => [d.name, d]));
      assert.deepEqual(Object.keys(desc).sort(), ['cutoffEnabled', 'cvScale', 'dialVoltage', 'slewTime']);
      assert.equal(desc.dialVoltage.defaultValue, -12, 'arranca en silencio');
      assert.equal(desc.dialVoltage.minValue, -12);
      assert.equal(desc.dialVoltage.maxValue, 0);
      assert.equal(desc.cvScale.defaultValue, 4);
      assert.equal(desc.cutoffEnabled.defaultValue, 1);
      assert.equal(desc.slewTime.defaultValue, 0.005);
      assert.ok(desc.slewTime.minValue > 0, 'slewTime nunca 0: evita división por cero');
      for (const d of Object.values(desc)) assert.equal(d.automationRate, 'k-rate');
    });

    it('constantes por defecto del CEM 3330 y estado inicial en silencio', () => {
      const proc = createProcessor();
      assert.equal(proc.dbPerVolt, 10);
      assert.equal(proc.cutoffThresholdDb, -120);
      assert.equal(proc.saturationLinear, 0);
      assert.equal(proc.saturationHardLimit, 3);
      assert.equal(proc.saturationSoftness, 2);
      assert.equal(proc._voltageSmoothed, -12);
    });

    it('processorOptions sobrescriben las constantes', () => {
      const proc = createProcessor({ dbPerVolt: 6, cutoffThresholdDb: -60, saturationHardLimit: 2 });
      assert.equal(proc.dbPerVolt, 6);
      assert.equal(proc.cutoffThresholdDb, -60);
      assert.equal(proc.saturationHardLimit, 2);
      assert.equal(proc.minGainLinear, Math.pow(10, -60 / 20));
    });
  });

  describe('Curva del VCA (voltageToGain)', () => {
    it('0 V → ganancia unidad; −6 V → −60 dB; −12 V → silencio', () => {
      const proc = createProcessor();
      assert.equal(proc.voltageToGain(0), 1);
      assert.ok(Math.abs(dB(proc.voltageToGain(-6)) - (-60)) < 1e-9);
      assert.equal(proc.voltageToGain(-12), 0, '−120 dB es el umbral de corte');
      assert.equal(proc.voltageToGain(-20), 0);
    });

    it('10 dB por voltio en toda la zona lineal', () => {
      const proc = createProcessor();
      for (let v = -10; v < 0; v += 1) {
        const step = dB(proc.voltageToGain(v)) - dB(proc.voltageToGain(v - 1));
        assert.ok(Math.abs(step - 10) < 1e-9, `entre ${v - 1} y ${v} V`);
      }
    });

    it('la curva es monótona creciente', () => {
      const proc = createProcessor();
      let prev = -1;
      for (let v = -12; v <= 6; v += 0.25) {
        const g = proc.voltageToGain(v);
        assert.ok(g >= prev, `v=${v}`);
        prev = g;
      }
    });

    it('voltajes ≤ 0 no se saturan; > 0 van con tanh hacia el tope de +3 V (+30 dB)', () => {
      const proc = createProcessor();
      assert.equal(proc.applySaturation(-3), -3);
      assert.equal(proc.applySaturation(0), 0);
      assert.ok(proc.applySaturation(100) <= 3, 'nunca pasa del límite duro');
      assert.ok(proc.applySaturation(100) > 2.99, 'pero se acerca a él');
      const maxGain = proc.voltageToGain(100);
      assert.ok(Math.abs(dB(maxGain) - 30) < 0.1, `tope +30 dB (${dB(maxGain).toFixed(2)})`);
    });

    it('QUIRK: justo por encima de 0 V la tanh(2·x) DOBLA el voltaje (+1 V → ≈ +17,5 dB)', () => {
      // Con softness = 2 la pendiente en el origen es 2, no 1: la curva no es
      // continua en derivada al pasar de 0 V y un CV pequeño positivo sube
      // más de 10 dB/V. El vcaCalculateGain del hilo principal, en cambio,
      // siempre comprime (+1 V → +6 dB). Se fija aquí tal cual está para
      // que cualquier cambio sea consciente; ver AUDITORIA-2026-09.md.
      const proc = createProcessor();
      assert.ok(Math.abs(proc.applySaturation(1) - Math.tanh(2 / 3) * 3) < 1e-12);
      assert.ok(proc.applySaturation(1) > 1, 'el "saturador" amplifica en esta zona');
      assert.ok(Math.abs(dB(proc.voltageToGain(1)) - 17.48) < 0.05);
    });
  });

  describe('Corte mecánico', () => {
    it('dial en −12 V → silencio aunque haya CV positivo, y resetea el slew', () => {
      const proc = createProcessor();
      proc._voltageSmoothed = -2;
      const audio = [new Float32Array(BLOCK).fill(0.5)];
      const cv = new Float32Array(BLOCK).fill(1);
      const [out] = processBlock(proc, audio, params({ dialVoltage: -12 }), cv);
      assert.ok(out.every(v => v === 0));
      assert.equal(proc._voltageSmoothed, -12);
    });

    it('con cutoffEnabled=0 el CV sí levanta el dial desde −12 V', () => {
      const proc = createProcessor();
      const cv = new Float32Array(BLOCK).fill(1);            // +4 V
      const g = steadyGain(proc, params({ dialVoltage: -12, cutoffEnabled: 0 }), cv);
      assert.ok(Math.abs(dB(g) - (-80)) < 0.01, `−12 + 4 = −8 V → −80 dB (${dB(g).toFixed(2)})`);
    });

    it('sin entrada de audio devuelve silencio y sigue vivo', () => {
      const proc = createProcessor();
      const outputs = [[new Float32Array(BLOCK).fill(0.7)]];
      assert.equal(proc.process([[]], outputs, params()), true);
      assert.ok(outputs[0][0].every(v => v === 0));
    });
  });

  describe('Ganancia en régimen permanente', () => {
    it('dial 0 V sin CV → unidad', () => {
      const proc = createProcessor();
      assert.ok(Math.abs(steadyGain(proc, params({ dialVoltage: 0 })) - 1) < 1e-6);
    });

    it('dial −6 V sin CV → −60 dB', () => {
      const proc = createProcessor();
      assert.ok(Math.abs(dB(steadyGain(proc, params({ dialVoltage: -6 }))) - (-60)) < 0.01);
    });

    it('CV se suma en voltios: dial −4 V + CV 1.0·4 = 0 V → unidad', () => {
      const proc = createProcessor();
      const cv = new Float32Array(BLOCK).fill(1);
      assert.ok(Math.abs(steadyGain(proc, params({ dialVoltage: -4 }), cv) - 1) < 1e-6);
    });

    it('CV negativo resta: dial 0 V + CV −0.5·4 = −2 V → −20 dB', () => {
      const proc = createProcessor();
      const cv = new Float32Array(BLOCK).fill(-0.5);
      assert.ok(Math.abs(dB(steadyGain(proc, params({ dialVoltage: 0 }), cv)) - (-20)) < 0.01);
    });

    it('cvScale escala el CV: el mismo CV con cvScale 8 vale el doble de voltios', () => {
      const cv = new Float32Array(BLOCK).fill(-0.5);
      const g4 = dB(steadyGain(createProcessor(), params({ dialVoltage: 0, cvScale: 4 }), cv));
      const g8 = dB(steadyGain(createProcessor(), params({ dialVoltage: 0, cvScale: 8 }), cv));
      assert.ok(Math.abs(g4 - (-20)) < 0.01);
      assert.ok(Math.abs(g8 - (-40)) < 0.01);
    });

    it('CV positivo por encima de 0 V satura: +4 V no da +40 dB', () => {
      const proc = createProcessor();
      const cv = new Float32Array(BLOCK).fill(1);
      const g = dB(steadyGain(proc, params({ dialVoltage: 0 }), cv));
      assert.ok(g > 0, 'amplifica');
      assert.ok(g < 30, `pero con tope (${g.toFixed(2)} dB)`);
      assert.ok(Math.abs(g - dB(proc.voltageToGain(4))) < 1e-6, 'coincide con la curva');
    });

    it('un bloque de CV vacío cuenta como "sin CV"', () => {
      const proc = createProcessor();
      const g = steadyGain(proc, params({ dialVoltage: -6 }), new Float32Array(0));
      assert.ok(Math.abs(dB(g) - (-60)) < 0.01);
    });
  });

  describe('Filtro anti-click (slew, τ = 5 ms)', () => {
    it('el coeficiente sale de τ y fs, y solo se recalcula cuando cambia slewTime', () => {
      const proc = createProcessor();
      const audio = [new Float32Array(BLOCK)];
      processBlock(proc, audio, params({ slewTime: 0.005 }));
      // El AudioParam llega en Float32: comparar con la misma precisión
      const tau = Math.fround(0.005);
      assert.ok(Math.abs(proc._slewCoef - (1 - Math.exp(-1 / (SAMPLE_RATE * tau)))) < 1e-12);
      const before = proc._slewCoef;
      processBlock(proc, audio, params({ slewTime: 0.005 }));
      assert.equal(proc._slewCoef, before);
      processBlock(proc, audio, params({ slewTime: 0.05 }));
      assert.ok(proc._slewCoef < before, 'τ mayor → coeficiente menor');
    });

    it('un salto de fader tarda ≈ τ en recorrer el 63 % (medido en muestras)', () => {
      const proc = createProcessor();
      proc._voltageSmoothed = -12;
      // Saltar a 0 V y medir el voltaje suavizado tras exactamente τ muestras
      const tauSamples = Math.round(SAMPLE_RATE * 0.005);   // 240
      const audio = [new Float32Array(tauSamples).fill(1)];
      processBlock(proc, audio, params({ dialVoltage: 0 }));
      const traveled = (proc._voltageSmoothed - (-12)) / 12;
      assert.ok(Math.abs(traveled - (1 - Math.exp(-1))) < 0.01, `63 % esperado, ${(traveled * 100).toFixed(1)} %`);
    });

    it('la ganancia sube sin saltos: ninguna muestra da un escalón brusco', () => {
      const proc = createProcessor();
      const audio = [new Float32Array(BLOCK).fill(1)];
      const [out] = processBlock(proc, audio, params({ dialVoltage: 0 }));
      assert.ok(out[0] < 0.05, 'arranca cerca del silencio');
      for (let i = 1; i < BLOCK; i++) {
        assert.ok(out[i] >= out[i - 1], `monótono en ${i}`);
        assert.ok(out[i] - out[i - 1] < 0.02, `sin escalón en ${i}`);
      }
    });

    it('el filtro actúa sobre fader + CV: un escalón de CV también se suaviza', () => {
      const proc = createProcessor();
      steadyGain(proc, params({ dialVoltage: -4 }));         // asentado en −4 V (−40 dB)
      const cv = new Float32Array(BLOCK).fill(1);            // salto a 0 V
      const [out] = processBlock(proc, [new Float32Array(BLOCK).fill(1)], params({ dialVoltage: -4 }), cv);
      assert.ok(out[0] < 0.02, 'la primera muestra sigue casi en −40 dB');
      assert.ok(out[BLOCK - 1] > out[0], 'y va subiendo');
      assert.ok(out[BLOCK - 1] < 1, 'sin llegar aún a la unidad');
    });

    it('AM a 1 kHz queda casi anulada; a 5 Hz pasa casi entera', () => {
      const depth = (freq) => {
        const proc = createProcessor();
        const p = params({ dialVoltage: -4 });
        const total = SAMPLE_RATE * 0.5;
        let min = Infinity, max = -Infinity;
        for (let start = 0; start < total; start += BLOCK) {
          const cv = new Float32Array(BLOCK);
          for (let i = 0; i < BLOCK; i++) cv[i] = 0.5 * Math.sin(2 * Math.PI * freq * (start + i) / SAMPLE_RATE);
          const [out] = processBlock(proc, [new Float32Array(BLOCK).fill(1)], p, cv);
          if (start > total / 2) {
            for (const v of out) { if (v < min) min = v; if (v > max) max = v; }
          }
        }
        return (max - min) / (max + min);   // profundidad de modulación relativa
      };
      const slow = depth(5);
      const fast = depth(1000);
      assert.ok(slow > 0.9, `5 Hz: profundidad ${slow.toFixed(3)}`);
      // LP de 1 polo a fc ≈ 32 Hz: a 1 kHz deja pasar ≈ 3 % del CV (±0,06 V ≈ ±0,6 dB)
      assert.ok(fast < 0.1, `1 kHz: profundidad ${fast.toFixed(3)}`);
    });
  });

  describe('Resync al despertar de dormancy', () => {
    it('el mensaje resync sitúa el slew en el voltaje del fader sin transitorio', () => {
      const proc = createProcessor();
      proc.port.onmessage({ data: { type: 'resync', dialVoltage: 0 } });
      assert.equal(proc._voltageSmoothed, 0);
      const [out] = processBlock(proc, [new Float32Array(BLOCK).fill(1)], params({ dialVoltage: 0 }));
      assert.ok(Math.abs(out[0] - 1) < 1e-6, 'primera muestra ya a ganancia unidad');
    });

    it('resync sin voltaje cae a −12 V; otros mensajes se ignoran', () => {
      const proc = createProcessor();
      proc._voltageSmoothed = -3;
      proc.port.onmessage({ data: { type: 'resync' } });
      assert.equal(proc._voltageSmoothed, -12);
      proc._voltageSmoothed = -3;
      proc.port.onmessage({ data: { type: 'otro' } });
      proc.port.onmessage({ data: null });
      assert.equal(proc._voltageSmoothed, -3);
    });
  });

  describe('Canales y robustez', () => {
    it('estéreo: los dos canales reciben la misma ganancia', () => {
      const proc = createProcessor();
      proc.port.onmessage({ data: { type: 'resync', dialVoltage: -6 } });
      const audio = [new Float32Array(BLOCK).fill(1), new Float32Array(BLOCK).fill(-0.5)];
      const [l, r] = processBlock(proc, audio, params({ dialVoltage: -6 }));
      const g = Math.pow(10, -60 / 20);
      assert.ok(Math.abs(l[BLOCK - 1] - g) < 1e-6);
      assert.ok(Math.abs(r[BLOCK - 1] - (-0.5 * g)) < 1e-6);
    });

    it('procesa solo los canales que tienen entrada y salida', () => {
      const proc = createProcessor();
      const inputs = [[new Float32Array(BLOCK).fill(1), new Float32Array(BLOCK).fill(1)]];
      const outputs = [[new Float32Array(BLOCK)]];
      assert.doesNotThrow(() => proc.process(inputs, outputs, params()));
    });

    it('si algo revienta dentro, saca silencio y avisa una sola vez', () => {
      const proc = createProcessor();
      proc.voltageToGain = () => { throw new Error('boom'); };
      const outputs = [[new Float32Array(BLOCK).fill(0.3)]];
      const p = params({ dialVoltage: 0 });
      assert.equal(proc.process([[new Float32Array(BLOCK).fill(1)]], outputs, p), true);
      assert.ok(outputs[0][0].every(v => v === 0));
      proc.process([[new Float32Array(BLOCK).fill(1)]], outputs, p);
      const errors = proc.port._messages.filter(m => m.type === 'process-error');
      assert.equal(errors.length, 1);
      assert.equal(errors[0].message, 'boom');
    });
  });
});
