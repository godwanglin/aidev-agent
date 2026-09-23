import { NextResponse } from 'next/server';
import { mcpClientManager } from '@/lib/mcp/client-manager';

export async function POST(
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

    const runtime = await mcpClientManager.restartServer(name);
    return NextResponse.json({
      success: true,
      server: runtime,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
