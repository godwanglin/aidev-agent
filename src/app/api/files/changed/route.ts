import { NextResponse } from 'next/server';
import fs from 'fs';
import { createTwoFilesPatch } from 'diff';
import { snapshotRepo } from '@/lib/db';
import { sanitizeAndResolvePath } from '@/lib/security';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const workdir = searchParams.get('workdir');

    if (!sessionId || !workdir) {
      return NextResponse.json({ error: 'sessionId and workdir are required' }, { status: 400 });
    }

    const snapshots = snapshotRepo.listBySession(sessionId);

    // Group snapshots by file_path
    const fileMap = new Map<string, {
      filePath: string;
      latestSnapshotId: string;
      status: 'ACTIVE' | 'REVERTED';
      additions: number;
      deletions: number;
      backupFilePath: string;
      createdAt: number;
      unifiedDiff?: string;
      originalContent?: string;
      currentContent?: string;
    }>();

    for (const snap of snapshots) {
      // Exclude session artifacts and scripts from project changed files
      const normPath = snap.file_path.replace(/\\/g, '/');
      if (
        normPath === 'walkthrough.md' ||
        normPath === 'implementation_plan.md' ||
        normPath.startsWith('artifacts/') ||
        normPath.startsWith('.aidev/') ||
        normPath.startsWith('scripts/')
      ) {
        continue;
      }

      const existing = fileMap.get(snap.file_path);
      if (!existing) {
        fileMap.set(snap.file_path, {
          filePath: snap.file_path,
          latestSnapshotId: snap.id,
          status: snap.status,
          additions: snap.diff_stat_additions,
          deletions: snap.diff_stat_deletions,
          backupFilePath: snap.backup_file_path,
          createdAt: snap.created_at,
        });
      } else {
        // accumulate additions/deletions
        existing.additions += snap.diff_stat_additions;
        existing.deletions += snap.diff_stat_deletions;
      }
    }

    const changedFiles = Array.from(fileMap.values());

    for (const item of changedFiles) {
      try {
        let originalContent = '';
        if (fs.existsSync(item.backupFilePath)) {
          originalContent = fs.readFileSync(item.backupFilePath, 'utf-8');
        }

        let currentContent = '';
        const resolvedCurrent = sanitizeAndResolvePath(workdir, item.filePath);
        if (fs.existsSync(resolvedCurrent)) {
          currentContent = fs.readFileSync(resolvedCurrent, 'utf-8');
        }

        item.originalContent = originalContent;
        item.currentContent = currentContent;
        item.unifiedDiff = createTwoFilesPatch(
          `a/${item.filePath}`,
          `b/${item.filePath}`,
          originalContent,
          currentContent
        );
      } catch {
        // ignore diff generation errors for deleted or binary files
      }
    }

    return NextResponse.json({ changedFiles });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
