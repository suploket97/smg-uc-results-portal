import { NextResponse } from 'next/server';
import { checkPassword, makeToken, COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({
      ok: false,
      error: 'ADMIN_PASSWORD is not set on the server. Add it in Vercel → Settings → Environment Variables, then redeploy. Check /setup-check.',
    }, { status: 500 });
  }
  const body = await req.json().catch(() => ({}));
  if (!checkPassword(String(body?.password ?? ''))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return NextResponse.json({ ok: false, error: 'Wrong password' }, { status: 401 });
  }
  const { value, maxAge } = await makeToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, value, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge,
  });
  return res;
}
