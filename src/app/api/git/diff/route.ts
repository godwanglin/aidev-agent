import { NextResponse } from 'next/server';
import { gitService } from '@/lib/git/git-service';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workdir = searchParams.get('workdir')?.trim();
    const filePath = searchParams.get('path');
    const staged = searchParams.get('staged') === 'true';

    if (!workdir || workdir === 'no_project') {
      return NextResponse.json({ originalContent: '', currentContent: '' });
    }

    if (!filePath) {
      return NextResponse.json({ error: 'path parameter is required' }, { status: 400 });
    }

    const diffResult = await gitService.getFileDiff(workdir, filePath, staged);

    return NextResponse.json(diffResult);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
