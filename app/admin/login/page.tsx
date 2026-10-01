'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : { error: 'Network error' };
    setBusy(false);
    if (res?.ok) {
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.href = next && next.startsWith('/') ? next : '/admin';
    } else setErr(j.error || `Login failed: the server returned an error (${res?.status ?? 'no response'}). Open /setup-check to see what is missing.`);
  }

  return (
    <div className="login-wrap">
      <form className="card stack" onSubmit={submit}>
        <h1>Admin</h1>
        <p className="muted small">Samaggi University Challenge — Results Portal</p>
        <label className="field">
          <span>Password</span>
          <input type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {err && <div className="notice err">{err}</div>}
        <button className="btn-primary btn-big" disabled={busy || !pw}>{busy ? '…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
