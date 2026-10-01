import { NextResponse } from 'next/server';
import { UserError } from './db';
import { buildState } from './repo';

/** ?c=<id> picks a competition other than the current one (read-only views). */
export function viewParam(req: Request): number | null {
  const v = new URL(req.url).searchParams.get('c');
  const n = v ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}
import { isAdmin } from './auth';

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Runs an admin action, then returns the fresh admin state (or a readable error). */
export async function adminAction(fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    return json({ ok: true, result: result ?? null, state: await buildState(true) });
  } catch (e) {
    return errorResponse(e);
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof UserError) return json({ ok: false, error: e.message, ...(e.extra ?? {}) }, e.status);
  console.error(e);
  const msg = e instanceof Error ? e.message : String(e);
  return json({ ok: false, error: `Server error: ${msg}` }, 500);
}

/** Returns a 401 response unless the request carries a valid sign-in cookie. */
export async function requireAdmin(req: Request) {
  if (await isAdmin(req)) return null;
  return json({ ok: false, error: 'Not signed in', needsLogin: true }, 401);
}
