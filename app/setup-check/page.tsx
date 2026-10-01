'use client';
import { useEffect, useState } from 'react';

interface Check { name: string; ok: boolean; detail: string }

export default function SetupCheck() {
  const [data, setData] = useState<{ ok: boolean; checks: Check[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/setup-check', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setErr('The server did not answer. Check the latest deployment in Vercel.'));
  }, []);
  return (
    <main className="admin-main" style={{ paddingTop: 32 }}>
      <h1>Setup check</h1>
      <p className="muted small">What the server can see. No passwords are shown.</p>
      {err && <div className="notice err">{err}</div>}
      {!data && !err && <p className="muted">Checking…</p>}
      {data && (
        <div className="card stack">
          {data.checks.map((c) => (
            <div key={c.name} className="row" style={{ alignItems: 'flex-start' }}>
              <span className={`chip ${c.ok ? 'green' : 'red'}`}>{c.ok ? 'OK' : 'Fix'}</span>
              <div style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b><div className="small muted" style={{ overflowWrap: 'anywhere' }}>{c.detail}</div></div>
            </div>
          ))}
          {data.ok
            ? <div className="notice ok">Everything is ready. <a href="/admin">Go to the admin pages</a>.</div>
            : <div className="notice warn">After changing an environment variable in Vercel, redeploy (Deployments → ⋯ → Redeploy) for it to take effect.</div>}
        </div>
      )}
    </main>
  );
}
