/**
 * Electron Preload Script
 *
 * Exposes a safe IPC bridge (window.electronAPI) to the control panel HTML.
 * Uses contextBridge so the renderer never has direct access to Node.js.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Actions
  startServer:    () => ipcRenderer.send('start-server'),
  stopServer:     () => ipcRenderer.send('stop-server'),
  openBrowser:    () => ipcRenderer.send('open-browser'),
  openBrowserLan: (url)  => ipcRenderer.send('open-browser-lan', url),
  openBrowserPage:(page) => ipcRenderer.send('open-browser-page', page),
  requestStatus:  () => ipcRenderer.send('request-status'),

  // Event listeners
  onStatus: (callback) => ipcRenderer.on('status', (_event, data)  => callback(data)),
  onLog:    (callback) => ipcRenderer.on('log',    (_event, entry) => callback(entry)),

  // ── Auto-updater ────────────────────────────────────────────────────────────
  // Actions
  checkForUpdate:  () => ipcRenderer.send('check-for-update'),
  downloadUpdate:  () => ipcRenderer.send('download-update'),
  installUpdate:   () => ipcRenderer.send('install-update'),

  // Event listener — receives { state, version?, percent?, error? }
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, data) => callback(data)),

  // ── Dev Drawer (Ctrl+Shift+Alt+D global shortcut) ───────────────────────────
  // The main process sends 'toggle-dev-drawer' when the global shortcut fires.
  // The React DebugPanel listens via this callback and toggles the hidden drawer.
  // Only active when DEVELOPER_LOCK=true — the React side enforces the gate.
  onToggleDevDrawer: (callback) => ipcRenderer.on('toggle-dev-drawer', () => callback()),
});
