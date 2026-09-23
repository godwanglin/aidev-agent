import { NextResponse } from 'next/server';
import { gitService } from '@/lib/git/git-service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workdir, message, push = false, remote = 'origin', branch } = body;

    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      return NextResponse.json({ error: 'Project working directory is invalid.' }, { status: 400 });
    }

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Commit message cannot be empty.' }, { status: 400 });
    }

    const currentStatus = await gitService.getStatus(workdir);
    if (!currentStatus.isRepo) {
      return NextResponse.json({ error: 'Working directory is not a Git repository.' }, { status: 400 });
    }

    if (currentStatus.clean) {
      return NextResponse.json({ error: 'No file changes to commit.' }, { status: 400 });
    }

    // Auto-stage all changes if nothing is staged
    if (currentStatus.staged.length === 0) {
      await gitService.stageAll(workdir);
    }

    // 1. Commit
    const commitOutput = await gitService.commit(workdir, message.trim());

    // 2. Push if requested
    let pushOutput: string | undefined;
    let pushSuccess = true;
    let requiresAuth = false;

    if (push) {
      try {
        const pushResult = await gitService.push(workdir, remote, branch || currentStatus.branch);
        pushOutput = pushResult.output;
      } catch (pushErr: any) {
        pushSuccess = false;
        requiresAuth = Boolean(pushErr.requiresAuth);
        pushOutput = pushErr.message;
      }
    }

    const updatedStatus = await gitService.getStatus(workdir);

    return NextResponse.json({
      success: push ? pushSuccess : true,
      commitOutput,
      pushOutput,
      requiresAuth,
      repoStatus: updatedStatus,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || String(err),
      requiresAuth: Boolean(err.requiresAuth),
    }, { status: 500 });
  }
}
