/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PITCH TO VOLTAGE CONVERTER CONFIG — Synthi 100 Cuenca (Datanomics 1982)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Configuración del convertidor Pitch-a-Voltaje (placa PC-25).
 * Convierte la frecuencia fundamental de una señal de audio en un voltaje
 * de control proporcional (1V/Octava), útil para seguir el pitch de una
 * fuente externa (voz, instrumento).
 *
 * Método de conversión: medición de periodo de medio ciclo con conversión
 * logarítmica. Incluye filtro adaptativo para extracción del fundamental
 * y circuito Track & Hold que mantiene el último voltaje válido cuando
 * la señal cae por debajo del umbral.
 *
 * Entrada: Panel 5 (matriz de audio), columna 50
 * Salida:  Panel 6 (matriz de control), fila 121
 * Knob:    Range (vernier, Panel 4, columna 1)
 *
 * Referencia: Plano D100-25 C1, Manual Datanomics 1982
 *
 * @module configs/modules/pitchToVoltageConverter.config
 */

export default {
  schemaVersion: 1,

  id: 'pitch-to-voltage-converter',
  title: 'Pitch to Voltage Converter',

  // ─────────────────────────────────────────────────────────────────────────
  // COLUMNA DE LA MATRIZ DE AUDIO (Panel 5) — Entrada
  // ─────────────────────────────────────────────────────────────────────────
  matrixCol: {
    input: 50
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FILA DE LA MATRIZ DE CONTROL (Panel 6) — Salida
  // ─────────────────────────────────────────────────────────────────────────
  matrixRow: {
    voltage: 121
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PARÁMETROS DE AUDIO
  // ─────────────────────────────────────────────────────────────────────────
  audio: {
    /** Frecuencia mínima de seguimiento (Hz) — el PVC no funciona bien bajo ~250 Hz */
    minFreq: 250,
    /** Frecuencia máxima de seguimiento (Hz) */
    maxFreq: 8000,
    /** Umbral de amplitud para track-and-hold (0-1). Por debajo, mantiene último valor */
    amplitudeThreshold: 0.02,
    /** Voltios por octava en la salida */
    voltsPerOctave: 1.0
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TIEMPOS DE RAMPA
  // ─────────────────────────────────────────────────────────────────────────
  ramps: {
    /** Rampa de suavizado de la salida de voltaje (s) */
    level: 0.06
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DEFINICIÓN DE KNOBS (controles del Panel 4)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Range (Pitch Spread): controla la relación octava-entrada / octava-salida
  //   Posición ~7:  1:1 (1 oct input → 1 oct output)
  //   Posición ~10: 2:1 (1 oct input → 2 oct output)
  //   Posiciones 0-3: igual pero con polaridad invertida
  //
  knobs: {
    range: {
      min: 0,
      max: 10,
      initial: 7,       // 1:1 octave tracking
      curve: 'linear',
      label: 'Range'
    }
  }
};
