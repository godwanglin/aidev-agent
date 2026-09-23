import { NextResponse } from 'next/server';
import { getUserUsage } from '@/lib/gateway';

export async function GET() {
  try {
    const data = await getUserUsage();
    if (!data) {
      return NextResponse.json({ error: 'Failed to fetch user usage' }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
