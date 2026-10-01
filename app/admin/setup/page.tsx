'use client';
import { useEffect, useState } from 'react';
import { AdminShell, Loading, useToast } from '@/components/AdminShell';
import { useAppState, post } from '@/lib/client';
import type { AppState, EventInfo } from '@/lib/types';

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

function fmtDate(d: string | null) {
  if (!d) return 'No date';
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Every competition (for example one per year). Nothing is deleted when a new one starts. */
function CompetitionsCard({ state, onState, toast }: {
  state: AppState; onState: (s: AppState) => void; toast: ReturnType<typeof useToast>;
}) {
  const list = state.admin?.competitions ?? [];
  const [name, setName] = useState(state.event.name);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true);
    const r = await post('/api/admin/competition', body);
    setBusy(false);
    if (r.ok && r.state) { onState(r.state); toast.show(done); }
    else toast.show(r.error || 'Error', 'err');
    return r.ok;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const ok = confirm(
      `Start a new competition?\n\nThe admin pages and the big screens switch to "${name.trim() || state.event.name}", with no teams, draw or results yet.\n\n"${state.event.name}" (${fmtDate(state.event.date)}) stays saved. You can open it again here at any time.`,
    );
    if (!ok) return;
    if (await act({ action: 'create', name, date }, 'New competition started')) setDate('');
  }

  return (
    <div className="card stack">
      <h2>Competitions</h2>
      <p className="small muted">
        Each competition keeps its own teams, draw, results, edit log and forms. Starting a new one keeps all earlier ones.
        The admin pages and the big screens always work on the <b>current</b> one.
      </p>
      <div className="comp-list">
        {list.map((c) => (
          <div key={c.id} className={`comp-item${c.current ? ' on' : ''}`}>
            <div className="row">
              <b>{c.name}</b>
              {c.current && <span className="chip amber">Current</span>}
              <span className="spacer" />
              <span className="small muted">{fmtDate(c.date)}</span>
            </div>
            <div className="small muted">
              {c.teamCount} qualified · {c.resultCount} results{c.champion ? <> · Champion: <b style={{ color: 'var(--text)' }}>{c.champion}</b></> : null}
            </div>
            <div className="row">
              <a className="btn btn-sm" href={`/print?c=${c.id}`} target="_blank" rel="noreferrer">Forms (PDF)</a>
              <a className="btn btn-sm" href={`/api/admin/export?c=${c.id}`}>Excel</a>
              <a className="btn btn-sm btn-ghost" href={`/screen/results?c=${c.id}`} target="_blank" rel="noreferrer">Results screen ↗</a>
            </div>
            {!c.current && (
              <div className="row">
                  <button type="button" className="btn-sm" disabled={busy}
                    onClick={() => {
                      if (confirm(`Make "${c.name}" (${fmtDate(c.date)}) the current competition?\n\nThe admin pages and the big screens switch to it.`)) {
                        act({ action: 'switch', id: c.id }, `Now working on ${c.name}`);
                      }
                    }}>Make current</button>
                  <button type="button" className="btn-sm btn-danger" disabled={busy}
                    onClick={() => {
                      const typed = prompt(`Delete "${c.name}" (${fmtDate(c.date)}) for good, with its teams, draws, results and edit log?\n\nThis cannot be undone. Download the Excel file first if you may need it.\n\nType the competition name to confirm:`);
                      if (typed != null) act({ action: 'delete', id: c.id, confirmName: typed }, 'Competition deleted');
                    }}>Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <form className="stack comp-new" onSubmit={create}>
        <h3>Start a new competition</h3>
        <p className="small muted">For next year&apos;s event. The number of qualifiers and the draw mode are copied from the current one.</p>
        <label className="field"><span>Event name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field"><span>Date (optional)</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn-primary" disabled={busy}>Start a new competition</button>
      </form>
    </div>
  );
}

export default function SetupPage() {
  const { state, setState, error } = useAppState({ admin: true });
  const [f, setF] = useState<EventInfo | null>(null);
  const [fid, setFid] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  // load the form again when another competition becomes current
  useEffect(() => {
    if (state && (!f || fid !== state.competition.id)) { setF(state.event); setFid(state.competition.id); }
  }, [state, f, fid]);
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
        <p className="small muted">Settings of the current competition. To start next year&apos;s event, see <b>Competitions</b> below.</p>
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
      <CompetitionsCard state={state} onState={setState} toast={toast} />
      <PasswordCard toast={toast} />
      {toast.node}
    </AdminShell>
  );
}
