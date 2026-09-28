export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { telegramBotManager } from '@/lib/telegram/telegram-service';
import { loadSettings, saveSettings } from '@/lib/storage';

export async function GET() {
  try {
    const settings = loadSettings();
    if (settings.telegramBotEnabled && settings.telegramBotToken && !telegramBotManager.getStatus().isRunning) {
      await telegramBotManager.start();
    }
    const status = telegramBotManager.getStatus();
    return NextResponse.json({
      ...status,
      enabled: Boolean(settings.telegramBotEnabled),
      tokenConfigured: Boolean(settings.telegramBotToken),
      allowedUserIds: settings.telegramAllowedUserIds || '',
      defaultProjectId: settings.telegramDefaultProjectId || '',
      logs: telegramBotManager.getLogs(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed fetching Telegram status' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'test') {
      const token = body?.token;
      if (!token) {
        return NextResponse.json({ valid: false, error: 'Token is required' }, { status: 400 });
      }
      const testResult = await telegramBotManager.testToken(token);
      return NextResponse.json(testResult);
    }

    if (action === 'start') {
      await telegramBotManager.start();
      return NextResponse.json({ ...telegramBotManager.getStatus(), logs: telegramBotManager.getLogs() });
    }

    if (action === 'stop') {
      await telegramBotManager.stop();
      return NextResponse.json({ ...telegramBotManager.getStatus(), logs: telegramBotManager.getLogs() });
    }

    if (action === 'restart') {
      await telegramBotManager.restart();
      return NextResponse.json({ ...telegramBotManager.getStatus(), logs: telegramBotManager.getLogs() });
    }

    if (action === 'clear_logs') {
      telegramBotManager.clearLogs();
      return NextResponse.json({ success: true, logs: [] });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed processing Telegram action' }, { status: 500 });
  }
}
