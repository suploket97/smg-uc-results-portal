import { NextResponse } from 'next/server';
import { UserError } from './db';
import { buildState } from './repo';

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
