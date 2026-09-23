export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { taskManager } from '@/lib/task-manager';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { taskId, all, sessionId, projectId } = body;

    if (all) {
      const stoppedCount = await taskManager.stopAllTasks({ sessionId, projectId });
      return NextResponse.json({ success: true, stoppedCount });
    }

    if (!taskId) {
      return NextResponse.json({ error: 'taskId or all: true is required' }, { status: 400 });
    }

    const success = await taskManager.stopTask(taskId);
    return NextResponse.json({ success, taskId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
