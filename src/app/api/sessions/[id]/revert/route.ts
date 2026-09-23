export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { revertSnapshot } from '@/lib/snapshot';
import { sessionRepo, projectRepo } from '@/lib/db';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = sessionRepo.getById(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const project = projectRepo.getById(session.project_id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await req.json();
    const { snapshotId } = body;
    if (!snapshotId) {
      return NextResponse.json({ error: 'snapshotId is required' }, { status: 400 });
    }

    const result = await revertSnapshot(snapshotId, project.workdir_path);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
