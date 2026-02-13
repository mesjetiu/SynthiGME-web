// ═══════════════════════════════════════════════════════════════════════════
// JOYSTICK CONFIG — Synthi 100 Cuenca (Datanomics 1982)
// ═══════════════════════════════════════════════════════════════════════════
//
// Configuración de los 2 joysticks (Left y Right) del Synthi 100.
//
// ─────────────────────────────────────────────────────────────────────────────
// CIRCUITO REAL
// ─────────────────────────────────────────────────────────────────────────────
//
// Cada joystick genera dos voltajes DC independientes (X e Y):
//   - Salida máxima: ±8V DC por eje
//   - Centro mecánico: 0V exacto (verificable con DVM del panel)
//   - Recorrido cuadrado (área cuadrada pese al soporte circular)
//   - Potenciómetros: 10K lineales (LIN)
//
// Controles de rango (Range):
//   - Pots: 10K LIN (uno por eje, montados encima del joystick)
//   - Escalan la magnitud del voltaje de salida
//   - Rango mínimo: movimientos grandes → cambios pequeños (ajuste fino)
//   - Rango máximo: recorrido completo = ±8V
//
// Buffer:
//   Las señales pasan por PC-12 (Joystick Buffer) en modo no balanceado.
//   Baja impedancia + estabilidad antes de la matriz.
//
// Voltaje de salida:
//   V_out = posición × rango_normalizado × 8V
//   donde posición ∈ [-1, +1], rango_normalizado ∈ [0, 1]
//
// ─────────────────────────────────────────────────────────────────────────────
// MODOS DE USO (Manual Datanomics 1982)
// ─────────────────────────────────────────────────────────────────────────────
//
// Estático:
//   Desplazamiento (offset) permanente sobre otro voltaje. Permite mover
//   masivamente un rango de control hacia positivo o negativo.
//
// Dinámico:
//   Movimiento manual en tiempo real durante la interpretación:
//   - Control de velocidad de portamento o dirección de secuencia
//   - Efecto "arco" (bowing) enviando salida a modulador en anillo
//   - Wah-wah manual modulando filtros a 1-2 Hz
//
// ─────────────────────────────────────────────────────────────────────────────
// IMPLEMENTACIÓN DIGITAL
// ─────────────────────────────────────────────────────────────────────────────
//
// Al ser señales puramente DC (no audio), se usa ConstantSourceNode nativo
// de Web Audio API en lugar de un AudioWorklet. Esto es óptimo porque:
//   - ConstantSourceNode genera DC a coste cero (implementación nativa C++)
//   - GainNode escala por el rango (también nativo)
//   - No hay procesamiento per-sample en JavaScript
//   - No necesita worklet: cero overhead de messaging y transferencias
//
// Cadena por eje:
//   ConstantSourceNode(offset = posición) → GainNode(gain = rango) → salida
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,

  // ─────────────────────────────────────────────────────────────────────────
  // PARÁMETROS COMPARTIDOS
  // ─────────────────────────────────────────────────────────────────────────

  defaults: {
    // Rampa de suavizado para cambios de posición del joystick (s)
    // Más baja que knobs porque el joystick es un control directo
    positionSmoothingTime: 0.01,

    // Rampa para cambios del knob de rango (s)
    rangeSmoothingTime: 0.03,

    // Rampas para controles manuales
    ramps: {
      position: 0.01,   // 10ms — movimiento del joystick instantáneo
      range: 0.05       // 50ms — cambio de rango suave
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // VOLTAJE DE SALIDA
  // ─────────────────────────────────────────────────────────────────────────
  //
  // En el dominio digital, ±1 = ±8V analógicos.
  // El rango escala linealmente: V_out = posición × rango_normalizado
  //
  // Con rango al máximo (dial 10): ±1 digital = ±8V real
  // Con rango a la mitad (dial 5): ±0.5 digital = ±4V real
  //
  // Potenciómetros:
  //   - Joystick interno: 10K LIN → posición lineal
  //   - Range pots: 10K LIN → escala lineal
  //
  // ─────────────────────────────────────────────────────────────────────────
  rangeCurve: {
    type: 'linear'   // Pot lineal 10K
  },

  // ─────────────────────────────────────────────────────────────────────────
  // JOYSTICK LEFT (LH) — Filas 117 (Y) y 118 (X) en Panel 6
  // ─────────────────────────────────────────────────────────────────────────
  left: {
    id: 'joystick-left',
    title: 'Joystick L',

    // Filas en la matriz de control (Panel 6)
    matrixRows: {
      y: 117,
      x: 118
    },

    // Configuración de knobs de la UI
    // Knob superior: Range Y, Knob inferior: Range X
    knobs: {
      // ───────────────────────────────────────────────────────────────
      // Knob RANGE Y (superior) — Escala del eje vertical
      // ───────────────────────────────────────────────────────────────
      //   0:  Rango cero (salida siempre 0V)
      //  10:  Rango máximo (±8V completos)
      //
      // Pot lineal 10K, escala directa.
      // ───────────────────────────────────────────────────────────────
      rangeY: {
        min: 0,
        max: 10,
        initial: 5,           // Mitad de rango (±4V) por defecto
        curve: 'linear',
        pixelsForFullRange: 900
      },
      // ───────────────────────────────────────────────────────────────
      // Knob RANGE X (inferior) — Escala del eje horizontal
      // ───────────────────────────────────────────────────────────────
      rangeX: {
        min: 0,
        max: 10,
        initial: 5,
        curve: 'linear',
        pixelsForFullRange: 900
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // JOYSTICK RIGHT (RH) — Filas 119 (Y) y 120 (X) en Panel 6
  // ─────────────────────────────────────────────────────────────────────────
  right: {
    id: 'joystick-right',
    title: 'Joystick R',

    matrixRows: {
      y: 119,
      x: 120
    },

    knobs: {
      rangeY: {
        min: 0,
        max: 10,
        initial: 5,
        curve: 'linear',
        pixelsForFullRange: 900
      },
      rangeX: {
        min: 0,
        max: 10,
        initial: 5,
        curve: 'linear',
        pixelsForFullRange: 900
      }
    }
  }
};
