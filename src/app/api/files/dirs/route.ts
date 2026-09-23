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

    // Available Drives on Windows
    const drives: string[] = [];
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
    }

    // Quick Access shortcuts
    const quickAccess: QuickAccessItem[] = [];
    const home = os.homedir();
    if (process.platform === 'win32' && fs.existsSync('C:\\dev')) {
      quickAccess.push({ label: 'C:\\dev', path: 'C:\\dev', type: 'dev' });
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
