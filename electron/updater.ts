import { BrowserWindow, ipcMain, app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export function initAutoUpdater(mainWindow: BrowserWindow, onBeforeInstall?: () => void): void {
  const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml');
  const hasUpdateConfig = fs.existsSync(updateConfigPath);

  // Automatically download updates silently in the background (like VS Code / Antigravity / Codex Desktop)
  // Disable differential blockmap download because NSIS blockmap range reconstruction frequently stalls at 85-89% on GitHub Releases CDN
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.disableWebInstaller = true;
  let latestAvailableVersion: string | undefined;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let retriedFullDownload = false;

  const clearStallTimer = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  };

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
    retriedFullDownload = false;
    sendStatus({
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', () => {
    clearStallTimer();
    sendStatus({ status: 'not-available' });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    clearStallTimer();
    const pct = Math.min(100, Math.round(progressObj.percent));
    sendStatus({
      status: 'downloading',
      version: latestAvailableVersion,
      percent: pct,
      transferredBytes: progressObj.transferred,
      totalBytes: progressObj.total,
      bytesPerSecond: progressObj.bytesPerSecond,
    });

    // Watchdog: if download stalls for >20s without completing, re-trigger clean full download once
    stallTimer = setTimeout(() => {
      if (!retriedFullDownload && app.isPackaged && hasUpdateConfig) {
        retriedFullDownload = true;
        autoUpdater.disableDifferentialDownload = true;
        autoUpdater.downloadUpdate().catch(() => {});
      }
    }, 20000);
  });

  autoUpdater.on('update-downloaded', (info) => {
    clearStallTimer();
    latestAvailableVersion = info.version || latestAvailableVersion;
    sendStatus({
      status: 'downloaded',
      version: latestAvailableVersion,
    });
  });

  autoUpdater.on('error', (err) => {
    clearStallTimer();
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
      try {
        onBeforeInstall?.();
      } catch {}

      if (process.platform === 'win32') {
        try {
          const targetExe = process.execPath;
          const verLabel = latestAvailableVersion ? `v${latestAvailableVersion}` : 'versi terbaru';
          const psScriptPath = path.join(os.tmpdir(), `aidev-update-watcher-${Date.now()}.ps1`);
          const psContent = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$targetExe = "${targetExe.replace(/\\/g, '\\\\')}"

$form = New-Object System.Windows.Forms.Form
$form.Text = "Aidev Desktop Updater"
$form.Size = New-Object System.Drawing.Size(420, 145)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "None"
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 19, 24)
$form.TopMost = $true

$title = New-Object System.Windows.Forms.Label
$title.Text = "Memperbarui Aidev Desktop (${verLabel})..."
$title.ForeColor = [System.Drawing.Color]::FromArgb(240, 242, 248)
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 11)
$title.Location = New-Object System.Drawing.Point(24, 24)
$title.Size = New-Object System.Drawing.Size(372, 24)
$form.Controls.Add($title)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = "Sedang mengekstrak file pembaruan. Mohon tunggu sebentar, aplikasi akan terbuka otomatis."
$sub.ForeColor = [System.Drawing.Color]::FromArgb(155, 160, 175)
$sub.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$sub.Location = New-Object System.Drawing.Point(24, 54)
$sub.Size = New-Object System.Drawing.Size(372, 38)
$form.Controls.Add($sub)

$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Style = "Marquee"
$bar.MarqueeAnimationSpeed = 25
$bar.Location = New-Object System.Drawing.Point(24, 100)
$bar.Size = New-Object System.Drawing.Size(372, 14)
$form.Controls.Add($bar)

$script:ticks = 0
$script:sawInstaller = $false
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
  $script:ticks++
  $inst = Get-Process | Where-Object { $_.ProcessName -match "Aidev-Offline-Setup|Aidev-Setup|Uninstall Aidev" }
  if ($inst) { $script:sawInstaller = $true }
  if (($script:ticks -ge 4) -and (-not $inst) -and (Test-Path $targetExe)) {
    $running = Get-Process -Name "Aidev" -ErrorAction SilentlyContinue
    if (-not $running) {
      Start-Process -FilePath $targetExe
    }
    $timer.Stop()
    $form.Close()
  } elseif ($script:ticks -ge 90) {
    if (Test-Path $targetExe) {
      $running = Get-Process -Name "Aidev" -ErrorAction SilentlyContinue
      if (-not $running) { Start-Process -FilePath $targetExe }
    }
    $timer.Stop()
    $form.Close()
  }
})
$timer.Start()
[void]$form.ShowDialog()
`;
          fs.writeFileSync(psScriptPath, psContent, 'utf-8');
          const child = spawn(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', psScriptPath],
            { detached: true, stdio: 'ignore' }
          );
          child.unref();
        } catch {}
      } else if (process.platform === 'linux') {
        try {
          const targetBin = process.env.APPIMAGE || process.execPath;
          const verLabel = latestAvailableVersion ? `v${latestAvailableVersion}` : 'versi terbaru';
          const shScriptPath = path.join(os.tmpdir(), `aidev-update-watcher-${Date.now()}.sh`);
          const shContent = `#!/usr/bin/env bash
TARGET_BIN="${targetBin.replace(/"/g, '\\"')}"
if command -v notify-send >/dev/null 2>&1; then
  notify-send "Aidev Desktop Updater" "Memperbarui Aidev Desktop (${verLabel})... Aplikasi akan terbuka otomatis." --icon=dialog-information || true
fi
ZENITY_PID=""
if command -v zenity >/dev/null 2>&1; then
  (while true; do echo "# Sedang memasang pembaruan Aidev Desktop (${verLabel})... Mohon tunggu sebentar."; sleep 1; done) | zenity --progress --title="Aidev Desktop Updater" --text="Sedang memasang pembaruan Aidev Desktop (${verLabel})..." --pulsate --no-cancel --width=400 2>/dev/null &
  ZENITY_PID=$!
fi
sleep 4
for i in $(seq 1 30); do
  if [ -f "$TARGET_BIN" ]; then
    chmod +x "$TARGET_BIN" 2>/dev/null || true
    if ! pgrep -f "$TARGET_BIN" >/dev/null 2>&1; then
      nohup "$TARGET_BIN" --no-sandbox >/dev/null 2>&1 &
    fi
    break
  fi
  sleep 1
done
if [ -n "$ZENITY_PID" ]; then
  kill "$ZENITY_PID" 2>/dev/null || true
fi
`;
          fs.writeFileSync(shScriptPath, shContent, { encoding: 'utf-8', mode: 0o755 });
          const child = spawn('bash', [shScriptPath], { detached: true, stdio: 'ignore' });
          child.unref();
        } catch {}
      }

      setTimeout(() => {
        autoUpdater.quitAndInstall(true, true);
      }, 250);
    }
  });

  // Initial check 5 seconds after startup if packaged and update config exists
  if (app.isPackaged && hasUpdateConfig) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 5000);
  }
}
