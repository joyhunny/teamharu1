import { NextRequest, NextResponse } from 'next/server';
const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE;
export async function POST(req: NextRequest) {
  if (!API_BASE) return NextResponse.json({ ok: false, error: 'API_BASE_URL not set' }, { status: 500 });
  const url = `${API_BASE.replace(/\/$/, '')}/roadmap/save`;
  const body = await req.text();
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const t = await r.text();
  return new NextResponse(t, { status: r.status, headers: { 'content-type': 'application/json' } });
}

