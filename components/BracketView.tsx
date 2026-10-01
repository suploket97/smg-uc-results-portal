'use client';
import type { Bracket, BracketMatch, Source } from '@/lib/bracket';
import type { AppState } from '@/lib/types';
import { ROUND_EN, L } from '@/lib/labels';

interface Box { x: number; y: number; w: number; h: number }

function sourceText(src: Source, isBye: boolean): string {
  if (isBye) return 'BYE';
  if (src.kind === 'slot') return '—';
  return src.kind === 'winner' ? `Winner ${src.code}` : `Loser ${src.code}`;
}

/** Shrinks long names so they fit the card instead of being cut off. */
function fitFont(text: string, base: number, width: number): number {
  const units = [...text].reduce((n, ch) => n + (/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(ch) ? 0 : 0.58), 0);
  return Math.max(Math.round(base * 0.62), Math.min(base, Math.floor(width / Math.max(1, units))));
}

function Card({ m, box, rowH, font, state, isNext }: {
  m: BracketMatch; box: Box; rowH: number; font: number; state: AppState; isNext: boolean;
}) {
  const done = m.status === 'done';
  const nameW = box.w - 32 - (done ? font * 2.2 : 0) - (done && (m.result?.suddenDeath || m.result?.walkover) ? 50 : 0);
  const rows = [
    { team: m.teamA, bye: m.aIsBye, src: m.sourceA, score: m.result?.scoreA },
    { team: m.teamB, bye: m.bIsBye, src: m.sourceB, score: m.result?.scoreB },
  ];
  return (
    <>
    <span className={`bk-code ${isNext ? 'next' : ''}`} style={{ left: box.x + 4, top: box.y - 26 }}>{m.code}{isNext ? ' · NEXT' : ''}</span>
    <div className={`bk-card ${isNext ? 'next' : ''}`} style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
      {rows.map((r, i) => {
        const win = (done || m.status === 'bye') && r.team != null && m.winner === r.team;
        const lose = done && r.team != null && m.loser === r.team;
        const cls = r.bye ? 'bye' : r.team == null ? 'tbd' : win ? 'win' : lose ? 'lose' : '';
        const label = r.team != null ? state.teamNames[r.team] : sourceText(r.src, r.bye);
        const no = r.team != null ? state.teamNos?.[r.team] : undefined;
        return (
          <div key={i} className={`bk-row ${cls}`} style={{ height: rowH, fontSize: r.team != null ? fitFont(label, font, nameW - (no ? font * 1.5 : 0)) : font * 0.8 }}>
            {no && <span className="bk-no" style={{ fontSize: font * 0.8 }}>{no}</span>}
            <span className="bk-name">{label}</span>
            {done && win && m.result?.suddenDeath && <span className="bk-tag">SD</span>}
            {done && win && m.result?.walkover && <span className="bk-tag">W/O</span>}
            {done && lose && m.result?.disqualification && <span className="bk-tag">DQ</span>}
            <span className="bk-score" style={{ fontSize: font * 1.25 }}>{done && !m.result?.walkover ? r.score ?? '' : ''}</span>
          </div>
        );
      })}
    </div>
    </>
  );
}

/** Symmetric bracket: left half → final ← right half, third-place match under the final. */
export function BracketView({ bracket, state, width, height }: { bracket: Bracket; state: AppState; width: number; height: number }) {
  const size = bracket.size;
  const R = Math.log2(size);
  const sideRounds = R - 1;
  const cols = 2 * sideRounds + 1;
  const colW = width / cols;
  const labelH = 64;
  const top = labelH + 10;
  const areaH = height - top;
  const firstPerSide = size / 4;
  const rowH = Math.max(40, Math.min(70, Math.floor(areaH / Math.max(1, firstPerSide) / 2 - 18)));
  const font = Math.min(32, Math.round(rowH * 0.46));
  const cardW = Math.min(colW - 22, 400);

  const byRound: BracketMatch[][] = [];
  for (const m of bracket.matches) {
    if (m.round === '3RD') continue;
    (byRound[m.roundNo] ||= []).push(m);
  }
  const boxes = new Map<string, Box>();
  const labels: { x: number; round: keyof typeof ROUND_EN }[] = [];

  for (let r = 0; r < sideRounds; r++) {
    const ms = byRound[r];
    const half = ms.length / 2;
    ms.forEach((m, g) => {
      const left = g < half;
      const j = left ? g : g - half;
      const col = left ? r : cols - 1 - r;
      const cy = top + (j + 0.5) * (areaH / half);
      boxes.set(m.code, { x: col * colW + (colW - cardW) / 2, y: cy - rowH, w: cardW, h: rowH * 2 });
    });
    labels.push({ x: r * colW, round: ms[0].round }, { x: (cols - 1 - r) * colW, round: ms[0].round });
  }
  const fRowH = Math.round(rowH * 1.25);
  const fW = Math.min(colW - 16, 420);
  const fcx = Math.floor(cols / 2) * colW + colW / 2;
  const fcy = top + areaH / 2;
  boxes.set('F', { x: fcx - fW / 2, y: fcy - fRowH, w: fW, h: fRowH * 2 });
  const third = bracket.matches.find((m) => m.code === '3RD');
  if (third) boxes.set('3RD', { x: fcx - cardW / 2, y: Math.min(fcy + fRowH + 120, top + areaH - rowH * 2), w: cardW, h: rowH * 2 });

  // connector lines
  const paths: { d: string; lit: boolean }[] = [];
  for (const m of bracket.matches) {
    if (m.round === '3RD' || m.code === 'F') continue;
    const target = bracket.matches.find((t) => t.round !== '3RD' &&
      [t.sourceA, t.sourceB].some((s) => s.kind === 'winner' && s.code === m.code));
    if (!target) continue;
    const a = boxes.get(m.code)!;
    const b = boxes.get(target.code)!;
    const leftSide = a.x < b.x;
    const x1 = leftSide ? a.x + a.w : a.x;
    const y1 = a.y + a.h / 2;
    const x2 = leftSide ? b.x : b.x + b.w;
    const isA = target.sourceA.kind === 'winner' && target.sourceA.code === m.code;
    const y2 = target.code === 'F' ? b.y + b.h / 2 : b.y + (isA ? b.h / 4 : (3 * b.h) / 4);
    const xm = (x1 + x2) / 2;
    paths.push({ d: `M${x1},${y1} H${xm} V${y2} H${x2}`, lit: m.winner != null && (m.status === 'done' || m.status === 'bye') });
  }

  const nextCode = bracket.nextCode;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      {labels.map((l, i) => (
        <div key={i} className="bk-round-label" style={{ left: l.x, top: 0, width: colW }}>
          {ROUND_EN[l.round]}
        </div>
      ))}
      <div className="bk-round-label" style={{ left: fcx - colW / 2, top: 0, width: colW, color: 'var(--accent)' }}>
        {ROUND_EN.F}
      </div>
      <svg className="bk-lines" width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
        {paths.map((p, i) => <path key={i} d={p.d} className={p.lit ? 'lit' : ''} />)}
      </svg>
      {bracket.matches.map((m) => {
        const box = boxes.get(m.code);
        if (!box) return null;
        const big = m.code === 'F';
        return (
          <Card key={m.code} m={m} box={box} rowH={big ? fRowH : rowH} font={big ? Math.round(font * 1.2) : font}
            state={state} isNext={m.code === nextCode} />
        );
      })}
      {third && boxes.get('3RD') && (
        <div className="bk-round-label" style={{ left: fcx - colW / 2, top: boxes.get('3RD')!.y - 84, width: colW }}>
          {ROUND_EN['3RD']}
        </div>
      )}
      {bracket.placings.champion && (
        <div className="bk-round-label" style={{ left: fcx - colW / 2, top: boxes.get('F')!.y - 70, width: colW, color: 'var(--accent-2)', fontSize: 30 }}>
          🏆 {state.teamNames[bracket.placings.champion]}
        </div>
      )}
    </div>
  );
}

export function nextMatchText(bracket: Bracket | null, state: AppState): string | null {
  if (!bracket?.nextCode) return null;
  const m = bracket.matches.find((x) => x.code === bracket.nextCode)!;
  return `${state.teamNames[m.teamA!]} ${L.vs} ${state.teamNames[m.teamB!]}`;
}
