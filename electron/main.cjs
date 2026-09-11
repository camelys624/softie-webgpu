const { app, BrowserWindow, ipcMain, Menu, Tray, screen } = require('electron');
const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const IS_HYPRLAND = /hyprland/i.test(process.env.XDG_CURRENT_DESKTOP || '');
const PET_SIZES = {
  small: { width: 255, height: 225 },
  medium: { width: 340, height: 300 },
  large: { width: 476, height: 420 },
};

if (process.platform === 'linux') {
  // Keep the desktop shell on native WebGPU; the web app deliberately has no WebGL fallback.
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
  app.commandLine.appendSwitch('class', 'softie-pet');
}

let mainWindow = null;
let tray = null;
let petMenu = null;
let cursorTimer = null;
let drag = null;
let dragRequested = false;
let movePending = false;
let petSize = 'medium';

function owns(event) {
  return mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents;
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function sanitizeMenu(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 32).map(item => {
    if (!item || typeof item !== 'object') return null;
    if (item.type === 'separator') return { type: 'separator' };
    const id = typeof item.id === 'string' ? item.id.slice(0, 80) : undefined;
    const entry = {
      label: String(item.label || '').slice(0, 120),
      type: ['normal', 'checkbox', 'radio'].includes(item.type) ? item.type : 'normal',
      checked: Boolean(item.checked),
    };
    if (Array.isArray(item.submenu)) entry.submenu = sanitizeMenu(item.submenu);
    if (id) entry.click = () => send('softie:command', { id });
    return entry;
  }).filter(Boolean);
}

function installMenu(payload) {
  const template = sanitizeMenu(payload?.template);
  if (!template.length) return;
  petMenu = Menu.buildFromTemplate(template);
  tray?.setContextMenu(petMenu);
  if (typeof payload.tooltip === 'string') tray?.setToolTip(payload.tooltip.slice(0, 120));
}

function preferredPetBounds() {
  const { width, height } = PET_SIZES[petSize];
  const area = screen.getPrimaryDisplay().workArea;
  const margin = 24;
  // Follow each desktop's status-area convention: Linux/macOS at the top, Windows at the bottom.
  const y = process.platform === 'win32'
    ? area.y + area.height - height - margin
    : area.y + margin;
  return { x: area.x + area.width - width - margin, y, width, height };
}

function placeNearDesktopCorner() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const bounds = preferredPetBounds();
  mainWindow.setBounds(bounds, false);
  return bounds;
}

async function hyprlandClient() {
  if (!IS_HYPRLAND) return null;
  try {
    const { stdout } = await execFileAsync('hyprctl', ['-j', 'clients'], { timeout: 1000 });
    const clients = JSON.parse(stdout);
    return clients.find(client => client.pid === process.pid || client.class === 'softie-pet' || client.title === 'softie-pet') || null;
  } catch {
    return null;
  }
}

function hyprlandMoveExpression(x, y, address) {
  if (!/^0x[0-9a-f]+$/i.test(address || '')) return null;
  return `hl.dispatch(hl.dsp.window.move({ window = "address:${address}", x = ${Math.round(x)}, y = ${Math.round(y)} }))`;
}

function hyprlandPropertyExpression(property, value, address) {
  if (!/^0x[0-9a-f]+$/i.test(address || '')) return null;
  return `hl.dispatch(hl.dsp.window.set_prop({ window = "address:${address}", prop = "${property}", value = "${value}" }))`;
}

async function placeHyprlandWindow(bounds) {
  if (!bounds) return;
  const client = await hyprlandClient();
  if (!client || !mainWindow || mainWindow.isDestroyed()) return;
  const expression = hyprlandMoveExpression(bounds.x, bounds.y, client.address);
  if (!expression) return;
  const selector = `address:${client.address}`;
  try {
    await execFileAsync('hyprctl', ['eval', expression], { timeout: 1000 });
    await Promise.all([
      ['decorate', '0'],
      ['no_blur', '1'],
      ['no_shadow', '1'],
      ['no_dim', '1'],
    ].map(([property, value]) => execFileAsync(
      'hyprctl', ['eval', hyprlandPropertyExpression(property, value, client.address)], { timeout: 1000 },
    )));
  } catch {
    // BrowserWindow positioning remains the fallback on unsupported compositor versions.
  }
}

async function beginDrag() {
  const point = screen.getCursorScreenPoint();
  const client = await hyprlandClient();
  if (!dragRequested || !mainWindow || mainWindow.isDestroyed()) return;
  const bounds = client ? { x: client.at[0], y: client.at[1] } : mainWindow.getBounds();
  drag = { offsetX: point.x - bounds.x, offsetY: point.y - bounds.y, address: client?.address };
}

function movePet(point) {
  if (!drag || !mainWindow || mainWindow.isDestroyed()) return;
  const x = Math.round(point.x - drag.offsetX);
  const y = Math.round(point.y - drag.offsetY);
  if (!IS_HYPRLAND || !drag.address) {
    mainWindow.setPosition(x, y, false);
    return;
  }
  if (movePending) return;
  const expression = hyprlandMoveExpression(x, y, drag.address);
  if (!expression) return;
  movePending = true;
  execFile('hyprctl', ['eval', expression], () => {
    movePending = false;
  });
}

function resizePet(level) {
  const next = PET_SIZES[level];
  if (!next || !mainWindow || mainWindow.isDestroyed()) return;
  petSize = level;
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({
    x: Math.round(bounds.x + (bounds.width - next.width) / 2),
    y: Math.round(bounds.y + bounds.height - next.height),
    ...next,
  }, true);
}

function showPet() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = placeNearDesktopCorner();
  mainWindow.showInactive();
  if (IS_HYPRLAND) setTimeout(() => { void placeHyprlandWindow(bounds); }, 150);
}

function createWindow() {
  const size = PET_SIZES[petSize];
  mainWindow = new BrowserWindow({
    ...size,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    title: 'softie-pet',
    type: 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.on('page-title-updated', event => event.preventDefault());
  mainWindow.once('ready-to-show', showPet);
  mainWindow.on('closed', () => { mainWindow = null; drag = null; dragRequested = false; });

  const entry = path.join(__dirname, '..', 'dist', 'index.html');
  mainWindow.loadFile(entry, { query: { pet: '1', size: petSize } }).catch(error => {
    console.error('[softie] desktop startup:', error);
    app.quit();
  });
}

ipcMain.on('softie:menu', (event, payload) => { if (owns(event)) installMenu(payload); });
ipcMain.on('softie:context-menu', event => { if (owns(event)) petMenu?.popup({ window: mainWindow }); });
ipcMain.on('softie:quit', event => { if (owns(event)) app.quit(); });
ipcMain.on('softie:resize', (event, payload) => { if (owns(event)) resizePet(payload?.level); });
ipcMain.on('softie:drag', (event, payload) => {
  if (!owns(event)) return;
  dragRequested = Boolean(payload?.active);
  if (dragRequested) void beginDrag(); else drag = null;
});
ipcMain.on('softie:ready', event => { if (owns(event)) showPet(); });

app.whenReady().then(() => {
  tray = new Tray(path.join(__dirname, 'tray.png'));
  tray.setToolTip('Softie · 软乎乎');
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else if (mainWindow.isVisible()) mainWindow.hide();
    else showPet();
  });
  createWindow();
  cursorTimer = setInterval(() => {
    const point = screen.getCursorScreenPoint();
    send('softie:cursor', point);
    movePet(point);
  }, 33);
});

app.on('before-quit', () => {
  clearInterval(cursorTimer);
  cursorTimer = null;
});

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  else showPet();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
