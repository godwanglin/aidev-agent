export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { NodeResolver } from '@/lib/node/node-resolver';

export async function GET() {
  try {
    const resolver = NodeResolver.getInstance();
    const resolved = await resolver.resolveNode();
    const status = resolver.getStatus();
    return NextResponse.json({
      success: true,
      ...status,
      ...resolved,
    });
  } catch (error: any) {
    const resolver = NodeResolver.getInstance();
    return NextResponse.json({
      ...resolver.getStatus(),
      success: false,
      error: error?.message || 'Failed to check Node/NPM status',
    });
  }
}
