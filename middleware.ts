import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, verifyToken } from './lib/auth';

// Every /admin page and /api/admin route needs the admin cookie, except the login itself.
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === '/admin/login' || pathname === '/api/admin/login') return NextResponse.next();
  if (await verifyToken(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'Not signed in', needsLogin: true }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
