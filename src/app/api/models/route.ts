export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getAvailableModels } from '@/lib/gateway';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get('refresh') === 'true';
    const models = await getAvailableModels(refresh);
    return NextResponse.json({ models });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
