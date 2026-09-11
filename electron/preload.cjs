const { contextBridge, ipcRenderer } = require('electron');

const SEND_CHANNELS = new Set([
  'softie:context-menu',
  'softie:drag',
  'softie:menu',
  'softie:quit',
  'softie:ready',
  'softie:resize',
]);
const RECEIVE_CHANNELS = new Set(['softie:command', 'softie:cursor']);

contextBridge.exposeInMainWorld('softieDesktop', Object.freeze({
  hyprland: /hyprland/i.test(process.env.XDG_CURRENT_DESKTOP || ''),
  send(channel, payload) {
    if (SEND_CHANNELS.has(channel)) ipcRenderer.send(channel, payload);
  },
  on(channel, listener) {
    if (!RECEIVE_CHANNELS.has(channel) || typeof listener !== 'function') return () => {};
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
}));
