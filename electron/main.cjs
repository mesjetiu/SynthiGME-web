/**
 * Electron Main Process
 * 
 * Punto de entrada para la aplicación de escritorio Synthi GME.
 * Carga la aplicación web desde dist-app/index.html con máxima compatibilidad
 * de Web Audio API y AudioWorklet.
 */

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { createServer } = require('http');
const { readFileSync, existsSync, statSync } = require('fs');
const { OSCServer } = require('./oscServer.cjs');

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
        res.writeHead(200, { 
          'Content-Type': mimeType,
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
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
      // Seguridad: aislar contexto del renderer
      contextIsolation: true,
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

  // Abrir DevTools en desarrollo (descomentar si necesario)
  // mainWindow.webContents.openDevTools();

  // Manejar cierre de ventana
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Configurar menú de aplicación
  setupMenu();
}

/**
 * Configura el menú de la aplicación
 */
function setupMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Recargar',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) mainWindow.reload();
          }
        },
        {
          label: 'Forzar Recarga',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            if (mainWindow) mainWindow.webContents.reloadIgnoringCache();
          }
        },
        { type: 'separator' },
        {
          label: 'Salir',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        {
          label: 'Pantalla Completa',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          }
        },
        {
          label: 'DevTools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            if (mainWindow) mainWindow.webContents.toggleDevTools();
          }
        },
        { type: 'separator' },
        {
          label: 'Zoom +',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            if (mainWindow) {
              const zoom = mainWindow.webContents.getZoomFactor();
              mainWindow.webContents.setZoomFactor(zoom + 0.1);
            }
          }
        },
        {
          label: 'Zoom -',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            if (mainWindow) {
              const zoom = mainWindow.webContents.getZoomFactor();
              mainWindow.webContents.setZoomFactor(Math.max(0.5, zoom - 0.1));
            }
          }
        },
        {
          label: 'Zoom 100%',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            if (mainWindow) mainWindow.webContents.setZoomFactor(1);
          }
        }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de Synthi GME',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Acerca de Synthi GME',
              message: 'Synthi GME',
              detail: `Versión: ${app.getVersion()}\n\nEmulador del sintetizador EMS Synthi usando Web Audio API.\n\nLicencia: MIT`
            });
          }
        }
      ]
    }
  ];

  // En macOS, el primer elemento del menú es el nombre de la app
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

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
