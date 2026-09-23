export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { gitService } from '@/lib/git/git-service';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workdir = searchParams.get('workdir')?.trim();
    const hash = searchParams.get('hash');
    const filePath = searchParams.get('path');
    const maxCount = parseInt(searchParams.get('maxCount') || '50', 10);

    if (!workdir || workdir === 'no_project') {
      return NextResponse.json({
        isRepo: false,
        logs: [],
      });
    }

    const isRepo = await gitService.isGitRepo(workdir);
    if (!isRepo) {
      return NextResponse.json({
        isRepo: false,
        logs: [],
      });
    }

    // 1. Commit file diff
    if (hash && filePath) {
      const diff = await gitService.getCommitFileDiff(workdir, hash, filePath);
      return NextResponse.json({ success: true, diff });
    }

    // 2. Single commit detail
    if (hash) {
      const commit = await gitService.getCommitDetail(workdir, hash);
      return NextResponse.json({ success: true, commit });
    }

    // 3. Commits log list
    const logs = await gitService.getLog(workdir, maxCount);
    return NextResponse.json({
      isRepo: true,
      logs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
