import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseStandings, suggestF1 } from '../lib/importer';
import { readWorkbook, writeWorkbook } from '../lib/xlsx';
import { SCHEMA_SQL } from '../lib/schema';

const fixture = (n: string) => readFileSync(join(__dirname, 'fixtures', n));

test('reads the quiz app export (Standings tab)', () => {
  const p = parseStandings(fixture('sample-standings.xlsx'), 'Sample-Round-2CR4D-2026-09-28.xlsx');
  const { rows, sheetName, warnings } = p;
  assert.equal(sheetName, 'Standings');
  assert.equal(warnings.length, 1); // no Team No. column yet
  assert.match(warnings[0], /Team No/);
  assert.equal(p.questionCount, 14);
  assert.equal(rows.length, 1);
  const f1 = suggestF1(p, 'Sample-Round-2CR4D-2026-09-28.xlsx');
  assert.equal(f1.roomCode, '2CR4D');
  assert.equal(f1.date, '2026-09-28');
  assert.equal(f1.questionsPlayed, 14);
  assert.deepEqual(rows[0], {
    rank: 1, teamNo: '', team: 'Gordon', score: 1420, correctAnswers: 12, timeOnCorrect: 68.5,
    qualified: true, qualifiedRaw: 'Yes', antiCheatFlags: '', tieBreak: '',
  });
});

test('reads a CSV with the same columns, including quotes and Thai names', () => {
  const csv = '﻿Rank,Team,Score,Correct answers,Time on correct answers (s),Qualified,Anti-cheat flags,Tie-break\r\n' +
    '1,"จุฬาฯ ทีม A",1500,13,60.2,Yes,0,\r\n' +
    '2,"Imperial, Team 2",1400,12,70,No,1,"Faster on correct answers"\r\n';
  const { rows } = parseStandings(Buffer.from(csv, 'utf8'), 'x.csv');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].team, 'จุฬาฯ ทีม A');
  assert.equal(rows[0].qualified, true);
  assert.equal(rows[1].team, 'Imperial, Team 2');
  assert.equal(rows[1].qualified, false);
  assert.equal(rows[1].antiCheatFlags, '1');
  assert.equal(rows[1].tieBreak, 'Faster on correct answers');
});

test('writes a workbook that reads back identically (Thai text, numbers, blanks)', () => {
  const buf = writeWorkbook([
    { name: 'Qualifying', header: true, widths: [8, 30], rows: [['Rank', 'Team'], [1, 'ทีม <A> & "B"'], [2, null]] },
    { name: 'Draw', rows: [['Slot', 'Team'], [1, 'X']] },
  ]);
  const back = readWorkbook(buf);
  assert.deepEqual(back.map((s) => s.name), ['Qualifying', 'Draw']);
  assert.deepEqual(back[0].rows[1], [1, 'ทีม <A> & "B"']);
  assert.deepEqual(back[0].rows[2], [2]);
  const parsed = parseStandings(writeWorkbook([{ name: 'Standings', rows: [
    ['Rank', 'Team', 'Score', 'Correct answers', 'Time on correct answers (s)', 'Qualified', 'Anti-cheat flags', 'Tie-break'],
    [1, 'A', 10, 1, 2, 'Yes', 0, ''], [2, 'B', 5, 1, 2, 'No', 0, ''],
  ] }]), 'round.xlsx');
  assert.deepEqual(parsed.rows.map((r) => [r.team, r.qualified]), [['A', true], ['B', false]]);
});

test('reads a Team No. column and spots a tie at the cut', () => {
  const csv = 'Rank,Team No.,Team,Score,Correct answers,Time on correct answers (s),Qualified,Anti-cheat flags,Tie-break\n' +
    '1,7,A,500,5,10,Yes,0,\n2,3,B,400,4,10,Yes,0,Faster on correct answers\n3,12,C,400,4,12,No,0,Faster on correct answers\n';
  const p = parseStandings(Buffer.from(csv), 'x.csv');
  assert.deepEqual(p.warnings, []);
  assert.deepEqual(p.rows.map((r) => r.teamNo), ['7', '3', '12']);
  const f1 = suggestF1(p, 'x.csv');
  assert.equal(f1.cutLevel, 'yes');
  assert.equal(f1.cutDecidedBy, 'time');
  assert.equal(f1.teamsPlayed, 3);
});

test('the SQL the app runs by itself matches supabase/schema.sql', () => {
  assert.equal(SCHEMA_SQL, readFileSync(join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8'));
});
