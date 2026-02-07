// ═══════════════════════════════════════════════════════════════════════════
// NOISE GENERATOR CONFIG — Synthi 100 Cuenca (Datanomics 1982)
// ═══════════════════════════════════════════════════════════════════════════
//
// Configuración de los 2 generadores de ruido idénticos del Synthi 100.
//
// ─────────────────────────────────────────────────────────────────────────────
// CIRCUITO REAL
// ─────────────────────────────────────────────────────────────────────────────
//
// Fuente de ruido:
//   Transistor BC169C con unión NP polarizada en inversa genera ruido
//   impulsivo de espectro plano (white noise). Amplificado y bufferizado.
//   Espectro plano ±3 dB de 100 Hz a 10 kHz.
//
// Filtro COLOUR (6 dB/oct, 1er orden):
//   Topología de filtro RC con pot lineal, idéntica al filtro del Output
//   Channel (plano D100-08 C1), con componentes adaptados para shaping
//   de ruido. Pot lineal 10 kΩ controla transición continua LP↔plano↔HP:
//
//     Dial 0  → LP:  ruido oscuro/rosa (atenúa HF a -6 dB/oct)
//     Dial 5  → Plano: ruido blanco (0 dB en todo el espectro)
//     Dial 10 → HP:  ruido brillante/azul (+6 dB shelf en HF)
//
// Nivel de salida:
//   Pot logarítmico 10 kΩ (audio taper, tipo A), salida bufferizada.
//   Salida ~3V p-p máxima. Dial 0 = silencio, Dial 10 = máximo.
//
// DC-coupled: respuesta desde ~2-3 Hz (fmin del circuito).
// Doble función: fuente de audio (Subgrupo IIA-1/1) y voltaje de control
// aleatorio (Subgrupo IIA-2/1) para modulación.
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 2,  // v2: rangos 0-10, filtro COLOUR IIR, nivel LOG

  // ─────────────────────────────────────────────────────────────────────────
  // PARÁMETROS DE AUDIO COMPARTIDOS
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Estos parámetros afectan al comportamiento del módulo de audio.
  //
  defaults: {
    // Tiempo de suavizado para cambios manuales de colour (s)
    // Más bajo que level para respuesta rápida del timbre
    colourSmoothingTime: 0.01,
    
    // Tiempo de suavizado para cambios manuales de level (s)
    // Previene clicks al cambiar bruscamente el volumen
    levelSmoothingTime: 0.03,
    
    // ───────────────────────────────────────────────────────────────────
    // RAMPAS PARA CONTROLES MANUALES (knobs)
    // ───────────────────────────────────────────────────────────────────
    //
    // Tiempos de rampa aplicados cuando el usuario manipula los knobs.
    // Evita saltos audibles ("zipper noise").
    //
    // Usa setTargetAtTime con τ = rampTime/3 para alcanzar ~95% del
    // valor objetivo en el tiempo especificado.
    //
    // NOTA: Estas rampas NO se aplican a CV desde la matriz → instantáneo
    //
    ramps: {
      colour: 0.05,     // 50ms — cambio de colour suave
      level: 0.06       // 60ms — cambio de nivel suave
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CIRCUITO DEL FILTRO COLOUR (6 dB/oct, 1er orden)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Misma topología que el filtro RC del Output Channel:
  //   Input → C1 → [end_A ── Pot 10K LIN ── end_B] → C2 → GND
  //                               │ wiper
  //                               ↓
  //                         Buffer (output)
  //
  // Modelo matemático (compartido con outputFilter.worklet.js):
  //   H(s) = 2·(2 + (1+p)·sτ) / (2 + sτ)    donde τ = R·C, p ∈ [-1, +1]
  //
  //   p = -1 → LP (dark/pink):  H = 2/(2+sτ) = 1/(1+sτ/2)
  //   p =  0 → Plano (white):   H = 1 (ganancia unitaria)
  //   p = +1 → HP (bright/blue): shelving +6 dB en HF
  //
  // Valores de circuito (componentes estimados, esquemático no disponible):
  //   - RV: Potenciómetro lineal 10 kΩ (COLOUR)
  //   - C:  Capacitor de acoplamiento 33 nF
  //   - τ = R·C = 10kΩ × 33nF = 3.3×10⁻⁴ s
  //   - fp = 1/(2πτ) ≈ 482 Hz (polo fundamental del filtro)
  //   - LP fc(-3dB) = 1/(πτ) ≈ 965 Hz
  //   - HP: shelf +6 dB por encima de ~965 Hz
  //   - Pendiente: 6 dB/octava (1er orden, un solo polo)
  //
  // Respuesta de audio a posiciones extremas:
  //   Dial 0  (LP): -3dB a ~965 Hz, -20dB a 10kHz → ruido oscuro/cálido
  //   Dial 5  (plano): 0 dB en todo el espectro → ruido blanco puro
  //   Dial 10 (HP): +6dB shelf por encima de ~965 Hz → ruido brillante
  //
  // ─────────────────────────────────────────────────────────────────────────
  colourFilter: {
    potResistance: 10000,     // 10 kΩ — pot lineal COLOUR
    capacitance: 33e-9,       // 33 nF — capacitor de acoplamiento
                               // → τ = R·C = 3.3×10⁻⁴ s
                               // → fp ≈ 482 Hz, LP fc(-3dB) ≈ 965 Hz
    order: 1                   // 1er orden → 6 dB/oct, un solo polo
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CURVA DEL POTENCIÓMETRO DE NIVEL (LOG 10 kΩ)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Pot logarítmico (audio taper, tipo A, 10 kΩ):
  //   gain = (B^(dial/maxDial) - 1) / (B - 1)   donde B = logBase
  //
  // Con B = 100 (ley del 10%, emula audio pot real):
  //   Dial 0:  gain = 0      (silencio total)
  //   Dial 3:  gain ≈ 0.030  (-30 dB)
  //   Dial 5:  gain ≈ 0.091  (-21 dB)  ← percepción ~"mitad volumen"
  //   Dial 8:  gain ≈ 0.392  (-8 dB)
  //   Dial 10: gain = 1.0    (0 dB, salida ~3V p-p)
  //
  // La curva LOG concentra la mayor parte del rango dinámico en el último
  // tercio del recorrido del knob, emulando el comportamiento del pot real
  // que permite ajustes finos a nivel bajo.
  //
  // ─────────────────────────────────────────────────────────────────────────
  levelCurve: {
    type: 'log',              // Pot logarítmico (audio taper)
    logBase: 100              // Base: gain = (100^(x/max) - 1) / 99
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NOISE GENERATOR 1 — Fila de matriz 89 (Panel 5)
  // ─────────────────────────────────────────────────────────────────────────
  noise1: {
    id: 'panel3-noise-1',
    title: 'Noise 1',
    
    // Fila en la matriz de audio (Panel 5)
    matrixRow: 89,
    
    // Configuración de knobs de la UI
    knobs: {
      // ───────────────────────────────────────────────────────────────
      // Knob COLOUR — Control de espectro (escala dial 0-10)
      // ───────────────────────────────────────────────────────────────
      //   0:  Lowpass  → ruido oscuro/rosa (dark, atenúa HF)
      //   5:  Plano    → ruido blanco (white, espectro plano)
      //  10:  Highpass → ruido brillante/azul (bright, +6dB HF)
      //
      // El valor del dial se convierte internamente a bipolar (-1..+1)
      // y se envía al AudioParam colourPosition del worklet IIR.
      // ───────────────────────────────────────────────────────────────
      colour: {
        min: 0,
        max: 10,
        initial: 5,            // White noise por defecto (espectro plano)
        curve: 'linear',
        pixelsForFullRange: 900  // Alta resolución (6× default)
      },
      // ───────────────────────────────────────────────────────────────
      // Knob LEVEL — Control de ganancia (pot LOG 10kΩ)
      // ───────────────────────────────────────────────────────────────
      //   0:  Silencio total
      //  10:  Salida máxima (~3V p-p)
      //
      // El valor del dial se convierte a ganancia mediante la curva
      // logarítmica del pot real (audio taper tipo A).
      // ───────────────────────────────────────────────────────────────
      level: {
        min: 0,
        max: 10,
        initial: 0,            // Silencio por defecto
        curve: 'linear',       // El pot es LOG, la curva la aplica el módulo
        pixelsForFullRange: 900  // Alta resolución (6× default)
      }
    },
    
    // Configuración del módulo de audio (override de defaults)
    audio: {
      // colourSmoothingTime: 0.01,  // Override del default si necesario
      // levelSmoothingTime: 0.03,   // Override del default si necesario
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NOISE GENERATOR 2 — Fila de matriz 90 (Panel 5)
  // ─────────────────────────────────────────────────────────────────────────
  noise2: {
    id: 'panel3-noise-2',
    title: 'Noise 2',
    
    matrixRow: 90,
    
    knobs: {
      colour: {
        min: 0,
        max: 10,
        initial: 5,
        curve: 'linear',
        pixelsForFullRange: 900
      },
      level: {
        min: 0,
        max: 10,
        initial: 0,
        curve: 'linear',
        pixelsForFullRange: 900
      }
    },
    
    audio: {
      // Misma configuración que noise1 por defecto
    }
  }
};
