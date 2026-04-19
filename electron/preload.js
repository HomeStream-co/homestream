/**
 * Electron Preload Script
 *
 * Exposes a safe IPC bridge (window.electronAPI) to the control panel HTML.
 * Uses contextBridge so the renderer never has direct access to Node.js.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Actions
  startServer: () => ipcRenderer.send('start-server'),
  stopServer: () => ipcRenderer.send('stop-server'),
  openBrowser: () => ipcRenderer.send('open-browser'),
  openBrowserLan: (url) => ipcRenderer.send('open-browser-lan', url),
  requestStatus: () => ipcRenderer.send('request-status'),

  // Event listeners
  onStatus: (callback) => ipcRenderer.on('status', (_event, data) => callback(data)),
  onLog: (callback) => ipcRenderer.on('log', (_event, entry) => callback(entry)),
});
