export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface DirectoryItemInfo {
  name: string;
  isGit: boolean;
  isHidden: boolean;
}

export interface QuickAccessItem {
  label: string;
  path: string;
  type: 'dev' | 'desktop' | 'documents' | 'downloads' | 'projects' | 'home';
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let targetPath = searchParams.get('path');

    if (!targetPath || !targetPath.trim()) {
      if (process.platform === 'win32' && fs.existsSync('C:\\dev')) {
        targetPath = 'C:\\dev';
      } else {
        targetPath = os.homedir();
      }
    }

    targetPath = targetPath.trim();

    // Resolve and normalize path
    let resolvedPath = path.resolve(targetPath);

    // If path ends with colon like C: on windows, make sure it has backslash C:\
    if (/^[a-zA-Z]:$/.test(resolvedPath)) {
      resolvedPath += '\\';
    }

    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json({
        currentPath: resolvedPath,
        parentPath: null,
        dirs: [],
        items: [],
        drives: [],
        quickAccess: [],
        error: 'Path does not exist',
      });
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return NextResponse.json({
        currentPath: resolvedPath,
        parentPath: null,
        dirs: [],
        items: [],
        drives: [],
        quickAccess: [],
        error: 'Path is not a directory',
      });
    }

    // Determine parent path
    const parsed = path.parse(resolvedPath);
    let parentPath: string | null = path.dirname(resolvedPath);
    if (resolvedPath === parsed.root || parentPath === resolvedPath) {
      parentPath = null;
    }

    const includeFiles = searchParams.get('includeFiles') === 'true';

    // Read entries
    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    const dirs: string[] = [];
    const items: DirectoryItemInfo[] = [];
    const files: Array<{ name: string; isDirectory: boolean; isHidden: boolean }> = [];

    for (const entry of entries) {
      try {
        if (
          entry.name === '$RECYCLE.BIN' ||
          entry.name === 'System Volume Information' ||
          entry.name === 'Recovery'
        ) {
          continue;
        }

        const isHidden = entry.name.startsWith('.');

        if (entry.isDirectory()) {
          dirs.push(entry.name);
          const fullChildPath = path.join(resolvedPath, entry.name);
          const isGit = fs.existsSync(path.join(fullChildPath, '.git'));

          items.push({
            name: entry.name,
            isGit,
            isHidden,
          });

          if (includeFiles) {
            files.push({
              name: entry.name,
              isDirectory: true,
              isHidden,
            });
          }
        } else if (includeFiles && entry.isFile()) {
          files.push({
            name: entry.name,
            isDirectory: false,
            isHidden,
          });
        }
      } catch {
        // ignore unreadable entries
      }
    }

    // Sort alphabetically, case-insensitive
    dirs.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    if (includeFiles) {
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
    }

    // Available Drives / Mounts on Windows & Linux/Ubuntu
    const drives: string[] = [];
    const home = os.homedir();
    if (process.platform === 'win32') {
      const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ';
      for (let i = 0; i < letters.length; i++) {
        const drivePath = `${letters[i]}:\\`;
        try {
          if (fs.existsSync(drivePath)) {
            drives.push(drivePath);
          }
        } catch {}
      }
    } else if (process.platform === 'linux') {
      drives.push('/');
      if (fs.existsSync('/mnt')) {
        drives.push('/mnt');
      }
      const userName = os.userInfo().username;
      const userMedia = `/media/${userName}`;
      if (fs.existsSync(userMedia)) {
        drives.push(userMedia);
      } else if (fs.existsSync('/media')) {
        drives.push('/media');
      }
    } else if (process.platform === 'darwin') {
      drives.push('/');
      if (fs.existsSync('/Volumes')) {
        drives.push('/Volumes');
      }
    }

    // Quick Access shortcuts
    const quickAccess: QuickAccessItem[] = [];
    if (process.platform === 'win32' && fs.existsSync('C:\\dev')) {
      quickAccess.push({ label: 'C:\\dev', path: 'C:\\dev', type: 'dev' });
    } else if (process.platform !== 'win32') {
      const devCandidates = [
        { label: '~/dev', path: path.join(home, 'dev') },
        { label: '~/projects', path: path.join(home, 'projects') },
        { label: '~/workspace', path: path.join(home, 'workspace') },
      ];
      for (const candidate of devCandidates) {
        if (fs.existsSync(candidate.path)) {
          quickAccess.push({ label: candidate.label, path: candidate.path, type: 'dev' });
          break;
        }
      }
    }
    if (fs.existsSync(path.join(home, 'Desktop'))) {
      quickAccess.push({ label: 'Desktop', path: path.join(home, 'Desktop'), type: 'desktop' });
    }
    if (fs.existsSync(path.join(home, 'Documents'))) {
      quickAccess.push({ label: 'Documents', path: path.join(home, 'Documents'), type: 'documents' });
    }
    if (fs.existsSync(path.join(home, 'Downloads'))) {
      quickAccess.push({ label: 'Downloads', path: path.join(home, 'Downloads'), type: 'downloads' });
    }
    const aidevProjects = path.join(home, '.aidev', 'projects');
    if (fs.existsSync(aidevProjects)) {
      quickAccess.push({ label: 'Aidev Projects', path: aidevProjects, type: 'projects' });
    }
    quickAccess.push({ label: 'Home', path: home, type: 'home' });

    return NextResponse.json({
      platform: process.platform,
      currentPath: resolvedPath,
      parentPath,
      dirs,
      items,
      files,
      drives,
      quickAccess,
    });
  } catch (err: any) {
    return NextResponse.json({
      platform: process.platform,
      currentPath: '',
      parentPath: null,
      dirs: [],
      items: [],
      drives: [],
      quickAccess: [],
      error: err.message || 'Failed to read directory',
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { parentPath, folderName } = body;

    if (!parentPath || !folderName || !folderName.trim()) {
      return NextResponse.json({ error: 'Folder name cannot be empty.' }, { status: 400 });
    }

    const cleanName = folderName.trim().replace(/[\\/:*?"<>|]/g, '');
    if (!cleanName) {
      return NextResponse.json({ error: 'Invalid folder name.' }, { status: 400 });
    }

    const newPath = path.join(parentPath, cleanName);
    if (fs.existsSync(newPath)) {
      return NextResponse.json({ error: 'A folder with this name already exists.' }, { status: 400 });
    }

    fs.mkdirSync(newPath, { recursive: true });
    return NextResponse.json({ success: true, createdPath: newPath, name: cleanName });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create folder.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const body = await req.json().catch(() => ({}));
    let startPath = body?.currentPath && fs.existsSync(body.currentPath)
      ? path.resolve(body.currentPath)
      : os.homedir();

    if (process.platform === 'win32') {
      const escapedPath = startPath.replace(/'/g, "''");
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = 'Select a project directory to load into Aidev'
$f.SelectedPath = '${escapedPath}'
$f.ShowNewFolderButton = $true
$top = New-Object System.Windows.Forms.Form
$top.TopMost = $true
if ($f.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $f.SelectedPath
}
`;
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-STA',
        '-Command',
        psScript,
      ]);
      const picked = stdout.trim();
      return NextResponse.json({ selectedPath: picked || null });
    }

    if (process.platform === 'linux') {
      const dirArg = startPath.endsWith('/') ? startPath : `${startPath}/`;
      // 1. Try zenity (Ubuntu / GNOME default)
      try {
        const { stdout } = await execFileAsync('zenity', [
          '--file-selection',
          '--directory',
          '--title=Open Workspace / Project',
          `--filename=${dirArg}`,
        ]);
        const picked = stdout.trim();
        return NextResponse.json({ selectedPath: picked || null });
      } catch (err: any) {
        if (err.code === 1) {
          // User cancelled zenity dialog
          return NextResponse.json({ selectedPath: null });
        }
      }

      // 2. Try kdialog (KDE Plasma)
      try {
        const { stdout } = await execFileAsync('kdialog', [
          '--getexistingdirectory',
          startPath,
          '--title',
          'Open Workspace / Project',
        ]);
        const picked = stdout.trim();
        return NextResponse.json({ selectedPath: picked || null });
      } catch (err: any) {
        if (err.code === 1) {
          return NextResponse.json({ selectedPath: null });
        }
      }

      // 3. Try yad
      try {
        const { stdout } = await execFileAsync('yad', [
          '--file',
          '--directory',
          '--title=Open Workspace / Project',
          `--filename=${dirArg}`,
        ]);
        const picked = stdout.trim();
        return NextResponse.json({ selectedPath: picked || null });
      } catch {}

      return NextResponse.json(
        { selectedPath: null, error: 'No native GUI dialog tool found (install zenity or kdialog).' },
        { status: 404 }
      );
    }

    if (process.platform === 'darwin') {
      const escapedPath = startPath.replace(/"/g, '\\"');
      const { stdout } = await execFileAsync('osascript', [
        '-e',
        `POSIX path of (choose folder with prompt "Select a project directory:" default location POSIX file "${escapedPath}")`,
      ]);
      const picked = stdout.trim();
      return NextResponse.json({ selectedPath: picked || null });
    }

    return NextResponse.json({ selectedPath: null });
  } catch (err: any) {
    return NextResponse.json({ selectedPath: null, error: err.message });
  }
}
