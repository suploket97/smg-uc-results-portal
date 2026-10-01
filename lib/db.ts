import { Pool, PoolClient, types } from 'pg';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

// bigint/numeric come back as strings by default; our values are small.
types.setTypeParser(20, (v: string) => Number(v)); // int8
types.setTypeParser(1700, (v: string) => parseFloat(v)); // numeric
types.setTypeParser(1082, (v: string) => v); // date → 'YYYY-MM-DD'

/**
 * The connection string. DATABASE_URL if set; otherwise the names the Vercel ↔ Supabase
 * integration creates (POSTGRES_URL is the pooled one, which suits serverless functions).
 */
export const DB_ENV_NAMES = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING'] as const;

export function databaseUrl(): { name: string; value: string } | null {
  for (const name of DB_ENV_NAMES) {
    const value = process.env[name];
    if (value) return { name, value };
  }
  return null;
}

function makePool(): Pool {
  const found = databaseUrl();
  if (!found) throw new Error('No database connection string. Set DATABASE_URL (or connect Supabase in Vercel, which sets POSTGRES_URL).');
  const url = new URL(found.value);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname) || process.env.DATABASE_SSL === 'disable';
  // Supabase needs SSL; its certificate chain isn't in Node's default store.
  // The integration's URLs also carry options meant for other clients.
  for (const k of ['sslmode', 'supa', 'pgbouncer', 'connection_limit']) url.searchParams.delete(k);
  return new Pool({
    connectionString: url.toString(),
    ssl: local ? undefined : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
  });
}

const g = globalThis as unknown as { __samaggiPool?: Pool };

export function pool(): Pool {
  if (!g.__samaggiPool) g.__samaggiPool = makePool();
  return g.__samaggiPool;
}

// ------------------------------------------------------------------ self-setup

let schemaReady: Promise<void> | null = null;

/** Creates or upgrades the tables once per server start. Cheap after the first time. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) schemaReady = migrate().catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

/**
 * The portal's tables and one column each that only the portal's version has.
 * If a table with the same name is already there without that column, it belongs
 * to another app that shares the database, and the portal must not touch it.
 */
export const OWN_TABLES: Record<string, string> = {
  settings: 'value', event: 'qualifier_count', suc_competitions: 'qualifier_count', uploads: 'sheet_name',
  qualifying_rows: 'upload_id', teams: 'qualifying_row_id', draws: 'bracket_size', draw_placements: 'pick_order',
  match_results: 'sudden_death', match_edits: 'old_value',
};

/** Names of tables that exist in the database but are not the portal's. */
export async function foreignTables(c: { query: PoolClient['query'] }): Promise<string[]> {
  const { rows } = await c.query(
    `select table_name, column_name from information_schema.columns
     where table_schema = current_schema() and table_name = any(string_to_array($1, ','))`,
    [Object.keys(OWN_TABLES).join(',')],
  );
  const cols = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!cols.has(r.table_name)) cols.set(r.table_name, new Set());
    cols.get(r.table_name)!.add(r.column_name);
  }
  return Object.entries(OWN_TABLES).filter(([t, col]) => cols.has(t) && !cols.get(t)!.has(col)).map(([t]) => t);
}

async function migrate(): Promise<void> {
  const c = await pool().connect();
  try {
    // two steps: a query that names a missing table fails before it runs
    const has = await c.query(`select to_regclass('public.settings') is not null as ok`);
    if (has.rows[0]?.ok) {
      const cur = await c.query(`select value from settings where key = 'schema_version'`);
      if (cur.rows[0]?.value === SCHEMA_VERSION) return;
    }
    await c.query('begin');
    await c.query('select pg_advisory_xact_lock(724001)'); // one server at a time
    const clash = await foreignTables(c);
    if (clash.length) {
      throw new Error(
        `This database already has ${clash.length === 1 ? 'a table' : 'tables'} named ${clash.map((t) => `"${t}"`).join(', ')} that ` +
        `belong${clash.length === 1 ? 's' : ''} to another app. The portal did not change anything. Connect a Supabase project of its own (see README).`,
      );
    }
    await c.query(SCHEMA_SQL);
    await c.query(
      `insert into settings (key, value) values ('schema_version', $1)
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [SCHEMA_VERSION],
    );
    await c.query('commit');
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await pool().query(sql, params as any[]);
  return res.rows as T[];
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const c = await pool().connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** An error whose message is safe to show the admin. */
export class UserError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(message: string, status = 400, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
