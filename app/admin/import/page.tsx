'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AdminShell, Loading, useToast } from '@/components/AdminShell';
import { useAppState, postForm, post } from '@/lib/client';
import { fmtTime } from '@/lib/labels';
import type { StandingRow } from '@/lib/importer';
import type { AppState, F1Info } from '@/lib/types';

interface Preview { rows: StandingRow[]; sheetName: string; warnings: string[] }

const fmt = (n: number | null | undefined) => (n == null ? '' : String(n));

function StandingsTable({ rows, showFlags }: { rows: { rank: number | null; teamNo: string; team: string; score: number | null; correctAnswers: number | null; timeOnCorrect: number | null; qualified: boolean; qualifiedRaw: string; antiCheatFlags?: string; tieBreak: string }[]; showFlags?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr>
          <th className="num">Rank</th><th>Team No.</th><th>Team</th><th className="num">Score</th><th className="num">Correct</th>
          <th className="num">Time (s)</th><th>Qualified</th>{showFlags && <th>Anti-cheat</th>}<th>Tie-break</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.qualified ? 'yes' : ''}>
              <td className="num">{fmt(r.rank)}</td>
              <td><span className="team-no">{r.teamNo}</span></td>
              <td><b>{r.team}</b></td>
              <td className="num">{fmt(r.score)}</td>
              <td className="num">{fmt(r.correctAnswers)}</td>
              <td className="num">{fmt(r.timeOnCorrect)}</td>
              <td>{r.qualified ? <span className="chip amber">{r.qualifiedRaw || 'Yes'}</span> : <span className="dim">{r.qualifiedRaw || 'No'}</span>}</td>
              {showFlags && <td>{r.antiCheatFlags ? <span className="chip red">{r.antiCheatFlags}</span> : ''}</td>}
              <td className="small muted">{r.tieBreak}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CUT_BY: { v: NonNullable<F1Info['cutDecidedBy']>; en: string }[] = [
  { v: 'correct', en: 'Correct answers' },
  { v: 'time', en: 'Time' },
  { v: 'all_through', en: 'Still level, all through (3.5)' },
];

function F1Card({ state, onSaved, toast }: { state: AppState; onSaved: (s: AppState) => void; toast: ReturnType<typeof useToast> }) {
  const [f, setF] = useState<F1Info>(state.event.f1);
  const [date, setDate] = useState(state.event.date ?? '');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!dirty) { setF(state.event.f1); setDate(state.event.date ?? ''); } }, [state.event, dirty]);
  const set = (patch: Partial<F1Info>) => { setF({ ...f, ...patch }); setDirty(true); };
  const numIn = (k: keyof F1Info, label: string) => (
    <label className="field"><span>{label}</span>
      <input type="number" inputMode="numeric" value={(f[k] as number | null) ?? ''}
        onChange={(e) => set({ [k]: e.target.value === '' ? null : Number(e.target.value) } as Partial<F1Info>)} />
    </label>
  );
  const textIn = (k: keyof F1Info, label: string) => (
    <label className="field"><span>{label}</span>
      <input type="text" value={f[k] as string} onChange={(e) => set({ [k]: e.target.value } as Partial<F1Info>)} />
    </label>
  );
  const qualifiers = state.teams.filter((t) => t.selected).length;

  async function save() {
    setBusy(true);
    const r = await post('/api/admin/event', { f1: f, date: date || null });
    setBusy(false);
    if (r.ok && r.state) { onSaved(r.state); setDirty(false); toast.show('F1 details saved'); }
    else toast.show(r.error || 'Error', 'err');
  }

  return (
    <div className="card stack">
      <div className="row"><span className="form-code">F1</span><h2 style={{ margin: 0 }}>Qualifying certificate</h2></div>
      <p className="small muted">Filled from the file where possible; check against the paper F1.</p>
      <div className="grid4">
        <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDirty(true); }} /></label>
        {textIn('roomCode', 'Room code')}
        {textIn('questionPack', 'Question pack')}
        {textIn('scoringMode', 'Scoring mode')}
        {numIn('questionsPlayed', 'Questions played')}
        {numIn('teamsPlayed', 'Teams that played')}
        <label className="field"><span>Qualifiers</span><input type="text" value={String(qualifiers)} disabled /></label>
        <label className="field"><span>Excel record</span><input type="text" value={state.upload ? `${state.upload.filename} · ${fmtTime(state.upload.uploadedAt)}` : ''} disabled /></label>
      </div>
      <div>
        <div className="small muted">The cut — Teams level across the cut</div>
        <div className="seg" style={{ marginTop: 4, maxWidth: 320 }}>
          <label><input type="radio" name="cutLevel" checked={f.cutLevel === 'no'} onChange={() => set({ cutLevel: 'no', cutDecidedBy: null })} />No</label>
          <label><input type="radio" name="cutLevel" checked={f.cutLevel === 'yes'} onChange={() => set({ cutLevel: 'yes' })} />Yes</label>
        </div>
      </div>
      {f.cutLevel === 'yes' && (
        <div>
          <div className="small muted">Decided by</div>
          <div className="seg" style={{ marginTop: 4 }}>
            {CUT_BY.map((c) => (
              <label key={c.v}><input type="radio" name="cutBy" checked={f.cutDecidedBy === c.v} onChange={() => set({ cutDecidedBy: c.v })} />{c.en}</label>
            ))}
          </div>
        </div>
      )}
      <div className="grid4">
        {numIn('challengesLodged', 'Challenges lodged')}
        {numIn('questionsCorrected', 'Questions corrected')}
      </div>
      {textIn('f4Entries', 'Details on F4, entry nos')}
      <button className="btn-primary" disabled={busy || !dirty} onClick={save}>{dirty ? 'Save F1 details' : 'Saved'}</button>
    </div>
  );
}

export default function ImportPage() {
  const { state, setState, error } = useAppState({ admin: true });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  if (!state) return <AdminShell state={null}><Loading error={error} /></AdminShell>;

  const locked = !!state.draw && state.draw.placements.length > 0;

  async function choose(f: File | null) {
    setFile(f);
    setPreview(null);
    if (!f) return;
    const form = new FormData();
    form.set('file', f);
    form.set('preview', '1');
    setBusy(true);
    const r = await postForm('/api/admin/import', form);
    setBusy(false);
    if (r.ok) setPreview(r.preview as Preview);
    else toast.show(r.error || 'Error', 'err');
  }

  async function doImport() {
    if (!file) return;
    if (state!.teams.some((t) => t.source === 'import') &&
        !confirm('Replace the previously imported teams?')) return;
    const form = new FormData();
    form.set('file', file);
    setBusy(true);
    const r = await postForm('/api/admin/import', form);
    setBusy(false);
    if (r.ok && r.state) {
      setState(r.state);
      setPreview(null);
      setFile(null);
      if (input.current) input.current.value = '';
      toast.show(`Imported ${r.result?.count ?? ''} rows`);
    } else toast.show(r.error || 'Error', 'err');
  }

  const qualifiedCount = preview?.rows.filter((r) => r.qualified).length ?? 0;
  const target = state.event.qualifierCount;

  return (
    <AdminShell state={state}>
      <div className="card stack">
        <h1>Import qualifying</h1>
        <p className="muted small">The quiz app&apos;s .xlsx (Standings tab) or a .csv with the same columns.</p>
        {locked && <div className="notice warn">The draw has started. Redo the draw before importing again.</div>}
        <input ref={input} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          disabled={locked || busy} onChange={(e) => choose(e.target.files?.[0] ?? null)} />
        {busy && <p className="muted">Reading…</p>}
      </div>

      {preview && (
        <div className="card stack">
          <h2>Preview <span className="muted small">({preview.sheetName}, {preview.rows.length} rows)</span></h2>
          {preview.warnings.map((w) => <div key={w} className="notice warn small">{w}</div>)}
          <p>Qualified = Yes: <b className="w">{qualifiedCount}</b> of {target} set in Setup</p>
          {qualifiedCount !== target && (
            <div className="notice warn">The count differs from the qualifier count ({target}), e.g. a tie at the cut. You can tick or untick teams on the Teams page after importing.</div>
          )}
          <StandingsTable rows={preview.rows} showFlags />
          <div className="row">
            <button className="btn-primary" disabled={busy || locked} onClick={doImport}>Import {preview.rows.length} rows</button>
            <button className="btn-ghost" onClick={() => choose(null)}>Cancel</button>
          </div>
        </div>
      )}

      {state.upload && (
        <div className="card stack">
          <div className="row">
            <h2 style={{ margin: 0 }}>Current standings</h2>
            <div className="spacer" />
            <Link className="btn btn-sm" href="/admin/teams">Edit teams →</Link>
          </div>
          <p className="small muted">
            {state.upload.filename} · {fmtTime(state.upload.uploadedAt)} ·{' '}
            <a href={`/api/admin/upload-file?id=${state.upload.id}`}>Download original</a>
          </p>
          <StandingsTable rows={state.standings} showFlags />
        </div>
      )}

      <F1Card state={state} onSaved={setState} toast={toast} />

      {(state.admin?.uploads.length ?? 0) > 1 && (
        <div className="card">
          <h3>Earlier uploads</h3>
          <ul className="small">
            {state.admin!.uploads.slice(1).map((u) => (
              <li key={u.id}><a href={`/api/admin/upload-file?id=${u.id}`}>{u.filename}</a> <span className="muted">· {fmtTime(u.uploadedAt)} · {u.rowCount} rows</span></li>
            ))}
          </ul>
        </div>
      )}
      {toast.node}
    </AdminShell>
  );
}
