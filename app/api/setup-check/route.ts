import { query, databaseUrl, DB_ENV_NAMES, ensureSchema } from '@/lib/db';
import { passwordSource } from '@/lib/auth';
import { json } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TABLES = ['settings', 'competitions', 'event', 'uploads', 'qualifying_rows', 'teams', 'draws', 'draw_placements', 'match_results', 'match_edits'];
const V2_COLUMNS: [string, string][] = [['competitions', 'f1'], ['draws', 'competition_id'], ['teams', 'team_no'], ['match_results', 'disqualification']];

// Public, but reveals no secrets: only whether each setting is present and whether the database answers.
export async function GET() {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const found = databaseUrl();
  const url = found?.value;
  let urlOk = false;
  let urlDetail = `Missing. Set DATABASE_URL to the Supabase "Transaction pooler" connection string (port 6543), or connect Supabase in Vercel (it sets POSTGRES_URL). Looked for: ${DB_ENV_NAMES.join(', ')}.`;
  if (url) {
    try {
      const u = new URL(url);
      urlOk = true;
      const ref = u.hostname.includes('supabase') ? (decodeURIComponent(u.username).split('.')[1] || u.hostname.split('.')[1] || '') : '';
      urlDetail = `Using ${found!.name} (host ${u.hostname}, port ${u.port || '5432'}${ref ? `, Supabase project ref ${ref}` : ''})`;
      if (url.includes('[YOUR-PASSWORD]')) { urlOk = false; urlDetail = 'Still contains [YOUR-PASSWORD]. Put the database password in its place.'; }
      else if (u.hostname.startsWith('db.') && u.hostname.endsWith('.supabase.co')) {
        urlDetail += '. This is the direct connection, which Vercel often cannot reach (IPv6). Use the Transaction pooler string instead.';
      }
    } catch { urlDetail = 'Not a valid URL. If the password has special characters (@ : / # ?), URL-encode them.'; }
  }
  checks.push({ name: 'Database connection string', ok: urlOk, detail: urlDetail });

  if (urlOk) {
    try {
      await ensureSchema(); // creates or upgrades the tables if needed
      checks.push({ name: 'Database connection', ok: true, detail: 'Connected; tables created or upgraded if they were missing' });
      const rows = await query<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema = 'public' and table_name = any(string_to_array($1, ','))`, [TABLES.join(',')],
      );
      const have = new Set(rows.map((r) => r.table_name));
      const missing = TABLES.filter((t) => !have.has(t));
      checks.push({
        name: 'Tables', ok: missing.length === 0,
        detail: missing.length ? `Missing: ${missing.join(', ')}. Run supabase/schema.sql in the Supabase SQL Editor (it only adds what is missing).` : 'All present',
      });
      if (!missing.length) {
        const cols = await query<{ table_name: string; column_name: string }>(
          `select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name = any(string_to_array($1, ','))`,
          [V2_COLUMNS.map((c) => c[1]).join(',')],
        );
        const lacking = V2_COLUMNS.filter(([t, c]) => !cols.some((r) => r.table_name === t && r.column_name === c));
        checks.push({
          name: 'Latest columns (v2)', ok: lacking.length === 0,
          detail: lacking.length ? 'Missing. Run supabase/schema.sql again; it only adds what is missing.' : 'Present',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      let hint = '';
      if (/password authentication failed/i.test(msg)) hint = ' The database password in DATABASE_URL is wrong.';
      else if (/ENOTFOUND|getaddrinfo/i.test(msg)) hint = ' The host name is wrong, or it is the direct (IPv6) host. Use the Transaction pooler string.';
      else if (/Tenant or user not found/i.test(msg)) hint = ' The user name must look like postgres.<project-ref> for the pooler.';
      else if (/timeout|ETIMEDOUT|ECONNREFUSED/i.test(msg)) hint = ' The database did not answer. If the Supabase project is paused, restore it in the dashboard.';
      checks.push({ name: 'Database connection', ok: false, detail: `${msg}.${hint}` });
    }
  }
  const src = urlOk ? await passwordSource() : (process.env.ADMIN_PASSWORD ? 'env' : 'none');
  checks.push({
    name: 'Admin password',
    ok: src !== 'none',
    detail: src === 'env' ? 'Set by the ADMIN_PASSWORD environment variable'
      : src === 'database' ? 'Set in the database (settings table)'
      : 'Not set yet. Open /admin/login and create it there.',
  });
  return json({ ok: checks.every((c) => c.ok), checks });
}
