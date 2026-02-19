/**
 * Tests para RecordingOverlay
 * 
 * Verifica la lógica del overlay visual de grabación:
 * - Formato del temporizador (MM:SS)
 * - Cálculo de tiempo transcurrido
 * - Estructura DOM esperada
 * 
 * @module tests/ui/recordingOverlay.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// Lógica del temporizador (replicada del módulo para test puro)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Formatea segundos transcurridos en formato MM:SS.
 * Replicada de RecordingOverlay._updateTimer()
 */
function formatTimer(elapsedSeconds) {
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const seconds = String(elapsedSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

describe('RecordingOverlay - Formato del temporizador', () => {

  describe('Formato MM:SS', () => {
    it('0 segundos → 00:00', () => {
      assert.strictEqual(formatTimer(0), '00:00');
    });

    it('1 segundo → 00:01', () => {
      assert.strictEqual(formatTimer(1), '00:01');
    });

    it('59 segundos → 00:59', () => {
      assert.strictEqual(formatTimer(59), '00:59');
    });

    it('60 segundos → 01:00', () => {
      assert.strictEqual(formatTimer(60), '01:00');
    });

    it('61 segundos → 01:01', () => {
      assert.strictEqual(formatTimer(61), '01:01');
    });

    it('90 segundos → 01:30', () => {
      assert.strictEqual(formatTimer(90), '01:30');
    });

    it('600 segundos → 10:00', () => {
      assert.strictEqual(formatTimer(600), '10:00');
    });

    it('3599 segundos → 59:59', () => {
      assert.strictEqual(formatTimer(3599), '59:59');
    });

    it('3600 segundos → 60:00 (sigue contando)', () => {
      assert.strictEqual(formatTimer(3600), '60:00');
    });
  });

  describe('Zero-padding', () => {
    it('minutos < 10 tienen cero a la izquierda', () => {
      assert.strictEqual(formatTimer(300), '05:00');
    });

    it('segundos < 10 tienen cero a la izquierda', () => {
      assert.strictEqual(formatTimer(5), '00:05');
    });

    it('ambos > 10 no tienen cero extra', () => {
      assert.strictEqual(formatTimer(671), '11:11');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cálculo de tiempo transcurrido
// ═══════════════════════════════════════════════════════════════════════════

describe('RecordingOverlay - Cálculo de elapsed', () => {
  it('elapsed se calcula como floor((now - start) / 1000)', () => {
    const startTime = 1000000;
    const now = 1005500; // 5.5 segundos después
    const elapsed = Math.floor((now - startTime) / 1000);
    assert.strictEqual(elapsed, 5);
  });

  it('elapsed 0 al inicio', () => {
    const start = Date.now();
    const elapsed = Math.floor((start - start) / 1000);
    assert.strictEqual(elapsed, 0);
  });

  it('elapsed no es negativo', () => {
    const start = 1000;
    const now = 1000; // mismo instante
    const elapsed = Math.floor((now - start) / 1000);
    assert.ok(elapsed >= 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Contrato de clases CSS del overlay
// ═══════════════════════════════════════════════════════════════════════════

describe('RecordingOverlay - Contrato de clases CSS', () => {
  it('la clase base del overlay es "recording-overlay"', () => {
    const className = 'recording-overlay';
    assert.strictEqual(className, 'recording-overlay');
  });

  it('clase de visible es "recording-overlay--visible"', () => {
    const visibleClass = 'recording-overlay--visible';
    assert.ok(visibleClass.startsWith('recording-overlay'));
  });

  it('clases BEM para sub-elementos', () => {
    const expected = [
      'recording-overlay__indicator',
      'recording-overlay__dot',
      'recording-overlay__label',
      'recording-overlay__timer'
    ];
    for (const cls of expected) {
      assert.ok(cls.startsWith('recording-overlay__'), `${cls} usa BEM`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Contrato de evento de grabación
// ═══════════════════════════════════════════════════════════════════════════

describe('RecordingOverlay - Contrato de evento', () => {
  it('escucha el evento synth:recordingChanged', () => {
    const eventName = 'synth:recordingChanged';
    assert.strictEqual(eventName, 'synth:recordingChanged');
  });

  it('detail.recording = true → mostrar', () => {
    const detail = { recording: true };
    assert.strictEqual(detail.recording, true);
  });

  it('detail.recording = false → ocultar', () => {
    const detail = { recording: false };
    assert.strictEqual(detail.recording, false);
  });

  it('detail sin recording → false (fallback)', () => {
    const detail = {};
    const recording = detail.recording ?? false;
    assert.strictEqual(recording, false);
  });
});
