export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { sanitizeAndResolvePath } from '@/lib/security';
import { sessionRepo, projectRepo } from '@/lib/db';
import { getChatStorage } from '@/lib/storage';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workdir = searchParams.get('workdir');
    const relativePath = searchParams.get('path');

    if (!relativePath) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    const sessionId = searchParams.get('sessionId');

    // 1. Check if it is an explicit artifact file of this session
    const isArtifactRequested =
      relativePath.startsWith('artifact:') ||
      relativePath.startsWith('artifacts/') ||
      relativePath === 'walkthrough.md' ||
      relativePath === 'implementation_plan.md' ||
      /\.(md|html|txt|json)$/i.test(relativePath);

    if (sessionId && isArtifactRequested) {
      const cleanName = path.basename(relativePath.replace(/^artifact:\/\/?/, ''));
      const session = sessionRepo.getById(sessionId);
      const projectId = session?.project_id || 'no_project';
      const chatStorage = getChatStorage(projectId, sessionId);

      const candidateArtifactPaths = [
        path.join(chatStorage.artifacts, cleanName),
        path.join(homeDir, '.aidev', 'sessions', sessionId, 'artifacts', cleanName),
        path.join(homeDir, '.aidev', 'sandbox', 'generated', sessionId, 'artifacts', cleanName),
      ];

      for (const aPath of candidateArtifactPaths) {
        if (fs.existsSync(aPath)) {
          try {
            const stat = fs.statSync(aPath);
            if (stat.isFile()) {
              const content = fs.readFileSync(aPath, 'utf-8');
              return NextResponse.json({ path: relativePath, content, size: stat.size });
            }
          } catch {}
        }
      }
    }

    // 2. Check if file only exists in session chatStorage.artifacts
    if (sessionId) {
      try {
        const cleanName = path.basename(relativePath);
        const session = sessionRepo.getById(sessionId);
        const projectId = session?.project_id || 'no_project';
        const chatStorage = getChatStorage(projectId, sessionId);
        const candidateArtifactPaths = [
          path.join(chatStorage.artifacts, cleanName),
          path.join(homeDir, '.aidev', 'sandbox', 'generated', sessionId, 'artifacts', cleanName),
        ];

        for (const directArtifactPath of candidateArtifactPaths) {
          if (fs.existsSync(directArtifactPath)) {
            let existsInWorkspace = false;
            if (workdir) {
              try {
                const wsPath = sanitizeAndResolvePath(workdir, relativePath, true);
                existsInWorkspace = fs.existsSync(wsPath);
              } catch {}
            }

            if (!existsInWorkspace) {
              const stat = fs.statSync(directArtifactPath);
              if (stat.isFile()) {
                const content = fs.readFileSync(directArtifactPath, 'utf-8');
                return NextResponse.json({ path: relativePath, content, size: stat.size });
              }
            }
          }
        }
      } catch {}
    }

    // 3. If relativePath is actually an existing absolute path on disk, serve it directly
    const directAbsPath = path.resolve(relativePath.replace(/^file:\/\/\/?/i, ''));
    if (fs.existsSync(directAbsPath)) {
      try {
        const stat = fs.statSync(directAbsPath);
        if (stat.isFile()) {
          const content = fs.readFileSync(directAbsPath, 'utf-8');
          return NextResponse.json({ path: relativePath, content, size: stat.size });
        }
      } catch {}
    }

    if (!workdir) {
      return NextResponse.json({ error: 'workdir and path are required' }, { status: 400 });
    }

    // 4. Resolve within active workspace directory, global skills, or any registered project
    let resolved = '';
    try {
      resolved = sanitizeAndResolvePath(workdir, relativePath, true);
    } catch (err: any) {
      // If not in current workdir, check if within any registered project's workdir
      const cleanPath = relativePath.replace(/^file:\/\/\/?/i, '');
      const targetAbs = path.resolve(cleanPath);
      const allProjects = projectRepo.list();
      let foundInProject = false;
      for (const proj of allProjects) {
        if (proj.workdir_path) {
          const rel = path.relative(path.resolve(proj.workdir_path), targetAbs);
          if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
            resolved = targetAbs;
            foundInProject = true;
            break;
          }
        }
      }
      if (!foundInProject) {
        throw err;
      }
    }

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: 'File does not exist' }, { status: 404 });
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return NextResponse.json({ error: 'Path is a directory' }, { status: 400 });
    }

    const content = fs.readFileSync(resolved, 'utf-8');
    return NextResponse.json({ path: relativePath, content, size: stat.size });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
