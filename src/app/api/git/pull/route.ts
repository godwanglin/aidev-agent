export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { gitService } from '@/lib/git/git-service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workdir, remote = 'origin', branch } = body;

    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      return NextResponse.json({ error: 'Project working directory is invalid.', success: false }, { status: 400 });
    }

    const pullResult = await gitService.pull(workdir, remote, branch);
    const updatedStatus = await gitService.getStatus(workdir);

    return NextResponse.json({
      success: true,
      output: pullResult.output,
      repoStatus: updatedStatus,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || String(err),
        requiresAuth: Boolean(err.requiresAuth),
      },
      { status: 500 }
    );
  }
}
