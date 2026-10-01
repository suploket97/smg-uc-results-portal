'use client';
// Printable record forms, laid out like "Record forms F1–F4 (EN)", v2026-10.
// The portal fills in what it knows; signatures and anything it does not record
// (clock stops, voided questions, judge's remarks …) are left blank to complete in pen.
import { useEffect, useState } from 'react';
import { useAppState } from '@/lib/client';
import { slotLabel, decidedBy, bracketSkeleton, type BracketMatch, type Source } from '@/lib/bracket';
import { matchLabel, fmtDate, fmtTime } from '@/lib/labels';
import type { AppState } from '@/lib/types';

const VERSION = 'v2026-10';

function Head({ code, title }: { code: string; title: string }) {
  return (
    <header className="fd-head">
      <div>
        <div className="fd-mark"><span>SAMAGGI</span> UNIVERSITY CHALLENGE</div>
        <h1 className="fd-title">{title}</h1>
      </div>
      <div className="fd-code-wrap">
        <div className="fd-code">{code}</div>
        <div className="fd-kind">Official record</div>
      </div>
    </header>
  );
}

function Foot({ code, page }: { code: string; page: string }) {
  return (
    <footer className="fd-foot">
      <span>{code} · {VERSION} · Pen only; strike through and initial corrections</span>
      <span>{page}</span>
    </footer>
  );
}

function Box({ label, value, tall }: { label: string; value?: React.ReactNode; tall?: boolean }) {
  return (
    <div className={`fd-box ${tall ? 'tall' : ''}`}>
      <div className="fd-lbl">{label}</div>
      {value !== undefined && value !== null && value !== '' && <div className="fd-val">{value}</div>}
    </div>
  );
}

function Sig({ label }: { label: string }) {
  return <div className="fd-sig"><div className="fd-lbl">{label}</div></div>;
}

function Check({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return <span className="fd-check"><span className={`fd-sq ${on ? 'on' : ''}`}>{on ? '✓' : ''}</span>{children}</span>;
}

function Panel({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`fd-panel ${className ?? ''}`}>
      <div className="fd-panel-t"><b>{title}</b>{sub && <span> · {sub}</span>}</div>
      {children}
    </section>
  );
}

const blankLine = (v: React.ReactNode, width = '28mm') =>
  v === '' || v == null ? <span className="fd-line" style={{ width }} /> : <span className="fd-filled">{v}</span>;

function srcText(src: Source) {
  if (src.kind === 'slot') return '';
  return src.kind === 'winner' ? `winner ${src.code}` : `loser ${src.code}`;
}

const ROUND_HEAD: Record<string, string> = { R16: 'Round of 16', QF: 'Quarterfinals', SF: 'Semifinals', F: 'Final / Third place' };

type FormSel = 'all' | 'f1' | 'f2' | 'f3';

export default function PrintPage() {
  const { state, error } = useAppState();
  // which form to show: /print?form=f1 | f2 | f3 [&match=QF1] (default: all)
  const [sel, setSel] = useState<{ form: FormSel; match: string }>({ form: 'all', match: '' });
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const f = sp.get('form');
    setSel({ form: f === 'f1' || f === 'f2' || f === 'f3' ? f : 'all', match: (sp.get('match') ?? '').toUpperCase() });
  }, []);
  const choose = (form: FormSel, match = '') => {
    setSel({ form, match });
    const q = form === 'all' ? '' : `?form=${form}${match ? `&match=${match}` : ''}`;
    try { window.history.replaceState(null, '', `${window.location.pathname}${q}`); } catch { /* not allowed in some embeds */ }
  };
  // the browser uses the page title as the file name for "Save as PDF"
  useEffect(() => {
    const name = state?.event.name ?? 'Samaggi University Challenge';
    const part = sel.form === 'all' ? 'F1-F3' : sel.form === 'f1' ? 'F1 Qualifying' : sel.form === 'f2' ? 'F2 Draw' : sel.match ? `F3 ${sel.match}` : 'F3 Matches';
    document.title = `${name} - ${part}`;
  }, [sel, state?.event.name]);
  if (!state) return <div className="print-page">{error ?? 'Loading…'}</div>;
  return <Forms state={state} sel={sel} choose={choose} />;
}

function Forms({ state, sel, choose }: { state: AppState; sel: { form: FormSel; match: string }; choose: (f: FormSel, m?: string) => void }) {
  const b = state.bracket;
  const d = state.draw;
  const f1 = state.event.f1;
  const name = (id: number | null | undefined) => (id == null ? '' : state.teamNames[id] ?? '');
  const no = (id: number | null | undefined) => (id == null ? '' : state.teamNos[id] ?? '');
  const both = (id: number | null | undefined) => (id == null ? '' : [no(id), name(id)].filter(Boolean).join(' · '));
  const qualified = state.teams.filter((t) => t.selected);
  const byRow = new Map(state.standings.map((s) => [s.rowId, s]));
  const date = fmtDate(state.event.date);
  const allPlayed = b && d?.status === 'locked' ? b.matches.filter((m) => m.status === 'done') : [];
  const played = sel.match ? allPlayed.filter((m) => m.code === sel.match) : allPlayed;
  const show = (f: 'f1' | 'f2' | 'f3') => sel.form === 'all' || sel.form === f;
  const xlsx = (f: string, m?: string) => `/api/admin/export?form=${f}${m ? `&match=${m}` : ''}`;

  return (
    <div className="print-page fd">
      <div className="no-print fd-toolbar">
        <div className="fd-pick" role="group" aria-label="Form to export">
          {(['all', 'f1', 'f2', 'f3'] as const).map((f) => (
            <button key={f} className={sel.form === f && !sel.match ? 'on' : ''} onClick={() => choose(f)}>
              {f === 'all' ? 'All forms' : f === 'f1' ? 'F1 Qualifying' : f === 'f2' ? 'F2 Draw' : 'F3 All matches'}
            </button>
          ))}
          {allPlayed.length > 0 && (
            <select aria-label="One F3 match" value={sel.form === 'f3' ? sel.match : ''} onChange={(e) => choose('f3', e.target.value)}>
              <option value="">F3 one match…</option>
              {allPlayed.map((m) => <option key={m.code} value={m.code}>F3 · {m.code}</option>)}
            </select>
          )}
        </div>
        <div className="fd-pick">
          <button className="btn-primary" onClick={() => window.print()}>Print / save as PDF</button>
          <a className="btn" href={xlsx(sel.form, sel.form === 'f3' ? sel.match : '')}>Download Excel</a>
        </div>
        <span>Showing {sel.form === 'all' ? 'F1, F2 and F3' : sel.form.toUpperCase()}{sel.match ? ` · ${sel.match}` : ''} ({VERSION}). Sign the printed copies in pen. F4 and the per-question F3 sheets stay on paper.</span>
      </div>

      {/* ================================================================ F1 */}
      {show('f1') && <>
      <article className="fd-page">
        <Head code="F1" title="Qualifying round result certificate" />
        <div className="fd-grid4">
          <Box label="Date" value={date} />
          <Box label="Room code" value={f1.roomCode} />
          <Box label="Question pack" value={f1.questionPack} />
          <Box label="Scoring mode" value={f1.scoringMode} />
          <Box label="Questions played" value={f1.questionsPlayed ?? ''} />
          <Box label="Teams that played" value={f1.teamsPlayed ?? (state.standings.length || '')} />
          <Box label="Qualifiers" value={qualified.length || ''} />
          <Box label="Excel record (file name/downloaded at)" value={state.upload ? `${state.upload.filename} · ${fmtTime(state.upload.uploadedAt)}` : ''} />
        </div>

        <Panel title="Qualified teams" sub="from the Standings tab">
          <table className="fd-table">
            <colgroup><col style={{ width: '9%' }} /><col style={{ width: '11%' }} /><col style={{ width: '31%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: '13%' }} /><col /></colgroup>
            <thead><tr><th>Rank</th><th>Team No.</th><th>Team</th><th>Score</th><th>Correct answers</th><th>Time on correct (s)</th><th>Tie-break</th></tr></thead>
            <tbody>
              {Array.from({ length: Math.max(16, qualified.length) }, (_, i) => {
                const t = qualified[i];
                const s = t?.qualifyingRowId != null ? byRow.get(t.qualifyingRowId) : undefined;
                return (
                  <tr key={i}>
                    <td className="c dim">{i + 1}</td>
                    <td className="c">{t?.teamNo ?? ''}</td>
                    <td>{t?.name ?? ''}</td>
                    <td className="r">{s?.score ?? ''}</td>
                    <td className="r">{s?.correctAnswers ?? ''}</td>
                    <td className="r">{s?.timeOnCorrect ?? ''}</td>
                    <td className="sm">{s?.tieBreak ?? (t?.source === 'manual' ? 'Added by hand' : '')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <div className="fd-cols">
          <Panel title="The cut">
            <div className="fd-row">Teams level across the cut: <Check on={f1.cutLevel === 'no'}>No</Check><Check on={f1.cutLevel === 'yes'}>Yes</Check></div>
            <div className="fd-row">Decided by: <Check on={f1.cutDecidedBy === 'correct'}>Correct answers</Check><Check on={f1.cutDecidedBy === 'time'}>Time</Check></div>
            <div className="fd-row"><Check on={f1.cutDecidedBy === 'all_through'}>Still level, all through (3.5)</Check></div>
          </Panel>
          <Panel title="Challenges and corrections">
            <div className="fd-grid2">
              <Box label="Challenges lodged" value={f1.challengesLodged ?? ''} />
              <Box label="Questions corrected" value={f1.questionsCorrected ?? ''} />
            </div>
            <div className="fd-row">Details on F4, entry nos: {blankLine(f1.f4Entries)}</div>
          </Panel>
        </div>

        <p className="fd-note">This sheet certifies the quiz system&apos;s competition log. Attach a printout of the full Standings tab. If anything here differs from the system, record why on F4.</p>
        <div className="fd-grid3">
          <Sig label="Host (signature/time)" />
          <Sig label="Chief judge (signature/time)" />
          <Sig label="Judge (signature/time)" />
        </div>
        <Foot code="F1" page="1 / 1" />
      </article>

      {/* --------------------------------------------- F1 attachment: full Standings */}
      {state.standings.length > 0 && (
        <article className="fd-page">
          <Head code="F1" title="Attachment: full Standings tab" />
          <div className="fd-grid4">
            <Box label="Date" value={date} />
            <Box label="Room code" value={f1.roomCode} />
            <Box label="Teams that played" value={state.standings.length} />
            <Box label="Excel record (file name/downloaded at)" value={state.upload ? `${state.upload.filename} · ${fmtTime(state.upload.uploadedAt)}` : ''} />
          </div>
          <Panel title="Standings" sub="every row of the Standings tab, as imported">
            <table className="fd-table">
              <thead><tr><th>Rank</th><th>Team No.</th><th>Team</th><th>Score</th><th>Correct answers</th><th>Time on correct (s)</th><th>Qualified</th><th>Tie-break</th></tr></thead>
              <tbody>
                {state.standings.map((r) => (
                  <tr key={r.rowId}>
                    <td className="c">{r.rank ?? ''}</td><td className="c">{r.teamNo}</td><td>{r.team}</td><td className="r">{r.score ?? ''}</td>
                    <td className="r">{r.correctAnswers ?? ''}</td><td className="r">{r.timeOnCorrect ?? ''}</td>
                    <td className="c">{r.qualifiedRaw || (r.qualified ? 'Yes' : 'No')}</td><td className="sm">{r.tieBreak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Foot code="F1" page="Attachment" />
        </article>
      )}
      </>}

      {/* ================================================================ F2 */}
      {show('f2') && (
      <article className="fd-page">
        <Head code="F2" title="Draw record" />
        <div className="fd-grid4">
          <Box label="Date" value={d ? fmtDate(d.createdAt.slice(0, 10)) : ''} />
          <Box label="Time" value={d ? new Date(d.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''} />
          <Box label="Place" value={d?.place ?? ''} />
          <Box label="Qualifiers" value={d?.teamCount ?? ''} />
        </div>

        <Panel title="Draw method" sub="3.4">
          <div className="fd-row">
            <Check on={d?.mode === 'manual'}>Lots from a box</Check>
            <Check on={d?.mode === 'random'}>Software (state which){d?.mode === 'random' ? <>: <span className="fd-filled">{d.software || 'Results Portal'}</span></> : null}</Check>
            <Check>Other: <span className="fd-line" style={{ width: '24mm' }} /></Check>
          </div>
          <div className="fd-row">Bye slots (fixed before the draw, 3.6): {blankLine(d ? (d.byeSlots.length ? d.byeSlots.map((s) => slotLabel(d.bracketSize, s)).join(', ') : 'None') : '', '50mm')}</div>
        </Panel>

        <Panel title="Result" sub="in the order drawn">
          <table className="fd-table">
            <colgroup><col style={{ width: '8%' }} /><col style={{ width: '11%' }} /><col style={{ width: '37%' }} /><col style={{ width: '15%' }} /><col style={{ width: '9%' }} /><col /></colgroup>
            <thead><tr><th>No.</th><th>Team No.</th><th>Team</th><th>Bracket slot</th><th>Bye</th><th>Drawn by</th></tr></thead>
            <tbody>
              {Array.from({ length: Math.max(10, d?.teamCount ?? 0) }, (_, i) => {
                const p = d?.placements[i];
                const partner = p ? (p.slot % 2 ? p.slot + 1 : p.slot - 1) : 0;
                return (
                  <tr key={i}>
                    <td className="c dim">{i + 1}</td>
                    <td className="c">{p ? no(p.teamId) : ''}</td>
                    <td>{p ? name(p.teamId) || p.teamName : ''}</td>
                    <td className="c">{p && d ? slotLabel(d.bracketSize, p.slot) : ''}</td>
                    <td className="c">{p && d?.byeSlots.includes(partner) ? 'Yes' : ''}</td>
                    <td>{p ? p.drawnBy ?? (p.method === 'random' ? 'Software' : '') : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel title="Bracket" sub={`Match IDs: ${d && d.bracketSize >= 16 ? 'R16-1–R16-8, ' : ''}${!d || d.bracketSize >= 8 ? 'QF1–QF4, ' : ''}SF1–SF2, 3RD, F`}>
          <F2Bracket state={state} />
        </Panel>

        <div className="fd-grid3">
          <Sig label="Chief judge (witness) (signature/time)" />
          <Sig label="Witness 1 (signature/time)" />
          <Sig label="Witness 2 (signature/time)" />
        </div>
        <Foot code="F2" page="1 / 1" />
      </article>
      )}

      {/* ================================================================ F3 (result page, one per match) */}
      {show('f3') && played.map((m) => <F3Result key={m.code} m={m} both={both} />)}
      {show('f3') && !played.length && (
        <article className="fd-page no-print"><Head code="F3" title="Buzzer match record: result" /><p>No match has a result yet.</p></article>
      )}
    </div>
  );
}

function F2Bracket({ state }: { state: AppState }) {
  const d = state.draw;
  const b = state.bracket;
  const size = d?.bracketSize ?? 8;
  const sk = bracketSkeleton(size);
  const rounds = Array.from(new Set(sk.map((m) => m.roundNo)));
  const live = (code: string) => b?.matches.find((x) => x.code === code) as BracketMatch | undefined;
  const label = (n: number | null | undefined, bye?: boolean) => (bye ? 'BYE' : n != null ? [state.teamNos[n], state.teamNames[n]].filter(Boolean).join(' · ') : '');

  return (
    <div className="fd-bracket">
      {rounds.map((rn) => {
        const ms = sk.filter((m) => m.roundNo === rn).sort((x, y) => (x.code === 'F' ? -1 : y.code === 'F' ? 1 : 0));
        const head = ROUND_HEAD[ms[0].code === '3RD' || ms[0].code === 'F' ? 'F' : ms[0].round];
        return (
          <div key={rn} className={`fd-bcol ${rn === 0 ? 'first' : ''}`}>
            <div className="fd-bhead">{head}</div>
            {ms.map((m) => {
              const lm = live(m.code);
              return (['A', 'B'] as const).map((side) => {
                const src = side === 'A' ? m.sourceA : m.sourceB;
                const team = side === 'A' ? lm?.teamA : lm?.teamB;
                const bye = side === 'A' ? lm?.aIsBye : lm?.bIsBye;
                const hint = rn === 0 ? (side === 'A' ? ' · Team No./Team' : '') : ` (${srcText(src)})`;
                return (
                  <div key={m.code + side} className="fd-bslot">
                    <div className="fd-lbl">{m.code}-{side}{hint}</div>
                    <div className="fd-val">{label(team, bye)}</div>
                  </div>
                );
              });
            })}
          </div>
        );
      })}
    </div>
  );
}

function F3Result({ m, both }: { m: BracketMatch; both: (id: number | null | undefined) => string }) {
  const r = m.result!;
  const how = decidedBy(r);
  return (
    <article className="fd-page">
      <Head code="F3" title="Buzzer match record: result" />
      <div className="fd-grid4">
        <Box label="Match ID" value={<b>{m.code}</b>} />
        <Box label="Last question" value={r.lastQuestion ?? ''} />
        <Box label="Round" value={matchLabel(m.round, m.index).en} />
        <Box label="Start / End" value={r.startTime || r.endTime ? `${r.startTime ?? '—'} – ${r.endTime ?? '—'}` : ''} />
      </div>

      <div className="fd-cols">
        <Panel title="Final score">
          <div className="fd-grid2">
            <Box label={`Team A · ${both(m.teamA)}`} value={r.walkover ? '' : r.scoreA ?? ''} />
            <Box label={`Team B · ${both(m.teamB)}`} value={r.walkover ? '' : r.scoreB ?? ''} />
          </div>
        </Panel>
        <Panel title="Decided by">
          <div className="fd-checks2">
            <Check on={how === 'score'}>Score at time</Check>
            <Check on={how === 'sudden_death'}>Sudden Death (Q {blankLine(how === 'sudden_death' ? r.sdQuestion : '', '8mm')})</Check>
            <Check on={how === 'walkover'}>Walkover (2.6)</Check>
            <Check on={how === 'disqualification'}>Disqualification (10)</Check>
          </div>
        </Panel>
      </div>

      <div className="fd-grid2">
        <Box label="Winner (Team No./Team)" value={both(m.winner)} />
        <Box label="Loser (Team No./Team)" value={both(m.loser)} />
      </div>

      <Panel title="During the match">
        <div className="fd-grid4">
          <Box label="Clock stops" />
          <Box label="Voided questions" />
          <Box label="Manual score changes" />
          <Box label="F4 entry nos" value={r.f4Entries ?? ''} />
        </div>
        <Box label="Judge's remarks" tall />
      </Panel>

      <p className="fd-note">The result is official once the scorer and judge sign. Captains sign only to acknowledge, not to agree; it does not withdraw a challenge already lodged.</p>
      <div className="fd-grid3">
        <Sig label="Scorer (signature/time)" />
        <Sig label="Judge (signature/time)" />
        <Sig label="Quiz master (signature/time)" />
      </div>
      <div className="fd-grid2">
        <Sig label="Captain A (acknowledged) (signature/time)" />
        <Sig label="Captain B (acknowledged) (signature/time)" />
      </div>
      <Foot code="F3" page={`${m.code} · 3 / 3`} />
    </article>
  );
}
