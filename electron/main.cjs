/**
 * Electron Main Process
 * 
 * Punto de entrada para la aplicación de escritorio Synthi GME.
 * Carga la aplicación web desde dist-app/index.html con máxima compatibilidad
 * de Web Audio API y AudioWorklet.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createServer } = require('http');
const { readFileSync, existsSync, statSync } = require('fs');
const { OSCServer } = require('./oscServer.cjs');
const { initMenu, rebuildMenu, updateMenuState, updateTranslations, isQuitConfirmed, resetQuitConfirmed, t: menuT } = require('./electronMenu.cjs');

// Establecer nombre de la aplicación (visible en PipeWire/PulseAudio)
app.setName('SynthiGME');

// ─────────────────────────────────────────────────────────────────────────────
// Flags de Chromium para audio
// ─────────────────────────────────────────────────────────────────────────────
// AudioServiceOutOfProcess deshabilitado hace que el audio se procese dentro
// del proceso de la app, mostrando "SynthiGME" en PipeWire/PulseAudio en lugar
// de "Chromium".
//
// NOTA SOBRE MULTICANAL: Chromium limita destination.maxChannelCount a 2
// canales independientemente del hardware. Para salida multicanal (>2ch)
// se necesitaría un addon nativo (PortAudio) o usar JACK directamente.
// ─────────────────────────────────────────────────────────────────────────────
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess');

// Habilitar SharedArrayBuffer para comunicación lock-free entre AudioWorklet y native
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');

// Mantener referencia global para evitar garbage collection
let mainWindow = null;
let server = null;
let oscServer = null;

// Tipos MIME para archivos estáticos
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

/**
 * Inicia un servidor HTTP local para servir los archivos
 */
function startServer(docsPath) {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      let filePath = path.join(docsPath, req.url === '/' ? 'index.html' : req.url);
      
      // Eliminar query strings
      filePath = filePath.split('?')[0];
      
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      
      const ext = path.extname(filePath);
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      
      try {
        const content = readFileSync(filePath);
        // Headers para deshabilitar caché de Chromium
        // Esto asegura que siempre se carguen los archivos del paquete actual
        // COOP/COEP headers habilitan SharedArrayBuffer para comunicación lock-free
        // CSP: seguridad del renderer (blob: para AudioWorklet, unsafe-inline para estilos dinámicos)
        res.writeHead(200, { 
          'Content-Type': mimeType,
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Content-Security-Policy': "default-src 'self'; script-src 'self' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; font-src 'self' data:"
        });
        res.end(content);
      } catch (err) {
        res.writeHead(500);
        res.end('Error loading file');
      }
    });
    
    // Puerto fijo para que localStorage e IndexedDB persistan entre sesiones
    // (el origen http://127.0.0.1:PORT determina el almacenamiento)
    const FIXED_PORT = 49371; // Puerto en rango dinámico/privado (49152-65535)
    
    server.listen(FIXED_PORT, '127.0.0.1', () => {
      console.log(`Local server running on http://127.0.0.1:${FIXED_PORT}`);
      resolve(FIXED_PORT);
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Puerto ${FIXED_PORT} en uso. ¿Hay otra instancia ejecutándose?`);
        app.quit();
      }
    });
  });
}

// Deshabilitar aceleración de hardware si causa problemas de audio
// app.disableHardwareAcceleration();

/**
 * Crea la ventana principal de la aplicación
 */
async function createWindow() {
  // Limpiar TODAS las cachés de Chromium al iniciar
  // Esto asegura que siempre se cargue la versión actual del paquete
  const { session } = require('electron');
  const ses = session.defaultSession;
  
  // Limpiar caché HTTP
  await ses.clearCache();
  
  // Limpiar caché de código (V8 bytecode cache)
  await ses.clearCodeCaches({});
  
  // Limpiar datos de almacenamiento excepto localStorage/IndexedDB (preferencias de usuario)
  await ses.clearStorageData({
    storages: ['serviceworkers', 'cachestorage', 'shadercache', 'websql']
  });
  
  // Iniciar servidor local
  const appPath = path.join(__dirname, '../dist-app');
  const port = await startServer(appPath);
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
    title: 'Synthi GME',
    icon: path.join(__dirname, '../dist-app/assets/pwa/icons/icon-512x512.png'),
    webPreferences: {
      // Seguridad: deshabilitar integración con Node.js en el renderer
      nodeIntegration: false,
      // NOTA: contextIsolation deshabilitado para permitir SharedArrayBuffer
      // entre renderer y preload (necesario para audio lock-free sin clicks)
      // Seguro porque: cargamos desde localhost, nodeIntegration=false
      contextIsolation: false,
      // Deshabilitar sandbox para permitir módulos Node.js en preload
      // Necesario para cargar addon nativo de PipeWire
      sandbox: false,
      // Preload script para exponer APIs seguras (OSC, etc.)
      preload: path.join(__dirname, 'preload.cjs'),
      // Permitir autoplay de audio (necesario para síntesis)
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  // Cargar desde servidor local
  mainWindow.loadURL(`http://127.0.0.1:${port}/`).catch(err => {
    console.error('Error loading:', err);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Bloquear atajos de recarga y zoom nativo de Chromium
  // Recarga: F5, Ctrl+R → bloqueados para evitar reinicios accidentales
  // Zoom: Ctrl+/-, Ctrl+0 → bloqueados para que los maneje el menú nativo
  //   (el menú envía acciones al renderer que hacen zoom en el canvas)
  // ─────────────────────────────────────────────────────────────────────────
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isRefresh =
      input.key === 'F5' ||
      (input.control && input.key === 'r') ||
      (input.control && input.shift && input.key === 'R');
    // Bloquear zoom nativo de Chromium (Ctrl+Plus, Ctrl+Minus, Ctrl+0)
    // NOTA: event.preventDefault() aquí también bloquea los accelerators del menú
    // nativo en Linux, así que enviamos la acción directamente vía IPC.
    const isZoom = input.control && (
      input.key === '+' || input.key === '=' ||
      input.key === '-' || input.key === '_' ||
      input.key === '0'
    );
    if (isRefresh || isZoom) {
      event.preventDefault();
    }
    // Despachar acciones de zoom manualmente (los accelerators no llegan al menú)
    if (isZoom && input.type === 'keyDown') {
      if (input.key === '+' || input.key === '=') {
        mainWindow.webContents.send('menu:action', { action: 'zoomIn' });
      } else if (input.key === '-' || input.key === '_') {
        mainWindow.webContents.send('menu:action', { action: 'zoomOut' });
      } else if (input.key === '0') {
        mainWindow.webContents.send('menu:action', { action: 'zoomReset' });
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Restaurar menú nativo tras salir de fullscreen
  // document.requestFullscreen() en Electron dispara AMBOS eventos:
  //   enter-full-screen (native) + enter-html-full-screen
  // Al salir, setMenuBarVisibility(true) no basta porque Electron no
  // re-renderiza el menú. Solución: reconstruir el menú completo y
  // forzar foco de la ventana con un delay para que la transición termine.
  // ─────────────────────────────────────────────────────────────────────────
  const restoreMenuAfterFullscreen = () => {
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.setAutoHideMenuBar(false);
      mainWindow.setMenuBarVisibility(true);
      rebuildMenu();
      mainWindow.focus();
    }, 200);
  };

  mainWindow.on('leave-full-screen', restoreMenuAfterFullscreen);
  mainWindow.on('leave-html-full-screen', restoreMenuAfterFullscreen);

  // Abrir DevTools en desarrollo (descomentar si necesario)
  // mainWindow.webContents.openDevTools();

  // ───────────────────────────────────────────────────────────────────────────
  // Confirmación de cierre (Alt+F4, botón X de ventana)
  // Si el usuario no ha confirmado vía menú, mostrar diálogo de confirmación
  // ───────────────────────────────────────────────────────────────────────────
  mainWindow.on('close', async (e) => {
    if (isQuitConfirmed()) return; // Ya confirmado desde el menú
    e.preventDefault();
    const { dialog } = require('electron');
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: [
        menuT('menu.file.quit', 'Quit'),
        menuT('common.cancel', 'Cancel')
      ],
      defaultId: 1,
      cancelId: 1,
      title: menuT('menu.file.quit', 'Quit'),
      message: menuT('menu.file.quit.confirm', 'Quit the application?')
    });
    if (response === 0) {
      resetQuitConfirmed(); // Limpiar para futuro uso
      mainWindow.destroy();
    }
  });

  // Manejar cierre de ventana
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Configurar menú nativo de aplicación (7 menús con i18n)
  initMenu(mainWindow);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers IPC para Menú nativo (sincronización bidireccional)
// ─────────────────────────────────────────────────────────────────────────────

// Renderer → Main: sincronizar estado de checkboxes del menú
ipcMain.on('menu:syncState', (event, state) => {
  updateMenuState(state);
});

// Renderer → Main: sincronizar traducciones del menú
ipcMain.on('menu:syncTranslations', (event, translations) => {
  updateTranslations(translations);
  // Actualizar título de la ventana con la traducción del idioma activo
  if (mainWindow && translations['app.windowTitle']) {
    mainWindow.setTitle(translations['app.windowTitle']);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Configuración OSC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa el servidor OSC para comunicación peer-to-peer
 * @param {Object} [config] - Configuración opcional
 * @param {number} [config.port] - Puerto UDP (default: 57121)
 * @see /OSC.md - Documentación del protocolo
 */
function initOSCServer(config = {}) {
  oscServer = new OSCServer(config);
  
  // Callback cuando se recibe un mensaje OSC de la red
  oscServer.onMessage = (address, args, rinfo) => {
    // Reenviar mensaje al renderer process
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('osc:message', { address, args, from: rinfo.address });
    }
  };
  
  oscServer.onError = (err) => {
    console.error('[OSC] Error:', err.message);
  };
  
  oscServer.onReady = () => {
    console.log('[OSC] Servidor listo en puerto', oscServer.config.port);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers IPC para OSC (comunicación main <-> renderer)
// ─────────────────────────────────────────────────────────────────────────────

// Iniciar servidor OSC
ipcMain.handle('osc:start', async (event, config = {}) => {
  // Si hay servidor activo con puerto diferente, detenerlo
  if (oscServer && oscServer.running && config.port && oscServer.config.port !== config.port) {
    await oscServer.stop();
    oscServer = null;
  }
  
  if (!oscServer) initOSCServer(config);
  try {
    await oscServer.start();
    return { success: true, status: oscServer.getStatus() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Detener servidor OSC
ipcMain.handle('osc:stop', async () => {
  if (oscServer) {
    await oscServer.stop();
    return { success: true };
  }
  return { success: false, error: 'Servidor no inicializado' };
});

// Enviar mensaje OSC
ipcMain.handle('osc:send', (event, address, args) => {
  if (oscServer && oscServer.running) {
    return oscServer.send(address, args);
  }
  return false;
});

// Obtener estado del servidor OSC
ipcMain.handle('osc:status', () => {
  if (oscServer) {
    return oscServer.getStatus();
  }
  return { running: false };
});

// Añadir target unicast (para enviar a SuperCollider u otras apps)
ipcMain.handle('osc:addTarget', (event, host, port) => {
  if (oscServer) {
    oscServer.addUnicastTarget(host, port);
    return { success: true, targets: oscServer.getUnicastTargets() };
  }
  return { success: false, error: 'Servidor no inicializado' };
});

// Eliminar target unicast
ipcMain.handle('osc:removeTarget', (event, host, port) => {
  if (oscServer) {
    oscServer.removeUnicastTarget(host, port);
    return { success: true, targets: oscServer.getUnicastTargets() };
  }
  return { success: false, error: 'Servidor no inicializado' };
});

// Obtener targets unicast
ipcMain.handle('osc:getTargets', () => {
  if (oscServer) {
    return oscServer.getUnicastTargets();
  }
  return [];
});

// ─────────────────────────────────────────────────────────────────────────────
// Handlers IPC para Audio Multicanal (8 salidas independientes)
// ─────────────────────────────────────────────────────────────────────────────

// Usar addon nativo de PipeWire (baja latencia)
const MultichannelAudio = require('./multichannelAudioNative.cjs');
const multichannelAudio = new MultichannelAudio();

// Verificar disponibilidad de audio multicanal
ipcMain.handle('multichannel:check', () => {
  return multichannelAudio.checkAvailability();
});

// Abrir stream de 8 canales
ipcMain.handle('multichannel:open', async (event, config) => {
  return await multichannelAudio.open(config);
});

// Escribir audio al stream (fire-and-forget, sin respuesta para no bloquear)
let writeCount = 0;
ipcMain.on('multichannel:write', (event, buffer) => {
  // El buffer viene como ArrayBuffer desde el renderer, convertir a Float32Array
  const float32Buffer = new Float32Array(buffer);
  writeCount++;
  if (writeCount % 100 === 1) {
    console.log(`[Multichannel] write #${writeCount}, frames: ${float32Buffer.length / 8}`);
  }
  multichannelAudio.write(float32Buffer);
  // No responder - fire and forget
});

// Cerrar stream
ipcMain.handle('multichannel:close', async () => {
  await multichannelAudio.close();
  return { success: true };
});

// Obtener info del stream
ipcMain.handle('multichannel:info', () => {
  return multichannelAudio.getStatus();
});

// Cuando Electron esté listo, crear ventana
app.whenReady().then(() => {
  createWindow();
  
  // Inicializar servidor OSC (no iniciado hasta que el usuario lo active)
  initOSCServer();

  // En macOS, recrear ventana si se hace clic en el dock
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Salir cuando todas las ventanas estén cerradas (excepto en macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Limpiar recursos al salir
app.on('will-quit', async () => {
  // Cerrar multicanal (elimina el sink de PulseAudio)
  if (multichannelAudio) {
    await multichannelAudio.close();
  }
  
  if (oscServer && oscServer.running) {
    await oscServer.stop();
  }
  if (server) {
    server.close();
  }
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error);
});
