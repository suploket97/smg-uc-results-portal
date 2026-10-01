import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slotLabel, bracketSize, byeSlotsFor, playableSlots, computeBracket, validateResult, downstreamOf, MatchResult, seedOrder,
} from '../lib/bracket';

function place(slots: number[], firstTeamId = 101): Record<number, number> {
  const p: Record<number, number> = {};
  slots.forEach((s, i) => { p[s] = firstTeamId + i; });
  return p;
}

/** Plays every ready match, team A wins unless `bWins` lists the code. */
function playAll(teamCount: number, placements: Record<number, number>, bWins: string[] = []) {
  const results: MatchResult[] = [];
  for (let guard = 0; guard < 40; guard++) {
    const b = computeBracket(teamCount, placements, results);
    if (!b.nextCode) return { bracket: b, results };
    const m = b.matches.find((x) => x.code === b.nextCode)!;
    const aWins = !bWins.includes(m.code);
    const v = validateResult({ scoreA: aWins ? 5 : 2, scoreB: aWins ? 3 : 4 }, m.teamA!, m.teamB!);
    assert.ok(v.ok);
    results.push({ code: m.code, ...(v as any).value });
  }
  throw new Error('did not finish');
}

test('bracket sizes', () => {
  assert.equal(bracketSize(2), 2);
  assert.equal(bracketSize(3), 4);
  assert.equal(bracketSize(6), 8);
  assert.equal(bracketSize(8), 8);
  assert.equal(bracketSize(9), 16);
  assert.equal(bracketSize(16), 16);
  assert.throws(() => bracketSize(1));
  assert.throws(() => bracketSize(17));
  assert.deepEqual(seedOrder(8), [1, 8, 5, 4, 3, 6, 7, 2]);
});

test('8 teams: no byes, QF1–QF4, SF1–SF2, 3RD, F in order of play', () => {
  assert.deepEqual(byeSlotsFor(8), []);
  const b = computeBracket(8, place(playableSlots(8)), []);
  assert.deepEqual(b.matches.map((m) => m.code), ['QF1', 'QF2', 'QF3', 'QF4', 'SF1', 'SF2', '3RD', 'F']);
  assert.equal(b.nextCode, 'QF1');
  assert.equal(b.matches[0].teamA, 101);
  assert.equal(b.matches[0].teamB, 102);
});

test('8 teams: winners advance to the Final, SF losers to the third-place match', () => {
  const placements = place(playableSlots(8)); // slots 1..8 → teams 101..108
  // QF: 101 beat 102, 104 beat 103 (B wins QF2), 105 beat 106, 107 beat 108
  // SF1: 101 v 104 → 104 wins ; SF2: 105 v 107 → 105 wins
  // 3RD: 101 v 107 → 101 ; F: 104 v 105 → 105 wins
  const { bracket, results } = playAll(8, placements, ['QF2', 'SF1', 'F']);
  const by = Object.fromEntries(bracket.matches.map((m) => [m.code, m]));
  assert.deepEqual([by.SF1.teamA, by.SF1.teamB], [101, 104]);
  assert.deepEqual([by.SF2.teamA, by.SF2.teamB], [105, 107]);
  assert.deepEqual([by['3RD'].teamA, by['3RD'].teamB], [101, 107]);
  assert.deepEqual([by.F.teamA, by.F.teamB], [104, 105]);
  assert.equal(bracket.placings.champion, 105);
  assert.equal(bracket.placings.runnerUp, 104);
  assert.equal(bracket.placings.third, 101);
  assert.equal(results.length, 8);
  assert.equal(bracket.nextCode, null);
});

test('6 teams: two byes, one in each half (QF1 and QF4)', () => {
  assert.deepEqual(byeSlotsFor(6), [2, 7]);
  assert.deepEqual(playableSlots(6), [1, 3, 4, 5, 6, 8]);
  const placements = place(playableSlots(6)); // 1→101, 3→102, 4→103, 5→104, 6→105, 8→106
  const b = computeBracket(6, placements, []);
  const by = Object.fromEntries(b.matches.map((m) => [m.code, m]));
  assert.equal(by.QF1.status, 'bye');
  assert.equal(by.QF1.winner, 101);
  assert.equal(by.QF4.status, 'bye');
  assert.equal(by.QF4.winner, 106);
  assert.equal(by.QF2.status, 'ready');
  assert.equal(by.QF3.status, 'ready');
  // bye winners already sit in the semifinals
  assert.equal(by.SF1.teamA, 101);
  assert.equal(by.SF2.teamB, 106);
  assert.equal(b.nextCode, 'QF2');
});

test('6 teams: full run to Final and third place', () => {
  const placements = place(playableSlots(6));
  const { bracket } = playAll(6, placements, ['QF3', 'SF2']);
  const by = Object.fromEntries(bracket.matches.map((m) => [m.code, m]));
  // QF2: 102 v 103 → 102 ; QF3: 104 v 105 → 105
  assert.deepEqual([by.SF1.teamA, by.SF1.teamB], [101, 102]);
  assert.deepEqual([by.SF2.teamA, by.SF2.teamB], [105, 106]);
  // SF1 → 101 ; SF2 (B wins) → 106
  assert.deepEqual([by.F.teamA, by.F.teamB], [101, 106]);
  assert.deepEqual([by['3RD'].teamA, by['3RD'].teamB], [102, 105]);
  assert.equal(bracket.placings.champion, 101);
  assert.equal(bracket.placings.runnerUp, 106);
  assert.equal(bracket.placings.third, 102);
});

test('every size from 2 to 16 completes with a champion', () => {
  for (let n = 2; n <= 16; n++) {
    const slots = playableSlots(n);
    assert.equal(slots.length, n);
    const size = bracketSize(n);
    // never two byes in one first-round match
    const byes = new Set(byeSlotsFor(n));
    for (let s = 1; s <= size; s += 2) assert.ok(!(byes.has(s) && byes.has(s + 1)), `n=${n}`);
    // byes split across halves as evenly as possible
    const top = [...byes].filter((s) => s <= size / 2).length;
    assert.ok(Math.abs(top - (byes.size - top)) <= 1, `n=${n} halves`);
    const { bracket } = playAll(n, place(slots));
    assert.ok(bracket.placings.champion, `n=${n}`);
    if (n >= 3) assert.ok(bracket.placings.third, `n=${n} third`);
  }
});

test('3 teams: semifinal bye means the other SF loser is third', () => {
  const { bracket } = playAll(3, place(playableSlots(3)));
  const third = bracket.matches.find((m) => m.code === '3RD')!;
  assert.equal(third.status, 'bye');
  assert.ok(bracket.placings.third);
});

test('incomplete draw: matches wait for placements', () => {
  const b = computeBracket(8, { 1: 101 }, []);
  assert.equal(b.nextCode, null);
  assert.equal(b.matches[0].status, 'waiting');
});

test('changing an earlier result marks later results as stale', () => {
  const placements = place(playableSlots(8));
  const { results } = playAll(8, placements);
  // flip QF1 winner
  const qf1 = results.find((r) => r.code === 'QF1')!;
  qf1.winnerId = qf1.teamBId;
  const b = computeBracket(8, placements, results);
  assert.deepEqual(b.staleCodes.sort(), ['3RD', 'F', 'SF1'].sort());
  assert.deepEqual(downstreamOf(8, 'QF1'), ['SF1', '3RD', 'F']);
  assert.deepEqual(downstreamOf(8, 'SF2'), ['3RD', 'F']);
});

test('result validation rules', () => {
  assert.equal(validateResult({ scoreA: 3, scoreB: 3 }, 1, 2).ok, false); // tie without SD
  assert.equal(validateResult({ scoreA: 3, scoreB: 3, suddenDeath: true }, 1, 2).ok, false); // no winner
  const sd = validateResult({ scoreA: 3, scoreB: 3, suddenDeath: true, winnerId: 2 }, 1, 2);
  assert.ok(sd.ok && sd.value.winnerId === 2);
  const wo = validateResult({ scoreA: '', scoreB: '', walkover: true, winnerId: 1 }, 1, 2);
  assert.ok(wo.ok && wo.value.winnerId === 1 && wo.value.scoreA === null);
  assert.equal(validateResult({ scoreA: '', scoreB: '', walkover: true }, 1, 2).ok, false);
  assert.equal(validateResult({ scoreA: 4, scoreB: '' }, 1, 2).ok, false);
  assert.equal(validateResult({ scoreA: 4.5, scoreB: 2 }, 1, 2).ok, false);
  const normal = validateResult({ scoreA: '120', scoreB: '150' }, 1, 2);
  assert.ok(normal.ok && normal.value.winnerId === 2);
  assert.equal(validateResult({ scoreA: 1, scoreB: 2, winnerId: 3 }, 1, 2).ok, false);
});

test('F3 rules: disqualification, sudden death question, times', () => {
  const dq = validateResult({ scoreA: 120, scoreB: 150, disqualification: true, winnerId: 1 }, 1, 2);
  assert.ok(dq.ok && dq.value.winnerId === 1 && dq.value.disqualification && dq.value.scoreB === 150);
  assert.equal(validateResult({ scoreA: '', scoreB: '', disqualification: true }, 1, 2).ok, false);
  const sd = validateResult({ scoreA: 3, scoreB: 3, suddenDeath: true, winnerId: 2, sdQuestion: '41', startTime: '9:05', endTime: '9.32', lastQuestion: 41, f4Entries: '3, 4' }, 1, 2);
  assert.ok(sd.ok && sd.value.sdQuestion === 41 && sd.value.startTime === '09:05' && sd.value.endTime === '09:32' && sd.value.f4Entries === '3, 4');
  assert.equal(validateResult({ scoreA: 1, scoreB: 2, startTime: '25:00' }, 1, 2).ok, false);
  // SD question is dropped when the match was not decided by sudden death
  const n = validateResult({ scoreA: 1, scoreB: 2, sdQuestion: 9 }, 1, 2);
  assert.ok(n.ok && n.value.sdQuestion === null);
  assert.equal(slotLabel(8, 1), 'QF1-A');
  assert.equal(slotLabel(8, 6), 'QF3-B');
  assert.equal(slotLabel(16, 16), 'R16-8-B');
  assert.equal(slotLabel(4, 3), 'SF2-A');
});
