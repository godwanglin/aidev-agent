import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface NodeResolutionStatus {
  available: boolean;
  nodePath: string | null;
  npmPath: string | null;
  npxPath: string | null;
  binDir: string | null;
  source: 'system' | 'standard_path' | 'portable' | 'none';
  downloading: boolean;
  progress: number; // 0 - 100
  statusMessage?: string;
  error: string | null;
  platform: string;
}

const DEFAULT_NODE_VERSION = 'v22.14.0';

export class NodeResolver {
  private static instance: NodeResolver;
  private cachedNodePath: string | null = null;
  private cachedNpmPath: string | null = null;
  private cachedNpxPath: string | null = null;
  private cachedBinDir: string | null = null;
  private cachedSource: 'system' | 'standard_path' | 'portable' | 'none' = 'none';
  private isDownloading = false;
  private downloadProgress = 0;
  private statusMessage = '';
  private downloadError: string | null = null;
  private downloadPromise: Promise<string> | null = null;

  public static getInstance(): NodeResolver {
    if (!NodeResolver.instance) {
      NodeResolver.instance = new NodeResolver();
    }
    return NodeResolver.instance;
  }

  public getPlatformInfo() {
    return {
      isWindows: process.platform === 'win32',
      isMac: process.platform === 'darwin',
      isLinux: process.platform === 'linux',
      arch: process.arch,
      nodeExe: process.platform === 'win32' ? 'node.exe' : 'node',
      npmCmd: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      npxCmd: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    };
  }

  public getRuntimesDir(): string {
    const dir = path.join(os.homedir(), '.cache', 'aidev-runtimes');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public getPortableNodeDir(): string {
    return path.join(this.getRuntimesDir(), 'node');
  }

  public getStatus(): NodeResolutionStatus {
    const available = Boolean(this.cachedNodePath && fs.existsSync(this.cachedNodePath));
    return {
      available,
      nodePath: this.cachedNodePath,
      npmPath: this.cachedNpmPath,
      npxPath: this.cachedNpxPath,
      binDir: this.cachedBinDir,
      source: this.cachedSource,
      downloading: this.isDownloading,
      progress: this.downloadProgress,
      statusMessage: this.statusMessage,
      error: this.downloadError,
      platform: `${process.platform}-${process.arch}`,
    };
  }

  /**
   * Resolves paths to Node, NPM, and NPX executables.
   * Checks: 1) System PATH, 2) Standard OS locations, 3) Cached portable directory.
   */
  public async resolveNode(): Promise<{ nodePath: string; npmPath: string; npxPath: string; binDir: string }> {
    if (this.cachedNodePath && fs.existsSync(this.cachedNodePath)) {
      return {
        nodePath: this.cachedNodePath,
        npmPath: this.cachedNpmPath || 'npm',
        npxPath: this.cachedNpxPath || 'npx',
        binDir: this.cachedBinDir || path.dirname(this.cachedNodePath),
      };
    }

    const { isWindows, nodeExe, npmCmd, npxCmd } = this.getPlatformInfo();

    // 1. Check system PATH
    try {
      const lookupCmd = isWindows ? 'where.exe' : 'which';
      const { stdout } = await execFileAsync(lookupCmd, ['node']);
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const clean = line.trim();
        if (clean.toLowerCase().endsWith(nodeExe) && fs.existsSync(clean)) {
          const binDir = path.dirname(clean);
          this.cachedNodePath = clean;
          this.cachedBinDir = binDir;
          this.cachedNpmPath = fs.existsSync(path.join(binDir, npmCmd)) ? path.join(binDir, npmCmd) : 'npm';
          this.cachedNpxPath = fs.existsSync(path.join(binDir, npxCmd)) ? path.join(binDir, npxCmd) : 'npx';
          this.cachedSource = 'system';
          return {
            nodePath: clean,
            npmPath: this.cachedNpmPath,
            npxPath: this.cachedNpxPath,
            binDir,
          };
        }
      }
    } catch {}

    // Direct invocation fallback check in PATH
    try {
      await execFileAsync('node', ['--version']);
      this.cachedNodePath = 'node';
      this.cachedNpmPath = 'npm';
      this.cachedNpxPath = 'npx';
      this.cachedBinDir = '';
      this.cachedSource = 'system';
      return { nodePath: 'node', npmPath: 'npm', npxPath: 'npx', binDir: '' };
    } catch {}

    // 2. Check standard OS installation paths
    let candidateStandardDirs: string[] = [];
    if (isWindows) {
      candidateStandardDirs = [
        'C:\\Program Files\\nodejs',
        'C:\\Program Files (x86)\\nodejs',
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'nodejs'),
        path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
        path.join(os.homedir(), 'scoop', 'shims'),
        'C:\\ProgramData\\chocolatey\\bin',
      ];
    } else {
      candidateStandardDirs = [
        '/usr/bin',
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/snap/bin',
        path.join(os.homedir(), '.nvm', 'current', 'bin'),
        path.join(os.homedir(), '.fnm', 'current', 'bin'),
        path.join(os.homedir(), '.volta', 'bin'),
      ];
    }

    for (const d of candidateStandardDirs) {
      const nodeFile = path.join(d, nodeExe);
      if (fs.existsSync(nodeFile)) {
        this.cachedNodePath = nodeFile;
        this.cachedBinDir = d;
        this.cachedNpmPath = fs.existsSync(path.join(d, npmCmd)) ? path.join(d, npmCmd) : 'npm';
        this.cachedNpxPath = fs.existsSync(path.join(d, npxCmd)) ? path.join(d, npxCmd) : 'npx';
        this.cachedSource = 'standard_path';
        return {
          nodePath: nodeFile,
          npmPath: this.cachedNpmPath,
          npxPath: this.cachedNpxPath,
          binDir: d,
        };
      }
    }

    // 3. Check cached portable node in ~/.cache/aidev-runtimes/node/
    const portableDir = this.getPortableNodeDir();
    const portableNodeFile = isWindows ? path.join(portableDir, nodeExe) : path.join(portableDir, 'bin', nodeExe);
    if (fs.existsSync(portableNodeFile)) {
      const binDir = isWindows ? portableDir : path.join(portableDir, 'bin');
      this.cachedNodePath = portableNodeFile;
      this.cachedBinDir = binDir;
      this.cachedNpmPath = path.join(binDir, npmCmd);
      this.cachedNpxPath = path.join(binDir, npxCmd);
      this.cachedSource = 'portable';
      return {
        nodePath: portableNodeFile,
        npmPath: this.cachedNpmPath,
        npxPath: this.cachedNpxPath,
        binDir,
      };
    }

    // 4. Download on-demand portable Node+NPM
    return this.ensurePortableNode();
  }

  public async ensurePortableNode(): Promise<{ nodePath: string; npmPath: string; npxPath: string; binDir: string }> {
    if (this.downloadPromise) {
      await this.downloadPromise;
      return this.resolveNode();
    }

    this.downloadPromise = (async () => {
      const { isWindows, arch } = this.getPlatformInfo();
      const targetDir = this.getPortableNodeDir();
      const runtimesDir = this.getRuntimesDir();

      this.isDownloading = true;
      this.downloadProgress = 10;
      this.statusMessage = 'Fetching official Node.js & NPM portable runtime...';
      this.downloadError = null;

      try {
        if (isWindows) {
          const winArch = arch === 'arm64' ? 'arm64' : 'x64';
          const zipName = `node-${DEFAULT_NODE_VERSION}-win-${winArch}.zip`;
          const downloadUrl = `https://nodejs.org/dist/${DEFAULT_NODE_VERSION}/${zipName}`;
          const zipPath = path.join(runtimesDir, 'node_download.zip');

          await this.downloadFile(downloadUrl, zipPath, `Node.js + NPM (${winArch})`);

          this.statusMessage = 'Extracting portable Node & NPM runtime...';
          this.downloadProgress = 85;

          const tempExtractDir = path.join(runtimesDir, 'node_temp');
          if (fs.existsSync(tempExtractDir)) {
            fs.rmSync(tempExtractDir, { recursive: true, force: true });
          }
          fs.mkdirSync(tempExtractDir, { recursive: true });

          await new Promise<void>((resolve, reject) => {
            const ps = spawn(
              'powershell',
              [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${tempExtractDir.replace(/'/g, "''")}' -Force`,
              ],
              { stdio: 'ignore' }
            );
            ps.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Expand-Archive exit ${code}`))));
            ps.on('error', reject);
          });

          // Move extracted contents (folder node-vXX-win-x64) into ~/.cache/aidev-runtimes/node
          const subdirs = fs.readdirSync(tempExtractDir);
          const innerFolder = subdirs.find((d) => d.startsWith('node-')) || '';
          const sourceDir = innerFolder ? path.join(tempExtractDir, innerFolder) : tempExtractDir;

          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
          fs.mkdirSync(targetDir, { recursive: true });

          for (const item of fs.readdirSync(sourceDir)) {
            fs.cpSync(path.join(sourceDir, item), path.join(targetDir, item), { recursive: true });
          }

          // Cleanup temp files
          try {
            fs.rmSync(zipPath, { force: true });
            fs.rmSync(tempExtractDir, { recursive: true, force: true });
          } catch {}
        } else {
          // Linux / macOS tarball
          const osName = process.platform === 'darwin' ? 'darwin' : 'linux';
          const linuxArch = arch === 'arm64' ? 'arm64' : 'x64';
          const tarName = `node-${DEFAULT_NODE_VERSION}-${osName}-${linuxArch}.tar.gz`;
          const downloadUrl = `https://nodejs.org/dist/${DEFAULT_NODE_VERSION}/${tarName}`;
          const tarPath = path.join(runtimesDir, 'node_download.tar.gz');

          await this.downloadFile(downloadUrl, tarPath, `Node.js + NPM (${osName}-${linuxArch})`);

          this.statusMessage = 'Extracting portable Node & NPM runtime...';
          this.downloadProgress = 85;

          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
          fs.mkdirSync(targetDir, { recursive: true });

          await new Promise<void>((resolve, reject) => {
            const tar = spawn('tar', ['-xzf', tarPath, '--strip-components=1', '-C', targetDir]);
            tar.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar exit ${code}`))));
            tar.on('error', reject);
          });

          try {
            fs.rmSync(tarPath, { force: true });
          } catch {}
        }

        this.downloadProgress = 100;
        this.statusMessage = 'Node.js & NPM portable runtime ready!';
        this.isDownloading = false;
        return targetDir;
      } catch (err: any) {
        this.isDownloading = false;
        this.downloadError = err?.message || 'Failed to download Node.js runtime';
        this.statusMessage = `Download error: ${this.downloadError}`;
        throw err;
      } finally {
        this.downloadPromise = null;
      }
    })();

    await this.downloadPromise;
    return this.resolveNode();
  }

  private async downloadFile(url: string, dest: string, label: string): Promise<void> {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'aidev-desktop' },
    });

    if (!res.ok || !res.body) {
      throw new Error(`Failed to download ${label} from ${url} (HTTP ${res.status})`);
    }

    const totalBytes = Number(res.headers.get('content-length')) || 0;
    let receivedBytes = 0;

    const fileStream = fs.createWriteStream(dest);

    const reader = res.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      receivedBytes += value.length;
      fileStream.write(Buffer.from(value));

      if (totalBytes > 0) {
        const pct = Math.min(80, Math.floor((receivedBytes / totalBytes) * 70) + 10);
        this.downloadProgress = pct;
        const mbReceived = (receivedBytes / (1024 * 1024)).toFixed(1);
        const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
        this.statusMessage = `Downloading ${label}: ${mbReceived}MB / ${mbTotal}MB (${pct}%)`;
      }
    }

    await new Promise((resolve, reject) => {
      fileStream.end(resolve);
      fileStream.on('error', reject);
    });
  }
}
