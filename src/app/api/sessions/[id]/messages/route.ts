export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { messageRepo } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const beforeParam = url.searchParams.get('before');
    const beforeCreatedAt = beforeParam ? parseInt(beforeParam, 10) : undefined;
    const limitTurnsParam = url.searchParams.get('limitTurns');
    const limitTurns = limitTurnsParam ? Math.max(1, parseInt(limitTurnsParam, 10)) : 5;

    const result = messageRepo.listPaginatedBySession(id, beforeCreatedAt, limitTurns);

    return NextResponse.json({
      messages: result.messages,
      hasMore: result.hasMore,
      totalTurns: result.totalTurns,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
