export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import fg from 'fast-glob';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workdir = searchParams.get('workdir');

    if (!workdir) {
      return NextResponse.json({ error: 'workdir is required' }, { status: 400 });
    }

    const normalizedWorkdir = workdir.replace(/\\/g, '/');
    const files = await fg('**/*', {
      cwd: normalizedWorkdir,
      ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/.next/**',
        '**/.aidev/**',
      ],
      onlyFiles: true,
      suppressErrors: true,
    });

    return NextResponse.json({ files });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
