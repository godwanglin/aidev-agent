export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { scanAvailableSkills } from '@/lib/skills';

interface ArtifactItem {
  id: string;
  title: string;
  path: string;
  size: number;
  updatedAt: number;
}

interface UploadItem {
  id: string;
  title: string;
  filename: string;
  url: string;
  size: number;
  timestamp: number;
}

interface SkillItem {
  name: string;
  path: string;
  description?: string;
  used: boolean;
}

// Format relative date like "Media (Today 5:23 PM)", "Media (Yesterday 4:10 PM)", or "Media (9/19 5:23 PM)"
function formatMediaTitle(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isToday) {
    return `Media (Today ${timeStr})`;
  } else if (isYesterday) {
    return `Media (Yesterday ${timeStr})`;
  } else {
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `Media (${month}/${day} ${timeStr})`;
  }
}

import { messageRepo, sessionRepo } from '@/lib/db';
import { getStoragePaths, getChatStorage } from '@/lib/storage';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workdir = searchParams.get('workdir')?.trim() || '';
    const sessionId = searchParams.get('sessionId');

    // If no session is active (e.g. New Conversation), return empty state immediately
    if (!sessionId || sessionId === 'null' || sessionId === 'undefined') {
      return NextResponse.json({
        artifacts: [],
        uploads: [],
        skills: [],
      });
    }

    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    const storagePaths = getStoragePaths();
    const session = sessionRepo.getById(sessionId);
    const projectId = session?.project_id || 'no_project';
    const chatStorage = getChatStorage(projectId, sessionId);
    const sessionArtifactsDir = chatStorage.artifacts;
    const sessionUploadsDir = chatStorage.uploads;
    const legacySessionArtifactsDir = path.join(storagePaths.root, 'sessions', sessionId, 'artifacts');
    const legacySessionUploadsDir = path.join(storagePaths.root, 'sessions', sessionId, 'uploads');

    // 1. Artifacts Check (Strictly for this Aidev session)
    const artifacts: ArtifactItem[] = [];
    const seenArtifactIds = new Set<string>();

    const checkArtifact = (p: string, id: string, defaultTitle: string) => {
      if (fs.existsSync(p) && !seenArtifactIds.has(id)) {
        try {
          const stat = fs.statSync(p);
          if (stat.isFile()) {
            seenArtifactIds.add(id);
            const isImage = /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(id);
            const targetPath = isImage
              ? `/api/media?file=${encodeURIComponent(id)}&sessionId=${encodeURIComponent(sessionId)}`
              : id;
            artifacts.push({
              id,
              title: defaultTitle,
              path: targetPath,
              size: stat.size,
              updatedAt: stat.mtimeMs,
            });
          }
        } catch {
          // ignore
        }
      }
    };

    // Strictly check session artifacts directories (.aidev/projects/<projectId>/<sessionId>/artifacts/)
    const artifactDirsToCheck = [
      sessionArtifactsDir,
      legacySessionArtifactsDir,
    ];

    for (const dir of artifactDirsToCheck) {
      if (fs.existsSync(dir)) {
        let metadata: Record<string, any> = {};
        const metaPath = path.join(dir, '.metadata.json');
        if (fs.existsSync(metaPath)) {
          try {
            metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          } catch {}
        }

        checkArtifact(path.join(dir, 'walkthrough.md'), 'walkthrough.md', metadata['walkthrough.md']?.title || 'Walkthrough');
        checkArtifact(path.join(dir, 'implementation_plan.md'), 'implementation_plan.md', metadata['implementation_plan.md']?.title || 'Implementation Plan');

        try {
          const dirFiles = fs.readdirSync(dir);
          for (const file of dirFiles) {
            if (
              file === '.metadata.json' ||
              file === 'walkthrough.md' ||
              file === 'implementation_plan.md'
            ) {
              continue;
            }

            const isMarkdown = file.endsWith('.md');
            const isImage = /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(file);
            const isHtml = file.endsWith('.html');

            if (isMarkdown || isImage || isHtml) {
              const customTitle = metadata[file]?.title || file
                .replace(/\.(md|html|png|jpg|jpeg|webp|svg|gif)$/i, '')
                .replace(/[-_]/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase());
              checkArtifact(path.join(dir, file), file, customTitle);
            }
          }
        } catch (err) {
          console.error(`Failed reading artifact directory ${dir}:`, err);
        }
      }
    }

    // 2. Uploads (Strictly session user_uploads and images sent in this session)
    const uploads: UploadItem[] = [];
    const seenUploads = new Set<string>();

    const processUploadFile = (filePath: string, filename: string, sourceSessionId: string) => {
      // Tool screenshots belong to artifacts, not uploads
      if (filename.startsWith('screenshot_')) return;
      if (seenUploads.has(filename) || !fs.existsSync(filePath)) return;
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          seenUploads.add(filename);
          const tsMatch = /^media_(\d+)\./.exec(filename);
          const timestamp = tsMatch ? parseInt(tsMatch[1], 10) : Math.round(stat.mtimeMs);
          const title = formatMediaTitle(timestamp);

          uploads.push({
            id: filename.replace(/\.[^/.]+$/, ''),
            title,
            filename,
            url: `/api/media?file=${encodeURIComponent(filename)}&sessionId=${encodeURIComponent(sourceSessionId)}`,
            size: stat.size,
            timestamp,
          });
        }
      } catch {
        // ignore
      }
    };

    // Check session uploads directories for images
    const uploadDirsToCheck = [
      sessionUploadsDir,
      legacySessionUploadsDir,
    ];

    for (const uDir of uploadDirsToCheck) {
      if (fs.existsSync(uDir)) {
        try {
          const files = fs.readdirSync(uDir);
          for (const file of files) {
            if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(file)) {
              processUploadFile(path.join(uDir, file), file, sessionId);
            }
          }
        } catch (err) {
          console.error('Failed reading session uploads dir:', err);
        }
      }
    }

    // Extract any image attachments sent in this session's chat messages
    try {
      const msgs = messageRepo.listBySession(sessionId);
      for (const m of msgs) {
        if (!m.content) continue;
        try {
          if (m.content.trim().startsWith('[')) {
            const parts = JSON.parse(m.content);
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (part.type === 'image_url' && part.image_url?.url) {
                  const imgId = part.image_id ? `img_${part.image_id}` : `msg_${m.id}`;
                  if (!seenUploads.has(imgId)) {
                    seenUploads.add(imgId);
                    const title = part.name || formatMediaTitle(m.created_at);
                    const filename = part.name || `image_${imgId}.png`;
                    uploads.push({
                      id: imgId,
                      title,
                      filename,
                      url: part.image_url.url,
                      size: typeof part.image_url.url === 'string' && part.image_url.url.startsWith('data:')
                        ? Math.round(part.image_url.url.length * 0.75)
                        : 0,
                      timestamp: m.created_at,
                    });
                  }
                }
              }
            }
          }
        } catch {}
      }
    } catch {}

    // Sort newest first
    uploads.sort((a, b) => b.timestamp - a.timestamp);

    // 3. Scan available skills (Workspace, Global, Builtin) and mark if used in this session
    let sessionContext = '';
    try {
      const msgs = messageRepo.listBySession(sessionId);
      sessionContext = msgs
        .map((m) => `${m.role} ${m.tool_name || ''} ${m.tool_arguments || ''} ${m.content || ''}`)
        .join(' ')
        .toLowerCase();
    } catch {
      // ignore
    }

    const skills = workdir && workdir !== 'no_project' ? scanAvailableSkills(workdir, sessionContext) : [];

    return NextResponse.json({
      artifacts,
      uploads,
      skills,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
