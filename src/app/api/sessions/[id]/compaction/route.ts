import { NextResponse } from 'next/server';
import { compactionRepo, messageRepo, sessionRepo } from '@/lib/db';
import { runCompaction, estimateActiveSessionTokens, getModelContextWindow, COMPACTION_CONSTANTS } from '@/lib/compaction';

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

    const messages = messageRepo.listBySession(id);
    const latest = compactionRepo.getLatestBySession(id) || null;
    const compactions = compactionRepo.listBySession(id);
    const estimatedTokens = estimateActiveSessionTokens(messages, latest);
    const contextWindow = getModelContextWindow(session.model_id);
    const autoCompactThreshold = Math.floor(contextWindow * COMPACTION_CONSTANTS.DEFAULT_CONTEXT_RATIO);

    return NextResponse.json({
      latest,
      compactions,
      estimatedTokens,
      contextWindow,
      autoCompactThreshold,
      modelId: session.model_id,
      messageCount: messages.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = sessionRepo.getById(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const record = await runCompaction(id, true);
    if (!record) {
      return NextResponse.json({
        success: false,
        message: 'Conversation history is too short to compact (minimum 6 messages required).',
      });
    }

    return NextResponse.json({
      success: true,
      record,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
