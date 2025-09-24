import { NextRequest, NextResponse } from 'next/server';
const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE;
export async function GET(req: NextRequest) {
  if (!API_BASE) return NextResponse.json({ ok: false, error: 'API_BASE_URL not set' }, { status: 500 });
  const url = new URL(`${API_BASE.replace(/\/$/, '')}/insights/checklist`);
  for (const [k, v] of req.nextUrl.searchParams.entries()) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  const t = await r.text();
  return new NextResponse(t, { status: r.status, headers: { 'content-type': 'application/json' } });
}
export async function POST(req: NextRequest) {
  if (!API_BASE) return NextResponse.json({ ok: false, error: 'API_BASE_URL not set' }, { status: 500 });
  const url = `${API_BASE.replace(/\/$/, '')}/insights/checklist`;
  const body = await req.text();
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const t = await r.text();
  return new NextResponse(t, { status: r.status, headers: { 'content-type': 'application/json' } });
}

