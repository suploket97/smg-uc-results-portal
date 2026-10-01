'use client';
import { Stage, POLL_MS } from '@/components/Stage';
import { BracketView } from '@/components/BracketView';
import { useAppState } from '@/lib/client';
import { matchLabel, L } from '@/lib/labels';

export default function BracketScreen() {
  const { state, offline } = useAppState({ poll: POLL_MS });
  const b = state?.bracket ?? null;
  const next = b?.nextCode ? b.matches.find((m) => m.code === b.nextCode) : null;
  const W = 1792;
  const H = 828;
  const bannerH = 96;

  return (
    <Stage state={state} title="BRACKET" offline={offline}>
      {!state || !b || !state.draw ? (
        <div className="stage-empty"><div><div className="big">WAITING FOR THE DRAW</div>The bracket appears once the draw starts</div></div>
      ) : (
        <>
          <BracketView bracket={b} state={state} width={W} height={H - bannerH - 16} />
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: bannerH, borderRadius: 18,
            background: 'var(--bg-2)', border: '2px solid var(--line)', display: 'flex', alignItems: 'center', gap: 28, padding: '0 32px',
          }}>
            {next ? (
              <>
                <span style={{ fontFamily: 'var(--font-head)', fontSize: 44, color: 'var(--accent)', letterSpacing: '0.06em' }}>NEXT MATCH</span>
                <span style={{ fontSize: 28, color: 'var(--muted)' }}>{matchLabel(next.round, next.index).en}</span>
                <span style={{ marginLeft: 'auto', fontSize: 44, fontWeight: 800 }}>
                  {state.teamNames[next.teamA!]} <span style={{ fontFamily: 'var(--font-head)', color: 'var(--accent)', margin: '0 18px' }}>VS</span> {state.teamNames[next.teamB!]}
                </span>
              </>
            ) : b.placings.champion ? (
              <>
                <span style={{ fontFamily: 'var(--font-head)', fontSize: 44, color: 'var(--accent)' }}>CHAMPION</span>
                <span style={{ marginLeft: 'auto', fontSize: 48, fontWeight: 800, color: 'var(--accent-2)' }}>{state.teamNames[b.placings.champion]}</span>
              </>
            ) : (
              <span style={{ fontSize: 32, color: 'var(--muted)' }}>
                {state.draw.status !== 'locked' ? 'Draw in progress' : 'Waiting for results'}
              </span>
            )}
          </div>
        </>
      )}
    </Stage>
  );
}
