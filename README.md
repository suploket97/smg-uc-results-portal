# Samaggi University Challenge — Results Portal

Results portal: import qualifying → draw → enter scores → big-screen display → Excel export.

Stack: Next.js 15 (TypeScript) + Supabase Postgres, deployed on Vercel's free tier.

---

## Setup (about 10 minutes, no Vercel settings needed)

### 1. Supabase
1. Create a project at supabase.com (free tier is fine).
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and press **Run**.
   It is safe to run again later; it only adds what is missing.
3. Set the admin password. In the SQL Editor run this one line, with your own password in the quotes:
   ```sql
   insert into settings (key, value) values ('admin_password', 'your-password')
   on conflict (key) do update set value = excluded.value, updated_at = now();
   ```
   The app replaces it with a salted hash the first time someone signs in. Run the same line again to
   reset a forgotten password. Once signed in, you can also change it on **Setup**.

### 2. GitHub and Vercel
1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project →** import the repository.
3. Connect the database: in the Vercel project open **Storage** (or **Integrations**) → **Supabase** →
   connect it to the project from step 1. This adds `POSTGRES_URL` for you; the app reads it automatically.
4. Deploy, then open `https://<your-app>.vercel.app/setup-check`. When every line says OK, go to `/admin`.

Optional environment variables, only if you prefer them to the database settings:

| Name | Use |
|---|---|
| `DATABASE_URL` | A Supabase *Transaction pooler* string (port 6543), instead of the integration's `POSTGRES_URL`. |
| `ADMIN_PASSWORD` | If set, this password is used instead of the one in the `settings` table. |
| `CRON_SECRET` | Protects the daily keep-alive URL. |
| `EVENT_TIMEZONE` | Time zone for times in the Excel export (default `Europe/London`). |

`vercel.json` adds a daily cron that calls `/api/keepalive`, so the free Supabase project never sits idle
for 7 days.

### Run on your own computer (optional)
```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL
npm run dev                    # http://localhost:3000
npm test                       # bracket, import and Excel tests
```

### If something does not work: `/setup-check`
Open `https://<your-app>.vercel.app/setup-check`. It shows, without revealing any password, whether
a database connection string is set, whether the database answers, whether an admin password exists, and whether the tables
and the latest columns exist, with what to fix for each.

- **"No admin password has been set"**: run the `insert into settings …` line from Setup step 1.3.
- **"Wrong password"**: the password typed differs from the one set in the `settings` table (or `ADMIN_PASSWORD`, if that is set).
- **No database connection string**: connect Supabase to the Vercel project (Storage → Supabase), then redeploy.
- **Database errors with your own DATABASE_URL**: use the *Transaction pooler* string (port 6543), with the real
  database password in place of `[YOUR-PASSWORD]`. URL-encode special characters (`@` → `%40`, `#` → `%23`).

## On the day

| Step | Where |
|---|---|
| Event name, date, number of qualifiers, draw mode | `/admin/setup` |
| Upload the quiz app's `.xlsx` (Standings tab) or `.csv` | `/admin/import` |
| Tick/untick qualifiers, fix names, or type teams by hand | `/admin/teams` |
| Draw: manual (lots from a box) or random on screen | `/admin/draw` |
| Enter scores, Sudden Death, Walkover; edit or clear results | `/admin/matches` |
| Download everything (F1, F2, F3 tabs plus full Standings and the edit log) | Overview → **Download Excel** |
| Printable results / save as PDF | `/print` |

**Projector pages** (public, no login, refresh themselves every few seconds; double-click for full screen):

- `/screen/draw` — each placement is revealed with an animation, for both draw modes
- `/screen/draw?controls=1` — the same, plus a **Draw next team** button (or Space) for random mode; needs the admin login in that browser
- `/screen/bracket` — the whole bracket with scores and the next match
- `/screen/next` — big "Next match" card
- `/screen/results` — champion, runner-up, third, and the qualifying standings

### Matching the paper forms F1–F4
The paper forms (F1–F4, v2026-10) stay the signed official record; the portal is the clean digital copy.

| Form | In the portal |
|---|---|
| **F1** qualifying certificate | `/admin/import` → F1 card. Room code, date, questions played, teams played and the cut are filled from the file; question pack, scoring mode and challenge counts are typed in. |
| **F2** draw record | Slots are named like the form (`QF1-A`, `QF1-B` …). Place is set when the draw starts; each lot can record **Drawn by**. |
| **F3** match result | Decided by: score at time / Sudden Death (with the question no.) / Walkover (2.6) / Disqualification (10). Optional start, end, last question and F4 entry nos. |
| **F4** rulings log | Stays on paper; enter its entry numbers in F1 and F3. |

**Team No.** is read from a `Team No.` column in the Standings tab (also accepted: `Team number`, `No.`, `เลขทีม`). If the file has none, type numbers on the Teams page, or start hand-typed teams with the number (`7 Oxford Siam`).

`/print` reproduces the English forms F1–F3 (v2026-10) with every signature box (F1: host, chief judge, judge; F2: chief judge and two witnesses; F3: scorer, judge, quiz master and both captains). The portal fills in what it knows; signatures and fields it does not record (clock stops, voided questions, manual score changes, judge's remarks) are left blank for pen. Print one F3 result page per played match, plus the full Standings tab as the F1 attachment. The Excel export is also laid out like F1, F2 and F3 (Excel tabs: F1 Qualifying, Standings (full), F2 Draw, F3 Matches, Edit log, Draw history).

**Upgrading a database from the first version:** run `supabase/schema.sql` again. The `v2` block at the end only adds the new columns.

### How the rules work
- **Bracket size:** 2–16 teams. 8 → QF1–QF4, SF1–SF2, 3RD, F. 3–4 → SF + Final. 9–16 → Round of 16 (`R16-1…8`) first.
- **Byes** sit in fixed slots, spread across both halves (6 teams: slots 2 and 7, so QF1 and QF4). Bye teams advance automatically; lots fill only the real slots.
- **Order of play:** first round in order, then SF1, SF2, third place, Final. "Next match" is the first one ready in that order.
- **Ties** can't be saved unless Sudden Death is ticked and a winner chosen. **Walkover** needs only the winner.
- **Editing a result** keeps the old value and the time in the edit log. If the winner changes and later matches were already entered, the app asks first, then clears those later matches so they can be re-entered (the cleared values stay in the log).
- **Redo draw** asks for confirmation (and typing `REDO` once matches have been played). The old draw and its results are kept in history and in the Excel export.
- The team list locks once the first lot is drawn; names can still be corrected.

---

## Language and fonts
- Every menu, label and message is in English. Anything people type (team names, places, names in "Drawn by") can be in Thai.
- Fonts match the record forms: **Bebas Neue** for headings, **Inter** for Latin text and **Noto Sans Thai** for Thai.
  They are loaded with `next/font` in `app/layout.tsx`, which downloads them at build time and serves them from your own site,
  so the venue's network never has to reach Google Fonts. Inter has no Thai letters, so Thai text falls through to Noto Sans Thai.

## Changing the look
All colours and fonts are tokens at the top of `app/globals.css` (`--bg`, `--accent`, `--font-head`, …).
Big-screen pages are a fixed 1920×1080 canvas (`components/Stage.tsx`) scaled to the window.

| File | What it is |
|---|---|
| `lib/bracket.ts` | Bracket rules: sizes, byes, advancement, result checks (tested) |
| `lib/repo.ts` | All database reads and writes |
| `lib/importer.ts`, `lib/xlsx.ts` | Standings import and Excel read/write (no extra libraries) |
| `lib/exporter.ts` | The Excel export |
| `app/admin/*` | Admin pages (phone-friendly) |
| `app/screen/*`, `components/BracketView.tsx` | Projector pages |
| `supabase/schema.sql` | Database tables |

Data kept: team names and scores only, plus the uploaded Standings file. No personal data.
Every database call happens on the server; Row Level Security is on with no policies, so Supabase's public key can't read anything.
