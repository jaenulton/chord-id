import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Version info
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Auto-update functions
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Update event listeners
  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  onUpdateProgress: (callback: (progress: { percent: number }) => void) => {
    ipcRenderer.on('update-progress', (_event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },

  // Check if running in Electron
  isElectron: true,
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI?: {
      getVersion: () => Promise<string>;
      checkForUpdates: () => Promise<void>;
      installUpdate: () => Promise<void>;
      onUpdateAvailable: (callback: (info: { version: string }) => void) => void;
      onUpdateProgress: (callback: (progress: { percent: number }) => void) => void;
      onUpdateDownloaded: (callback: (info: { version: string }) => void) => void;
      isElectron: boolean;
    };
  }
}
