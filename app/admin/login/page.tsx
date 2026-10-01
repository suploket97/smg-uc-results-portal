'use client';
import { useEffect, useState } from 'react';
import { Wordmark } from '@/components/Wordmark';

export default function LoginPage() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [setup, setSetup] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/login', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setSetup(!!j.needsSetup);
        else setErr(`${j.error ?? 'The server could not start.'} Open /setup-check for details.`);
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (setup && pw !== pw2) { setErr('The two passwords are different.'); return; }
    setBusy(true);
    setErr(null);
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw, create: setup }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : { error: 'Network error' };
    setBusy(false);
    if (res?.ok) {
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.href = next && next.startsWith('/') ? next : '/admin';
      return;
    }
    if (j.needsSetup) setSetup(true);
    else if (setup && res?.status === 409) setSetup(false);
    setErr(j.error || `Login failed: the server returned an error (${res?.status ?? 'no response'}). Open /setup-check to see what is missing.`);
  }

  return (
    <div className="login-wrap">
      <form className="card stack" onSubmit={submit}>
        <h1>{setup ? 'Create admin password' : 'Admin'}</h1>
        <p className="small"><Wordmark className="wm-sm" /> <span className="muted">· Results Portal</span></p>
        {setup && (
          <div className="notice info small">
            No admin password has been set yet. Choose one now (at least 8 characters). Everyone who runs the
            event signs in with it. You can change it later on Setup.
          </div>
        )}
        <label className="field">
          <span>{setup ? 'New password' : 'Password'}</span>
          <input type="password" autoFocus autoComplete={setup ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {setup && (
          <label className="field">
            <span>Type it again</span>
            <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </label>
        )}
        {err && <div className="notice err">{err}</div>}
        <button className="btn-primary btn-big" disabled={busy || !pw || (setup && pw.trim().length < 8)}>
          {busy ? '…' : setup ? 'Create password and sign in' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
