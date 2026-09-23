import { NextResponse } from 'next/server';
import { loadSettings, saveSettings, getStoragePaths } from '@/lib/storage';
import fs from 'fs';

export async function GET() {
  try {
    const settings = loadSettings();
    const { keybindingsFile } = getStoragePaths();
    let keybindings = {};
    if (fs.existsSync(keybindingsFile)) {
      try {
        keybindings = JSON.parse(fs.readFileSync(keybindingsFile, 'utf-8'));
      } catch {
        // fallback
      }
    }
    return NextResponse.json({ settings, keybindings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const updated = saveSettings(body);
    return NextResponse.json({ settings: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return PUT(req);
}

