const { app, BrowserWindow } = require('electron');
const path = require('node:path');

if (process.platform === 'linux') {
  // Keep the desktop shell on native WebGPU; the web app deliberately has no WebGL fallback.
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 680,
    backgroundColor: '#f5f5f3',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  const entry = path.join(__dirname, '..', 'dist', 'index.html');
  mainWindow.loadFile(entry).catch(error => {
    console.error('[softie] desktop startup:', error);
    app.quit();
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
