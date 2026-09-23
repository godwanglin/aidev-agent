export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { taskManager } from '@/lib/task-manager';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId') || undefined;
    const projectId = searchParams.get('projectId') || undefined;

    const tasks = taskManager.listTasks({ sessionId, projectId });
    return NextResponse.json({ tasks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { command, workdir, sessionId, projectId, replaceTaskId } = body;

    if (!command) {
      return NextResponse.json({ error: 'Command is required' }, { status: 400 });
    }

    const task = await taskManager.startTask({
      command,
      workdir: workdir || process.cwd(),
      sessionId,
      projectId,
      replaceTaskId,
    });

    return NextResponse.json({ task, replacedTaskId: replaceTaskId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const clearStopped = searchParams.get('clearStopped');
    const sessionId = searchParams.get('sessionId') || undefined;

    if (clearStopped === 'true') {
      taskManager.clearStoppedTasks(sessionId);
      return NextResponse.json({ success: true, cleared: true });
    }

    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const success = await taskManager.deleteTask(id);
    return NextResponse.json({ success, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
