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
Add-Type -Name Win32 -Namespace Native -MemberDefinition @"
  [DllImport("kernel32.dll")]
  public static extern IntPtr GetConsoleWindow();
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
"@
$consoleHwnd = [Native.Win32]::GetConsoleWindow()
if ($consoleHwnd -ne [IntPtr]::Zero) {
  [void][Native.Win32]::ShowWindow($consoleHwnd, 0)
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$targetExe = "${targetExe.replace(/\\/g, '\\\\')}"
$installDir = Split-Path $targetExe -Parent
$nextFile = Join-Path $installDir "resources\\app\\node_modules\\next\\dist\\server\\next.js"

$form = New-Object System.Windows.Forms.Form
$form.Text = "Aidev Desktop Updater"
$form.Size = New-Object System.Drawing.Size(450, 165)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "None"
$form.BackColor = [System.Drawing.Color]::FromArgb(16, 17, 22)
$form.TopMost = $true
$form.ShowInTaskbar = $true

$title = New-Object System.Windows.Forms.Label
$title.Text = "Memperbarui Aidev Desktop (${verLabel})..."
$title.ForeColor = [System.Drawing.Color]::FromArgb(244, 245, 250)
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 11)
$title.Location = New-Object System.Drawing.Point(24, 22)
$title.Size = New-Object System.Drawing.Size(340, 24)
$form.Controls.Add($title)

$pctLabel = New-Object System.Windows.Forms.Label
$pctLabel.Text = "5%"
$pctLabel.TextAlign = "TopRight"
$pctLabel.ForeColor = [System.Drawing.Color]::FromArgb(96, 165, 250)
$pctLabel.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
$pctLabel.Location = New-Object System.Drawing.Point(364, 23)
$pctLabel.Size = New-Object System.Drawing.Size(62, 22)
$form.Controls.Add($pctLabel)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = "Menyiapkan installer & mengekstrak ribuan file runtime. Mohon tunggu, aplikasi akan terbuka otomatis..."
$sub.ForeColor = [System.Drawing.Color]::FromArgb(158, 164, 180)
$sub.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$sub.Location = New-Object System.Drawing.Point(24, 52)
$sub.Size = New-Object System.Drawing.Size(402, 38)
$form.Controls.Add($sub)

$barBg = New-Object System.Windows.Forms.Panel
$barBg.BackColor = [System.Drawing.Color]::FromArgb(34, 37, 46)
$barBg.Location = New-Object System.Drawing.Point(24, 104)
$barBg.Size = New-Object System.Drawing.Size(402, 10)
$form.Controls.Add($barBg)

$barFill = New-Object System.Windows.Forms.Panel
$barFill.BackColor = [System.Drawing.Color]::FromArgb(59, 130, 246)
$barFill.Location = New-Object System.Drawing.Point(0, 0)
$barFill.Size = New-Object System.Drawing.Size(20, 10)
$barBg.Controls.Add($barFill)

$hint = New-Object System.Windows.Forms.Label
$hint.Text = "Jangan matikan komputer selama proses ekstraksi berlangsung."
$hint.ForeColor = [System.Drawing.Color]::FromArgb(105, 112, 128)
$hint.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$hint.Location = New-Object System.Drawing.Point(24, 124)
$hint.Size = New-Object System.Drawing.Size(402, 18)
$form.Controls.Add($hint)

$form.Add_Shown({
  [void][Native.Win32]::ShowWindow($form.Handle, 9)
  [void][Native.Win32]::SetForegroundWindow($form.Handle)
  $form.Activate()
})

$script:ticks = 0
$script:progress = 5
$script:sawInstaller = $false

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({
  $script:ticks++
  $inst = Get-Process | Where-Object { $_.ProcessName -match "Aidev-Offline-Setup|Aidev-Setup|__update__|Uninstall Aidev|Au_" }
  if ($inst) { $script:sawInstaller = $true }

  if ($script:progress -lt 92) {
    if ($script:ticks -le 10) {
      $script:progress += 3
      $sub.Text = "Membersihkan versi lama & menyiapkan paket pembaruan..."
    } elseif ($script:ticks -le 32) {
      $script:progress += 2
      $sub.Text = "Mengekstrak ribuan file modul Next.js & runtime Aidev Desktop..."
    } else {
      $script:progress += 1
      $sub.Text = "Menyelesaikan ekstraksi paket & memverifikasi integritas file..."
    }
    if ($script:progress -gt 92) { $script:progress = 92 }
    $pctLabel.Text = "$($script:progress)%"
    $barFill.Width = [Math]::Round(402 * ($script:progress / 100.0))
  }

  $minTicks = if ($script:sawInstaller) { 8 } else { 28 }
  $readyOnDisk = (Test-Path $targetExe) -and (Test-Path $nextFile)

  if (($script:ticks -ge $minTicks) -and (-not $inst) -and $readyOnDisk) {
    $pctLabel.Text = "100%"
    $barFill.Width = 402
    $sub.Text = "Pembaruan selesai! Membuka kembali Aidev Desktop..."
    $form.Refresh()
    Start-Sleep -Milliseconds 650
    $running = Get-Process -Name "Aidev" -ErrorAction SilentlyContinue
    if (-not $running) {
      Start-Process -FilePath $targetExe
    }
    $timer.Stop()
    $form.Close()
  } elseif ($script:ticks -ge 200) {
    if ($readyOnDisk) {
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
            ['-NoProfile', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', psScriptPath],
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
        autoUpdater.quitAndInstall(false, true);
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
