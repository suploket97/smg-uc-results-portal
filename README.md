# Samaggi University Challenge — Results Portal

Results portal: import qualifying → draw → enter scores → big-screen display → Excel export.

Stack: Next.js 15 (TypeScript) + Supabase Postgres, deployed on Vercel's free tier.

---

## Setup (about 5 minutes, no Vercel settings and no SQL needed)

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project →** import the repository.
3. Connect the database: in the Vercel project open **Storage** (or **Integrations**) → **Supabase** and connect a
   Supabase project. This adds `POSTGRES_URL`; the app reads it automatically.
4. Deploy, then open `https://<your-app>.vercel.app/admin/login`.
   - On first use the app **creates its own tables** in that Supabase project (and upgrades them after an update).
   - If no admin password exists yet, the page asks you to **create one**. Do this straight after deploying:
     the first person to open the page sets it. You can change it later on **Setup**.
5. `https://<your-app>.vercel.app/setup-check` shows that everything is in place.

`supabase/schema.sql` is the same SQL the app runs by itself. You only need it if you want to create the
tables by hand. To reset a forgotten password, run this in the Supabase SQL Editor of the connected project,
then sign in with the new password:
```sql
insert into settings (key, value) values ('admin_password', 'new-password')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

Optional environment variables (none are required):

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

- **"relation … does not exist"**: you are running an older version of the app. Deploy this version; it creates the tables itself.
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
| Export one form or all of them, as PDF (print) or Excel | Overview → **Export**, or `/print` (pick a form at the top). One match's F3: **Matches** → open the match → F3 PDF / F3 Excel |
| Printable results / save as PDF | `/print` |

**Projector pages** (public, no login, refresh themselves every few seconds; double-click for full screen):

- `/screen/draw` — each placement is revealed with an animation, for both draw modes
- `/screen/draw?controls=1` — the same, plus a **Draw next team** button (or Space) for random mode; needs the admin login in that browser
- `/screen/bracket` — the whole bracket with scores and the next match
- `/screen/next` — big "Next match" card
- `/screen/results` — champion, runner-up, third, and the qualifying standings

### Next year: a new competition

The portal keeps every competition (for example one per year) in the same database. Nothing is reset or deleted.

- **Setup → Competitions → Start a new competition** opens a new, empty one and makes it the *current* one.
  The admin pages and the projector pages always work on the current competition. Its date is shown under the name
  at the top of every admin page.
- Every earlier competition stays in the list with its own **Forms (PDF)**, **Excel** and **Results screen** buttons
  (`/print?c=<id>`, `/api/admin/export?c=<id>`, `/screen/results?c=<id>`).
- **Make current** switches back to an earlier one, for example to correct a result.
- **Delete** is only for test runs: you have to type the competition's name, and the current one cannot be deleted.

A database from an earlier version upgrades by itself on the first request after you deploy: the data already there
becomes the first competition.

### Matching the paper forms F1–F4
The paper forms (F1–F4, v2026-10) stay the signed official record; the portal is the clean digital copy.

| Form | In the portal |
|---|---|
| **F1** qualifying certificate | `/admin/import` → F1 card. Room code, date, questions played, teams played and the cut are filled from the file; question pack, scoring mode and challenge counts are typed in. |
| **F2** draw record | Slots are named like the form (`QF1-A`, `QF1-B` …). Place is set when the draw starts; each lot can record **Drawn by**. |
| **F3** match result | Decided by: score at time / Sudden Death (with the question no.) / Walkover (2.6) / Disqualification (10). Optional start, end, last question and F4 entry nos. |
| **F4** rulings log | Stays on paper; enter its entry numbers in F1 and F3. |

**Team No.** is read from a `Team No.` column in the Standings tab (also accepted: `Team number`, `No.`, `เลขทีม`). If the file has none, type numbers on the Teams page, or start hand-typed teams with the number (`7 Oxford Siam`).

`/print` (or `/print?form=f1`, `f2`, `f3`, `f3&match=SF1`) reproduces the English forms F1–F3 (v2026-10) with every signature box (F1: host, chief judge, judge; F2: chief judge and two witnesses; F3: scorer, judge, quiz master and both captains). The portal fills in what it knows; signatures and fields it does not record (clock stops, voided questions, manual score changes, judge's remarks) are left blank for pen. Print one F3 result page per played match, plus the full Standings tab as the F1 attachment. The Excel export follows the same split: `/api/admin/export?form=f1|f2|f3[&match=QF1]`, or no form for everything. It is also laid out like F1, F2 and F3 (Excel tabs: F1 Qualifying, Standings (full), F2 Draw, F3 Matches, Edit log, Draw history).

**Upgrading a database from the first version:** run `supabase/schema.sql` again. The `v2` block at the end only adds the new columns.

### How the rules work
- **Draw screen:** with lots from a box, each lot appears straight away with its slot (no spinning names, since the room has already heard it). With the on-screen random draw, names spin for about 2 seconds first, because the computer is doing the drawing.
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
