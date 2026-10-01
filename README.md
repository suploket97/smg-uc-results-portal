# Samaggi University Challenge — Results Portal

Results portal: import qualifying → draw → enter scores → big-screen display → Excel export.

Stack: Next.js 15 (TypeScript) + Supabase Postgres, deployed on Vercel's free tier.

---

## Setup (about 15 minutes)

### 1. Supabase: create the tables
1. Create a project at supabase.com (free tier is fine). Note the **database password**.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and press **Run**.
   It is safe to run again later.
3. Click **Connect** (top of the project page) → **Transaction pooler**. Copy the connection string
   (it ends in `:6543/postgres`) and put your database password in place of `[YOUR-PASSWORD]`.
   This is your `DATABASE_URL`.

### 2. GitHub
Unzip this folder, then push it to a new repository (GitHub Desktop: *Add existing repository* → *Publish*;
or `git init && git add . && git commit -m "Results portal" && git push`).

### 3. Vercel
1. **Add New → Project →** import the GitHub repository. Framework is detected as Next.js.
2. Under **Environment Variables** add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Supabase Transaction pooler string from step 1. Not needed if you connected Supabase through Vercel's Supabase integration: the app then uses the `POSTGRES_URL` it creates. |
   | `ADMIN_PASSWORD` | the one admin password |
   | `CRON_SECRET` | optional, any long random text (protects the keep-alive URL) |
   | `EVENT_TIMEZONE` | optional, default `Europe/London` (times in the Excel export) |

3. **Deploy.** Open `https://<your-app>.vercel.app/admin` and sign in.

`vercel.json` adds a daily cron that calls `/api/keepalive`, so the free Supabase project never sits idle
for 7 days. Vercel shows it under **Settings → Cron Jobs**.

### Run on your own computer (optional)
```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL and ADMIN_PASSWORD
npm run dev                    # http://localhost:3000
npm test                       # bracket, import and Excel tests
```

---

### If something does not work: `/setup-check`
Open `https://<your-app>.vercel.app/setup-check`. It shows, without revealing any password, whether
`ADMIN_PASSWORD` and `DATABASE_URL` are set, whether the database answers, and whether the tables
and the latest columns exist, with what to fix for each.

- **"Login failed" / "ADMIN_PASSWORD is not set"**: add `ADMIN_PASSWORD` in Vercel, then **redeploy**
  (Deployments → ⋯ → Redeploy). Vercel only applies new environment variables to new deployments.
- **"Wrong password"**: the password typed differs from `ADMIN_PASSWORD`.
- **Database errors**: use the *Transaction pooler* string (port 6543), with the real database password
  in place of `[YOUR-PASSWORD]`. URL-encode special characters in that password (`@` → `%40`, `#` → `%23`).

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
