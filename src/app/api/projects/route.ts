import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { projectRepo, ProjectRecord } from '@/lib/db';
import { getStoragePaths } from '@/lib/storage';
import { gitService } from '@/lib/git/git-service';

export async function GET() {
  try {
    const allProjects = projectRepo.list();
    const projects = allProjects.filter((p) => p.id !== 'no_project' && p.name !== 'No Project');
    return NextResponse.json({ projects });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let workdir = body.workdir_path?.trim();
    let name = body.name?.trim();

    if (body.id === 'no_project' || body.name === 'No Project' || workdir === 'no_project') {
      const { projects: projectsRootDir } = getStoragePaths();
      workdir = path.join(projectsRootDir, 'no_project');
      fs.mkdirSync(workdir, { recursive: true });
      name = 'No Project';
      const project: ProjectRecord = {
        id: 'no_project',
        name,
        workdir_path: path.resolve(workdir),
        created_at: Date.now(),
        last_opened_at: Date.now(),
      };
      const savedProject = projectRepo.upsert(project);
      return NextResponse.json({ project: savedProject });
    }

    const id = body.id || (workdir
      ? crypto.createHash('sha256').update(path.resolve(workdir).toLowerCase()).digest('hex').substring(0, 8)
      : crypto.randomBytes(4).toString('hex'));

    if (!workdir) {
      // Default to $USERPROFILE/.aidev/projects/<id>/
      const { projects: projectsRootDir } = getStoragePaths();
      workdir = path.join(projectsRootDir, id);
      fs.mkdirSync(workdir, { recursive: true });
      if (!name) name = `Default Workspace (${id.substring(0, 6)})`;
    } else {
      if (!fs.existsSync(workdir)) {
        fs.mkdirSync(workdir, { recursive: true });
      }
      if (!name) {
        name = path.basename(workdir);
      }
    }

    const resolvedWorkdir = path.resolve(workdir);

    // Auto-initialize Git repository if not already a git repository
    try {
      const isRepo = await gitService.isGitRepo(resolvedWorkdir);
      if (!isRepo) {
        await gitService.initRepo(resolvedWorkdir);
      }
    } catch (gitErr) {
      console.warn('[ProjectsAPI] Auto git init skipped or failed:', gitErr);
    }

    const project: ProjectRecord = {
      id,
      name,
      workdir_path: resolvedWorkdir,
      created_at: Date.now(),
      last_opened_at: Date.now(),
    };

    const savedProject = projectRepo.upsert(project);

    return NextResponse.json({ project: savedProject });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, name, workdir_path } = body;
    if (!id) {
      return NextResponse.json({ error: 'Missing project id' }, { status: 400 });
    }
    const updated = projectRepo.update(id, {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(workdir_path !== undefined ? { workdir_path: String(workdir_path).trim() } : {}),
    });
    if (!updated) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ project: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    let id = url.searchParams.get('id');
    if (!id) {
      try {
        const body = await req.json();
        id = body?.id;
      } catch {}
    }

    if (!id) {
      return NextResponse.json({ error: 'Missing project id' }, { status: 400 });
    }

    const success = projectRepo.delete(id);
    if (!success) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

