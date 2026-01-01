// ═══════════════════════════════════════════════════════════════════════════
// Panel 2 Blueprint
// ═══════════════════════════════════════════════════════════════════════════
//
// Este archivo define la ESTRUCTURA visual y de ruteo del Panel 2.
// Para PARÁMETROS de audio, ver panel2.config.js.
//
// Panel 2 contiene:
// - Osciloscopio (mitad superior, con su panelillo)
// - Input Amplifier Level (8 canales de entrada del Synthi 100)
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,
  panelId: 'panel-2',
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DEL LAYOUT VISUAL
  // ─────────────────────────────────────────────────────────────────────────
  
  layout: {
    // Padding general del panel
    padding: { top: 10, right: 15, bottom: 10, left: 15 },
    
    // El panel se divide verticalmente en secciones
    sections: {
      oscilloscope: {
        // Proporción del alto total (algo menos de la mitad)
        heightRatio: 0.45,
        // Margen entre secciones
        marginBottom: 10
      },
      inputAmplifiers: {
        // Resto del espacio para Input Amplifiers y futuros módulos
        heightRatio: 0.55
      }
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // MÓDULOS
  // ─────────────────────────────────────────────────────────────────────────
  
  modules: {
    oscilloscope: {
      id: 'oscilloscope',
      type: 'oscilloscope',
      title: 'Oscilloscope',
      section: 'oscilloscope',
      
      // El "panelillo" que contiene el osciloscopio
      // Ocupa todo el ancho disponible
      frame: {
        fullWidth: true,
        padding: { top: 8, right: 10, bottom: 8, left: 10 },
        border: true,
        borderRadius: 6
      },
      
      // Configuración del display
      display: {
        aspectRatio: 4 / 3,
        fitWidth: true
      },
      
      // Controles del osciloscopio (a la derecha del display)
      controls: [
        {
          id: 'timeScale',
          type: 'knob',
          label: 'TIME',         // Escala horizontal (tiempo/división)
          position: 'right'
        },
        {
          id: 'ampScale',
          type: 'knob',
          label: 'AMP',          // Escala vertical (amplitud)
          position: 'right'
        }
      ]
    },
    
    inputAmplifiers: {
      id: 'input-amplifiers',
      type: 'inputAmplifiers',
      title: 'Input Amplifier Level',
      section: 'inputAmplifiers',
      
      // Frame del módulo
      frame: {
        fullWidth: true,
        border: true,
        borderRadius: 6
      },
      
      // 8 canales de entrada del Synthi 100 (Rows 1-8 en la matriz original)
      channels: 8,
      
      // Controles: un knob de nivel por canal
      controls: [
        { id: 'level1', type: 'knob', label: 'Channel 1', channel: 0 },
        { id: 'level2', type: 'knob', label: 'Channel 2', channel: 1 },
        { id: 'level3', type: 'knob', label: 'Channel 3', channel: 2 },
        { id: 'level4', type: 'knob', label: 'Channel 4', channel: 3 },
        { id: 'level5', type: 'knob', label: 'Channel 5', channel: 4 },
        { id: 'level6', type: 'knob', label: 'Channel 6', channel: 5 },
        { id: 'level7', type: 'knob', label: 'Channel 7', channel: 6 },
        { id: 'level8', type: 'knob', label: 'Channel 8', channel: 7 }
      ]
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // MAPEO A MATRIZ DE AUDIO (Panel 5)
  // ─────────────────────────────────────────────────────────────────────────
  
  matrixMapping: {
    oscilloscope: {
      inputY: 57,   // Columna para entrada Y
      inputX: 58    // Columna para entrada X (Lissajous)
    },
    inputAmplifiers: {
      // Filas 67-74 en la numeración Synthi (primeras 8 filas de la matriz)
      firstRow: 67,
      channels: 8
    }
  }
};
