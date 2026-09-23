import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface GitResolutionStatus {
  available: boolean;
  gitPath: string | null;
  source: 'system' | 'standard_path' | 'portable' | 'none';
  downloading: boolean;
  progress: number; // 0 - 100
  statusMessage?: string;
  error: string | null;
  platform: string;
}

const FALLBACK_MINGIT_WINDOWS_URL =
  'https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.5/MinGit-2.55.0.5-64-bit.zip';

const FALLBACK_GIT_LINUX_AMD64 =
  'https://github.com/mislav/git-static/releases/download/v2.43.0/git-linux-amd64.tar.gz';

const FALLBACK_GIT_LINUX_ARM64 =
  'https://github.com/mislav/git-static/releases/download/v2.43.0/git-linux-arm64.tar.gz';

class GitResolver {
  private static instance: GitResolver;
  private cachedGitPath: string | null = null;
  private cachedSource: 'system' | 'standard_path' | 'portable' | 'none' = 'none';
  private isDownloading = false;
  private downloadProgress = 0;
  private statusMessage = '';
  private downloadError: string | null = null;
  private downloadPromise: Promise<string> | null = null;

  public static getInstance(): GitResolver {
    if (!GitResolver.instance) {
      GitResolver.instance = new GitResolver();
    }
    return GitResolver.instance;
  }

  public getPlatformInfo() {
    return {
      isWindows: process.platform === 'win32',
      isMac: process.platform === 'darwin',
      isLinux: process.platform === 'linux',
      arch: process.arch, // x64, arm64, ia32, etc.
      binaryName: process.platform === 'win32' ? 'git.exe' : 'git',
    };
  }

  public getRuntimesDir(): string {
    const dir = path.join(os.homedir(), '.cache', 'aidev-runtimes');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public getPortableGitDir(): string {
    return path.join(this.getRuntimesDir(), 'git');
  }

  public getStatus(): GitResolutionStatus {
    return {
      available: Boolean(this.cachedGitPath && fs.existsSync(this.cachedGitPath)),
      gitPath: this.cachedGitPath,
      source: this.cachedSource,
      downloading: this.isDownloading,
      progress: this.downloadProgress,
      statusMessage: this.statusMessage,
      error: this.downloadError,
      platform: `${process.platform}-${process.arch}`,
    };
  }

  public async resolveGit(): Promise<string> {
    if (this.cachedGitPath && fs.existsSync(this.cachedGitPath)) {
      return this.cachedGitPath;
    }

    const { isWindows, isMac, isLinux, binaryName } = this.getPlatformInfo();

    // 1. Check system PATH
    try {
      const lookupCmd = isWindows ? 'where.exe' : 'which';
      const { stdout } = await execFileAsync(lookupCmd, ['git']);
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const clean = line.trim();
        if (clean.toLowerCase().endsWith(binaryName) && fs.existsSync(clean)) {
          this.cachedGitPath = clean;
          this.cachedSource = 'system';
          return clean;
        }
      }
    } catch {
      // Not in PATH or lookupCmd returned non-zero
    }

    // Direct invocation fallback check in PATH
    try {
      await execFileAsync('git', ['--version']);
      this.cachedGitPath = 'git';
      this.cachedSource = 'system';
      return 'git';
    } catch {
      // Not directly executable
    }

    // 2. Check standard OS installation paths
    let candidateStandardPaths: string[] = [];

    if (isWindows) {
      candidateStandardPaths = [
        'C:\\Program Files\\Git\\cmd\\git.exe',
        'C:\\Program Files\\Git\\bin\\git.exe',
        'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'cmd', 'git.exe'),
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'bin', 'git.exe'),
        path.join(os.homedir(), 'scoop', 'shims', 'git.exe'),
        'C:\\ProgramData\\chocolatey\\bin\\git.exe',
      ];
    } else if (isMac) {
      candidateStandardPaths = [
        '/usr/bin/git',
        '/usr/local/bin/git',
        '/opt/homebrew/bin/git',
        '/Library/Developer/CommandLineTools/usr/bin/git',
        path.join(os.homedir(), '.nix-profile', 'bin', 'git'),
      ];
    } else if (isLinux) {
      candidateStandardPaths = [
        '/usr/bin/git',
        '/usr/local/bin/git',
        '/bin/git',
        '/snap/bin/git',
        path.join(os.homedir(), '.nix-profile', 'bin', 'git'),
      ];
    }

    for (const p of candidateStandardPaths) {
      if (fs.existsSync(p)) {
        this.cachedGitPath = p;
        this.cachedSource = 'standard_path';
        return p;
      }
    }

    // 3. Check cached portable git in ~/.cache/aidev-runtimes/git/
    const portableCandidates: string[] = [];
    if (isWindows) {
      portableCandidates.push(
        path.join(this.getPortableGitDir(), 'cmd', 'git.exe'),
        path.join(this.getPortableGitDir(), 'bin', 'git.exe'),
        path.join(this.getPortableGitDir(), 'git.exe')
      );
    } else {
      portableCandidates.push(
        path.join(this.getPortableGitDir(), 'bin', 'git'),
        path.join(this.getPortableGitDir(), 'git')
      );
    }

    for (const p of portableCandidates) {
      if (fs.existsSync(p)) {
        this.cachedGitPath = p;
        this.cachedSource = 'portable';
        return p;
      }
    }

    // 4. If not found anywhere, trigger platform-appropriate download
    return this.ensurePortableGit();
  }

  public async ensurePortableGit(): Promise<string> {
    if (this.downloadPromise) {
      return this.downloadPromise;
    }

    this.downloadPromise = (async () => {
      const { isWindows, isMac, isLinux, arch } = this.getPlatformInfo();
      const targetGitDir = this.getPortableGitDir();
      const runtimesDir = this.getRuntimesDir();

      this.isDownloading = true;
      this.downloadProgress = 5;
      this.statusMessage = `Searching portable Git package for platform ${process.platform}-${arch}...`;
      this.downloadError = null;

      try {
        if (isWindows) {
          // ================= WINDOWS (MinGit) =================
          let downloadUrl = FALLBACK_MINGIT_WINDOWS_URL;

          try {
            const res = await fetch('https://api.github.com/repos/git-for-windows/git/releases/latest', {
              headers: { 'User-Agent': 'aidev' },
            });
            if (res.ok) {
              const data = (await res.json()) as any;
              const is64 = arch === 'x64' || arch === 'arm64';
              const targetSuffix = is64 ? '-64-bit.zip' : '-32-bit.zip';
              const asset = data.assets?.find(
                (x: any) =>
                  typeof x.name === 'string' &&
                  x.name.startsWith('MinGit-') &&
                  x.name.endsWith(targetSuffix) &&
                  !x.name.includes('busybox')
              );
              if (asset?.browser_download_url) {
                downloadUrl = asset.browser_download_url;
              }
            }
          } catch {}

          const zipPath = path.join(runtimesDir, 'mingit_download.zip');
          const executablePath = path.join(targetGitDir, 'cmd', 'git.exe');

          await this.downloadFile(downloadUrl, zipPath, 'MinGit Windows (~37MB)');

          this.statusMessage = 'Extracting MinGit to ~/.cache/aidev-runtimes/git/...';
          this.downloadProgress = 85;

          if (!fs.existsSync(targetGitDir)) {
            fs.mkdirSync(targetGitDir, { recursive: true });
          }

          // Expand archive via PowerShell
          await new Promise<void>((resolve, reject) => {
            const ps = spawn(
              'powershell',
              [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${targetGitDir.replace(/'/g, "''")}' -Force`,
              ],
              { stdio: 'ignore' }
            );
            ps.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Expand-Archive exit ${code}`))));
            ps.on('error', reject);
          });

          try {
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
          } catch {}

          this.cachedGitPath = executablePath;
          this.cachedSource = 'portable';
          this.downloadProgress = 100;
          this.statusMessage = 'Portable Git Windows is ready to use!';
          this.isDownloading = false;
          return executablePath;
        } else if (isLinux) {
          // ================= LINUX (Static Git Tarball) =================
          const downloadUrl = arch === 'arm64' ? FALLBACK_GIT_LINUX_ARM64 : FALLBACK_GIT_LINUX_AMD64;
          const tarPath = path.join(runtimesDir, 'git_linux.tar.gz');
          const executablePath = path.join(targetGitDir, 'bin', 'git');

          await this.downloadFile(downloadUrl, tarPath, `Git Linux ${arch}`);

          this.statusMessage = 'Extracting Git to ~/.cache/aidev-runtimes/git/...';
          this.downloadProgress = 85;

          if (!fs.existsSync(targetGitDir)) {
            fs.mkdirSync(targetGitDir, { recursive: true });
          }

          // Extract tarball via native tar
          await new Promise<void>((resolve, reject) => {
            const t = spawn('tar', ['-xzf', tarPath, '-C', targetGitDir], { stdio: 'ignore' });
            t.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar exit ${code}`))));
            t.on('error', reject);
          });

          // Ensure executable permissions
          try {
            if (fs.existsSync(executablePath)) {
              fs.chmodSync(executablePath, 0o755);
            }
            if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
          } catch {}

          this.cachedGitPath = executablePath;
          this.cachedSource = 'portable';
          this.downloadProgress = 100;
          this.statusMessage = 'Portable Git Linux is ready to use!';
          this.isDownloading = false;
          return executablePath;
        } else if (isMac) {
          // ================= MACOS =================
          // macOS typically provides Git via Xcode CLT or Homebrew
          this.isDownloading = false;
          throw new Error(
            'Git is not installed on macOS. Please run `xcode-select --install` or `brew install git` in terminal.'
          );
        } else {
          this.isDownloading = false;
          throw new Error(`Platform OS is not supported: ${process.platform}`);
        }
      } catch (err: any) {
        this.isDownloading = false;
        this.downloadError = err.message || String(err);
        this.statusMessage = `Error: ${this.downloadError}`;
        throw err;
      } finally {
        this.downloadPromise = null;
      }
    })();

    return this.downloadPromise;
  }

  private async downloadFile(url: string, destPath: string, label: string): Promise<void> {
    this.statusMessage = `Downloading ${label}...`;
    this.downloadProgress = 15;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'aidev' },
    });

    if (!res.ok || !res.body) {
      throw new Error(`Failed to download ${label}: ${res.statusText} (${res.status})`);
    }

    const contentLength = Number(res.headers.get('content-length')) || 35 * 1024 * 1024;
    let downloadedBytes = 0;

    const fileStream = fs.createWriteStream(destPath);
    const reader = res.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        downloadedBytes += value.length;
        fileStream.write(Buffer.from(value));
        const pct = Math.min(80, 15 + Math.round((downloadedBytes / contentLength) * 65));
        this.downloadProgress = pct;
        const mbDownloaded = (downloadedBytes / 1024 / 1024).toFixed(1);
        const mbTotal = (contentLength / 1024 / 1024).toFixed(1);
        this.statusMessage = `Downloading ${label} (${mbDownloaded}MB / ${mbTotal}MB)...`;
      }
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.end(() => resolve());
      fileStream.on('error', reject);
    });
  }
}

export const gitResolver = GitResolver.getInstance();
