import { Pool, PoolClient, types } from 'pg';

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

export async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query(sql, params as any[]);
  return res.rows as T[];
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
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
