export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { loadSettings, saveSettings, getStoragePaths, ensureStorageInitialized } from '@/lib/storage';
import fs from 'fs';
import { exec } from 'child_process';

export async function GET() {
  try {
    const settings = loadSettings();
    const { keybindingsFile, settingsFile } = getStoragePaths();
    let keybindings = {};
    if (fs.existsSync(keybindingsFile)) {
      try {
        keybindings = JSON.parse(fs.readFileSync(keybindingsFile, 'utf-8'));
      } catch {
        // fallback
      }
    }
    return NextResponse.json({ settings, keybindings, settingsFile });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();

    if (body?.action === 'open-settings-file') {
      ensureStorageInitialized();
      const { settingsFile } = getStoragePaths();
      if (process.platform === 'win32') {
        exec(`notepad.exe "${settingsFile}"`);
      } else if (process.platform === 'darwin') {
        exec(`open -t "${settingsFile}"`);
      } else {
        exec(`xdg-open "${settingsFile}"`);
      }
      return NextResponse.json({ success: true, settingsFile });
    }

    if (body?.action === 'verify-api-key') {
      const candidateKey = String(body.apiKey || '').trim();
      if (!candidateKey) {
        return NextResponse.json(
          { valid: false, error: 'API Key tidak boleh kosong.' },
          { status: 400 }
        );
      }

      const currentSettings = loadSettings();
      const baseUrl = (currentSettings.gatewayUrl || 'https://aidev.weebinhub.biz.id/v1').replace(/\/+$/, '');
      const isAidevGateway =
        baseUrl.includes('aidev') ||
        baseUrl.includes('weebinhub') ||
        baseUrl.includes('localhost:3000') ||
        baseUrl.includes('127.0.0.1:3000');

      try {
        if (isAidevGateway) {
          // Strictly validate against /usage (which enforces Bearer token validation on Aidev Gateway)
          const verifyRes = await fetch(`${baseUrl}/usage`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${candidateKey}`,
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(10000),
          });

          if (!verifyRes.ok) {
            const errData = await verifyRes.json().catch(() => ({}));
            const rawErr =
              typeof errData?.error === 'string'
                ? errData.error
                : errData?.error?.message || '';
            return NextResponse.json(
              {
                valid: false,
                error:
                  rawErr.toLowerCase().includes('invalid') || verifyRes.status === 401 || verifyRes.status === 403
                    ? 'API Key tidak valid atau tidak terdaftar. Silakan periksa kembali API Key Anda.'
                    : `Gagal memverifikasi API Key (HTTP ${verifyRes.status}): ${rawErr || 'Unauthorized'}`,
              },
              { status: 401 }
            );
          }

          const usageData = await verifyRes.json().catch(() => ({}));
          const updated = saveSettings({ apiKey: candidateKey });
          return NextResponse.json({
            valid: true,
            settings: updated,
            user: usageData?.user,
            tier: usageData?.tier,
          });
        } else {
          // Custom Base URL (from settings.json): test /models with Bearer token
          const verifyRes = await fetch(`${baseUrl}/models`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${candidateKey}`,
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(10000),
          });

          if (!verifyRes.ok) {
            return NextResponse.json(
              {
                valid: false,
                error: `API Key ditolak oleh endpoint custom (${baseUrl}) [HTTP ${verifyRes.status}].`,
              },
              { status: 401 }
            );
          }

          const updated = saveSettings({ apiKey: candidateKey });
          return NextResponse.json({
            valid: true,
            settings: updated,
          });
        }
      } catch (netErr: any) {
        return NextResponse.json(
          {
            valid: false,
            error: `Tidak dapat menghubungi server Gateway (${baseUrl}). Periksa koneksi internet Anda.`,
          },
          { status: 502 }
        );
      }
    }

    const updated = saveSettings(body);
    return NextResponse.json({ settings: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return PUT(req);
}


