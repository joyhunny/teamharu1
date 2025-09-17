import { NextRequest, NextResponse } from 'next/server';

// Simple tenant guard: redirect to onboarding if no tenantId cookie
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Bypass for public and system paths
  const bypass = [
    '/health',
    '/onboarding',
  ];
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    bypass.some((p) => pathname === p || pathname.startsWith(p + '/'))
  ) {
    return NextResponse.next();
  }

  const tenantId = req.cookies.get('tenantId')?.value;
  if (!tenantId) {
    const url = req.nextUrl.clone();
    url.pathname = '/onboarding';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|assets).*)'],
};

