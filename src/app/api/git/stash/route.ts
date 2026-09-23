import { NextResponse } from 'next/server';
import { gitService } from '@/lib/git/git-service';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workdir = searchParams.get('workdir')?.trim();

    if (!workdir || workdir === 'no_project') {
      return NextResponse.json({ success: true, stashes: [] });
    }

    const stashes = await gitService.stashList(workdir);
    return NextResponse.json({ success: true, stashes });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workdir, action, message, index = 0 } = body;

    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      return NextResponse.json({ error: 'Project working directory is invalid.' }, { status: 400 });
    }

    let output = '';
    switch (action) {
      case 'save':
        output = await gitService.stashSave(workdir, message);
        break;
      case 'pop':
        output = await gitService.stashPop(workdir, index);
        break;
      case 'drop':
        output = await gitService.stashDrop(workdir, index);
        break;
      default:
        return NextResponse.json({ error: `Unknown action '${action}'.` }, { status: 400 });
    }

    const stashes = await gitService.stashList(workdir);
    const repoStatus = await gitService.getStatus(workdir);

    return NextResponse.json({
      success: true,
      output,
      stashes,
      repoStatus,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
