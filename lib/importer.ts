// Reads the quiz app's Standings tab (.xlsx) or a .csv with the same columns.
import { readWorkbook, Cell } from './xlsx';

export interface StandingRow {
  rank: number | null;
  teamNo: string;
  team: string;
  score: number | null;
  correctAnswers: number | null;
  timeOnCorrect: number | null;
  qualified: boolean;
  qualifiedRaw: string;
  antiCheatFlags: string;
  tieBreak: string;
}

export const STANDINGS_COLUMNS = [
  'Rank', 'Team', 'Score', 'Correct answers', 'Time on correct answers (s)', 'Qualified', 'Anti-cheat flags', 'Tie-break',
] as const;

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9\u0E00-\u0E7F#]+/g, '');

const KEYS: Record<string, keyof StandingRow> = {
  rank: 'rank',
  teamno: 'teamNo',
  teamnumber: 'teamNo',
  'team#': 'teamNo',
  no: 'teamNo',
  เลขทีม: 'teamNo',
  team: 'team',
  score: 'score',
  correctanswers: 'correctAnswers',
  timeoncorrectanswers: 'timeOnCorrect',
  qualified: 'qualified',
  anticheatflags: 'antiCheatFlags',
  tiebreak: 'tieBreak',
};

export function parseCsv(text: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function num(v: Cell): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function str(v: Cell): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export function isYes(v: Cell): boolean {
  if (v === true) return true;
  const s = str(v).toLowerCase();
  return ['yes', 'y', 'true', '1', '✓', '✔', 'ใช่', 'ผ่าน', 'qualified'].includes(s);
}

export interface ParsedStandings {
  rows: StandingRow[];
  sheetName: string;
  warnings: string[];
  /** rows in the Questions tab, if the file has one (F1 "Questions played") */
  questionCount: number | null;
}

export function parseStandings(buf: Buffer, filename: string): ParsedStandings {
  const warnings: string[] = [];
  let table: Cell[][];
  let sheetName = 'CSV';
  let questionCount: number | null = null;
  if (/\.csv$/i.test(filename) || (buf[0] !== 0x50 || buf[1] !== 0x4b)) {
    table = parseCsv(buf.toString('utf8'));
  } else {
    const sheets = readWorkbook(buf);
    const sheet = sheets.find((s) => s.name.trim().toLowerCase() === 'standings')
      ?? sheets.find((s) => s.rows.some((r) => r.map(norm).includes('team') && r.map(norm).includes('qualified')));
    if (!sheet) throw new Error('No "Standings" tab found in the file');
    if (sheet.name.trim().toLowerCase() !== 'standings') warnings.push(`Used tab "${sheet.name}" (no tab named Standings).`);
    table = sheet.rows;
    sheetName = sheet.name;
    const qs = sheets.find((x) => x.name.trim().toLowerCase() === 'questions');
    if (qs) questionCount = qs.rows.slice(1).filter((r) => r.length && r[0] !== null && r[0] !== '').length;
  }

  // header row = first row that has both Team and Qualified
  const headerIdx = table.findIndex((r) => r.map(norm).includes('team') && r.map(norm).includes('qualified'));
  if (headerIdx < 0) {
    throw new Error('Header row with "Team" and "Qualified" not found');
  }
  const header = table[headerIdx].map(norm);
  const colOf: Partial<Record<keyof StandingRow, number>> = {};
  header.forEach((h, i) => {
    const key = KEYS[h];
    if (key && colOf[key] === undefined) colOf[key] = i;
  });
  const missing = STANDINGS_COLUMNS.filter((h) => colOf[KEYS[norm(h)]] === undefined);
  if (missing.length) warnings.push(`Missing columns: ${missing.join(', ')}`);
  if (colOf.teamNo === undefined) warnings.push('No "Team No." column: add numbers on the Teams page.');

  const rows: StandingRow[] = [];
  for (const r of table.slice(headerIdx + 1)) {
    const get = (k: keyof StandingRow): Cell => (colOf[k] === undefined ? null : r[colOf[k]!] ?? null);
    const team = str(get('team'));
    if (!team) continue;
    const q = get('qualified');
    const flags = get('antiCheatFlags');
    rows.push({
      rank: num(get('rank')),
      teamNo: str(get('teamNo')).replace(/\.0$/, ''),
      team,
      score: num(get('score')),
      correctAnswers: num(get('correctAnswers')),
      timeOnCorrect: num(get('timeOnCorrect')),
      qualified: isYes(q),
      qualifiedRaw: str(q),
      antiCheatFlags: flags === 0 || flags === '0' ? '' : str(flags),
      tieBreak: str(get('tieBreak')),
    });
  }
  if (!rows.length) throw new Error('No team rows found in the file');
  return { rows, sheetName, warnings, questionCount };
}

// ------------------------------------------------------------------ F1 suggestions

export type CutDecidedBy = 'correct' | 'time' | 'all_through';

/** Values for the F1 certificate that can be read from the file. The admin can change them. */
export function suggestF1(p: ParsedStandings, filename: string) {
  const m = filename.match(/Round-([A-Za-z0-9]{3,8})-(\d{4}-\d{2}-\d{2})/);
  const qualified = p.rows.filter((r) => r.qualified);
  const others = p.rows.filter((r) => !r.qualified);
  const cutScore = qualified.length ? Math.min(...qualified.map((r) => r.score ?? Infinity)) : null;
  const level = cutScore !== null && others.some((r) => r.score === cutScore);
  let decidedBy: CutDecidedBy | null = null;
  if (level) {
    const notes = p.rows.filter((r) => r.score === cutScore).map((r) => r.tieBreak.toLowerCase()).join(' ');
    if (/faster|time|เวลา/.test(notes)) decidedBy = 'time';
    else if (/correct|ข้อถูก/.test(notes)) decidedBy = 'correct';
  }
  return {
    roomCode: m ? m[1].toUpperCase() : null,
    date: m ? m[2] : null,
    teamsPlayed: p.rows.length,
    questionsPlayed: p.questionCount,
    cutLevel: level ? 'yes' as const : 'no' as const,
    cutDecidedBy: decidedBy,
  };
}
