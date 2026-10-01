'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AdminShell, Loading, useToast } from '@/components/AdminShell';
import { useAppState, post } from '@/lib/client';
import type { Team } from '@/lib/types';

function NoInput({ team, onSave }: { team: Team; onSave: (no: string) => void }) {
  const [v, setV] = useState(team.teamNo ?? '');
  const [prev, setPrev] = useState(team.teamNo ?? '');
  if ((team.teamNo ?? '') !== prev) { setPrev(team.teamNo ?? ''); setV(team.teamNo ?? ''); }
  const commit = () => { if (v.trim() !== (team.teamNo ?? '')) onSave(v.trim()); };
  return (
    <input type="text" inputMode="numeric" className="no-input" value={v} placeholder="No." aria-label="Team No."
      onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

function NameInput({ team, disabled, onSave }: { team: Team; disabled?: boolean; onSave: (name: string) => void }) {
  const [v, setV] = useState(team.name);
  const [prev, setPrev] = useState(team.name);
  if (team.name !== prev) { setPrev(team.name); setV(team.name); }
  const commit = () => { if (v.trim() && v.trim() !== team.name) onSave(v.trim()); else setV(team.name); };
  return (
    <input type="text" value={v} disabled={disabled} aria-label="Team name"
      onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

export default function TeamsPage() {
  const { state, setState, error } = useAppState({ admin: true });
  const [names, setNames] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!state) return <AdminShell state={null}><Loading error={error} /></AdminShell>;

  const locked = !!state.draw && state.draw.placements.length > 0;
  const selected = state.teams.filter((t) => t.selected).length;
  const target = state.event.qualifierCount;

  async function act(body: Record<string, unknown>, okMsg?: string) {
    setBusy(true);
    const r = await post('/api/admin/teams', body);
    setBusy(false);
    if (r.ok && r.state) { setState(r.state); if (okMsg) toast.show(okMsg); return true; }
    toast.show(r.error || 'Error', 'err');
    return false;
  }

  return (
    <AdminShell state={state}>
      <div className="card stack">
        <h1>Qualified teams</h1>
        <div className="row">
          <span className="stat">{selected}</span>
          <span className="muted">teams ticked · qualifier count is {target}</span>
        </div>
        {selected !== target && (
          <div className="notice warn">
            {selected} teams are ticked but the qualifier count is {target}.
            {' '}Check for a tie at the cut, or change the count in <Link href="/admin/setup">Setup</Link>.
          </div>
        )}
        {locked && <div className="notice info">The draw has started: only names can be changed. Use &quot;Redo draw&quot; to change the list.</div>}
        {state.draw && !locked && <div className="notice info small">An empty draw is open; changing the list discards it.</div>}

        {state.teams.length === 0 && <p className="muted">No teams yet. <Link href="/admin/import">Import a file</Link> or type names below.</p>}
        <div>
          {state.teams.map((t) => (
            <div key={t.id} className="team-row">
              <label className="check" title="Qualified">
                <input type="checkbox" checked={t.selected} disabled={locked || busy}
                  onChange={(e) => act({ action: 'select', id: t.id, selected: e.target.checked })} />
              </label>
              <div className="name-cell">
                <NoInput team={t} onSave={(teamNo) => act({ action: 'number', id: t.id, teamNo }, 'Team No. saved')} />
                <NameInput team={t} onSave={(name) => act({ action: 'rename', id: t.id, name }, 'Renamed')} />
                <div className="meta" style={{ gridColumn: '1 / -1' }}>
                  {t.source === 'import' ? `#${t.qualRank ?? '–'} · ${t.qualScore ?? '–'} pts` : 'Added by hand'}
                </div>
              </div>
              {t.source === 'manual'
                ? <button className="btn-sm btn-danger" disabled={locked || busy} onClick={() => act({ action: 'remove', id: t.id })} aria-label={`Remove ${t.name}`}>Remove</button>
                : <span />}
            </div>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h2>Add teams by hand</h2>
        <p className="small muted">Fallback when the import isn&apos;t used. One team per line; start with the Team No. if you have it.</p>
        <textarea value={names} disabled={locked} onChange={(e) => setNames(e.target.value)} placeholder={'7 Oxford Siam\n12 Cambridge Thai'} />
        <div className="row">
          <button className="btn-primary" disabled={locked || busy || !names.trim()}
            onClick={async () => { if (await act({ action: 'add', names: names.split('\n') }, 'Added')) setNames(''); }}>
            Add
          </button>
          <div className="spacer" />
          {state.teams.length > 0 && (
            <button className="btn-sm btn-danger" disabled={locked || busy}
              onClick={() => confirm('Remove every team from the list?') && act({ action: 'clearAll' }, 'Cleared')}>
              Clear all
            </button>
          )}
        </div>
      </div>
      {toast.node}
    </AdminShell>
  );
}
