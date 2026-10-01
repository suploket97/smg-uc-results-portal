// Admin sign-in. The password can come from either place:
//   1. the ADMIN_PASSWORD environment variable (if set), or
//   2. the `settings` table in Supabase, so no Vercel setting is needed:
//        insert into settings (key, value) values ('admin_password', 'your-password')
//        on conflict (key) do update set value = excluded.value;
//      A plain password typed there is replaced by a salted hash at the first sign-in.
// Server only (uses the database).
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { query } from './db';
import { COOKIE } from './cookie';

export { COOKIE };
const MAX_AGE_S = 60 * 60 * 24 * 3; // 3 days covers a competition weekend

async function getSetting(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>('select value from settings where key = $1', [key]);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await query(
    'insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()',
    [key, value],
  );
}

let cachedSecret: string | null = null;

/** Secret for signing the sign-in cookie: env if given, otherwise one random value kept in the database. */
async function secret(): Promise<string> {
  const env = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (env) return `suc:${env}`;
  if (cachedSecret) return cachedSecret;
  let s = await getSetting('session_secret');
  if (!s) {
    await query(
      `insert into settings (key, value) values ('session_secret', $1) on conflict (key) do nothing`,
      [randomBytes(32).toString('hex')],
    );
    s = await getSetting('session_secret');
  }
  cachedSecret = `suc:${s}`;
  return cachedSecret;
}

function sign(data: string, key: string): string {
  return createHmac('sha256', key).update(data).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(pw, salt, 32).toString('hex')}`;
}

function matchesHash(pw: string, stored: string): boolean {
  const [, salt, hex] = stored.split('$');
  if (!salt || !hex) return false;
  return safeEqual(scryptSync(pw, salt, 32).toString('hex'), hex);
}

export type PasswordSource = 'env' | 'database' | 'none';

export async function passwordSource(): Promise<PasswordSource> {
  if (process.env.ADMIN_PASSWORD) return 'env';
  try {
    return (await getSetting('admin_password')) ? 'database' : 'none';
  } catch {
    return 'none';
  }
}

/** true = correct, false = wrong, null = no password has been set anywhere. */
export async function checkPassword(input: string): Promise<boolean | null> {
  const pw = input.trim(); // ignore stray spaces from copy and paste
  const env = process.env.ADMIN_PASSWORD;
  if (env) return safeEqual(pw, env.trim());
  const stored = await getSetting('admin_password');
  if (!stored) return null;
  if (stored.startsWith('scrypt$')) return matchesHash(pw, stored);
  // plain password typed into the settings table: compare, then store it hashed
  const ok = safeEqual(pw, stored.trim());
  if (ok) await setSetting('admin_password', hashPassword(stored.trim()));
  return ok;
}

export async function changePassword(current: string, next: string): Promise<string | null> {
  if (process.env.ADMIN_PASSWORD) return 'The password is set by the ADMIN_PASSWORD environment variable, so it cannot be changed here.';
  const ok = await checkPassword(current);
  if (!ok) return 'Current password is wrong.';
  if (next.trim().length < 8) return 'Use at least 8 characters.';
  await setSetting('admin_password', hashPassword(next.trim()));
  return null;
}

export async function makeToken(): Promise<{ value: string; maxAge: number }> {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE_S);
  return { value: `${exp}.${sign(exp, await secret())}`, maxAge: MAX_AGE_S };
}

export async function verifyToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  try {
    return safeEqual(sig, sign(exp, await secret()));
  } catch {
    return false;
  }
}

export function readCookie(req: Request, name = COOKIE): string | null {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export async function isAdmin(req: Request): Promise<boolean> {
  return verifyToken(readCookie(req));
}
