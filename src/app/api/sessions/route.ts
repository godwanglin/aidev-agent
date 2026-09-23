import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sessionRepo, projectRepo, SessionRecord } from '@/lib/db';
import { loadSettings } from '@/lib/storage';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || undefined;
    const sessions = sessionRepo.list(projectId);
    return NextResponse.json({ sessions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const settings = loadSettings();

    let targetProjectId = body.project_id || body.projectId;
    if (!targetProjectId || targetProjectId === 'no_project') {
      let noProj = projectRepo.getById('no_project');
      if (!noProj) {
        const { getAidevHome } = await import('@/lib/storage');
        const root = getAidevHome();
        const sandboxDir = (await import('path')).join(root, 'sandbox');
        const fs = await import('fs');
        fs.mkdirSync(sandboxDir, { recursive: true });
        noProj = projectRepo.upsert({
          id: 'no_project',
          name: 'No Project',
          workdir_path: sandboxDir,
          created_at: Date.now(),
          last_opened_at: Date.now(),
        });
      }
      targetProjectId = 'no_project';
    }

    const sessionId = body.id || crypto.randomUUID();
    const session: SessionRecord = {
      id: sessionId,
      project_id: targetProjectId,
      title: body.title || 'New Conversation',
      model_id: body.model_id || body.modelId || settings.defaultModel,
      permission_mode: body.permission_mode || body.permissionMode || settings.permissionMode,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    sessionRepo.create(session);

    // Initialize artifacts, uploads, snapshots, and sandbox subdirectories
    try {
      const { ensureChatStorageInitialized } = await import('@/lib/storage');
      ensureChatStorageInitialized(targetProjectId, sessionId);
    } catch {}

    return NextResponse.json({ session });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
