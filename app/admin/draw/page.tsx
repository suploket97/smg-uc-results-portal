'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell, Loading, useToast } from '@/components/AdminShell';
import { useAppState, post, teamName, teamLabel, teamNo } from '@/lib/client';
import { bracketSize, byeSlotsFor, firstRoundCode, slotLabel } from '@/lib/bracket';
import { fmtTime, L } from '@/lib/labels';
import type { AppState, DrawInfo } from '@/lib/types';

function SlotGrid({ draw, state, fresh }: { draw: DrawInfo; state: AppState; fresh?: number }) {
  const bySlot = new Map(draw.placements.map((p) => [p.slot, p]));
  const byes = new Set(draw.byeSlots);
  const matches = [];
  for (let s = 1; s <= draw.bracketSize; s += 2) matches.push([s, s + 1]);
  return (
    <div className="slots">
      {matches.map(([a, b]) => (
        <div key={a} className="slot-match">
          <div className="code">{firstRoundCode(draw.bracketSize, a)}</div>
          {[a, b].map((s) => {
            const p = bySlot.get(s);
            const cls = byes.has(s) ? 'bye' : p ? 'filled' : '';
            return (
              <div key={s} className={`slot-line ${cls} ${p && p.pickOrder === fresh ? 'new' : ''}`}>
                <span className="n">{s % 2 ? 'A' : 'B'}</span>
                {p && teamNo(state, p.teamId) && <span className="team-no">{teamNo(state, p.teamId)}</span>}
                <span>{byes.has(s) ? L.bye : p ? (teamName(state, p.teamId) || p.teamName) : <span className="dim">—</span>}</span>
                {p && <span className="spacer" />}
                {p && <span className="chip">#{p.pickOrder}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function DrawAdminPage() {
  const { state, setState, error } = useAppState({ admin: true, poll: 4000 });
  const [teamId, setTeamId] = useState<string>('');
  const [slot, setSlot] = useState<string>('');
  const [drawnBy, setDrawnBy] = useState('');
  const [place, setPlace] = useState('');
  const [placeDirty, setPlaceDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const draw = state?.draw ?? null;
  const placedTeams = new Set(draw?.placements.map((p) => p.teamId));
  const placedSlots = new Set(draw?.placements.map((p) => p.slot));
  const remaining = state?.teams.filter((t) => t.selected && !placedTeams.has(t.id)) ?? [];
  const openSlots = draw?.playableSlots.filter((s) => !placedSlots.has(s)) ?? [];
  const nextSlot = openSlots[0];

  // default the slot picker to the next empty slot
  useEffect(() => { if (!placeDirty) setPlace(draw?.place ?? ''); }, [draw?.place, draw?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!slot || !openSlots.includes(Number(slot))) setSlot(nextSlot ? String(nextSlot) : '');
    if (teamId && !remaining.some((t) => String(t.id) === teamId)) setTeamId('');
  }, [nextSlot, openSlots.join(','), remaining.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <AdminShell state={null}><Loading error={error} /></AdminShell>;

  async function act(body: Record<string, unknown>, okMsg?: string) {
    setBusy(true);
    const r = await post('/api/admin/draw', body);
    setBusy(false);
    if (r.ok && r.state) { setState(r.state); if (okMsg) toast.show(okMsg); return r.state; }
    toast.show(r.error || 'Error', 'err');
    return null;
  }

  const selected = state.teams.filter((t) => t.selected);
  const n = selected.length;
  const sizeOk = n >= 2 && n <= 16;
  const lastPick = draw?.placements[draw.placements.length - 1];
  const resultsEntered = state.bracket?.matches.filter((m) => m.status === 'done').length ?? 0;

  async function redo() {
    if (resultsEntered > 0) {
      const typed = prompt(`${resultsEntered} match results exist. They will be archived and a fresh bracket started.\n\nType REDO to confirm`);
      if (typed?.trim().toUpperCase() !== 'REDO') return;
    } else if (!confirm('Redo the draw? The current draw is kept in history.')) return;
    await act({ action: 'redo', confirm: true }, 'Archived. Start a new draw.');
  }

  return (
    <AdminShell state={state}>
      {!draw && (
        <div className="card stack">
          <h1>Draw</h1>
          <p>
            Ticked teams: <b className="w">{n}</b>
            {sizeOk && <> → {bracketSize(n)}-slot bracket{byeSlotsFor(n).length > 0 && <>, {byeSlotsFor(n).length} byes ({byeSlotsFor(n).map((s) => slotLabel(bracketSize(n), s)).join(', ')})</>}</>}
          </p>
          {n !== state.event.qualifierCount && (
            <div className="notice warn">{n} teams ticked, qualifier count is {state.event.qualifierCount}. <Link href="/admin/teams">Check teams</Link></div>
          )}
          {!sizeOk && <div className="notice err">Tick between 2 and 16 teams first.</div>}
          <p className="muted small">Mode: <b>{state.event.drawMode === 'manual' ? 'Manual (lots from a box)' : 'On-screen random'}</b> — <Link href="/admin/setup">change</Link></p>
          <label className="field"><span>{L.place} (F2)</span>
            <input type="text" value={place} placeholder="e.g. Great Hall" onChange={(e) => { setPlace(e.target.value); setPlaceDirty(true); }} />
          </label>
          <button className="btn-primary btn-big" disabled={!sizeOk || busy} onClick={async () => { if (await act({ action: 'start', place }, 'Draw started')) setPlaceDirty(false); }}>
            Start the draw
          </button>
          <p className="small muted">Open the <Link href="/screen/draw" target="_blank">draw screen ↗</Link> on the projector first.</p>
        </div>
      )}

      {draw && (
        <div className="card stack">
          <div className="row">
            <h1 style={{ margin: 0 }}>Draw</h1>
            <div className="spacer" />
            {draw.status === 'locked' ? <span className="chip green">Locked</span> : <span className="chip amber">Open</span>}
          </div>
          <p className="muted">
            {draw.mode === 'manual' ? 'Manual' : 'Random'} · {draw.placements.length}/{draw.teamCount} teams
            {draw.byeSlots.length > 0 && <> · byes: {draw.byeSlots.map((s) => slotLabel(draw.bracketSize, s)).join(', ')}</>}
          </p>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: 1, minWidth: 0 }}><span>{L.place} (F2)</span>
              <input type="text" value={place} onChange={(e) => { setPlace(e.target.value); setPlaceDirty(true); }} />
            </label>
            {placeDirty && <button className="btn-sm" disabled={busy} onClick={async () => { if (await act({ action: 'details', place }, 'Saved')) setPlaceDirty(false); }}>Save</button>}
          </div>

          {draw.status === 'open' && remaining.length > 0 && draw.mode === 'manual' && (
            <div className="card stack" style={{ background: 'var(--bg)' }}>
              <h3>Lot #{draw.placements.length + 1}</h3>
              <label className="field"><span>{L.team}</span>
                <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">— choose team —</option>
                  {remaining.map((t) => <option key={t.id} value={t.id}>{t.teamNo ? `${t.teamNo} · ` : ''}{t.name}</option>)}
                </select>
              </label>
              <label className="field"><span>{L.slot}</span>
                <select value={slot} onChange={(e) => setSlot(e.target.value)}>
                  {openSlots.map((s) => (
                    <option key={s} value={s}>{slotLabel(draw.bracketSize, s)}</option>
                  ))}
                </select>
              </label>
              <label className="field"><span>{L.drawnBy} <span className="dim">(optional)</span></span>
                <input type="text" value={drawnBy} onChange={(e) => setDrawnBy(e.target.value)} />
              </label>
              <button className="btn-primary btn-big" disabled={busy || !teamId || !slot}
                onClick={async () => {
                  const t = remaining.find((x) => String(x.id) === teamId);
                  if (await act({ action: 'place', teamId: Number(teamId), slot: Number(slot), drawnBy }, `${t?.name} → ${slotLabel(draw.bracketSize, Number(slot))}`)) setTeamId('');
                }}>
                Reveal on screen
              </button>
            </div>
          )}

          {draw.status === 'open' && remaining.length > 0 && draw.mode === 'random' && (
            <div className="stack">
              <button className="btn-primary btn-big" style={{ minHeight: 88, fontSize: '1.4rem' }} disabled={busy}
                onClick={() => act({ action: 'random', drawnBy })}>
                Draw next team
              </button>
              <p className="small muted">Picks one of the remaining teams at random for the next empty slot ({nextSlot ? slotLabel(draw.bracketSize, nextSlot) : ''}).</p>
              <label className="field"><span>{L.drawnBy} <span className="dim">(who pressed it, optional)</span></span>
                <input type="text" value={drawnBy} onChange={(e) => setDrawnBy(e.target.value)} />
              </label>
            </div>
          )}

          {draw.status === 'open' && (
            <div className="row">
              {remaining.length === 0 && (
                <button className="btn-primary" disabled={busy} onClick={() => act({ action: 'lock' }, 'Draw locked')}>
                  Lock the draw
                </button>
              )}
              {lastPick && (
                <button className="btn-ghost" disabled={busy}
                  onClick={() => confirm(`Undo the last placement: ${teamName(state, lastPick.teamId)} (${slotLabel(draw.bracketSize, lastPick.slot)})?`) && act({ action: 'undo' }, 'Undone')}>
                  ↶ Undo last
                </button>
              )}
            </div>
          )}
          {draw.status === 'locked' && (
            <div className="notice ok">Locked {fmtTime(draw.lockedAt)}. Enter scores on <Link href="/admin/matches">Matches</Link>.</div>
          )}

          <SlotGrid draw={draw} state={state} fresh={lastPick?.pickOrder} />

          <div className="row" style={{ marginTop: 18 }}>
            <div className="spacer" />
            <button className="btn-sm btn-danger" disabled={busy} onClick={redo}>Redo draw</button>
          </div>
        </div>
      )}

      {(state.admin?.history.length ?? 0) > 0 && (
        <div className="card">
          <h3>Earlier draws</h3>
          {state.admin!.history.map((h) => (
            <details key={h.id} style={{ marginBottom: 8 }}>
              <summary>Draw #{h.id} · {fmtTime(h.createdAt)} · {h.placements.length}/{h.teamCount} · {h.resultCount} results · archived {fmtTime(h.archivedAt)}</summary>
              <ol className="small">
                {h.placements.map((p) => <li key={p.pickOrder}>{slotLabel(h.bracketSize, p.slot)} · {teamLabel(state, p.teamId) || p.teamName} <span className="muted">({p.method}{p.drawnBy ? `, ${p.drawnBy}` : ''})</span></li>)}
              </ol>
            </details>
          ))}
        </div>
      )}
      {toast.node}
    </AdminShell>
  );
}
