// Builds the single Excel file. Tabs follow the paper record forms:
//   F1 Qualifying · Standings (full) · F2 Draw · F3 Matches · Edit log · Draw history
import { writeWorkbook, Cell } from './xlsx';
import { UserError } from './db';
import { buildState, allDrawsWithResults } from './repo';
import { computeBracket, slotLabel, decidedBy, bracketSkeleton } from './bracket';
import { matchLabel, DECIDED_BY } from './labels';

const yn = (b: boolean) => (b ? 'Yes' : 'No');
const TZ = () => process.env.EVENT_TIMEZONE || 'Europe/London';
const local = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TZ() }) : '');
const localDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ() });
const localTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ(), hour: '2-digit', minute: '2-digit' });

const CUT_BY: Record<string, string> = {
  correct: 'Correct answers', time: 'Time', all_through: 'Still level, all through',
};

export type ExportForm = 'all' | 'f1' | 'f2' | 'f3';

const FORM_SHEETS: Record<ExportForm, string[]> = {
  all: ['F1 Qualifying', 'Standings (full)', 'F2 Draw', 'F3 Matches', 'Edit log', 'Draw history'],
  f1: ['F1 Qualifying', 'Standings (full)'],
  f2: ['F2 Draw'],
  f3: ['F3 Matches', 'Edit log'],
};

export async function buildExport(form: ExportForm = 'all', matchCode?: string, competitionId?: number | null): Promise<{ buffer: Buffer; filename: string }> {
  const state = await buildState(true, competitionId);
  const draws = await allDrawsWithResults(state.competition.id);
  const names = state.teamNames;
  const nos = state.teamNos;
  const name = (id: number | null | undefined) => (id == null ? '' : names[id] ?? `#${id}`);
  const no = (id: number | null | undefined) => (id == null ? '' : nos[id] ?? '');
  const f1 = state.event.f1;
  const qualified = state.teams.filter((t) => t.selected);
  const byRow = new Map(state.standings.map((s) => [s.rowId, s]));

  // F1 ---------------------------------------------------------------------
  const F1: Cell[][] = [
    ['F1 · Qualifying round result certificate'],
    [state.event.name],
    [],
    ['Date', state.event.date ?? ''],
    ['Room code', f1.roomCode],
    ['Question pack', f1.questionPack],
    ['Scoring mode', f1.scoringMode],
    ['Questions played', f1.questionsPlayed],
    ['Teams that played', f1.teamsPlayed ?? state.standings.length],
    ['Qualifiers', qualified.length],
    ['Excel record', state.upload ? `${state.upload.filename} (${local(state.upload.uploadedAt)})` : ''],
    [],
    ['Qualified teams'],
    ['Rank', 'Team No.', 'Team', 'Score', 'Correct answers', 'Time on correct (s)', 'Tie-break', 'Name in the Standings tab'],
  ];
  qualified.forEach((t, i) => {
    const s = t.qualifyingRowId != null ? byRow.get(t.qualifyingRowId) : undefined;
    F1.push([s?.rank ?? i + 1, t.teamNo ?? '', t.name, s?.score ?? null, s?.correctAnswers ?? null, s?.timeOnCorrect ?? null,
      s?.tieBreak ?? (t.source === 'manual' ? 'Added by hand' : ''), s && s.team !== t.name ? s.team : '']);
  });
  F1.push([], ['The cut'],
    ['Teams level across the cut', f1.cutLevel === 'yes' ? 'Yes' : f1.cutLevel === 'no' ? 'No' : ''],
    ['Decided by', f1.cutDecidedBy ? CUT_BY[f1.cutDecidedBy] : ''],
    [], ['Challenges and corrections'],
    ['Challenges lodged', f1.challengesLodged],
    ['Questions corrected', f1.questionsCorrected],
    ['Details on F4, entry nos', f1.f4Entries]);

  // Standings (full) ------------------------------------------------------------
  const selectedRows = new Set(qualified.map((t) => t.qualifyingRowId));
  const standings: Cell[][] = [[
    'Rank', 'Team No.', 'Team', 'Score', 'Correct answers', 'Time on correct answers (s)', 'Qualified', 'Anti-cheat flags', 'Tie-break', 'In the draw',
  ]];
  for (const s of state.standings) {
    standings.push([s.rank, s.teamNo, s.team, s.score, s.correctAnswers, s.timeOnCorrect, s.qualifiedRaw || yn(s.qualified),
      s.antiCheatFlags || '', s.tieBreak, yn(selectedRows.has(s.rowId))]);
  }

  // F2 (current draw) -----------------------------------------------------------
  const cur = draws.find((x) => x.draw.status !== 'archived');
  const F2: Cell[][] = [['F2 · Draw record'], [state.event.name], []];
  if (!cur) F2.push(['No draw yet']);
  else {
    const d = cur.draw;
    F2.push(
      ['Date', localDate(d.createdAt)], ['Time', localTime(d.createdAt)], ['Place', d.place],
      ['Qualifiers', d.teamCount],
      ['Draw method (3.4)', d.mode === 'manual' ? 'Lots from a box' : `Software: ${d.software || 'Results Portal'}`],
      ['Bye slots (3.6)', d.byeSlots.map((s) => slotLabel(d.bracketSize, s)).join(', ') || 'none'],
      ['Status', d.status === 'locked' ? `Locked ${local(d.lockedAt)}` : 'Open (not locked)'],
      [], ['Result, in the order drawn'],
      ['No.', 'Team No.', 'Team', 'Bracket slot', 'Bye', 'Drawn by', 'Placed at'],
    );
    for (const p of d.placements) {
      const partner = p.slot % 2 ? p.slot + 1 : p.slot - 1;
      F2.push([p.pickOrder, no(p.teamId), name(p.teamId) || p.teamName, slotLabel(d.bracketSize, p.slot),
        d.byeSlots.includes(partner) ? 'Yes' : '', p.drawnBy ?? (p.method === 'random' ? 'Software' : ''), local(p.placedAt)]);
    }
    const pmap: Record<number, number> = {};
    d.placements.forEach((p) => { pmap[p.slot] = p.teamId; });
    const b = computeBracket(d.teamCount, pmap, cur.results);
    F2.push([], ['Bracket'], ['Slot', 'Comes from', 'Team No.', 'Team']);
    const order = bracketSkeleton(d.bracketSize).sort((x, y) => (x.code === 'F' && y.code === '3RD' ? -1 : x.code === '3RD' && y.code === 'F' ? 1 : 0));
    for (const sk of order) {
      const m = b.matches.find((x) => x.code === sk.code)!;
      for (const side of ['A', 'B'] as const) {
        const src = side === 'A' ? sk.sourceA : sk.sourceB;
        const team = side === 'A' ? m.teamA : m.teamB;
        const bye = side === 'A' ? m.aIsBye : m.bIsBye;
        F2.push([`${sk.code}-${side}`, src.kind === 'slot' ? 'Draw' : `${src.kind === 'winner' ? 'Winner' : 'Loser'} ${src.code}`,
          bye ? '' : no(team), bye ? 'BYE' : name(team)]);
      }
    }
  }

  // F3 (current draw) -----------------------------------------------------------
  const F3: Cell[][] = [[
    'Match ID', 'Round', 'Start', 'End', 'Team A No.', 'Team A', 'Team B No.', 'Team B', 'Final score A', 'Final score B',
    'Decided by', 'Sudden Death Q', 'Winner No.', 'Winner', 'Loser No.', 'Loser', 'Last question', 'F4 entry nos', 'Status', 'Last updated',
  ]];
  if (cur) {
    const pmap: Record<number, number> = {};
    cur.draw.placements.forEach((p) => { pmap[p.slot] = p.teamId; });
    const b = computeBracket(cur.draw.teamCount, pmap, cur.results);
    for (const m of b.matches) {
      if (m.status === 'void') continue;
      const r = m.result;
      const how = r ? DECIDED_BY[decidedBy(r)] : null;
      F3.push([
        m.code, matchLabel(m.round, m.index).en, r?.startTime ?? '', r?.endTime ?? '',
        m.aIsBye ? '' : no(m.teamA), m.aIsBye ? 'BYE' : name(m.teamA), m.bIsBye ? '' : no(m.teamB), m.bIsBye ? 'BYE' : name(m.teamB),
        r?.scoreA ?? null, r?.scoreB ?? null, how ? `${how.en}${how.rule ? ` (${how.rule})` : ''}` : m.status === 'bye' ? 'Bye' : '',
        r?.sdQuestion ?? null, no(m.winner), name(m.winner), no(m.loser), name(m.loser), r?.lastQuestion ?? null, r?.f4Entries ?? '',
        m.status, local(r?.updatedAt),
      ]);
    }
    F3.push([]);
    F3.push(['Champion', '', '', '', no(b.placings.champion), name(b.placings.champion)]);
    F3.push(['Runner-up', '', '', '', no(b.placings.runnerUp), name(b.placings.runnerUp)]);
    if (b.size >= 4) F3.push(['Third place', '', '', '', no(b.placings.third), name(b.placings.third)]);
  }

  // Edit log -----------------------------------------------------------------
  const fmt = (v: Record<string, unknown> | null) => {
    if (!v) return '';
    const how = v.walkover ? 'walkover' : v.disqualification ? 'disqualification' : v.suddenDeath ? `sudden death${v.sdQuestion ? ` Q${v.sdQuestion}` : ''}` : '';
    const score = v.walkover ? '' : `${v.scoreA ?? ''}–${v.scoreB ?? ''}`;
    return `${v.teamA} v ${v.teamB}: ${[score, how].filter(Boolean).join(', ')}; winner ${v.winner}`;
  };
  const edits: Cell[][] = [['When', 'Draw ID', 'Match', 'Action', 'Previous', 'New', 'Note']];
  for (const e of [...(state.admin?.edits ?? [])].reverse()) {
    edits.push([local(e.editedAt), e.drawId, e.code, e.action, fmt(e.oldValue), fmt(e.newValue), e.note ?? '']);
  }

  // Draw history (archived draws, kept by "Redo draw") ---------------------------
  const hist: Cell[][] = [['Draw ID', 'Created', 'Archived', 'Mode', 'Place', 'No.', 'Bracket slot', 'Team No.', 'Team', 'Drawn by', 'Results entered']];
  for (const { draw: d, results } of draws.filter((x) => x.draw.status === 'archived')) {
    for (const p of d.placements) {
      hist.push([d.id, local(d.createdAt), local(d.archivedAt), d.mode, d.place, p.pickOrder, slotLabel(d.bracketSize, p.slot),
        no(p.teamId), name(p.teamId) || p.teamName, p.drawnBy ?? '', results.length]);
    }
    for (const r of results) {
      hist.push([d.id, '', '', 'result', '', '', r.code, '', `${name(r.teamAId)} ${r.scoreA ?? ''}–${r.scoreB ?? ''} ${name(r.teamBId)}`, '', `winner ${name(r.winnerId)}`]);
    }
  }

  // one match only: keep its row (and the champion lines if it is the final)
  if (form === 'f3' && matchCode) {
    const head = F3[0];
    const rows = F3.filter((r, i) => i > 0 && r[0] === matchCode);
    if (!rows.length) throw new UserError(`No match ${matchCode} in the current bracket`, 404);
    F3.length = 0;
    F3.push(head, ...rows);
    const keep = edits.filter((r, i) => i === 0 || r[2] === matchCode);
    edits.length = 0;
    edits.push(...keep);
  }

  const all = [
    { name: 'F1 Qualifying', rows: F1, widths: [40, 14, 30, 10, 14, 16, 26, 24] },
    { name: 'Standings (full)', header: true, rows: standings, widths: [7, 10, 30, 9, 10, 14, 10, 13, 26, 10] },
    { name: 'F2 Draw', rows: F2, widths: [30, 22, 12, 30, 8, 18, 22] },
    { name: 'F3 Matches', header: true, rows: F3, widths: [10, 16, 8, 8, 10, 26, 10, 26, 10, 10, 22, 10, 10, 26, 10, 26, 10, 14, 9, 20] },
    { name: 'Edit log', header: true, rows: edits, widths: [22, 9, 8, 9, 50, 50, 30] },
    { name: 'Draw history', header: true, rows: hist, widths: [9, 20, 20, 9, 18, 6, 12, 10, 30, 16, 16] },
  ];
  const buffer = writeWorkbook(all.filter((sh) => FORM_SHEETS[form].includes(sh.name)));
  const safe = state.event.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'results';
  const stamp = new Date().toISOString().slice(0, 10);
  const part = form === 'all' ? 'all-forms' : form === 'f1' ? 'F1-Qualifying' : form === 'f2' ? 'F2-Draw' : matchCode ? `F3-${matchCode}` : 'F3-Matches';
  return { buffer, filename: `${safe}-${state.event.date ?? stamp}-${part}.xlsx` };
}
