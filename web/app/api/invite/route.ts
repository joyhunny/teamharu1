import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE;

export async function POST(req: NextRequest) {
  if (!API_BASE) {
    return NextResponse.json({ ok: false, error: 'API_BASE_URL not set' }, { status: 500 });
  }
  const json = await req.json();
  const res = await fetch(`${API_BASE.replace(/\/$/, '')}/invite`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(json),
  });
  const out = await res.text();
  return new NextResponse(out, { status: res.status, headers: { 'content-type': 'application/json' } });
}

