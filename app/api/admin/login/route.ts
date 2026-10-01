import { NextResponse } from 'next/server';
import { checkPassword, makeToken, COOKIE } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ok = await checkPassword(String(body?.password ?? ''));
    if (ok === null) {
      return NextResponse.json({
        ok: false,
        error: 'No admin password has been set. In Supabase → SQL Editor run: insert into settings (key, value) values (\'admin_password\', \'your-password\') on conflict (key) do update set value = excluded.value;',
      }, { status: 503 });
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
