// ═══════════════════════════════════════════════════════════════════════════
// Panel 7 Blueprint
// ═══════════════════════════════════════════════════════════════════════════
//
// Este archivo define la ESTRUCTURA visual del Panel 7.
// Para PARÁMETROS de audio, ver panel7.config.js.
//
// Panel 7 contiene:
// - 8 Output Channels (cada uno con Filter, Pan, Switch y Level Fader)
//
// ═══════════════════════════════════════════════════════════════════════════

export default {
  schemaVersion: 1,
  panelId: 'panel-7',
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DEL LAYOUT VISUAL
  // ─────────────────────────────────────────────────────────────────────────
  
  layout: {
    // Padding general del panel
    padding: { top: 10, right: 10, bottom: 10, left: 10 },
    
    // El panel contiene una única sección con los 8 output channels
    sections: {
      outputChannels: {
        // Ocupa todo el alto del panel
        heightRatio: 1.0
      }
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // MÓDULOS
  // ─────────────────────────────────────────────────────────────────────────
  
  modules: {
    outputChannels: {
      id: 'output-channels',
      type: 'outputChannelsPanel',
      title: 'Output Channels',
      section: 'outputChannels',
      
      // Número de canales
      channelCount: 8,
      
      // Frame contenedor
      frame: {
        fullWidth: true,
        fullHeight: true,
        padding: { top: 5, right: 5, bottom: 5, left: 5 }
      },
      
      // Configuración de cada canal individual
      channelLayout: {
        // Los 8 canales se disponen en una fila horizontal
        direction: 'horizontal',
        gap: 4,
        
        // Cada canal tiene estos controles (de arriba a abajo)
        controls: [
          {
            id: 'filter',
            type: 'knob',
            label: 'Filter'
          },
          {
            id: 'pan',
            type: 'knob',
            label: 'Pan'
          },
          {
            id: 'power',
            type: 'switch',
            label: 'On/Off'
          },
          {
            id: 'level',
            type: 'fader',
            label: 'Level'
          }
        ]
      }
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // AUDIO ROUTING
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Los Output Channels reciben señal de los Output Buses (1-8) de la matriz
  // y la envían a las salidas físicas del sistema de audio.
  //
  // Cada canal puede:
  // - Filtrar la señal (LP/HP bipolar)
  // - Ajustar el paneo estéreo
  // - Silenciarse (switch on/off)
  // - Controlar el nivel de salida
  //
  // ─────────────────────────────────────────────────────────────────────────
  
  routing: {
    // Cada canal recibe de un output bus de la matriz
    inputs: [
      { channelIndex: 0, source: { kind: 'outputBus', bus: 1 } },
      { channelIndex: 1, source: { kind: 'outputBus', bus: 2 } },
      { channelIndex: 2, source: { kind: 'outputBus', bus: 3 } },
      { channelIndex: 3, source: { kind: 'outputBus', bus: 4 } },
      { channelIndex: 4, source: { kind: 'outputBus', bus: 5 } },
      { channelIndex: 5, source: { kind: 'outputBus', bus: 6 } },
      { channelIndex: 6, source: { kind: 'outputBus', bus: 7 } },
      { channelIndex: 7, source: { kind: 'outputBus', bus: 8 } }
    ],
    
    // Salida a los canales físicos del sistema
    outputs: {
      destination: 'physicalOutput'
    }
  }
};
