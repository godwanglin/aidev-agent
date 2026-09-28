export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getAvailableModels, getAvailableImageModels } from '@/lib/gateway';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get('refresh') === 'true';
    const type = searchParams.get('type')?.toLowerCase().trim();

    if (type === 'image') {
      const models = await getAvailableImageModels(refresh);
      return NextResponse.json({ models });
    }

    const models = await getAvailableModels(refresh);
    return NextResponse.json({ models });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
