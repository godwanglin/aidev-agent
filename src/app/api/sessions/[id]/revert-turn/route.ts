import { NextRequest, NextResponse } from 'next/server';
import { sessionRepo, projectRepo, messageRepo, snapshotRepo } from '@/lib/db';
import { revertSnapshot } from '@/lib/snapshot';
import { abortSessionOrchestrator } from '@/lib/orchestrator';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await context.params;
    const body = await req.json();
    const { messageId, createdAt } = body || {};

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const session = sessionRepo.getById(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Abort any running orchestrator turn for this session first
    try {
      abortSessionOrchestrator(sessionId);
    } catch {}

    const project = projectRepo.getById(session.project_id);
    const workdir = project?.workdir_path || '';

    const allMessages = messageRepo.listBySession(sessionId);
    const targetMsg = messageId
      ? allMessages.find((m) => m.id === messageId)
      : allMessages.find((m) => m.created_at === createdAt);

    const cutoffTimestamp =
      typeof targetMsg?.created_at === 'number'
        ? targetMsg.created_at
        : typeof createdAt === 'number'
        ? createdAt
        : Date.now();

    const targetMessageIds = new Set(
      allMessages.filter((m) => m.created_at >= cutoffTimestamp || m.id === messageId).map((m) => m.id)
    );

    // Revert all active snapshots created at or after the target message in reverse chronological order (newest -> oldest)
    const revertedFiles: string[] = [];
    if (workdir) {
      const allSnapshots = snapshotRepo.listBySession(sessionId); // Already ordered by created_at DESC
      const snapshotsToRevert = allSnapshots.filter(
        (s) =>
          s.status === 'ACTIVE' &&
          (s.created_at >= cutoffTimestamp || targetMessageIds.has(s.message_id))
      );

      for (const snap of snapshotsToRevert) {
        try {
          const res = await revertSnapshot(snap.id, workdir);
          if (res.success && !revertedFiles.includes(res.filePath)) {
            revertedFiles.push(res.filePath);
          }
        } catch (err) {
          console.warn(`[revert-turn] Failed to revert snapshot ${snap.id}:`, err);
        }
      }
    }

    // Delete messages from cutoffTimestamp onwards
    const deletedMessagesCount = messageRepo.deleteFromTimestamp(
      sessionId,
      cutoffTimestamp,
      messageId
    );

    return NextResponse.json({
      success: true,
      revertedFilesCount: revertedFiles.length,
      revertedFiles,
      deletedMessagesCount,
    });
  } catch (err: any) {
    console.error('[revert-turn] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to revert turn' },
      { status: 500 }
    );
  }
}
