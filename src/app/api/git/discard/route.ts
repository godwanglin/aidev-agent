export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { gitService } from '@/lib/git/git-service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workdir, files = [], all = false } = body;

    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      return NextResponse.json({ error: 'Project working directory is invalid.' }, { status: 400 });
    }

    if (all) {
      await gitService.discardAll(workdir);
    } else {
      if (!Array.isArray(files) || files.length === 0) {
        return NextResponse.json({ error: 'File list cannot be empty.' }, { status: 400 });
      }
      await gitService.discardFiles(workdir, files);
    }

    const updatedStatus = await gitService.getStatus(workdir);
    return NextResponse.json({ success: true, repoStatus: updatedStatus });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
