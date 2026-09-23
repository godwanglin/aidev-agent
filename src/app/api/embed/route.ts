import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { sessionRepo } from '@/lib/db';
import { getChatStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSrc = searchParams.get('src');
    const workdir = searchParams.get('workdir');
    const sessionId = searchParams.get('sessionId');
    const theme = searchParams.get('theme') || 'dark';
    const isLight = theme === 'light';

    if (!rawSrc) {
      return new NextResponse('Missing src parameter', { status: 400 });
    }

    // 1. Normalize source path
    let cleanSrc = decodeURIComponent(rawSrc).trim();
    // Strip file URI prefixes
    cleanSrc = cleanSrc.replace(/^file:\/\/\//i, '').replace(/^file:\/\//i, '');
    // Standardize slashes
    cleanSrc = cleanSrc.replace(/\//g, path.sep);

    // On Windows, if cleanSrc looks like 'C:\...', make sure leading slash is gone
    if (/^[a-zA-Z]:\\/.test(cleanSrc)) {
      // Valid Windows absolute path
    }

    const filename = path.basename(cleanSrc);
    const candidatePaths: string[] = [];

    // Candidate 1: Direct absolute path
    if (path.isAbsolute(cleanSrc) || /^[a-zA-Z]:[\\/]/.test(cleanSrc)) {
      candidatePaths.push(cleanSrc);
    }

    // Candidate 2: In workspace workdir
    if (workdir) {
      candidatePaths.push(path.resolve(workdir, cleanSrc));
      candidatePaths.push(path.resolve(workdir, 'artifacts', filename));
      candidatePaths.push(path.resolve(workdir, filename));
    }

    // Candidate 3: In session chat storage
    if (sessionId) {
      try {
        const session = sessionRepo.getById(sessionId);
        const projectId = session?.project_id || 'default';
        const chatStorage = getChatStorage(projectId, sessionId);
        candidatePaths.push(path.resolve(chatStorage.artifacts, cleanSrc));
        candidatePaths.push(path.resolve(chatStorage.artifacts, filename));
        candidatePaths.push(path.resolve(chatStorage.uploads, filename));
      } catch {}
    }

    // Candidate 4: Search globally in .aidev/projects/<proj>/<session>/artifacts/
    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    if (homeDir) {
      const projectsRoot = path.join(homeDir, '.aidev', 'projects');
      if (fs.existsSync(projectsRoot)) {
        try {
          const projs = fs.readdirSync(projectsRoot);
          for (const p of projs) {
            const pDir = path.join(projectsRoot, p);
            if (fs.statSync(pDir).isDirectory()) {
              const sessions = fs.readdirSync(pDir);
              for (const s of sessions) {
                candidatePaths.push(path.join(pDir, s, 'artifacts', filename));
              }
            }
          }
        } catch {}
      }
    }

    let resolvedPath: string | null = null;
    for (const cp of candidatePaths) {
      if (fs.existsSync(cp)) {
        try {
          const stat = fs.statSync(cp);
          if (stat.isFile()) {
            resolvedPath = cp;
            break;
          }
        } catch {}
      }
    }

    if (!resolvedPath) {
      const errorHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #141414; color: #cccccc; padding: 24px; }
    .card { background: #1a1a1a; border: 1px solid #282828; border-radius: 12px; padding: 18px; max-width: 560px; margin: 20px auto; }
    h3 { margin-top: 0; color: #ff7b72; font-size: 14px; }
    p { font-size: 12px; line-height: 1.6; color: #999999; }
    code { background: #222222; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 11px; color: #e5c07b; }
  </style>
</head>
<body>
  <div class="card">
    <h3>Embedded Artifact Not Found</h3>
    <p>The source HTML file could not be found in the project directory or session artifacts.</p>
    <p>Target: <code>${rawSrc}</code></p>
  </div>
</body>
</html>`;
      return new NextResponse(errorHtml, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    let html = fs.readFileSync(resolvedPath, 'utf-8');

    // 1. Fix common mistyped gstatic CDN URLs (e.g. aidev -> antigravity)
    html = html.replace(
      /https:\/\/www\.gstatic\.com\/aidev\/web\/dev\/tailwindcss\.min\.js/g,
      'https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js'
    );

    // 2. Inject Semantic Theme CSS Variables & class
    const themeStyles = `
  <style id="aidev-theme-tokens">
    :root {
      --background: ${isLight ? '#ffffff' : '#101010'};
      --foreground: ${isLight ? '#101010' : '#cccccc'};
      --card: ${isLight ? '#f9f9f9' : '#181818'};
      --border: ${isLight ? '#e5e5e5' : '#262626'};
      --muted: ${isLight ? '#f3f3f3' : '#151515'};
      --muted-foreground: ${isLight ? '#666666' : '#8c8c8c'};
      --placeholder: ${isLight ? '#8c8c8c' : '#666666'};
      --primary: #007acc;
      --primary-foreground: #ffffff;
      --secondary: ${isLight ? '#eaeaea' : '#272727'};
      --secondary-foreground: ${isLight ? '#444444' : '#9d9d9d'};
      --sidebar: ${isLight ? '#f5f5f5' : '#151515'};
      --content: ${isLight ? '#ffffff' : '#141414'};
      --accent: #007acc;
    }
  </style>
`;

    // Inject title if missing
    if (!/<title[^>]*>/i.test(html) && html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n  <title>${filename}</title>`);
    }

    // Inject theme styles into <head>
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${themeStyles}\n</head>`);
    } else {
      html = `${themeStyles}\n${html}`;
    }

    // Ensure <html> has correct dark/light class
    if (html.includes('<html')) {
      html = html.replace(/<html([^>]*)>/i, (_match, group) => {
        if (/class=["'][^"']*["']/i.test(group)) {
          return `<html${group.replace(/class=["']([^"']*)["']/i, `class="$1 ${theme}"`)}>`;
        }
        return `<html${group} class="${theme}">`;
      });
    }

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'SAMEORIGIN',
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  } catch (err: any) {
    return new NextResponse(`Error reading embed: ${err.message}`, { status: 500 });
  }
}
