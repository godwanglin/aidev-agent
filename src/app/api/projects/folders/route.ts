import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getAidevHome } from '@/lib/storage';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    const home = getAidevHome();
    const foldersFile = path.join(home, 'projects', projectId, 'folders.json');
    if (fs.existsSync(foldersFile)) {
      const folders = JSON.parse(fs.readFileSync(foldersFile, 'utf-8'));
      return NextResponse.json({ folders });
    }

    return NextResponse.json({ folders: [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, folders } = body;
    if (!projectId || !Array.isArray(folders)) {
      return NextResponse.json({ error: 'Missing projectId or folders array' }, { status: 400 });
    }

    const home = getAidevHome();
    const projectDir = path.join(home, 'projects', projectId);
    fs.mkdirSync(projectDir, { recursive: true });

    const foldersFile = path.join(projectDir, 'folders.json');
    fs.writeFileSync(foldersFile, JSON.stringify(folders, null, 2), 'utf-8');

    return NextResponse.json({ success: true, folders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
