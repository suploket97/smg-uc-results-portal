'use client';
import { useEffect, useState } from 'react';
import { AdminShell, Loading, useToast } from '@/components/AdminShell';
import { useAppState, post } from '@/lib/client';
import type { EventInfo } from '@/lib/types';

function PasswordCard({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await post('/api/admin/password', { current, next });
    setBusy(false);
    if (r.ok) { setCurrent(''); setNext(''); toast.show('Password changed'); }
    else toast.show(r.error || 'Error', 'err');
  }
  return (
    <form className="card stack" onSubmit={save}>
      <h2>Admin password</h2>
      <p className="small muted">Stored as a hash in the database. Everyone signed in stays signed in.</p>
      <label className="field"><span>Current password</span>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="field"><span>New password (at least 8 characters)</span>
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <button className="btn-primary" disabled={busy || !current || next.trim().length < 8}>Change password</button>
    </form>
  );
}

export default function SetupPage() {
  const { state, setState, error } = useAppState({ admin: true });
  const [f, setF] = useState<EventInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { if (state && !f) setF(state.event); }, [state, f]);
  if (!state || !f) return <AdminShell state={state}><Loading error={error} /></AdminShell>;

  const drawStarted = !!state.draw;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await post('/api/admin/event', f);
    setBusy(false);
    if (r.ok && r.state) { setState(r.state); setF(r.state.event); toast.show('Saved'); }
    else toast.show(r.error || 'Error', 'err');
  }

  return (
    <AdminShell state={state}>
      <form className="card stack" onSubmit={save}>
        <h1>Event setup</h1>
        <label className="field"><span>Event name</span>
          <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="field"><span>Date</span>
          <input type="date" value={f.date ?? ''} onChange={(e) => setF({ ...f, date: e.target.value || null })} />
        </label>
        <label className="field"><span>Number of teams that qualify (2–16)</span>
          <input type="number" inputMode="numeric" min={2} max={16} value={f.qualifierCount}
            onChange={(e) => setF({ ...f, qualifierCount: Number(e.target.value) })} />
        </label>
        <div className="field">
          <span className="muted small">Draw mode</span>
          <div className="seg" style={{ marginTop: 4 }}>
            <label><input type="radio" name="mode" checked={f.drawMode === 'manual'} onChange={() => setF({ ...f, drawMode: 'manual' })} />Manual</label>
            <label><input type="radio" name="mode" checked={f.drawMode === 'random'} onChange={() => setF({ ...f, drawMode: 'random' })} />Random</label>
          </div>
          {drawStarted && <p className="small muted">A draw already in progress keeps its mode; a change applies to the next draw.</p>}
        </div>
        <button className="btn-primary btn-big" disabled={busy}>{busy ? '…' : 'Save'}</button>
      </form>
      <PasswordCard toast={toast} />
      {toast.node}
    </AdminShell>
  );
}
