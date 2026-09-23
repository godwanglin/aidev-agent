import { NextResponse } from 'next/server';
import { gitService } from '@/lib/git/git-service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workdir } = body;

    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      return NextResponse.json({ error: 'Project working directory is invalid.' }, { status: 400 });
    }

    await gitService.initRepo(workdir);
    const updatedStatus = await gitService.getStatus(workdir);

    return NextResponse.json({ success: true, repoStatus: updatedStatus });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
