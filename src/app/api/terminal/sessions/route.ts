export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import {
  listActiveTerminals,
  getActiveTerminalCount,
  killActiveTerminal,
  killAllActiveTerminals,
  checkTerminalProcesses,
  checkAllTerminalsProcesses,
} from '@/lib/terminal-server';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const checkId = url.searchParams.get('check');
    const checkAll = url.searchParams.get('checkAll') === 'true';

    if (checkId) {
      const info = checkTerminalProcesses(checkId);
      return NextResponse.json(info);
    }

    if (checkAll) {
      const info = checkAllTerminalsProcesses();
      return NextResponse.json(info);
    }

    const terminals = listActiveTerminals();
    const count = getActiveTerminalCount();
    return NextResponse.json({ terminals, count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const all = url.searchParams.get('all') === 'true';

    if (all) {
      const killedCount = killAllActiveTerminals();
      return NextResponse.json({
        success: true,
        killedCount,
        count: getActiveTerminalCount(),
        terminals: listActiveTerminals(),
      });
    }

    if (!id) {
      return NextResponse.json({ error: 'Missing terminal session id' }, { status: 400 });
    }

    const killed = killActiveTerminal(id);
    return NextResponse.json({
      success: true,
      killed,
      count: getActiveTerminalCount(),
      terminals: listActiveTerminals(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'delete';

    if (action === 'clear_all' || action === 'delete_all') {
      const killedCount = killAllActiveTerminals();
      return NextResponse.json({
        success: true,
        killedCount,
        count: getActiveTerminalCount(),
        terminals: listActiveTerminals(),
      });
    }

    if (action === 'delete' || action === 'kill') {
      const id = body.id;
      if (!id) {
        return NextResponse.json({ error: 'Missing terminal session id' }, { status: 400 });
      }
      const killed = killActiveTerminal(id);
      return NextResponse.json({
        success: true,
        killed,
        count: getActiveTerminalCount(),
        terminals: listActiveTerminals(),
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

