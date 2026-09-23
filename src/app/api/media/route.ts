export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { sessionRepo } from '@/lib/db';
import { getChatStorage } from '@/lib/storage';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('file');

    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: 'Invalid file parameter' }, { status: 400 });
    }

    let sessionId = searchParams.get('sessionId');
    let targetFilePath = '';

    if (sessionId) {
      const session = sessionRepo.getById(sessionId);
      const projectId = session?.project_id || searchParams.get('projectId') || 'default';
      const chatStorage = getChatStorage(projectId, sessionId);
      const artifactPath = path.join(chatStorage.artifacts, filename);
      if (fs.existsSync(artifactPath)) {
        targetFilePath = artifactPath;
      } else {
        const uploadPath = path.join(chatStorage.uploads, filename);
        if (fs.existsSync(uploadPath)) {
          targetFilePath = uploadPath;
        }
      }

      // Legacy fallback
      if (!targetFilePath || !fs.existsSync(targetFilePath)) {
        const homeDir = process.env.USERPROFILE || process.env.HOME || '';
        const legacyPath = path.join(homeDir, '.aidev', 'sessions', sessionId, 'uploads', filename);
        if (fs.existsSync(legacyPath)) {
          targetFilePath = legacyPath;
        }
      }
    }

    // Global fallback across projects if sessionId is missing or not yet found
    if (!targetFilePath || !fs.existsSync(targetFilePath)) {
      const homeDir = process.env.USERPROFILE || process.env.HOME || '';
      const projectsDir = path.join(homeDir, '.aidev', 'projects');
      if (fs.existsSync(projectsDir)) {
        try {
          const projects = fs.readdirSync(projectsDir);
          for (const proj of projects) {
            const projDir = path.join(projectsDir, proj);
            if (fs.statSync(projDir).isDirectory()) {
              const sessions = fs.readdirSync(projDir);
              for (const sess of sessions) {
                const sessDir = path.join(projDir, sess);
                const artFile = path.join(sessDir, 'artifacts', filename);
                if (fs.existsSync(artFile)) {
                  targetFilePath = artFile;
                  break;
                }
                const upFile = path.join(sessDir, 'user_uploads', filename);
                if (fs.existsSync(upFile)) {
                  targetFilePath = upFile;
                  break;
                }
              }
              if (targetFilePath && fs.existsSync(targetFilePath)) break;
            }
          }
        } catch {}
      }

      // Also check ~/.aidev/mcp/media/
      if (!targetFilePath || !fs.existsSync(targetFilePath)) {
        const mcpMediaFile = path.join(homeDir, '.aidev', 'mcp', 'media', filename);
        if (fs.existsSync(mcpMediaFile)) {
          targetFilePath = mcpMediaFile;
        }
      }
    }

    if (!targetFilePath || !fs.existsSync(targetFilePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.svg') contentType = 'image/svg+xml';

    const fileBuffer = fs.readFileSync(targetFilePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
