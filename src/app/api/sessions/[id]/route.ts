import { NextResponse } from 'next/server';
import { sessionRepo, messageRepo, snapshotRepo, subagentRepo, auditRepo, compactionRepo } from '@/lib/db';
import { isSessionOrchestratorRunning } from '@/lib/orchestrator';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = sessionRepo.getById(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const loadAll = url.searchParams.get('all') === 'true';
    const limitTurnsParam = url.searchParams.get('limitTurns');
    const limitTurns = limitTurnsParam ? Math.max(1, parseInt(limitTurnsParam, 10)) : 5;

    let messages;
    let hasMore = false;
    let totalTurns = 0;

    if (loadAll) {
      messages = messageRepo.listBySession(id);
      hasMore = false;
    } else {
      const paginated = messageRepo.listPaginatedBySession(id, undefined, limitTurns);
      messages = paginated.messages;
      hasMore = paginated.hasMore;
      totalTurns = paginated.totalTurns;
    }

    const snapshots = snapshotRepo.listBySession(id);
    const subagents = subagentRepo.listBySession(id);
    const audit = auditRepo.listBySession(id);
    const compactions = compactionRepo.listBySession(id);
    const isRunning = isSessionOrchestratorRunning(id);

    return NextResponse.json({
      session,
      messages,
      hasMore,
      totalTurns,
      snapshots,
      subagents,
      audit,
      compactions,
      isRunning,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    sessionRepo.update(id, body);
    const updated = sessionRepo.getById(id);
    return NextResponse.json({ session: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    sessionRepo.delete(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
