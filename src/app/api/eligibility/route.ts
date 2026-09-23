export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getUserEligibility } from '@/lib/gateway';

export async function GET() {
  try {
    const data = await getUserEligibility();
    if (!data) {
      return NextResponse.json({ error: 'Failed to fetch user eligibility' }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
