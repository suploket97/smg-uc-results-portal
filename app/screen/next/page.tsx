'use client';
import { Stage, POLL_MS } from '@/components/Stage';
import { useAppState } from '@/lib/client';
import { matchLabel } from '@/lib/labels';

export default function NextMatchScreen() {
  const { state, offline } = useAppState({ poll: POLL_MS });
  const b = state?.bracket ?? null;
  const next = b?.nextCode ? b.matches.find((m) => m.code === b.nextCode) : null;
  const last = b?.matches
    .filter((m) => m.status === 'done' && m.result?.updatedAt)
    .sort((x, y) => (x.result!.updatedAt! < y.result!.updatedAt! ? 1 : -1))[0];
  const name = (id: number | null | undefined) => (id == null || !state ? '' : state.teamNames[id]);
  const no = (id: number | null | undefined) => (id == null || !state ? '' : state.teamNos?.[id] ?? '');
  const fit = (s: string) => (s.length > 22 ? 64 : s.length > 14 ? 78 : 96);

  return (
    <Stage state={state} title="NEXT MATCH" offline={offline}>
      {next ? (
        <div className="nm">
          <div className="round">{matchLabel(next.round, next.index).en.toUpperCase()}</div>
          <div className="teams">
            <div className="team" style={{ fontSize: fit(name(next.teamA)) }}>{no(next.teamA) && <div className="nm-no">{no(next.teamA)}</div>}{name(next.teamA)}</div>
            <div className="vs">VS</div>
            <div className="team" style={{ fontSize: fit(name(next.teamB)) }}>{no(next.teamB) && <div className="nm-no">{no(next.teamB)}</div>}{name(next.teamB)}</div>
          </div>
          {last?.result && (
            <div className="meta">
              Last result — {last.code}: {name(last.teamA)} {last.result.walkover ? 'W/O' : `${last.result.scoreA ?? '–'}–${last.result.scoreB ?? '–'}`}{last.result.suddenDeath ? ' (SD)' : ''}{last.result.disqualification ? ' (DQ)' : ''} {name(last.teamB)}
            </div>
          )}
        </div>
      ) : b?.placings.champion ? (
        <div className="nm">
          <div className="round">CHAMPION</div>
          <div className="team" style={{ fontSize: 130, color: 'var(--accent-2)', marginTop: 50 }}>{name(b.placings.champion)}</div>
        </div>
      ) : (
        <div className="stage-empty"><div>
          <div className="big">{state?.draw?.status === 'locked' ? 'COMING UP' : 'WAITING FOR THE DRAW'}</div>
          {state?.draw?.status === 'locked' ? 'The next match will appear here' : 'Matches appear once the draw is locked'}
        </div></div>
      )}
    </Stage>
  );
}
