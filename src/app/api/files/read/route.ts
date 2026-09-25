export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { sanitizeAndResolvePath } from '@/lib/security';
import { sessionRepo, projectRepo } from '@/lib/db';
import { getChatStorage } from '@/lib/storage';
import { isBinaryExtension, isBinaryBuffer } from '@/lib/binary-detector';

function serveFileSafely(absPath: string, relativePath: string) {
  const stat = fs.statSync(absPath);
  if (stat.isDirectory()) {
    return NextResponse.json({ error: 'Path is a directory' }, { status: 400 });
  }

  // 1. Check known binary extensions
  if (isBinaryExtension(absPath)) {
    return NextResponse.json({
      path: relativePath,
      content: '__AIDEV_BINARY_FILE__',
      isBinary: true,
      size: stat.size,
    });
  }

  // 2. Reject files larger than 10MB to avoid freezing UI
  if (stat.size > 10 * 1024 * 1024) {
    return NextResponse.json({
      path: relativePath,
      content: '__AIDEV_BINARY_FILE__',
      isBinary: true,
      isTooLarge: true,
      size: stat.size,
    });
  }

  // 3. Inspect first 1024 bytes for null bytes
  if (stat.size > 0) {
    const fd = fs.openSync(absPath, 'r');
    const buffer = Buffer.alloc(Math.min(stat.size, 1024));
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    if (isBinaryBuffer(buffer)) {
      return NextResponse.json({
        path: relativePath,
        content: '__AIDEV_BINARY_FILE__',
        isBinary: true,
        size: stat.size,
      });
    }
  }

  const content = fs.readFileSync(absPath, 'utf-8');
  return NextResponse.json({ path: relativePath, content, size: stat.size });
}

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
            return serveFileSafely(aPath, relativePath);
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
              return serveFileSafely(directArtifactPath, relativePath);
            }
          }
        }
      } catch {}
    }

    // 3. If relativePath is actually an existing absolute path on disk, serve it directly
    const directAbsPath = path.resolve(relativePath.replace(/^file:\/\/\/?/i, ''));
    if (fs.existsSync(directAbsPath)) {
      try {
        return serveFileSafely(directAbsPath, relativePath);
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

    return serveFileSafely(resolved, relativePath);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
