import { app, BrowserWindow, ipcMain, shell, utilityProcess, UtilityProcess, dialog } from 'electron';
import path from 'path';
import net from 'net';
import http from 'http';
import fs from 'fs';
import { initAutoUpdater } from './updater';

let mainWindow: BrowserWindow | null = null;
let serverProcess: UtilityProcess | any = null;
let activePort: number = 63027;

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

/**
 * Checks if a specific port is free to listen on.
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Dynamic Port Hunter: Tests default port 63027, or picks a random free port in range 60000-65535.
 */
async function findAvailablePort(defaultPort = 63027): Promise<number> {
  if (await isPortAvailable(defaultPort)) {
    return defaultPort;
  }

  console.log(`Port ${defaultPort} is busy. Hunting for an available port in range 60000-65535...`);
  const min = 60000;
  const max = 65535;

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = Math.floor(Math.random() * (max - min + 1)) + min;
    if (await isPortAvailable(candidate)) {
      console.log(`Found available port: ${candidate}`);
      return candidate;
    }
  }

  // Fallback to random OS-assigned port
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const p = typeof addr === 'object' && addr ? addr.port : 63027;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
}

/**
 * Polls the local server until it responds with HTTP 200 on /api/models.
 */
function waitForServerReady(port: number, timeoutMs = 25000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/models`, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          resolve();
        } else {
          retry();
        }
      });

      req.on('error', () => {
        retry();
      });

      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server readiness check timed out on port ${port} after ${timeoutMs}ms`));
      } else {
        setTimeout(check, 250);
      }
    };

    check();
  });
}

/**
 * Spawns the standalone Next.js server (server.mjs) via Electron utilityProcess.
 */
async function startBackendServer(port: number): Promise<void> {
  let serverPath = '';

  if (isDev) {
    serverPath = path.join(__dirname, '../server.mjs');
  } else {
    // In packaged app, server.mjs is located in resources/app/server.mjs or app.asar
    const candidatePaths = [
      path.join(process.resourcesPath, 'app', 'server.mjs'),
      path.join(app.getAppPath(), 'server.mjs'),
      path.join(__dirname, '../server.mjs'),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        serverPath = p;
        break;
      }
    }
  }

  if (!serverPath || !fs.existsSync(serverPath)) {
    throw new Error(`Could not find server.mjs. Searched in app resources.`);
  }

  console.log(`Starting backend server on port ${port} using: ${serverPath}`);

  const bundledNpmBin = path.join(process.resourcesPath, 'npm', 'bin');
  const customPath = fs.existsSync(bundledNpmBin)
    ? `${bundledNpmBin}${path.delimiter}${process.env.PATH || ''}`
    : process.env.PATH;

  const childEnv: Record<string, string | undefined> = { ...process.env };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  return new Promise<void>((resolve, reject) => {
    let isReady = false;
    let serverStderr = '';

    serverProcess = utilityProcess.fork(serverPath, [], {
      env: {
        ...childEnv,
        PORT: String(port),
        NODE_ENV: 'production',
        AIDEV_DESKTOP: '1',
        PATH: customPath,
      },
      stdio: 'pipe',
      cwd: path.dirname(serverPath),
    });

    serverProcess.stdout?.on('data', (data: Buffer) => {
      console.log(`[Next.js Server]: ${data.toString().trim()}`);
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      serverStderr += line + '\n';
      console.error(`[Next.js Server Error]: ${line}`);
    });

    serverProcess.on('exit', (code: number) => {
      console.log(`Next.js server exited with code: ${code}`);
      if (!isReady) {
        reject(new Error(`Server proses berhenti tiba-tiba dengan exit code: ${code}.\n${serverStderr}`));
      }
    });

    waitForServerReady(port)
      .then(() => {
        isReady = true;
        console.log(`Next.js backend server successfully listening and healthy on port ${port}!`);
        resolve();
      })
      .catch((err) => {
        reject(new Error(`${err.message}\n${serverStderr}`));
      });
  });
}

function getSplashPath(): string {
  const candidatePaths = [
    path.join(process.resourcesPath, 'app', 'public', 'splash.html'),
    path.join(__dirname, '../public/splash.html'),
    path.join(app.getAppPath(), 'public', 'splash.html'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, '../public/splash.html');
}

/**
 * Creates the primary Frameless BrowserWindow matching Cursor / VS Code dark styling.
 */
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0c0d12',
    show: false,
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: fs.existsSync(path.join(__dirname, 'preload.cjs'))
        ? path.join(__dirname, 'preload.cjs')
        : path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  const splashPath = getSplashPath();
  if (fs.existsSync(splashPath)) {
    win.loadFile(splashPath);
  }

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // Track maximize state changes for custom titlebar button icon toggle
  win.on('maximize', () => {
    win.webContents.send('window-maximize-change', true);
  });
  win.on('unmaximize', () => {
    win.webContents.send('window-maximize-change', false);
  });

  // 1. Intercept new window requests (target="_blank" or window.open)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // 2. Intercept direct in-app navigation on external URLs (target="_self" or markdown links)
  win.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);
      const isLocal = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
      if (!isLocal && (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:')) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {}
  });

  return win;
}

/**
 * IPC handlers for frameless window controls & desktop integration.
 */
function setupIpcHandlers(): void {
  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    // Full Quit per user preference: cleanly exit the entire application
    app.quit();
  });

  ipcMain.handle('window-is-maximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });

  ipcMain.handle('get-server-port', () => {
    return activePort;
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.on('open-external', (_event, url: string) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url);
    }
  });
}

// Single instance lock (prevent multiple running desktop instances)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      // Handle CLI 'aidev .' or folder arguments passed in second instance
      const lastArg = commandLine[commandLine.length - 1];
      if (lastArg && lastArg !== '.' && fs.existsSync(lastArg)) {
        mainWindow.webContents.send('open-project-path', path.resolve(lastArg));
      }
    }
  });

  // Register custom Windows deep link protocol (aidev://)
  app.setAsDefaultProtocolClient('aidev');

  app.whenReady().then(async () => {
    setupIpcHandlers();

    // 1. Instantly display splash window (< 50ms)
    mainWindow = createMainWindow();

    try {
      const startTime = Date.now();
      activePort = await findAvailablePort(63027);
      await startBackendServer(activePort);

      // Ensure splash is visible for a smooth, premium feel (min 900ms)
      const elapsed = Date.now() - startTime;
      if (elapsed < 900) {
        await new Promise((resolve) => setTimeout(resolve, 900 - elapsed));
      }

      // 2. Seamlessly transition to main app URL
      if (mainWindow && !mainWindow.isDestroyed()) {
        await mainWindow.loadURL(`http://127.0.0.1:${activePort}`);
        initAutoUpdater(mainWindow);
      }
    } catch (err: any) {
      console.error('Failed to initialize Aidev Desktop application:', err);
      dialog.showErrorBox('Aidev Desktop Error', `Gagal memulai aplikasi:\n\n${err?.message || err}`);
      app.quit();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && activePort) {
        mainWindow = createMainWindow();
        mainWindow.loadURL(`http://127.0.0.1:${activePort}`);
      }
    });
  });

  // Ensure graceful shutdown of Next.js server process on window exit
  app.on('before-quit', () => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch {}
      serverProcess = null;
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
