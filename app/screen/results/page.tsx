'use client';
import { Stage, POLL_MS } from '@/components/Stage';
import { useAppState } from '@/lib/client';
import type { Standing } from '@/lib/types';

function Table({ rows, fontSize }: { rows: Standing[]; fontSize: number }) {
  return (
    <table className="std" style={{ fontSize }}>
      <thead><tr><th className="num">#</th><th>No.</th><th>Team</th><th className="num">Score</th><th className="num">Correct</th><th className="num">Time (s)</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.qualified ? 'q' : ''}>
            <td className="num">{r.rank ?? ''}</td>
            <td><span className="team-no">{r.teamNo}</span></td>
            <td style={{ fontWeight: 700 }}>{r.team}</td>
            <td className="num">{r.score ?? ''}</td>
            <td className="num">{r.correctAnswers ?? ''}</td>
            <td className="num">{r.timeOnCorrect ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ResultsScreen() {
  const { state, offline } = useAppState({ poll: POLL_MS });
  const p = state?.bracket?.placings;
  const done = !!p?.champion;
  const name = (id: number | null | undefined) => (id == null || !state ? 'TBD' : state.teamNames[id]);
  const st = state?.standings ?? [];
  const perCol = done ? 7 : 16;
  const shown = st.slice(0, perCol * 2);
  const colA = shown.slice(0, perCol);
  const colB = shown.slice(perCol);

  return (
    <Stage state={state} title="RESULTS" offline={offline}>
      {done && (
        <div className="podium" style={{ height: 400 }}>
          <div className="pod second"><div className="place">RUNNER-UP</div><div className="name">{name(p!.runnerUp)}</div></div>
          <div className="pod first"><div className="place">CHAMPION</div><div className="name">{name(p!.champion)}</div></div>
          <div className="pod third"><div className="place">THIRD PLACE</div><div className="name">{p!.third ? name(p!.third) : '—'}</div></div>
        </div>
      )}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: done ? 430 : 0 }}>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 34, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 6 }}>
          QUALIFYING STANDINGS
          {st.length > shown.length && <span style={{ fontSize: 22 }}> · top {shown.length} of {st.length}</span>}
        </div>
        {st.length === 0 ? <div className="muted" style={{ fontSize: 30 }}>No standings imported yet</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: colB.length ? '1fr 1fr' : '1fr', gap: 48, alignItems: 'start' }}>
            <Table rows={colA} fontSize={done ? 23 : 26} />
            {colB.length > 0 && <Table rows={colB} fontSize={done ? 23 : 26} />}
          </div>
        )}
      </div>
    </Stage>
  );
}
