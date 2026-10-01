// Pure bracket logic. No database, no React — easy to test.
//
// Slots are numbered 1..size (top to bottom of the first round).
// First-round match i (0-based) takes slots 2i+1 and 2i+2.
// Byes go where the lowest "virtual seeds" would sit, so they are spread
// across both halves of the bracket (e.g. 6 teams in 8 slots → QF1 and QF4).

export type RoundKey = 'R16' | 'QF' | 'SF' | 'F' | '3RD';

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 16;

export type Source =
  | { kind: 'slot'; slot: number }
  | { kind: 'winner'; code: string }
  | { kind: 'loser'; code: string };

export interface MatchResult {
  code: string;
  teamAId: number;
  teamBId: number;
  scoreA: number | null;
  scoreB: number | null;
  suddenDeath: boolean;
  walkover: boolean;
  /** F3 "Disqualification (10)" */
  disqualification: boolean;
  winnerId: number;
  /** F3 details (all optional) */
  sdQuestion: number | null;
  startTime: string | null;
  endTime: string | null;
  lastQuestion: number | null;
  f4Entries: string | null;
  updatedAt?: string;
}

export type DecidedBy = 'score' | 'sudden_death' | 'walkover' | 'disqualification';

export function decidedBy(r: Pick<MatchResult, 'suddenDeath' | 'walkover' | 'disqualification'>): DecidedBy {
  if (r.walkover) return 'walkover';
  if (r.disqualification) return 'disqualification';
  if (r.suddenDeath) return 'sudden_death';
  return 'score';
}

export type MatchStatus = 'waiting' | 'ready' | 'done' | 'bye' | 'void';

export interface BracketMatch {
  code: string;
  round: RoundKey;
  roundNo: number; // 0 = first round; 3RD shares the final's roundNo
  index: number; // position within its round, 0-based
  sourceA: Source;
  sourceB: Source;
  teamA: number | null;
  teamB: number | null;
  aIsBye: boolean;
  bIsBye: boolean;
  status: MatchStatus;
  result: MatchResult | null;
  winner: number | null;
  loser: number | null;
}

export interface Bracket {
  size: number;
  teamCount: number;
  byeSlots: number[];
  matches: BracketMatch[];
  nextCode: string | null;
  placings: { champion: number | null; runnerUp: number | null; third: number | null };
  /** Stored results that no longer fit the bracket (teams changed upstream). */
  staleCodes: string[];
}

export function bracketSize(teamCount: number): number {
  if (!Number.isInteger(teamCount) || teamCount < MIN_TEAMS || teamCount > MAX_TEAMS) {
    throw new Error(`Team count must be between ${MIN_TEAMS} and ${MAX_TEAMS}`);
  }
  let s = 2;
  while (s < teamCount) s *= 2;
  return s;
}

/** Seed number sitting in each slot (index 0 = slot 1). Seed 1 top, seed 2 bottom. */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const m = order.length * 2;
    const next: number[] = [];
    order.forEach((s, i) => {
      const pair = [s, m + 1 - s];
      next.push(...(i % 2 === 0 ? pair : pair.reverse()));
    });
    order = next;
  }
  return order;
}

export function byeSlotsFor(teamCount: number): number[] {
  const size = bracketSize(teamCount);
  const order = seedOrder(size);
  const out: number[] = [];
  order.forEach((seed, i) => {
    if (seed > teamCount) out.push(i + 1);
  });
  return out;
}

/** Non-bye slots in top-to-bottom order: the order the random draw fills them. */
export function playableSlots(teamCount: number): number[] {
  const size = bracketSize(teamCount);
  const byes = new Set(byeSlotsFor(teamCount));
  const out: number[] = [];
  for (let s = 1; s <= size; s++) if (!byes.has(s)) out.push(s);
  return out;
}

function roundKeyFor(matchesInRound: number): RoundKey {
  switch (matchesInRound) {
    case 8: return 'R16';
    case 4: return 'QF';
    case 2: return 'SF';
    case 1: return 'F';
    default: throw new Error('Unsupported bracket size');
  }
}

export function matchCode(round: RoundKey, index: number): string {
  if (round === 'F') return 'F';
  if (round === '3RD') return '3RD';
  if (round === 'R16') return `R16-${index + 1}`;
  return `${round}${index + 1}`;
}

/** Skeleton of all matches, in order of play. */
export function bracketSkeleton(size: number): Omit<BracketMatch,
  'teamA' | 'teamB' | 'aIsBye' | 'bIsBye' | 'status' | 'result' | 'winner' | 'loser'>[] {
  const out: ReturnType<typeof bracketSkeleton> = [];
  let count = size / 2;
  let roundNo = 0;
  let prev: string[] = [];
  let sfCodes: string[] = [];
  while (count >= 1) {
    const round = roundKeyFor(count);
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = matchCode(round, i);
      codes.push(code);
      const sourceA: Source = roundNo === 0 ? { kind: 'slot', slot: 2 * i + 1 } : { kind: 'winner', code: prev[2 * i] };
      const sourceB: Source = roundNo === 0 ? { kind: 'slot', slot: 2 * i + 2 } : { kind: 'winner', code: prev[2 * i + 1] };
      if (round === 'F' && sfCodes.length === 2) {
        // third-place match is played before the final
        out.push({
          code: '3RD', round: '3RD', roundNo, index: 0,
          sourceA: { kind: 'loser', code: sfCodes[0] },
          sourceB: { kind: 'loser', code: sfCodes[1] },
        });
      }
      out.push({ code, round, roundNo, index: i, sourceA, sourceB });
    }
    if (round === 'SF') sfCodes = codes;
    prev = codes;
    count /= 2;
    roundNo++;
  }
  return out;
}

export function computeBracket(
  teamCount: number,
  placements: Record<number, number | undefined>, // slot → team id
  results: MatchResult[],
): Bracket {
  const size = bracketSize(teamCount);
  const byeSlots = byeSlotsFor(teamCount);
  const byes = new Set(byeSlots);
  const resultByCode = new Map(results.map((r) => [r.code, r]));
  const byCode = new Map<string, BracketMatch>();
  const matches: BracketMatch[] = [];
  const staleCodes: string[] = [];

  const resolve = (src: Source): { team: number | null; isBye: boolean } => {
    if (src.kind === 'slot') {
      if (byes.has(src.slot)) return { team: null, isBye: true };
      return { team: placements[src.slot] ?? null, isBye: false };
    }
    const m = byCode.get(src.code)!;
    if (src.kind === 'winner') return { team: m.winner, isBye: m.status === 'void' };
    // loser of a bye match is "nobody": that side is a bye too
    return { team: m.loser, isBye: m.status === 'bye' || m.status === 'void' };
  };

  for (const sk of bracketSkeleton(size)) {
    const a = resolve(sk.sourceA);
    const b = resolve(sk.sourceB);
    const m: BracketMatch = {
      ...sk,
      teamA: a.team, teamB: b.team, aIsBye: a.isBye, bIsBye: b.isBye,
      status: 'waiting', result: null, winner: null, loser: null,
    };
    const stored = resultByCode.get(sk.code) ?? null;

    if (a.isBye && b.isBye) {
      m.status = 'void';
    } else if (a.isBye || b.isBye) {
      m.status = 'bye';
      m.winner = a.isBye ? b.team : a.team;
    } else if (m.teamA != null && m.teamB != null) {
      if (stored && stored.teamAId === m.teamA && stored.teamBId === m.teamB &&
          (stored.winnerId === m.teamA || stored.winnerId === m.teamB)) {
        m.status = 'done';
        m.result = stored;
        m.winner = stored.winnerId;
        m.loser = stored.winnerId === m.teamA ? m.teamB : m.teamA;
      } else {
        m.status = 'ready';
      }
    }
    if (stored && m.status !== 'done') staleCodes.push(sk.code);
    byCode.set(sk.code, m);
    matches.push(m);
  }

  const next = matches.find((m) => m.status === 'ready') ?? null;
  const final = byCode.get('F')!;
  const third = byCode.get('3RD');
  return {
    size,
    teamCount,
    byeSlots,
    matches,
    nextCode: next ? next.code : null,
    placings: {
      champion: final.status === 'done' ? final.winner : null,
      runnerUp: final.status === 'done' ? final.loser : null,
      third: third && (third.status === 'done' || third.status === 'bye') ? third.winner : null,
    },
    staleCodes,
  };
}

/** Every match that depends (directly or not) on the given match. */
export function downstreamOf(size: number, code: string): string[] {
  const sk = bracketSkeleton(size);
  const out = new Set<string>();
  const queue = [code];
  while (queue.length) {
    const c = queue.shift()!;
    for (const m of sk) {
      const feeds = [m.sourceA, m.sourceB].some((s) => s.kind !== 'slot' && s.code === c);
      if (feeds && !out.has(m.code)) {
        out.add(m.code);
        queue.push(m.code);
      }
    }
  }
  return sk.map((m) => m.code).filter((c) => out.has(c));
}

// ---------------------------------------------------------------- results

export interface ResultInput {
  scoreA: number | string | null | undefined;
  scoreB: number | string | null | undefined;
  suddenDeath?: boolean;
  walkover?: boolean;
  disqualification?: boolean;
  winnerId?: number | null;
  sdQuestion?: number | string | null;
  startTime?: string | null;
  endTime?: string | null;
  lastQuestion?: number | string | null;
  f4Entries?: string | null;
}

function toScore(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) return NaN;
  return n;
}

function toTime(v: unknown): string | null | false {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return false;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/**
 * Checks a score entry and works out the winner. Mirrors F3 "Decided by".
 * - Walkover or Disqualification: a winner must be chosen; scores are optional (score at the time).
 * - Otherwise both scores are required. A tie needs Sudden Death ticked and a winner chosen.
 * - With Sudden Death ticked the chosen winner counts (default: higher score).
 */
export function validateResult(
  input: ResultInput,
  teamA: number,
  teamB: number,
): { ok: true; value: Omit<MatchResult, 'code'> } | { ok: false; error: string } {
  const walkover = !!input.walkover;
  const disqualification = !walkover && !!input.disqualification;
  const suddenDeath = !walkover && !disqualification && !!input.suddenDeath;
  const scoreA = toScore(input.scoreA);
  const scoreB = toScore(input.scoreB);
  const sdQ = toScore(input.sdQuestion);
  const lastQ = toScore(input.lastQuestion);
  const startTime = toTime(input.startTime);
  const endTime = toTime(input.endTime);
  const f4Entries = String(input.f4Entries ?? '').trim().slice(0, 200) || null;
  const chosen = input.winnerId ?? null;
  if (chosen !== null && chosen !== teamA && chosen !== teamB) {
    return { ok: false, error: 'Winner must be one of the two teams' };
  }
  if (Number.isNaN(scoreA) || Number.isNaN(scoreB)) {
    return { ok: false, error: 'Scores must be whole numbers' };
  }
  if (Number.isNaN(sdQ) || (sdQ !== null && sdQ < 1) || Number.isNaN(lastQ) || (lastQ !== null && lastQ < 0)) {
    return { ok: false, error: 'Question numbers must be whole numbers' };
  }
  if (startTime === false || endTime === false) {
    return { ok: false, error: 'Enter times like 14:05' };
  }
  const details = {
    sdQuestion: suddenDeath ? sdQ : null, startTime, endTime, lastQuestion: lastQ, f4Entries,
  };
  if (walkover || disqualification) {
    if (chosen === null) {
      return { ok: false, error: walkover ? 'Choose the winner of the walkover' : 'Choose the winner (the other team was disqualified)' };
    }
    return { ok: true, value: {
      teamAId: teamA, teamBId: teamB, scoreA: walkover ? null : scoreA, scoreB: walkover ? null : scoreB,
      suddenDeath: false, walkover, disqualification, winnerId: chosen, ...details,
    } };
  }
  if (scoreA === null || scoreB === null) {
    return { ok: false, error: 'Enter both scores' };
  }
  let winnerId: number | null;
  if (scoreA === scoreB) {
    if (!suddenDeath) return { ok: false, error: 'A tie needs Sudden Death and a chosen winner' };
    if (chosen === null) return { ok: false, error: 'Choose the Sudden Death winner' };
    winnerId = chosen;
  } else if (suddenDeath && chosen !== null) {
    winnerId = chosen;
  } else {
    winnerId = scoreA > scoreB ? teamA : teamB;
  }
  return { ok: true, value: {
    teamAId: teamA, teamBId: teamB, scoreA, scoreB, suddenDeath, walkover: false, disqualification: false, winnerId, ...details,
  } };
}

/** First-round match a slot belongs to, e.g. slot 5 in an 8-slot bracket → "QF3". */
export function firstRoundCode(size: number, slot: number): string {
  const count = size / 2;
  return matchCode(roundKeyFor(count), Math.ceil(slot / 2) - 1);
}

/** F2 slot name, e.g. slot 5 → "QF3-A", slot 6 → "QF3-B". */
export function slotLabel(size: number, slot: number): string {
  return `${firstRoundCode(size, slot)}-${slot % 2 === 1 ? 'A' : 'B'}`;
}
