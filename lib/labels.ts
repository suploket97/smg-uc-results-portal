// Labels shown in the app. English only; text typed by users may be Thai.
import type { RoundKey } from './bracket';

export const ROUND_EN: Record<RoundKey, string> = {
  R16: 'Round of 16',
  QF: 'Quarterfinal',
  SF: 'Semifinal',
  '3RD': 'Third place',
  F: 'Final',
};

/** e.g. "QF2" → { en: "Quarterfinal 2" } */
export function matchLabel(round: RoundKey, index: number): { en: string } {
  if (round === 'F' || round === '3RD') return { en: ROUND_EN[round] };
  return { en: `${ROUND_EN[round]} ${index + 1}` };
}

export const L = {
  team: 'Team',
  teams: 'Teams',
  score: 'Score',
  rank: 'Rank',
  slot: 'Slot',
  bye: 'BYE',
  vs: 'VS',
  nextMatch: 'Next match',
  champion: 'Champion',
  runnerUp: 'Runner-up',
  third: 'Third place',
  draw: 'Draw',
  bracket: 'Bracket',
  results: 'Results',
  qualifying: 'Qualifying',
  suddenDeath: 'Sudden Death',
  walkover: 'Walkover',
  winner: 'Winner',
  qualified: 'Qualified',
  save: 'Save',
  cancel: 'Cancel',
  tbd: 'TBD',
  teamNo: 'Team No.',
  disqualification: 'Disqualification',
  scoreAtTime: 'Score at time',
  drawnBy: 'Drawn by',
  place: 'Place',
};

export const DECIDED_BY: Record<'score' | 'sudden_death' | 'walkover' | 'disqualification', { en: string; rule?: string }> = {
  score: { en: 'Score at time' },
  sudden_death: { en: 'Sudden Death' },
  walkover: { en: 'Walkover', rule: '2.6' },
  disqualification: { en: 'Disqualification', rule: '10' },
};

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDate(date: string | null | undefined): string {
  if (!date) return '';
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
