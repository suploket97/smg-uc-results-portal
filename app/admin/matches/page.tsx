'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AdminShell, Loading, useToast } from '@/components/AdminShell';
import { useAppState, post, teamLabel } from '@/lib/client';
import { matchLabel, fmtTime, L, DECIDED_BY } from '@/lib/labels';
import { decidedBy, type BracketMatch } from '@/lib/bracket';
import type { AppState, MatchEdit } from '@/lib/types';

function describe(v: Record<string, unknown> | null) {
  if (!v) return '—';
  const how = v.walkover ? 'Walkover' : v.disqualification ? 'DQ' : v.suddenDeath ? `SD${v.sdQuestion ? ` Q${v.sdQuestion}` : ''}` : '';
  const score = v.walkover ? '' : `${v.scoreA ?? ''}–${v.scoreB ?? ''}`;
  return `${[score, how].filter(Boolean).join(' ')}, winner ${String(v.winner)}`;
}

type How = 'score' | 'sudden_death' | 'walkover' | 'disqualification';

function Editor({ m, state, onSaved, toast }: {
  m: BracketMatch; state: AppState; onSaved: (s: AppState) => void; toast: ReturnType<typeof useToast>;
}) {
  const r = m.result;
  const [a, setA] = useState(r?.scoreA != null ? String(r.scoreA) : '');
  const [b, setB] = useState(r?.scoreB != null ? String(r.scoreB) : '');
  const [how, setHow] = useState<How>(r ? decidedBy(r) : 'score');
  const [winner, setWinner] = useState<number | null>(r && decidedBy(r) !== 'score' ? r.winnerId : null);
  const [sdQ, setSdQ] = useState(r?.sdQuestion != null ? String(r.sdQuestion) : '');
  const [start, setStart] = useState(r?.startTime ?? '');
  const [end, setEnd] = useState(r?.endTime ?? '');
  const [lastQ, setLastQ] = useState(r?.lastQuestion != null ? String(r.lastQuestion) : '');
  const [f4, setF4] = useState(r?.f4Entries ?? '');
  const [busy, setBusy] = useState(false);
  const tA = teamLabel(state, m.teamA);
  const tB = teamLabel(state, m.teamB);
  const tie = a !== '' && b !== '' && Number(a) === Number(b);
  const needWinner = how !== 'score';

  async function send(extra: Record<string, unknown> = {}) {
    setBusy(true);
    const res = await post('/api/admin/match', {
      code: m.code, scoreA: how === 'walkover' ? '' : a, scoreB: how === 'walkover' ? '' : b,
      suddenDeath: how === 'sudden_death', walkover: how === 'walkover', disqualification: how === 'disqualification',
      winnerId: needWinner ? winner : null, sdQuestion: sdQ, startTime: start, endTime: end, lastQuestion: lastQ, f4Entries: f4,
      ...extra,
    });
    setBusy(false);
    if (res.needsConfirm) {
      if (confirm(`${res.error}\n\nContinue?`)) return send({ ...extra, confirm: true });
      return;
    }
    if (res.ok && res.state) {
      onSaved(res.state);
      const cleared: string[] = res.result?.cleared ?? [];
      toast.show(`Saved ${m.code}${cleared.length ? ` — cleared ${cleared.join(', ')}` : ''}`, cleared.length ? 'warn' : 'ok');
    } else toast.show(res.error || 'Error', 'err');
  }

  async function clear(extra: Record<string, unknown> = {}) {
    if (!extra.confirm && !confirm(`Clear the result of ${m.code}?`)) return;
    setBusy(true);
    const res = await post('/api/admin/match', { action: 'clear', code: m.code, ...extra });
    setBusy(false);
    if (res.needsConfirm) {
      if (confirm(`${res.error}\n\nContinue?`)) return clear({ confirm: true });
      return;
    }
    if (res.ok && res.state) { onSaved(res.state); toast.show(`Cleared ${(res.result?.cleared ?? []).join(', ')}`, 'warn'); }
    else toast.show(res.error || 'Error', 'err');
  }

  const edits: MatchEdit[] = (state.admin?.edits ?? []).filter((e) => e.drawId === state.draw?.id && e.code === m.code);
  const opts: How[] = ['score', 'sudden_death', 'walkover', 'disqualification'];

  return (
    <div className="match-body">
      <div className="small muted" style={{ marginTop: 12 }}>Final score{how === 'walkover' ? ' (not needed)' : how === 'disqualification' ? ' (at the time)' : ''}</div>
      <div className="score-grid" style={{ marginTop: 4 }}>
        <div className="tn"><span className="dim small">A</span> {tA}</div>
        <input type="number" inputMode="numeric" aria-label={`Score ${tA}`} value={a} disabled={how === 'walkover'} onChange={(e) => setA(e.target.value)} />
        <div className="tn"><span className="dim small">B</span> {tB}</div>
        <input type="number" inputMode="numeric" aria-label={`Score ${tB}`} value={b} disabled={how === 'walkover'} onChange={(e) => setB(e.target.value)} />
      </div>

      <div className="small muted" style={{ marginTop: 14 }}>Decided by</div>
      <div className="seg seg-wrap" style={{ marginTop: 4 }}>
        {opts.map((o) => (
          <label key={o}><input type="radio" name={`how-${m.code}`} checked={how === o} onChange={() => setHow(o)} />
            {DECIDED_BY[o].en}{DECIDED_BY[o].rule ? <small>Rule {DECIDED_BY[o].rule}</small> : null}</label>
        ))}
      </div>
      {tie && how === 'score' && <div className="notice warn small" style={{ marginTop: 8 }}>A tie needs Sudden Death and a chosen winner.</div>}
      {how === 'sudden_death' && (
        <label className="field" style={{ marginTop: 8, maxWidth: 200 }}><span>Decided on Q</span>
          <input type="number" inputMode="numeric" value={sdQ} onChange={(e) => setSdQ(e.target.value)} />
        </label>
      )}
      {needWinner && (
        <div style={{ marginTop: 8 }}>
          <div className="small muted">{how === 'disqualification' ? 'Winner (the other team was disqualified)' : L.winner}</div>
          <div className="seg" style={{ marginTop: 4 }}>
            <label><input type="radio" name={`w-${m.code}`} checked={winner === m.teamA} onChange={() => setWinner(m.teamA)} />{tA}</label>
            <label><input type="radio" name={`w-${m.code}`} checked={winner === m.teamB} onChange={() => setWinner(m.teamB)} />{tB}</label>
          </div>
        </div>
      )}

      <details className="f3-more" open={!!(r?.startTime || r?.endTime || r?.lastQuestion != null || r?.f4Entries)}>
        <summary>Details from F3 <span className="dim">(optional)</span></summary>
        <div className="grid4">
          <label className="field"><span>Start</span><input type="text" inputMode="numeric" placeholder="14:05" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="field"><span>End</span><input type="text" inputMode="numeric" placeholder="14:32" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          <label className="field"><span>Last Q</span><input type="number" inputMode="numeric" value={lastQ} onChange={(e) => setLastQ(e.target.value)} /></label>
          <label className="field"><span>F4 entry nos</span><input type="text" value={f4} onChange={(e) => setF4(e.target.value)} /></label>
        </div>
      </details>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => send()}>{busy ? '…' : L.save}</button>
        {r && <button className="btn-danger btn-sm" disabled={busy} onClick={() => clear()}>Clear</button>}
      </div>
      {edits.length > 0 && (
        <ul className="edit-log">
          {edits.map((e) => (
            <li key={e.id}>
              <b>{fmtTime(e.editedAt)}</b> · {e.action === 'create' ? 'saved' : e.action === 'update' ? 'edited' : 'cleared'}:{' '}
              {e.action === 'update' ? <>{describe(e.oldValue)} → {describe(e.newValue)}</> : e.action === 'create' ? describe(e.newValue) : describe(e.oldValue)}
              {e.note && <span className="dim"> ({e.note})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MatchesPage() {
  const { state, setState, error } = useAppState({ admin: true, poll: 8000 });
  const [open, setOpen] = useState<string | null>(null);
  const toast = useToast();
  if (!state) return <AdminShell state={null}><Loading error={error} /></AdminShell>;
  const b = state.bracket;

  if (!state.draw || state.draw.status !== 'locked' || !b) {
    return (
      <AdminShell state={state}>
        <div className="card"><h1>Matches</h1><p>Finish and lock the <Link href="/admin/draw">draw</Link> first.</p></div>
      </AdminShell>
    );
  }
  const current = open ?? b.nextCode;

  return (
    <AdminShell state={state}>
      <h1>Matches</h1>
      {b.placings.champion && (
        <div className="notice ok" style={{ marginBottom: 12 }}>
          {L.champion}: <b>{teamLabel(state, b.placings.champion)}</b> · {L.runnerUp}: {teamLabel(state, b.placings.runnerUp)}
          {b.placings.third && <> · {L.third}: {teamLabel(state, b.placings.third)}</>}
        </div>
      )}
      {b.matches.filter((m) => m.status !== 'void').map((m) => {
        const lbl = matchLabel(m.round, m.index);
        const isNext = m.code === b.nextCode;
        const canEdit = m.status === 'ready' || m.status === 'done';
        const nameA = m.aIsBye ? L.bye : m.teamA ? teamLabel(state, m.teamA) : L.tbd;
        const nameB = m.bIsBye ? L.bye : m.teamB ? teamLabel(state, m.teamB) : L.tbd;
        const wA = m.status === 'done' && m.winner === m.teamA;
        const wB = m.status === 'done' && m.winner === m.teamB;
        return (
          <div key={m.code} className={`match-item ${isNext ? 'next' : ''}`}>
            <button className="match-head" disabled={!canEdit} onClick={() => setOpen(current === m.code ? '' : m.code)} aria-expanded={current === m.code}>
              <span className="code">{m.code}</span>
              <span className="teams">
                <div className={wA ? 'w' : m.status === 'done' ? 'l' : ''}>{nameA}</div>
                <div className={wB ? 'w' : m.status === 'done' ? 'l' : ''}>{nameB}</div>
                <div className="small dim">{lbl.en}</div>
              </span>
              {m.status === 'done' && m.result && (
                <span className="sc">
                  {m.result.walkover ? <span className="chip">W/O</span> : <>{m.result.scoreA ?? '–'}<br />{m.result.scoreB ?? '–'}</>}
                  {m.result.suddenDeath && <div><span className="chip amber">SD{m.result.sdQuestion ? ` Q${m.result.sdQuestion}` : ''}</span></div>}
                  {m.result.disqualification && <div><span className="chip red">DQ</span></div>}
                </span>
              )}
              {isNext && <span className="chip amber">NEXT</span>}
              {m.status === 'bye' && <span className="chip">BYE</span>}
              {m.status === 'waiting' && <span className="chip">waiting</span>}
            </button>
            {current === m.code && canEdit && (
              <Editor key={`${m.code}-${m.result?.updatedAt ?? 'new'}-${m.teamA}-${m.teamB}`} m={m} state={state} onSaved={(s) => { setState(s); setOpen(null); }} toast={toast} />
            )}
          </div>
        );
      })}
      {toast.node}
    </AdminShell>
  );
}
