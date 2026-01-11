// Type definitions for Electron API exposed via preload script

export interface ElectronAPI {
  getVersion: () => Promise<string>;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateAvailable: (callback: (info: { version: string }) => void) => void;
  onUpdateProgress: (callback: (progress: { percent: number }) => void) => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => void;
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
