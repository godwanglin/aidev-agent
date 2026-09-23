export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { taskManager } from '@/lib/task-manager';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('id');
    const cmd = searchParams.get('cmd');

    const result = taskManager.getTaskLogs(taskId, cmd);

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
