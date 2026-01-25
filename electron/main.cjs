/**
 * Electron Main Process
 * 
 * Punto de entrada para la aplicación de escritorio Synthi GME.
 * Carga la aplicación web desde docs/index.html con máxima compatibilidad
 * de Web Audio API y AudioWorklet.
 */

const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { createServer } = require('http');
const { readFileSync, existsSync, statSync } = require('fs');

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
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(content);
      } catch (err) {
        res.writeHead(500);
        res.end('Error loading file');
      }
    });
    
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`Local server running on http://127.0.0.1:${port}`);
      resolve(port);
    });
  });
}

// Deshabilitar aceleración de hardware si causa problemas de audio
// app.disableHardwareAcceleration();

/**
 * Crea la ventana principal de la aplicación
 */
async function createWindow() {
  // Iniciar servidor local
  const docsPath = path.join(__dirname, '../docs');
  const port = await startServer(docsPath);
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
    title: 'Synthi GME',
    icon: path.join(__dirname, '../docs/assets/pwa/icons/icon-512x512.png'),
    webPreferences: {
      // Seguridad: deshabilitar integración con Node.js en el renderer
      nodeIntegration: false,
      // Seguridad: aislar contexto del renderer
      contextIsolation: true,
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

// Cuando Electron esté listo, crear ventana
app.whenReady().then(() => {
  createWindow();

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

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error);
});
