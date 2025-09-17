import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId') || 't-demo';
  const res = NextResponse.json({ ok: true, tenantId });
  res.cookies.set('tenantId', tenantId, { path: '/', httpOnly: false, sameSite: 'lax' });
  return res;
}

