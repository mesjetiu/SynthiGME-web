/**
 * Electron Preload Script
 * 
 * Este script se ejecuta antes de cargar la página web en el renderer.
 * Permite exponer APIs nativas de forma segura al contexto del renderer
 * usando contextBridge.
 * 
 * Por ahora está vacío. Futuras funcionalidades:
 * - Acceso a sistema de archivos para guardar/cargar patches
 * - Integración con MIDI nativo
 * - Acceso a información del sistema
 */

const { contextBridge, ipcRenderer } = require('electron');

// Exponer APIs seguras al renderer
// contextBridge.exposeInMainWorld('electronAPI', {
//   // Ejemplo: guardar archivo
//   saveFile: (data, filename) => ipcRenderer.invoke('save-file', data, filename),
//   // Ejemplo: cargar archivo
//   loadFile: () => ipcRenderer.invoke('load-file'),
//   // Ejemplo: obtener versión de la app
//   getVersion: () => ipcRenderer.invoke('get-version')
// });

// Indicador para que la app web sepa que está en Electron
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform
});
