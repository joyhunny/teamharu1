import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE;

export async function GET(req: NextRequest) {
  if (!API_BASE) {
    return NextResponse.json({ ok: false, error: 'API_BASE_URL not set' }, { status: 500 });
  }
  const url = new URL(`${API_BASE.replace(/\/$/, '')}/oauth/github/start`);
  for (const [k, v] of req.nextUrl.searchParams.entries()) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url.toString(), { status: 302 });
}

