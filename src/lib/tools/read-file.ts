import fs from 'fs';
import { sanitizeAndResolvePath } from '../security';

export interface ReadFileParams {
  path: string;
  start_line?: number;
  end_line?: number;
}

export interface ReadFileResult {
  path: string;
  content: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  isBinary?: boolean;
}

const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500 KB

function isBinaryBuffer(buffer: Buffer): boolean {
  const maxCheck = Math.min(buffer.length, 1024);
  for (let i = 0; i < maxCheck; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

import path from 'path';
import { sessionRepo } from '../db';
import { getChatStorage } from '../storage';

export async function executeReadFile(
  params: ReadFileParams,
  workdir: string,
  sessionId?: string
): Promise<ReadFileResult> {
  let resolvedPath: string | null = null;

  // 1. Check if it's an artifact or script in session storage
  const normalizedPath = params.path.replace(/\\/g, '/');
  const cleanBaseName = path.basename(params.path);
  const isArtifact =
    normalizedPath === 'walkthrough.md' ||
    normalizedPath === 'implementation_plan.md' ||
    normalizedPath.startsWith('artifacts/') ||
    normalizedPath.startsWith('.aidev/artifacts/') ||
    normalizedPath.startsWith('artifact:');

  if (sessionId && isArtifact) {
    try {
      const session = sessionRepo.getById(sessionId);
      const projectId = session?.project_id || 'default';
      const chatStorage = getChatStorage(projectId, sessionId);
      const artifactFile = path.join(chatStorage.artifacts, cleanBaseName);
      if (fs.existsSync(artifactFile)) {
        resolvedPath = artifactFile;
      }
    } catch {}
  }

  // 2. Otherwise resolve within workdir
  if (!resolvedPath) {
    try {
      const wsPath = sanitizeAndResolvePath(workdir, params.path, true);
      if (fs.existsSync(wsPath)) {
        resolvedPath = wsPath;
      }
    } catch {}
  }

  // 3. Fallback: check session storage even if path didn't explicitly start with artifacts/
  if (!resolvedPath && sessionId) {
    try {
      const session = sessionRepo.getById(sessionId);
      const projectId = session?.project_id || 'default';
      const chatStorage = getChatStorage(projectId, sessionId);
      const artifactCandidate = path.join(chatStorage.artifacts, cleanBaseName);
      if (fs.existsSync(artifactCandidate)) {
        resolvedPath = artifactCandidate;
      }
    } catch {}
  }

  // 4. Fallback: check configured secondary project folders
  if (!resolvedPath && sessionId) {
    try {
      const session = sessionRepo.getById(sessionId);
      const projectId = session?.project_id || 'default';
      const home = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\aiden';
      const foldersFile = path.join(home, '.aidev', 'projects', projectId, 'folders.json');
      if (fs.existsSync(foldersFile)) {
        const extraFolders: string[] = JSON.parse(fs.readFileSync(foldersFile, 'utf-8'));
        if (Array.isArray(extraFolders)) {
          for (const extraDir of extraFolders) {
            if (!fs.existsSync(extraDir)) continue;
            try {
              const candidate = sanitizeAndResolvePath(extraDir, params.path, true);
              if (fs.existsSync(candidate)) {
                resolvedPath = candidate;
                break;
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${params.path}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (stat.isDirectory()) {
    throw new Error(`Cannot read directory as file: ${params.path}`);
  }

  if (stat.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File exceeds maximum size of 500 KB (${Math.round(stat.size / 1024)} KB). Use start_line/end_line or grep.`);
  }

  const buffer = fs.readFileSync(resolvedPath);
  if (isBinaryBuffer(buffer)) {
    return {
      path: params.path,
      content: '[Binary File: Preview not available]',
      totalLines: 0,
      startLine: 0,
      endLine: 0,
      isBinary: true,
    };
  }

  const rawText = buffer.toString('utf-8');
  const lines = rawText.split(/\r?\n/);
  const totalLines = lines.length;

  let start = params.start_line && params.start_line > 0 ? params.start_line : 1;
  let end = params.end_line && params.end_line >= start ? params.end_line : totalLines;

  // Clamp within boundary
  start = Math.max(1, Math.min(start, totalLines));
  end = Math.max(start, Math.min(end, totalLines));

  const sliced = lines.slice(start - 1, end).join('\n');

  return {
    path: params.path.replace(/\\/g, '/'),
    content: sliced,
    totalLines,
    startLine: start,
    endLine: end,
  };
}
