import fs from 'fs';
import path from 'path';
import { sanitizeAndResolvePath } from '../security';
import { createPreChangeSnapshot } from '../snapshot';
import { sessionRepo } from '../db';
import { ensureChatStorageInitialized } from '../storage';

export interface WriteFileParams {
  path: string;
  content: string;
}

export interface WriteFileResult {
  success: boolean;
  path: string;
  bytesWritten: number;
  additions: number;
  deletions: number;
  snapshotId: string;
  isArtifact?: boolean;
}

export async function executeWriteFile(
  params: WriteFileParams,
  workdir: string,
  sessionId: string,
  messageId: string
): Promise<WriteFileResult> {
  const normalizedPath = params.path.replace(/\\/g, '/');
  const cleanBaseName = path.basename(params.path);

  const isArtifact =
    normalizedPath === 'walkthrough.md' ||
    normalizedPath === 'implementation_plan.md' ||
    normalizedPath.startsWith('artifacts/') ||
    normalizedPath.startsWith('.aidev/artifacts/') ||
    normalizedPath.startsWith('artifact:');

  const isScript =
    normalizedPath.startsWith('scripts/') ||
    normalizedPath.startsWith('.aidev/scripts/');

  // 1. Artifacts & Session Scripts: Save strictly to system session storage (Never pollute workdir or Git)
  if (isArtifact || isScript) {
    try {
      const session = sessionRepo.getById(sessionId);
      const projectId = session?.project_id || 'default';
      const chatStorage = ensureChatStorageInitialized(projectId, sessionId);
      const targetDir = isArtifact ? chatStorage.artifacts : chatStorage.scripts;
      const targetFile = path.join(targetDir, cleanBaseName);

      fs.writeFileSync(targetFile, params.content, 'utf-8');

      // Update .metadata.json in artifacts for Overview API
      if (isArtifact) {
        try {
          const metaPath = path.join(chatStorage.artifacts, '.metadata.json');
          let metadata: Record<string, any> = {};
          if (fs.existsSync(metaPath)) {
            try {
              metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            } catch {}
          }
          let title = cleanBaseName;
          if (cleanBaseName === 'walkthrough.md') {
            const titleMatch = /^#\s*(?:Walkthrough:?\s*)?(.*)$/im.exec(params.content);
            title = titleMatch && titleMatch[1].trim() ? `Walkthrough: ${titleMatch[1].trim()}` : 'Walkthrough';
          } else if (cleanBaseName === 'implementation_plan.md') {
            const titleMatch = /^#\s*(?:Implementation Plan:?\s*)?(.*)$/im.exec(params.content);
            title = titleMatch && titleMatch[1].trim() ? `Implementation Plan: ${titleMatch[1].trim()}` : 'Implementation Plan';
          } else {
            title = cleanBaseName.replace(/\.(html|md)$/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          }
          metadata[cleanBaseName] = {
            title,
            updatedAt: Date.now(),
          };
          fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
        } catch {}
      }

      // If this artifact was previously written in workdir, cleanly purge it so git stays spotless
      if (workdir) {
        try {
          const legacyWorkdirFile = sanitizeAndResolvePath(workdir, params.path);
          if (fs.existsSync(legacyWorkdirFile)) {
            fs.unlinkSync(legacyWorkdirFile);
            // If parent directory is artifacts and now empty, remove it
            const parent = path.dirname(legacyWorkdirFile);
            if (path.basename(parent) === 'artifacts' && fs.readdirSync(parent).length === 0) {
              fs.rmdirSync(parent);
            }
          }
        } catch {}
      }

      return {
        success: true,
        path: isArtifact ? `artifacts/${cleanBaseName}` : `scripts/${cleanBaseName}`,
        bytesWritten: Buffer.byteLength(params.content, 'utf-8'),
        additions: 0,
        deletions: 0,
        snapshotId: '',
        isArtifact: true,
      };
    } catch (err) {
      console.error('Failed saving artifact/script to chatStorage:', err);
      throw err;
    }
  }

  // 2. Standard Workspace Project File Write (with pre-change snapshot and diff tracking)
  const resolvedPath = sanitizeAndResolvePath(workdir, params.path);

  // Ensure parent directory exists
  const parentDir = path.dirname(resolvedPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // Create snapshot before modifying/creating file
  const { snapshotId, additions, deletions } = await createPreChangeSnapshot(
    sessionId,
    messageId,
    workdir,
    params.path,
    params.content
  );

  // Write content directly to disk
  fs.writeFileSync(resolvedPath, params.content, 'utf-8');

  return {
    success: true,
    path: params.path.replace(/\\/g, '/'),
    bytesWritten: Buffer.byteLength(params.content, 'utf-8'),
    additions,
    deletions,
    snapshotId,
  };
}
