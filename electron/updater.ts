import { BrowserWindow, ipcMain, app } from 'electron';
import { autoUpdater } from 'electron-updater';
import fs from 'fs';
import path from 'path';

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml');
  const hasUpdateConfig = fs.existsSync(updateConfigPath);

  // Automatically download updates silently in the background (like VS Code / Antigravity / Codex Desktop)
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let latestAvailableVersion: string | undefined;

  const sendStatus = (payload: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        version: latestAvailableVersion,
        ...payload,
      });
    }
  };

  autoUpdater.on('checking-for-update', () => {
    sendStatus({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    latestAvailableVersion = info.version;
    sendStatus({
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendStatus({ status: 'not-available' });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendStatus({
      status: 'downloading',
      version: latestAvailableVersion,
      percent: Math.round(progressObj.percent),
      transferredBytes: progressObj.transferred,
      totalBytes: progressObj.total,
      bytesPerSecond: progressObj.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    latestAvailableVersion = info.version || latestAvailableVersion;
    sendStatus({
      status: 'downloaded',
      version: latestAvailableVersion,
    });
  });

  autoUpdater.on('error', (err) => {
    // Only report error if app is packaged and update config exists
    if (app.isPackaged && hasUpdateConfig) {
      sendStatus({
        status: 'error',
        error: err.message || 'Error checking for updates',
      });
    }
  });

  // Renderer triggers
  ipcMain.on('check-for-updates', () => {
    if (app.isPackaged && hasUpdateConfig) {
      autoUpdater.checkForUpdates().catch(() => {});
    } else {
      sendStatus({ status: 'not-available' });
    }
  });

  ipcMain.on('download-update', () => {
    if (app.isPackaged && hasUpdateConfig) {
      autoUpdater.downloadUpdate().catch((err) => {
        sendStatus({ status: 'error', error: err.message });
      });
    }
  });

  ipcMain.on('quit-and-install', () => {
    if (app.isPackaged && hasUpdateConfig) {
      // isSilent = true (skips NSIS installer wizard completely via /S flag),
      // isForceRunAfter = true (automatically relaunches Aidev right after silent update)
      autoUpdater.quitAndInstall(true, true);
    }
  });

  // Initial check 5 seconds after startup if packaged and update config exists
  if (app.isPackaged && hasUpdateConfig) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 5000);
  }
}
