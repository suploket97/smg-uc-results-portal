// All database reads and writes. Server only.
import { randomInt } from 'node:crypto';
import type { PoolClient } from 'pg';
import { query, tx, UserError } from './db';
import {
  bracketSize, byeSlotsFor, playableSlots, computeBracket, validateResult, downstreamOf,
  MatchResult, ResultInput, MIN_TEAMS, MAX_TEAMS,
} from './bracket';
import type {
  AppState, EventInfo, Team, Standing, DrawInfo, Placement, UploadInfo, MatchEdit, ArchivedDraw, DrawMode,
} from './types';
import type { ParsedStandings } from './importer';
import { suggestF1 } from './importer';
import { EMPTY_F1, type F1Info } from './types';

type Q = { query: PoolClient['query'] };

export const RANDOM_SOFTWARE = 'Samaggi Results Portal (crypto.randomInt)';

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d == null ? null : String(d));

// ------------------------------------------------------------------ event

export async function getEvent(c?: Q): Promise<EventInfo> {
  const rows = c
    ? (await c.query('select * from event where id = 1')).rows
    : await query('select * from event where id = 1');
  const r = rows[0] ?? { name: 'Samaggi University Challenge', event_date: null, qualifier_count: 8, draw_mode: 'manual', f1: {} };
  return { name: r.name, date: r.event_date, qualifierCount: r.qualifier_count, drawMode: r.draw_mode, f1: { ...EMPTY_F1, ...(r.f1 ?? {}) } };
}

function cleanF1(input: unknown, cur: F1Info): F1Info {
  const i = (input ?? {}) as Partial<Record<keyof F1Info, unknown>>;
  const text = (k: keyof F1Info, max = 120) => (i[k] === undefined ? (cur[k] as string) : String(i[k] ?? '').trim().slice(0, max));
  const int = (k: keyof F1Info) => {
    if (i[k] === undefined) return cur[k] as number | null;
    if (i[k] === null || i[k] === '') return null;
    const n = Number(i[k]);
    if (!Number.isInteger(n) || n < 0) throw new UserError('F1 numbers must be whole numbers');
    return n;
  };
  const pick = <T extends string>(k: keyof F1Info, allowed: T[]): T | null => {
    if (i[k] === undefined) return cur[k] as T | null;
    return allowed.includes(i[k] as T) ? (i[k] as T) : null;
  };
  return {
    roomCode: text('roomCode', 20), questionPack: text('questionPack'), scoringMode: text('scoringMode'),
    questionsPlayed: int('questionsPlayed'), teamsPlayed: int('teamsPlayed'),
    cutLevel: pick('cutLevel', ['no', 'yes']), cutDecidedBy: pick('cutDecidedBy', ['correct', 'time', 'all_through']),
    challengesLodged: int('challengesLodged'), questionsCorrected: int('questionsCorrected'), f4Entries: text('f4Entries', 200),
  };
}

export async function updateEvent(input: Partial<EventInfo>): Promise<void> {
  const cur = await getEvent();
  const name = (input.name ?? cur.name).trim() || cur.name;
  const date = input.date === undefined ? cur.date : input.date || null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError('Invalid date');
  const qc = input.qualifierCount === undefined ? cur.qualifierCount : Number(input.qualifierCount);
  if (!Number.isInteger(qc) || qc < MIN_TEAMS || qc > MAX_TEAMS) {
    throw new UserError(`Qualifier count must be ${MIN_TEAMS}–${MAX_TEAMS}`);
  }
  const mode = (input.drawMode ?? cur.drawMode) as DrawMode;
  if (mode !== 'manual' && mode !== 'random') throw new UserError('Invalid draw mode');
  const f1 = input.f1 === undefined ? cur.f1 : cleanF1(input.f1, cur.f1);
  await query(
    `insert into event (id, name, event_date, qualifier_count, draw_mode, f1, updated_at)
     values (1, $1, $2, $3, $4, $5, now())
     on conflict (id) do update set name = $1, event_date = $2, qualifier_count = $3, draw_mode = $4, f1 = $5, updated_at = now()`,
    [name, date, qc, mode, JSON.stringify(f1)],
  );
}

// ------------------------------------------------------------------ helpers

async function currentDrawRow(c: Q, lock = false) {
  const { rows } = await c.query(
    `select * from draws where status <> 'archived' order by id desc limit 1${lock ? ' for update' : ''}`,
  );
  return rows[0] ?? null;
}

async function placementCount(c: Q, drawId: number): Promise<number> {
  const { rows } = await c.query('select count(*)::int as n from draw_placements where draw_id = $1', [drawId]);
  return rows[0].n;
}

/** Team lists can change freely until the first lot is drawn. */
async function assertTeamsEditable(c: Q) {
  const d = await currentDrawRow(c, true);
  if (!d) return;
  if ((await placementCount(c, d.id)) > 0) {
    throw new UserError('The draw has started. Use "Redo draw" before changing the team list.', 409);
  }
  await c.query('delete from draws where id = $1', [d.id]); // empty draw: discard
}

// ------------------------------------------------------------------ import

export async function importStandings(file: { name: string; type: string; data: Buffer }, parsed: ParsedStandings) {
  const { rows, sheetName } = parsed;
  return tx(async (c) => {
    await assertTeamsEditable(c);
    const up = await c.query(
      `insert into uploads (filename, content_type, data, sheet_name, row_count, question_count) values ($1, $2, $3, $4, $5, $6) returning id`,
      [file.name, file.type || null, file.data, sheetName, rows.length, parsed.questionCount],
    );
    const uploadId = up.rows[0].id as number;
    await c.query(`update teams set active = false where source = 'import' and active`);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const q = await c.query(
        `insert into qualifying_rows (upload_id, row_order, rank, team, score, correct_answers, time_on_correct,
           qualified, qualified_raw, anti_cheat_flags, tie_break, team_no)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        [uploadId, i + 1, r.rank, r.team, r.score, r.correctAnswers, r.timeOnCorrect, r.qualified, r.qualifiedRaw,
          r.antiCheatFlags || null, r.tieBreak || null, r.teamNo || null],
      );
      await c.query(
        `insert into teams (name, source, qualifying_row_id, qual_rank, qual_score, selected, team_no)
         values ($1, 'import', $2, $3, $4, $5, $6)`,
        [r.team, q.rows[0].id, r.rank, r.score, r.qualified, r.teamNo || null],
      );
    }
    // fill the F1 certificate with what the file tells us
    const ev = await getEvent(c);
    const s = suggestF1(parsed, file.name);
    const f1: F1Info = {
      ...ev.f1,
      roomCode: s.roomCode ?? ev.f1.roomCode,
      teamsPlayed: s.teamsPlayed,
      questionsPlayed: s.questionsPlayed ?? ev.f1.questionsPlayed,
      cutLevel: s.cutLevel,
      cutDecidedBy: s.cutDecidedBy ?? (s.cutLevel === 'no' ? null : ev.f1.cutDecidedBy),
    };
    await c.query(
      `update event set f1 = $1, event_date = coalesce(event_date, $2::date), updated_at = now() where id = 1`,
      [JSON.stringify(f1), s.date],
    );
    return uploadId;
  });
}

export async function getUploadFile(id: number) {
  const rows = await query('select filename, content_type, data from uploads where id = $1', [id]);
  return rows[0] ?? null;
}

// ------------------------------------------------------------------ teams

export async function teamAction(body: any) {
  const action = String(body?.action ?? '');
  return tx(async (c) => {
    if (action === 'rename') {
      const name = String(body.name ?? '').trim();
      if (!name) throw new UserError('Team name cannot be empty');
      const dup = await c.query('select 1 from teams where active and lower(name) = lower($1) and id <> $2', [name, body.id]);
      if (dup.rows.length) throw new UserError('A team with this name already exists');
      const r = await c.query('update teams set name = $1 where id = $2 and active returning id', [name, body.id]);
      if (!r.rows.length) throw new UserError('Team not found', 404);
      // keep the live draw's snapshot in step
      await c.query(
        `update draw_placements set team_name = $1 where team_id = $2 and draw_id in (select id from draws where status <> 'archived')`,
        [name, body.id],
      );
      return;
    }
    if (action === 'number') {
      const no = String(body.teamNo ?? '').trim().slice(0, 10);
      if (no) {
        const dup = await c.query('select name from teams where active and team_no = $1 and id <> $2', [no, body.id]);
        if (dup.rows.length) throw new UserError(`Team No. ${no} is already used by ${dup.rows[0].name}`);
      }
      const r = await c.query('update teams set team_no = $1 where id = $2 and active returning id', [no || null, body.id]);
      if (!r.rows.length) throw new UserError('Team not found', 404);
      return;
    }
    await assertTeamsEditable(c);
    if (action === 'select') {
      const r = await c.query('update teams set selected = $1 where id = $2 and active returning id', [!!body.selected, body.id]);
      if (!r.rows.length) throw new UserError('Team not found', 404);
    } else if (action === 'add') {
      const names: string[] = (Array.isArray(body.names) ? body.names : [body.name])
        .map((s: unknown) => String(s ?? '').trim()).filter(Boolean);
      if (!names.length) throw new UserError('Enter a team name');
      for (const line of names) {
        // "12, Team name" or "12 Team name" sets the Team No. too
        const m = line.match(/^(\d{1,4})\s*[,.\t:]?\s+(.+)$/);
        const name = m ? m[2].trim() : line;
        const no = m ? m[1] : null;
        const dup = await c.query('select 1 from teams where active and lower(name) = lower($1)', [name]);
        if (dup.rows.length) throw new UserError(`"${name}" already exists`);
        await c.query(`insert into teams (name, source, selected, team_no) values ($1, 'manual', true, $2)`, [name, no]);
      }
    } else if (action === 'remove') {
      await c.query('update teams set active = false where id = $1', [body.id]);
    } else if (action === 'clearAll') {
      await c.query('update teams set active = false where active');
    } else {
      throw new UserError('Unknown action');
    }
  });
}

// ------------------------------------------------------------------ draw

async function loadPlacements(c: Q, drawId: number): Promise<Placement[]> {
  const { rows } = await c.query('select * from draw_placements where draw_id = $1 order by pick_order', [drawId]);
  return rows.map((r: any) => ({
    slot: r.slot, teamId: r.team_id, teamName: r.team_name, pickOrder: r.pick_order, method: r.method, placedAt: iso(r.placed_at)!,
    drawnBy: r.drawn_by ?? null,
  }));
}

async function selectedTeams(c: Q): Promise<{ id: number; name: string }[]> {
  const { rows } = await c.query('select id, name from teams where active and selected order by qual_rank nulls last, id');
  return rows;
}

export async function drawAction(body: any) {
  const action = String(body?.action ?? '');
  return tx(async (c) => {
    const ev = await getEvent(c);
    let d = await currentDrawRow(c, true);

    if (action === 'start') {
      if (d) throw new UserError('A draw already exists', 409);
      const teams = await selectedTeams(c);
      if (teams.length < MIN_TEAMS || teams.length > MAX_TEAMS) {
        throw new UserError(`Need ${MIN_TEAMS}–${MAX_TEAMS} ticked teams (now ${teams.length})`);
      }
      await c.query(
        `insert into draws (status, mode, team_count, bracket_size, place, software) values ('open', $1, $2, $3, $4, $5)`,
        [ev.drawMode, teams.length, bracketSize(teams.length), String(body.place ?? '').trim().slice(0, 120) || null,
          ev.drawMode === 'random' ? RANDOM_SOFTWARE : null],
      );
      return;
    }

    if (action === 'details') {
      if (!d) throw new UserError('No draw yet', 404);
      await c.query('update draws set place = $1 where id = $2', [String(body.place ?? '').trim().slice(0, 120) || null, d.id]);
      return;
    }

    if (action === 'redo') {
      if (!d) throw new UserError('No draw to redo', 404);
      if (body.confirm !== true) throw new UserError('Confirmation required', 400);
      await c.query(`update draws set status = 'archived', archived_at = now() where id = $1`, [d.id]);
      return;
    }

    if (!d) throw new UserError('Start the draw first', 409);
    if (d.status !== 'open') throw new UserError('The draw is locked', 409);
    const placements = await loadPlacements(c, d.id);
    const playable = playableSlots(d.team_count);
    const usedSlots = new Set(placements.map((p) => p.slot));
    const usedTeams = new Set(placements.map((p) => p.teamId));
    const teams = await selectedTeams(c);
    if (teams.length !== d.team_count) {
      throw new UserError('The team list changed after the draw started. Redo the draw.', 409);
    }
    const remaining = teams.filter((t) => !usedTeams.has(t.id));

    const drawnBy = String(body.drawnBy ?? '').trim().slice(0, 60) || null;
    const insert = async (slot: number, team: { id: number; name: string }, method: DrawMode) => {
      await c.query(
        `insert into draw_placements (draw_id, slot, team_id, team_name, pick_order, method, drawn_by) values ($1,$2,$3,$4,$5,$6,$7)`,
        [d.id, slot, team.id, team.name, placements.length + 1, method, drawnBy],
      );
    };

    if (action === 'place') {
      const slot = Number(body.slot);
      const team = remaining.find((t) => t.id === Number(body.teamId));
      if (!team) throw new UserError('Team already drawn or not in the list');
      if (!playable.includes(slot)) throw new UserError('That slot is a bye or does not exist');
      if (usedSlots.has(slot)) throw new UserError('That slot is already filled');
      await insert(slot, team, 'manual');
    } else if (action === 'random') {
      const slot = playable.find((s) => !usedSlots.has(s));
      if (slot === undefined || !remaining.length) throw new UserError('All teams are drawn');
      await insert(slot, remaining[randomInt(remaining.length)], 'random');
    } else if (action === 'undo') {
      const last = placements[placements.length - 1];
      if (!last) throw new UserError('Nothing to undo');
      await c.query('delete from draw_placements where draw_id = $1 and pick_order = $2', [d.id, last.pickOrder]);
    } else if (action === 'lock') {
      if (placements.length !== d.team_count) throw new UserError('Not all teams are drawn yet');
      await c.query(`update draws set status = 'locked', locked_at = now() where id = $1`, [d.id]);
    } else {
      throw new UserError('Unknown action');
    }
  });
}

// ------------------------------------------------------------------ matches

async function loadResults(c: Q, drawId: number): Promise<MatchResult[]> {
  const { rows } = await c.query('select * from match_results where draw_id = $1', [drawId]);
  return rows.map(rowToResult);
}

function rowToResult(r: any): MatchResult {
  return {
    code: r.code, teamAId: r.team_a_id, teamBId: r.team_b_id, scoreA: r.score_a, scoreB: r.score_b,
    suddenDeath: r.sudden_death, walkover: r.walkover, disqualification: !!r.disqualification, winnerId: r.winner_id,
    sdQuestion: r.sd_question ?? null, startTime: r.start_time ?? null, endTime: r.end_time ?? null,
    lastQuestion: r.last_question ?? null, f4Entries: r.f4_entries ?? null, updatedAt: iso(r.updated_at)!,
  };
}

function resultForLog(r: MatchResult, names: Map<number, string>) {
  return {
    teamA: names.get(r.teamAId) ?? r.teamAId, teamB: names.get(r.teamBId) ?? r.teamBId,
    scoreA: r.scoreA, scoreB: r.scoreB, suddenDeath: r.suddenDeath, walkover: r.walkover,
    disqualification: r.disqualification, sdQuestion: r.sdQuestion,
    winner: names.get(r.winnerId) ?? r.winnerId,
    startTime: r.startTime, endTime: r.endTime, lastQuestion: r.lastQuestion, f4Entries: r.f4Entries,
  };
}

async function teamNameMap(c: Q): Promise<Map<number, string>> {
  const { rows } = await c.query('select id, name from teams');
  return new Map(rows.map((r: any) => [r.id, r.name]));
}

async function lockedBracket(c: Q) {
  const d = await currentDrawRow(c, true);
  if (!d) throw new UserError('No draw yet', 409);
  if (d.status !== 'locked') throw new UserError('Lock the draw before entering scores', 409);
  const placements = await loadPlacements(c, d.id);
  const pmap: Record<number, number> = {};
  placements.forEach((p) => { pmap[p.slot] = p.teamId; });
  return { d, pmap };
}

/** Deletes stored results that no longer fit (teams changed upstream) and logs it. */
async function clearStale(c: Q, drawId: number, teamCount: number, pmap: Record<number, number>, names: Map<number, string>, reason: string) {
  const results = await loadResults(c, drawId);
  const b = computeBracket(teamCount, pmap, results);
  for (const code of b.staleCodes) {
    const old = results.find((r) => r.code === code)!;
    await c.query('delete from match_results where draw_id = $1 and code = $2', [drawId, code]);
    await c.query(
      `insert into match_edits (draw_id, code, action, old_value, new_value, note) values ($1, $2, 'clear', $3, null, $4)`,
      [drawId, code, JSON.stringify(resultForLog(old, names)), reason],
    );
  }
  return b.staleCodes;
}

export async function saveMatch(body: any): Promise<{ cleared: string[] }> {
  const code = String(body?.code ?? '');
  return tx(async (c) => {
    const { d, pmap } = await lockedBracket(c);
    const results = await loadResults(c, d.id);
    const b = computeBracket(d.team_count, pmap, results);
    const m = b.matches.find((x) => x.code === code);
    if (!m) throw new UserError('Match not found', 404);
    if (m.status !== 'ready' && m.status !== 'done') {
      throw new UserError('This match is not ready yet', 409);
    }
    const v = validateResult(body as ResultInput, m.teamA!, m.teamB!);
    if (!v.ok) throw new UserError(v.error);
    const names = await teamNameMap(c);
    const prev = m.result;

    if (prev && prev.winnerId !== v.value.winnerId) {
      const affected = downstreamOf(d.bracket_size, code).filter((dc) => results.some((r) => r.code === dc));
      if (affected.length && body.confirm !== true) {
        throw new UserError(
          `The winner changes, so ${affected.join(', ')} will be cleared and must be re-entered.`,
          409, { needsConfirm: true, affected },
        );
      }
    }
    const n = v.value;
    await c.query(
      `insert into match_results (draw_id, code, team_a_id, team_b_id, score_a, score_b, sudden_death, walkover, winner_id,
         disqualification, sd_question, start_time, end_time, last_question, f4_entries, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
       on conflict (draw_id, code) do update set team_a_id = $3, team_b_id = $4, score_a = $5, score_b = $6,
         sudden_death = $7, walkover = $8, winner_id = $9, disqualification = $10, sd_question = $11,
         start_time = $12, end_time = $13, last_question = $14, f4_entries = $15, updated_at = now()`,
      [d.id, code, n.teamAId, n.teamBId, n.scoreA, n.scoreB, n.suddenDeath, n.walkover, n.winnerId,
        n.disqualification, n.sdQuestion, n.startTime, n.endTime, n.lastQuestion, n.f4Entries],
    );
    const newLog = resultForLog({ code, ...n }, names);
    const oldLog = prev ? resultForLog(prev, names) : null;
    if (!oldLog || JSON.stringify(oldLog) !== JSON.stringify(newLog)) {
      await c.query(
        `insert into match_edits (draw_id, code, action, old_value, new_value) values ($1, $2, $3, $4, $5)`,
        [d.id, code, prev ? 'update' : 'create', oldLog ? JSON.stringify(oldLog) : null, JSON.stringify(newLog)],
      );
    }
    const cleared = await clearStale(c, d.id, d.team_count, pmap, names, `Cleared because ${code} changed`);
    return { cleared };
  });
}

export async function clearMatch(body: any): Promise<{ cleared: string[] }> {
  const code = String(body?.code ?? '');
  return tx(async (c) => {
    const { d, pmap } = await lockedBracket(c);
    const results = await loadResults(c, d.id);
    const prev = results.find((r) => r.code === code);
    if (!prev) throw new UserError('No result to clear');
    const affected = downstreamOf(d.bracket_size, code).filter((dc) => results.some((r) => r.code === dc));
    if (affected.length && body.confirm !== true) {
      throw new UserError(
        `${affected.join(', ')} will also be cleared.`,
        409, { needsConfirm: true, affected },
      );
    }
    const names = await teamNameMap(c);
    await c.query('delete from match_results where draw_id = $1 and code = $2', [d.id, code]);
    await c.query(
      `insert into match_edits (draw_id, code, action, old_value, new_value, note) values ($1, $2, 'clear', $3, null, 'Cleared by admin')`,
      [d.id, code, JSON.stringify(resultForLog(prev, names))],
    );
    const cleared = await clearStale(c, d.id, d.team_count, pmap, names, `Cleared because ${code} was cleared`);
    return { cleared: [code, ...cleared] };
  });
}

// ------------------------------------------------------------------ state

function drawInfo(r: any, placements: Placement[]): DrawInfo {
  return {
    id: r.id, status: r.status, mode: r.mode, teamCount: r.team_count, bracketSize: r.bracket_size,
    byeSlots: byeSlotsFor(r.team_count), playableSlots: playableSlots(r.team_count), placements,
    place: r.place ?? '', software: r.software ?? '',
    createdAt: iso(r.created_at)!, lockedAt: iso(r.locked_at), archivedAt: iso(r.archived_at),
  };
}

export async function buildState(admin: boolean): Promise<AppState> {
  return tx(async (c) => {
    await c.query('set transaction read only');
    const event = await getEvent(c);
    const teamRows = (await c.query('select * from teams order by qual_rank nulls last, id')).rows;
    const teams: Team[] = teamRows.filter((t: any) => t.active).map((t: any) => ({
      id: t.id, teamNo: t.team_no ?? null, name: t.name, source: t.source, selected: t.selected, qualRank: t.qual_rank, qualScore: t.qual_score,
      qualifyingRowId: t.qualifying_row_id,
    }));
    const teamNames: Record<number, string> = {};
    const teamNos: Record<number, string> = {};
    teamRows.forEach((t: any) => { teamNames[t.id] = t.name; if (t.team_no) teamNos[t.id] = t.team_no; });

    const upRows = (await c.query(
      'select id, filename, sheet_name, row_count, question_count, uploaded_at from uploads order by id desc',
    )).rows;
    const uploads: UploadInfo[] = upRows.map((u: any) => ({
      id: u.id, filename: u.filename, sheetName: u.sheet_name, rowCount: u.row_count, questionCount: u.question_count ?? null,
      uploadedAt: iso(u.uploaded_at)!,
    }));
    const upload = uploads[0] ?? null;
    const standings: Standing[] = upload
      ? (await c.query('select * from qualifying_rows where upload_id = $1 order by row_order', [upload.id])).rows.map((r: any) => ({
          rowId: r.id, rank: r.rank, teamNo: r.team_no ?? '', team: r.team, score: r.score, correctAnswers: r.correct_answers, timeOnCorrect: r.time_on_correct,
          qualified: r.qualified, qualifiedRaw: r.qualified_raw ?? '', tieBreak: r.tie_break ?? '',
          ...(admin ? { antiCheatFlags: r.anti_cheat_flags ?? '' } : {}),
        }))
      : [];

    const dRow = await currentDrawRow(c);
    let draw: DrawInfo | null = null;
    let bracket = null;
    if (dRow) {
      draw = drawInfo(dRow, await loadPlacements(c, dRow.id));
      const pmap: Record<number, number> = {};
      draw.placements.forEach((p) => { pmap[p.slot] = p.teamId; });
      bracket = computeBracket(dRow.team_count, pmap, await loadResults(c, dRow.id));
      if (draw.status !== 'locked') bracket.nextCode = null;
    }

    const state: AppState = { event, teams, teamNames, teamNos, standings, upload, draw, bracket, serverTime: new Date().toISOString() };

    if (admin) {
      const edits: MatchEdit[] = (await c.query('select * from match_edits order by edited_at desc, id desc limit 500')).rows.map((e: any) => ({
        id: e.id, drawId: e.draw_id, code: e.code, action: e.action, oldValue: e.old_value, newValue: e.new_value,
        note: e.note, editedAt: iso(e.edited_at)!,
      }));
      const hist = (await c.query(`select d.*, (select count(*)::int from match_results r where r.draw_id = d.id) as result_count
                                   from draws d where status = 'archived' order by id desc`)).rows;
      const history: ArchivedDraw[] = [];
      for (const h of hist) history.push({ ...drawInfo(h, await loadPlacements(c, h.id)), resultCount: h.result_count });
      state.admin = { edits, history, uploads };
    }
    return state;
  });
}

// ------------------------------------------------------------------ export data

export async function allDrawsWithResults() {
  const draws = await query(`select * from draws order by (status = 'archived'), id desc`);
  const out: { draw: DrawInfo; results: MatchResult[] }[] = [];
  for (const d of draws) {
    const placements = (await query('select * from draw_placements where draw_id = $1 order by pick_order', [d.id])).map((r: any) => ({
      slot: r.slot, teamId: r.team_id, teamName: r.team_name, pickOrder: r.pick_order, method: r.method, placedAt: iso(r.placed_at)!,
      drawnBy: r.drawn_by ?? null,
    }));
    const results = (await query('select * from match_results where draw_id = $1', [d.id])).map(rowToResult);
    out.push({ draw: drawInfo(d, placements), results });
  }
  return out;
}

export async function keepAlive(): Promise<string> {
  const rows = await query<{ now: string }>('select now()::text as now');
  return rows[0].now;
}
