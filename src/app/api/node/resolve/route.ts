export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { NodeResolver } from '@/lib/node/node-resolver';

export async function POST() {
  try {
    const resolver = NodeResolver.getInstance();
    const resolved = await resolver.ensurePortableNode();
    return NextResponse.json({
      success: true,
      ...resolver.getStatus(),
      ...resolved,
    });
  } catch (error: any) {
    const resolver = NodeResolver.getInstance();
    return NextResponse.json(
      {
        ...resolver.getStatus(),
        success: false,
        error: error?.message || 'Failed to download portable Node/NPM',
      },
      { status: 500 }
    );
  }
}
