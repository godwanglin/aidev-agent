import fs from 'fs';
import path from 'path';
import { diffLines } from 'diff';
import { getStoragePaths, ensureStorageInitialized, getChatStorage, ensureChatStorageInitialized } from './storage';
import { snapshotRepo, SnapshotRecord, sessionRepo } from './db';
import { sanitizeAndResolvePath } from './security';

export interface SnapshotManifest {
  id: string;
  sessionId: string;
  messageId: string;
  filePath: string;
  createdAt: number;
  additions: number;
  deletions: number;
  backupFilePath: string;
  status: 'ACTIVE' | 'REVERTED';
}

export function generateSnapshotId(): string {
  return `snap_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Creates an immutable pre-change snapshot before any file modification.
 * Backs up the current file content to .aidev/projects/<projectId>/<sessionId>/snapshots/<snapshotId>/backup/
 */
export async function createPreChangeSnapshot(
  sessionId: string,
  messageId: string,
  workdir: string,
  relativePath: string,
  newContent: string
): Promise<{ snapshotId: string; additions: number; deletions: number }> {
  ensureStorageInitialized();
  const session = sessionRepo.getById(sessionId);
  const projectId = session?.project_id || 'default';
  const chatStorage = ensureChatStorageInitialized(projectId, sessionId);

  const resolvedTarget = sanitizeAndResolvePath(workdir, relativePath);
  const snapshotId = generateSnapshotId();

  const sessionSnapDir = path.join(chatStorage.snapshots, snapshotId);
  const backupDir = path.join(sessionSnapDir, 'backup');
  fs.mkdirSync(backupDir, { recursive: true });

  const backupFilePath = path.join(backupDir, path.basename(relativePath));

  let originalContent = '';
  let fileExisted = false;

  if (fs.existsSync(resolvedTarget)) {
    fileExisted = true;
    originalContent = fs.readFileSync(resolvedTarget, 'utf-8');
    fs.writeFileSync(backupFilePath, originalContent, 'utf-8');
  } else {
    // If the file is brand new, write an empty marker file to indicate it didn't exist before
    fs.writeFileSync(backupFilePath + '.new_file', '', 'utf-8');
  }

  // Calculate additions and deletions
  const diff = diffLines(originalContent, newContent);
  let additions = 0;
  let deletions = 0;

  for (const part of diff) {
    if (part.added) {
      additions += part.count || 0;
    } else if (part.removed) {
      deletions += part.count || 0;
    }
  }

  // Write manifest.json
  const manifest: SnapshotManifest = {
    id: snapshotId,
    sessionId,
    messageId,
    filePath: relativePath.replace(/\\/g, '/'),
    createdAt: Date.now(),
    additions,
    deletions,
    backupFilePath,
    status: 'ACTIVE',
  };

  fs.writeFileSync(path.join(sessionSnapDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  // Insert into SQLite
  const record: SnapshotRecord = {
    id: snapshotId,
    session_id: sessionId,
    message_id: messageId,
    file_path: relativePath.replace(/\\/g, '/'),
    diff_stat_additions: additions,
    diff_stat_deletions: deletions,
    backup_file_path: backupFilePath,
    status: 'ACTIVE',
    created_at: manifest.createdAt,
  };
  snapshotRepo.create(record);

  return { snapshotId, additions, deletions };
}

/**
 * 1-Click Revert: Restores the file to its exact pre-change snapshot state.
 */
export async function revertSnapshot(
  snapshotId: string,
  workdir: string
): Promise<{ success: boolean; filePath: string; message: string }> {
  // 1. Look for snapshot record in SQLite
  const record = snapshotRepo.getById(snapshotId);
  let targetManifest: SnapshotManifest | null = null;
  let manifestPath = '';

  if (record && record.session_id) {
    const session = sessionRepo.getById(record.session_id);
    const projectId = session?.project_id || 'default';
    const chatStorage = getChatStorage(projectId, record.session_id);
    const candidatePath = path.join(chatStorage.snapshots, snapshotId, 'manifest.json');
    if (fs.existsSync(candidatePath)) {
      manifestPath = candidatePath;
      try {
        targetManifest = JSON.parse(fs.readFileSync(candidatePath, 'utf-8')) as SnapshotManifest;
      } catch {}
    }
  }

  // 2. Legacy fallback: search in .aidev/snapshots/
  if (!targetManifest) {
    const { snapshots: snapshotsRootDir } = getStoragePaths();
    if (fs.existsSync(snapshotsRootDir)) {
      const allSessionsSnapshots = fs.readdirSync(snapshotsRootDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const sessId of allSessionsSnapshots) {
        const candidatePath = path.join(snapshotsRootDir, sessId, snapshotId, 'manifest.json');
        if (fs.existsSync(candidatePath)) {
          manifestPath = candidatePath;
          try {
            targetManifest = JSON.parse(fs.readFileSync(candidatePath, 'utf-8')) as SnapshotManifest;
          } catch {}
          break;
        }
      }
    }
  }

  if (!targetManifest && !record) {
    throw new Error(`Snapshot ${snapshotId} not found.`);
  }

  const effectiveBackupPath = targetManifest?.backupFilePath || record?.backup_file_path || '';
  const effectiveFilePath = targetManifest?.filePath || record?.file_path || '';
  const resolvedTarget = sanitizeAndResolvePath(workdir, effectiveFilePath);

  if (fs.existsSync(effectiveBackupPath + '.new_file')) {
    // File was created by AI; revert means removing it
    if (fs.existsSync(resolvedTarget)) {
      fs.unlinkSync(resolvedTarget);
    }
  } else if (fs.existsSync(effectiveBackupPath)) {
    // Restore original file
    const originalContent = fs.readFileSync(effectiveBackupPath, 'utf-8');
    fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true });
    fs.writeFileSync(resolvedTarget, originalContent, 'utf-8');
  } else {
    throw new Error(`Backup file missing for snapshot ${snapshotId}`);
  }

  // Update manifest and DB status
  if (targetManifest && manifestPath) {
    targetManifest.status = 'REVERTED';
    try {
      fs.writeFileSync(manifestPath, JSON.stringify(targetManifest, null, 2), 'utf-8');
    } catch {}
  }
  snapshotRepo.updateStatus(snapshotId, 'REVERTED');

  return {
    success: true,
    filePath: effectiveFilePath,
    message: `File ${effectiveFilePath} successfully reverted to pre-change snapshot.`,
  };
}
