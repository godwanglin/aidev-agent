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

    return NextResponse.json({
      name,
      version: `v${version}`,
      git: {
        commit,
        branch,
        clean: isClean,
      },
      runtime,
      status: 'latest',
      checkedAt: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
