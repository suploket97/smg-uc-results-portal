import { NextResponse } from 'next/server';
import { checkPassword, createFirstPassword, makeToken, passwordSource, COOKIE } from '@/lib/auth';
import { ensureSchema } from '@/lib/db';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tells the login page whether a password exists yet (and sets up the tables on the way). */
export async function GET() {
  try {
    await ensureSchema();
    return NextResponse.json({ ok: true, needsSetup: (await passwordSource()) === 'none' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = String(body?.password ?? '');
    let ok = await checkPassword(password);
    if (ok === null) {
      // No password anywhere yet: the first person to open the login page creates it.
      if (body?.create !== true) {
        return NextResponse.json({ ok: false, needsSetup: true, error: 'No admin password yet. Create one.' }, { status: 409 });
      }
      if (password.trim().length < 8) {
        return NextResponse.json({ ok: false, needsSetup: true, error: 'Use at least 8 characters.' }, { status: 400 });
      }
      if (!(await createFirstPassword(password))) {
        return NextResponse.json({ ok: false, error: 'A password was just set by someone else. Sign in with it.' }, { status: 409 });
      }
      ok = true;
    }
    if (!ok) {
      await new Promise((r) => setTimeout(r, 600)); // slow down guessing
      return NextResponse.json({ ok: false, error: 'Wrong password' }, { status: 401 });
    }
    const { value, maxAge } = await makeToken();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, value, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge,
    });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
