export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { mcpClientManager } from '@/lib/mcp/client-manager';

export async function GET() {
  try {
    await mcpClientManager.init();
    const servers = mcpClientManager.getServersRuntime();
    const rawConfig = mcpClientManager.loadConfig();

    return NextResponse.json({
      success: true,
      servers,
      rawConfig,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Mode 1: Full raw JSON config replacement
    if (body.rawConfig && typeof body.rawConfig === 'object') {
      mcpClientManager.saveConfig(body.rawConfig);
      // Re-initialize servers with new config
      await mcpClientManager.init();
      const servers = mcpClientManager.getServersRuntime();
      return NextResponse.json({
        success: true,
        servers,
        rawConfig: body.rawConfig,
      });
    }

    // Mode 2: Individual server add/update
    const { name, config } = body;
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Server name is required.' },
        { status: 400 }
      );
    }
    if (!config || typeof config !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Server config is required.' },
        { status: 400 }
      );
    }

    const updatedRuntime = await mcpClientManager.addOrUpdateServer(name.trim(), config);
    return NextResponse.json({
      success: true,
      server: updatedRuntime,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const name = url.searchParams.get('name');
    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Server name is required.' },
        { status: 400 }
      );
    }

    await mcpClientManager.deleteServer(name);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
