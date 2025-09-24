import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE;

export async function GET(req: NextRequest) {
  if (!API_BASE) {
    return NextResponse.json({ ok: false, error: 'API_BASE_URL not set' }, { status: 500 });
  }
  const url = new URL(`${API_BASE.replace(/\/$/, '')}/github/collect`);
  for (const [k, v] of req.nextUrl.searchParams.entries()) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: { 'content-type': 'application/json' } });
  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { 'content-type': 'application/json' } });
}

export async function POST(req: NextRequest) {
  if (!API_BASE) {
    return NextResponse.json({ ok: false, error: 'API_BASE_URL not set' }, { status: 500 });
  }
  const url = new URL(`${API_BASE.replace(/\/$/, '')}/github/collect`);
  const body = await req.text();
  const res = await fetch(url.toString(), { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { 'content-type': 'application/json' } });
}

