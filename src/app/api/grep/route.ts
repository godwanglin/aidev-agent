export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { executeGrep, GrepParams } from '@/lib/tools/grep';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || searchParams.get('q');
    const workdir = searchParams.get('workdir');
    const targetPath = searchParams.get('path') || searchParams.get('searchPath');
    const isRegex = searchParams.get('isRegex') === 'true';
    const caseSensitive = searchParams.get('caseSensitive') === 'true';
    const filePattern = searchParams.get('filePattern') || undefined;
    const maxResultsStr = searchParams.get('maxResults');
    const maxResults = maxResultsStr ? parseInt(maxResultsStr, 10) : 100;

    if (!query) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }
    if (!workdir) {
      return NextResponse.json({ error: 'workdir parameter is required' }, { status: 400 });
    }

    const params: GrepParams = {
      query,
      path: targetPath || undefined,
      isRegex,
      caseSensitive,
      filePattern,
      maxResults,
    };

    const result = await executeGrep(params, workdir);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query = body.query || body.q;
    const workdir = body.workdir;

    if (!query) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }
    if (!workdir) {
      return NextResponse.json({ error: 'workdir parameter is required' }, { status: 400 });
    }

    const params: GrepParams = {
      query,
      path: body.path || body.searchPath,
      isRegex: Boolean(body.isRegex),
      caseSensitive: Boolean(body.caseSensitive),
      filePattern: body.filePattern,
      maxResults: typeof body.maxResults === 'number' ? body.maxResults : 100,
    };

    const result = await executeGrep(params, workdir);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
