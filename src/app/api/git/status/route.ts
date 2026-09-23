import { NextResponse } from 'next/server';
import { gitResolver } from '@/lib/git/git-resolver';
import { gitService } from '@/lib/git/git-service';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workdir = searchParams.get('workdir')?.trim();

    // Check resolution status
    let gitStatus = gitResolver.getStatus();

    // If not available and not already downloading, start resolution/download in background
    if (!gitStatus.available && !gitStatus.downloading) {
      gitResolver.resolveGit().catch((err) => {
        console.error('[GitResolver] Error during background git resolution:', err);
      });
      gitStatus = gitResolver.getStatus();
    }

    if (!workdir || workdir === 'no_project') {
      return NextResponse.json({
        gitStatus,
        repoStatus: {
          isRepo: false,
          branch: '',
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          untracked: [],
          clean: true,
          totalChanges: 0,
          noProject: true,
        },
      });
    }

    if (!gitStatus.available) {
      return NextResponse.json({
        gitStatus,
        repoStatus: null,
      });
    }

    const repoStatus = await gitService.getStatus(workdir);

    return NextResponse.json({
      gitStatus,
      repoStatus,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
