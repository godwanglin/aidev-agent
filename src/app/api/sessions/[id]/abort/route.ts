export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { abortSessionOrchestrator } from '@/lib/orchestrator';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const aborted = abortSessionOrchestrator(id);
  return Response.json({ success: true, aborted });
}
