export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { mcpClientManager } from '@/lib/mcp/client-manager';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Server name is required.' },
        { status: 400 }
      );
    }

    const servers = mcpClientManager.getServersRuntime();
    const server = servers.find((s) => s.name === name);

    return NextResponse.json({
      success: true,
      name,
      logs: server?.logs || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
