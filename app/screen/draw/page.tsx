'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage } from '@/components/Stage';
import { useAppState, post } from '@/lib/client';
import { firstRoundCode, slotLabel } from '@/lib/bracket';
import { matchLabel } from '@/lib/labels';
import type { AppState, Placement } from '@/lib/types';

// Reveal timelines (ms).
// Random draw: names spin first, because the computer is doing the drawing.
// Lots from a box: no spin. The room has already heard the lot read out, so the
// name appears straight away with its slot, then drops into the bracket.
const TIMELINE = {
  random: { spin: 1900, slot: 2700, out: 6200, end: 6700 },
  manual: { spin: 0, slot: 500, out: 3300, end: 3800 },
} as const;

type Phase = 'spin' | 'land' | 'slot' | 'out';

function roundOfSlot(size: number, slot: number) {
  const code = firstRoundCode(size, slot);
  const round = size === 2 ? 'F' : size === 4 ? 'SF' : size === 8 ? 'QF' : 'R16';
  const idx = Math.ceil(slot / 2) - 1;
  return { code, label: matchLabel(round as 'F' | 'SF' | 'QF' | 'R16', idx) };
}

export default function DrawScreen() {
  const { state, offline, reload } = useAppState({ poll: 1200 });
  const [controls, setControls] = useState(false);
  const [queue, setQueue] = useState<Placement[]>([]);
  const [current, setCurrent] = useState<{ p: Placement; phase: Phase; spinName: string } | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const seen = useRef<{ drawId: number | null; max: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { setControls(new URLSearchParams(window.location.search).get('controls') === '1'); }, []);

  // detect new placements
  useEffect(() => {
    if (!state) return;
    const d = state.draw;
    const max = d ? Math.max(0, ...d.placements.map((p) => p.pickOrder)) : 0;
    const id = d?.id ?? null;
    if (!seen.current || seen.current.drawId !== id) {
      seen.current = { drawId: id, max }; // first load or a new draw: show what's there, no animation
      setQueue([]);
      setCurrent(null);
      return;
    }
    if (max > seen.current.max) {
      const fresh = d!.placements.filter((p) => p.pickOrder > seen.current!.max).sort((a, b) => a.pickOrder - b.pickOrder);
      setQueue((q) => [...q, ...fresh]);
    } else if (max < seen.current.max) {
      // an undo: drop anything queued that no longer exists
      setQueue((q) => q.filter((p) => p.pickOrder <= max));
    }
    seen.current.max = max;
  }, [state]);

  // run the reveal for the head of the queue
  const stateRef = useRef(state);
  stateRef.current = state;
  const head = queue[0];
  useEffect(() => {
    const st = stateRef.current;
    if (!head || !st?.draw) return;
    const p = head;
    const placedBefore = new Set(st.draw.placements.filter((x) => x.pickOrder < p.pickOrder).map((x) => x.teamId));
    const pool = st.teams.filter((t) => t.selected && !placedBefore.has(t.id)).map((t) => t.name);
    if (!pool.length) pool.push(p.teamName);
    const t = TIMELINE[p.method === 'random' ? 'random' : 'manual'];
    let spin: ReturnType<typeof setInterval> | undefined;
    if (t.spin > 0) {
      setCurrent({ p, phase: 'spin', spinName: pool[0] });
      let i = 0;
      spin = setInterval(() => {
        i++;
        setCurrent((c) => (c && c.phase === 'spin' ? { ...c, spinName: pool[i % pool.length] } : c));
      }, 85);
    } else {
      setCurrent({ p, phase: 'land', spinName: p.teamName });
    }
    const timers = [
      ...(t.spin > 0 ? [setTimeout(() => { clearInterval(spin); setCurrent((c) => c && { ...c, phase: 'land' }); }, t.spin)] : []),
      setTimeout(() => setCurrent((c) => c && { ...c, phase: 'slot' }), t.slot),
      setTimeout(() => setCurrent((c) => c && { ...c, phase: 'out' }), t.out),
      setTimeout(() => { setFresh(p.pickOrder); setCurrent(null); setQueue((q) => q.slice(1)); }, t.end),
    ];
    return () => { if (spin) clearInterval(spin); timers.forEach(clearTimeout); setCurrent(null); };
  }, [head?.pickOrder, head?.slot, head?.teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const drawNext = useCallback(async () => {
    if (busy || current || queue.length) return;
    setBusy(true);
    const r = await post('/api/admin/draw', { action: 'random' });
    setBusy(false);
    if (!r.ok) setMsg(r.error || 'Error');
    else { setMsg(null); reload(); }
  }, [busy, current, queue.length, reload]);

  useEffect(() => {
    if (!controls) return;
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); drawNext(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controls, drawNext]);

  const d = state?.draw ?? null;
  const hidden = new Set([...queue.map((p) => p.pickOrder), ...(current && current.phase !== 'out' ? [current.p.pickOrder] : [])]);
  const visible = d ? d.placements.filter((p) => !hidden.has(p.pickOrder)) : [];
  const shownCount = visible.length;

  return (
    <Stage
      state={state} title="THE DRAW" offline={offline}
      right={d ? <span style={{ fontFamily: 'var(--font-head)', fontSize: 64, color: 'var(--accent)' }}>{shownCount}<span style={{ color: 'var(--dim)' }}> / {d.teamCount}</span></span> : undefined}
    >
      {!d ? (
        <div className="stage-empty"><div><div className="big">THE DRAW STARTS SOON</div>Teams appear here as they are drawn</div></div>
      ) : (
        <SlotBoard state={state!} visible={visible} fresh={fresh} />
      )}

      {current && d && (
        <div className={`dr-overlay ${current.phase === 'out' ? 'out' : ''}`}>
          <div className="dr-pick">DRAW #{current.p.pickOrder}</div>
          {current.phase !== 'spin' && state?.teamNos[current.p.teamId] && (
            <div className="dr-no">TEAM NO. {state.teamNos[current.p.teamId]}</div>
          )}
          <div className={`dr-name ${current.phase === 'spin' ? 'spin' : 'land'}`}>
            {current.phase === 'spin' ? current.spinName : current.p.teamName}
          </div>
          <div className={`dr-slot ${current.phase === 'slot' || current.phase === 'out' ? 'show' : ''}`}>
            {(() => {
              const r = roundOfSlot(d.bracketSize, current.p.slot);
              const lbl = slotLabel(d.bracketSize, current.p.slot);
              return <>{lbl}<span className="sub">{r.label.en} · side {current.p.slot % 2 ? 'A' : 'B'}</span></>;
            })()}
          </div>
        </div>
      )}

      {controls && d?.status === 'open' && d.mode === 'random' && (
        <div className="dr-controls">
          {msg && <span className="offline">{msg}</span>}
          <button className="btn-primary" disabled={busy || !!current || queue.length > 0 || d.placements.length >= d.teamCount} onClick={drawNext}>
            Draw next team
          </button>
        </div>
      )}
    </Stage>
  );
}

function SlotBoard({ state, visible, fresh }: { state: AppState; visible: Placement[]; fresh: number | null }) {
  const d = state.draw!;
  const size = d.bracketSize;
  const bySlot = new Map(visible.map((p) => [p.slot, p]));
  const byes = new Set(d.byeSlots);
  const matches: number[] = [];
  for (let s = 1; s <= size; s += 2) matches.push(s);
  const half = Math.max(1, matches.length / 2);
  const cols = size === 2 ? [matches] : [matches.slice(0, half), matches.slice(half)];
  const perCol = cols[0].length;
  const rowH = Math.min(104, Math.floor((828 - perCol * 64) / perCol / 2));
  const font = Math.round(rowH * 0.46);

  return (
    <div className="dr-grid" style={size === 2 ? { gridTemplateColumns: '1fr', padding: '0 400px' } : undefined}>
      {cols.map((col, ci) => (
        <div key={ci} className="dr-col">
          {col.map((s) => (
            <div key={s} className="dr-m">
              <div className="code" style={{ fontSize: Math.max(22, font * 0.6) }}>{firstRoundCode(size, s)}</div>
              {[s, s + 1].map((slot) => {
                const p = bySlot.get(slot);
                const isBye = byes.has(slot);
                return (
                  <div key={slot} className={`dr-s ${isBye ? 'bye' : p ? '' : 'empty'} ${p && p.pickOrder === fresh ? 'fresh' : ''}`}
                    style={{ height: rowH, fontSize: font }}>
                    <span className="n">{slot % 2 ? 'A' : 'B'}</span>
                    {p && state.teamNos[p.teamId] && <span className="dr-tno">{state.teamNos[p.teamId]}</span>}
                    <span className="nm2">{isBye ? 'BYE' : p ? (state.teamNames[p.teamId] ?? p.teamName) : '—'}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
