import { NextResponse } from 'next/server';
import { gitService } from '@/lib/git/git-service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workdir, action, files = [] } = body;

    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      return NextResponse.json({ error: 'Project working directory is invalid.' }, { status: 400 });
    }

    const fileList = Array.isArray(files) ? files : files && files !== 'all' ? [files] : [];

    switch (action) {
      case 'stage':
        if (files === 'all' || files === '*') {
          await gitService.stageAll(workdir);
        } else {
          await gitService.stageFiles(workdir, fileList);
        }
        break;
      case 'unstage':
        if (files === 'all' || files === '*') {
          await gitService.unstageAll(workdir);
        } else {
          await gitService.unstageFiles(workdir, fileList);
        }
        break;
      case 'stage_all':
        await gitService.stageAll(workdir);
        break;
      case 'unstage_all':
        await gitService.unstageAll(workdir);
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const updatedStatus = await gitService.getStatus(workdir);
    return NextResponse.json({ success: true, repoStatus: updatedStatus });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
