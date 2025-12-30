// ═══════════════════════════════════════════════════════════════════════════
// Panel 2 Blueprint
// ═══════════════════════════════════════════════════════════════════════════
//
// Este archivo define la ESTRUCTURA visual y de ruteo del Panel 2.
// Para PARÁMETROS de audio, ver panel2.config.js.
//
// Panel 2 contiene:
// - Osciloscopio (mitad superior, con su panelillo)
// - Espacio reservado para futuros módulos (mitad inferior)
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
      reserved: {
        // Resto del espacio
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
      
      // Controles (futuro: knobs y toggles)
      controls: []
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // MAPEO A MATRIZ DE AUDIO (Panel 5)
  // ─────────────────────────────────────────────────────────────────────────
  
  matrixMapping: {
    oscilloscope: {
      inputY: 57,   // Columna para entrada Y
      inputX: 58    // Columna para entrada X (Lissajous)
    }
  }
};
