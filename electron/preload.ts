import { contextBridge, ipcRenderer } from 'electron';

export interface UpdateInfo {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  transferredBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  error?: string;
}

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void;
  openExternal: (url: string) => void;
  getServerPort: () => Promise<number>;
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => void;
  downloadUpdate: () => void;
  quitAndInstall: () => void;
  toggleDevTools: () => void;
  toggleFullScreen: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  onUpdateStatus: (callback: (info: UpdateInfo) => void) => () => void;
  onOpenProjectPath: (callback: (projectPath: string) => void) => () => void;
  openDirectoryPicker: (defaultPath?: string) => Promise<string | null>;
}

const electronAPI: ElectronAPI = {
  isElectron: true,
  platform: process.platform,

  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  toggleDevTools: () => ipcRenderer.send('window-toggle-devtools'),
  toggleFullScreen: () => ipcRenderer.send('window-toggle-fullscreen'),
  zoomIn: () => ipcRenderer.send('window-zoom-in'),
  zoomOut: () => ipcRenderer.send('window-zoom-out'),
  resetZoom: () => ipcRenderer.send('window-reset-zoom'),

  onMaximizeChange: (callback: (isMax: boolean) => void) => {
    const handler = (_event: any, isMax: boolean) => callback(isMax);
    ipcRenderer.on('window-maximize-change', handler);
    return () => {
      ipcRenderer.removeListener('window-maximize-change', handler);
    };
  },

  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),

  onUpdateStatus: (callback: (info: UpdateInfo) => void) => {
    const handler = (_event: any, info: UpdateInfo) => callback(info);
    ipcRenderer.on('updater-status', handler);
    return () => {
      ipcRenderer.removeListener('updater-status', handler);
    };
  },

  onOpenProjectPath: (callback: (projectPath: string) => void) => {
    const handler = (_event: any, p: string) => callback(p);
    ipcRenderer.on('open-project-path', handler);
    return () => {
      ipcRenderer.removeListener('open-project-path', handler);
    };
  },

  openDirectoryPicker: (defaultPath?: string) =>
    ipcRenderer.invoke('open-directory-picker', defaultPath),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
