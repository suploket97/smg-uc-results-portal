import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE } from './lib/cookie';

// Sends visitors without the sign-in cookie to the login page.
// The cookie's signature is checked by every /api/admin route (lib/api.ts → requireAdmin),
// because the secret may live in the database, which middleware cannot reach.
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === '/admin/login' || pathname === '/api/admin/login') return NextResponse.next();
  if (req.cookies.get(COOKIE)?.value) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'Not signed in', needsLogin: true }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
