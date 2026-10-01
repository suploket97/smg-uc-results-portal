'use client';
import Link from 'next/link';
import { AdminShell, Loading } from '@/components/AdminShell';
import { useAppState, teamName } from '@/lib/client';
import { matchLabel, fmtDate, L } from '@/lib/labels';
import { Wordmark } from '@/components/Wordmark';

export default function AdminHome() {
  const { state, error } = useAppState({ admin: true, poll: 5000 });
  if (!state) return <AdminShell state={null}><Loading error={error} /></AdminShell>;

  const selected = state.teams.filter((t) => t.selected).length;
  const target = state.event.qualifierCount;
  const d = state.draw;
  const b = state.bracket;
  const played = b ? b.matches.filter((m) => m.status === 'done').length : 0;
  const total = b ? b.matches.filter((m) => m.status !== 'bye' && m.status !== 'void').length : 0;
  const next = b?.nextCode ? b.matches.find((m) => m.code === b.nextCode) : null;

  return (
    <AdminShell state={state}>
      <div className="card">
        <h1><Wordmark name={state.event.name} /></h1>
        <div className="muted">{fmtDate(state.event.date) || 'No date set'} · {state.event.drawMode === 'manual' ? 'Manual draw' : 'On-screen random draw'}</div>
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>1 · Qualifying</h3>
          {state.upload
            ? <p className="small muted">{state.upload.filename} · {state.standings.length} teams</p>
            : <p className="small muted">Not imported yet</p>}
          <div className="row"><span className="stat">{selected}</span><span className="muted">/ {target} {L.qualified}</span></div>
          {selected !== target && <div className="notice warn small" style={{ marginTop: 8 }}>Ticked teams differ from the qualifier count ({target}).</div>}
          <div className="row" style={{ marginTop: 10 }}>
            <Link className="btn btn-sm" href="/admin/import">Import</Link>
            <Link className="btn btn-sm" href="/admin/teams">Teams</Link>
          </div>
        </div>
        <div className="card">
          <h3>2 · Draw</h3>
          {!d && <p className="muted small">Not started</p>}
          {d && <p><span className="stat">{d.placements.length}</span> <span className="muted">/ {d.teamCount} · {d.status === 'locked' ? <span className="chip green">Locked</span> : <span className="chip amber">Open</span>}</span></p>}
          <Link className="btn btn-sm" href="/admin/draw">Go to draw</Link>
        </div>
        <div className="card">
          <h3>3 · Matches</h3>
          {b && d?.status === 'locked' ? (
            <>
              <p><span className="stat">{played}</span> <span className="muted">/ {total} played</span></p>
              {next && <p className="small">{L.nextMatch}: <b>{matchLabel(next.round, next.index).en}</b> — {teamName(state, next.teamA)} vs {teamName(state, next.teamB)}</p>}
              {b.placings.champion && <p className="small">{L.champion}: <b className="w">{teamName(state, b.placings.champion)}</b></p>}
            </>
          ) : <p className="muted small">Lock the draw first</p>}
          <Link className="btn btn-sm" href="/admin/matches">Enter scores</Link>
        </div>
        <div className="card">
          <h3>4 · Export</h3>
          <p className="small muted">Each form on its own, or everything at once. The Excel file is also the backup.</p>
          <table className="tbl exp">
            <tbody>
              {([['f1', 'F1 Qualifying'], ['f2', 'F2 Draw'], ['f3', 'F3 Match results'], ['all', 'All forms']] as const).map(([f, label]) => (
                <tr key={f}>
                  <td><b>{label}</b></td>
                  <td className="num">
                    <a className="btn btn-sm" href={f === 'all' ? '/print' : `/print?form=${f}`} target="_blank">PDF ↗</a>{' '}
                    <a className="btn btn-sm" href={`/api/admin/export${f === 'all' ? '' : `?form=${f}`}`}>Excel</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Big screens</h3>
        <div className="row">
          <Link className="btn btn-sm" href="/screen/draw" target="_blank">Draw ↗</Link>
          <Link className="btn btn-sm" href="/screen/bracket" target="_blank">Bracket ↗</Link>
          <Link className="btn btn-sm" href="/screen/next" target="_blank">Next match ↗</Link>
          <Link className="btn btn-sm" href="/screen/results" target="_blank">Results ↗</Link>
        </div>
      </div>
    </AdminShell>
  );
}
