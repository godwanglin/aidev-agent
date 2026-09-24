export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

export async function GET() {
  try {
    // 1. Read package.json version
    let version = '1.0.0';
    let name = 'aidev-coding-agent';
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.version) version = pkg.version;
        if (pkg.name) name = pkg.name;
      }
    } catch {}

    // 2. Read git metadata if in git repository
    let commit = `v${version}`;
    let branch = 'main';
    let isClean = true;
    try {
      commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', timeout: 3000 }).trim();
      branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', timeout: 3000 }).trim();
      const statusOut = execSync('git status --porcelain', { encoding: 'utf-8', timeout: 3000 }).trim();
      isClean = statusOut.length === 0;
    } catch {
      commit = process.env.GIT_COMMIT || `v${version}`;
      branch = 'release';
    }

    // 3. Runtime diagnostics
    const runtime = {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    };

    // 4. Check GitHub latest release version
    let latestVersion = version;
    let updateAvailable = false;
    let releaseUrl = 'https://github.com/godwanglin/aidev-agent/releases/latest';
    try {
      const ghRes = await fetch('https://api.github.com/repos/godwanglin/aidev-agent/releases/latest', {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Aidev-Desktop-Updater',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (ghRes.ok) {
        const ghData = await ghRes.json();
        const rawTag = String(ghData?.tag_name || '').replace(/^v/i, '').trim();
        if (rawTag) {
          latestVersion = rawTag;
          if (ghData?.html_url) releaseUrl = ghData.html_url;
          const parseParts = (v: string) =>
            v
              .split('-')[0]
              .split('.')
              .map((n) => parseInt(n, 10) || 0);
          const [cMaj = 0, cMin = 0, cPat = 0] = parseParts(version);
          const [lMaj = 0, lMin = 0, lPat = 0] = parseParts(latestVersion);
          if (
            lMaj > cMaj ||
            (lMaj === cMaj && lMin > cMin) ||
            (lMaj === cMaj && lMin === cMin && lPat > cPat)
          ) {
            updateAvailable = true;
          }
        }
      }
    } catch {}

    return NextResponse.json({
      name,
      version: `v${version}`,
      latestVersion: `v${latestVersion}`,
      updateAvailable,
      releaseUrl,
      git: {
        commit,
        branch,
        clean: isClean,
      },
      runtime,
      status: updateAvailable ? 'update_available' : 'latest',
      checkedAt: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
