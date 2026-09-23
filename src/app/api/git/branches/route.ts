export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { gitService } from '@/lib/git/git-service';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workdir = searchParams.get('workdir')?.trim();

    if (!workdir || workdir === 'no_project') {
      return NextResponse.json({
        isRepo: false,
        current: '',
        local: [],
        remote: [],
      });
    }

    const isRepo = await gitService.isGitRepo(workdir);
    if (!isRepo) {
      return NextResponse.json({
        isRepo: false,
        current: '',
        local: [],
        remote: [],
      });
    }

    const branches = await gitService.listBranches(workdir);
    return NextResponse.json({
      isRepo: true,
      ...branches,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workdir, action, branch } = body;

    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      return NextResponse.json({ error: 'Project working directory is invalid.' }, { status: 400 });
    }

    const rawBranch = body.branch || body.branchName;
    if (!rawBranch || !rawBranch.trim()) {
      return NextResponse.json({ error: 'Branch name cannot be empty.' }, { status: 400 });
    }

    const targetBranch = rawBranch.trim();

    if (action === 'create') {
      const output = await gitService.createBranch(workdir, targetBranch, true);
      const repoStatus = await gitService.getStatus(workdir);
      return NextResponse.json({
        success: true,
        action: 'create',
        branch: targetBranch,
        output,
        repoStatus,
      });
    } else if (action === 'checkout') {
      const output = await gitService.checkoutBranch(workdir, targetBranch);
      const repoStatus = await gitService.getStatus(workdir);
      return NextResponse.json({
        success: true,
        action: 'checkout',
        branch: targetBranch,
        output,
        repoStatus,
      });
    } else if (action === 'delete') {
      const output = await gitService.deleteBranch(workdir, targetBranch, Boolean(body.force));
      const repoStatus = await gitService.getStatus(workdir);
      return NextResponse.json({
        success: true,
        action: 'delete',
        branch: targetBranch,
        output,
        repoStatus,
      });
    } else {
      return NextResponse.json({ error: 'Action must be "checkout", "create", or "delete".' }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || err.stderr || String(err),
    }, { status: 500 });
  }
}
