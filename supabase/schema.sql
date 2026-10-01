-- Samaggi University Challenge — Results Portal
-- Run this once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run again (it only creates what is missing).
--
-- The app talks to the database from the server only (DATABASE_URL), so
-- Row Level Security is switched on with no policies: the public anon key
-- cannot read or write anything.

-- Before v4 this single row held the event. v4 copies it into "competitions".
create table if not exists event (
  id              int primary key default 1 check (id = 1),
  name            text not null default 'Samaggi University Challenge',
  event_date      date,
  qualifier_count int  not null default 8 check (qualifier_count between 2 and 16),
  draw_mode       text not null default 'manual' check (draw_mode in ('manual', 'random')),
  updated_at      timestamptz not null default now()
);
insert into event (id) values (1) on conflict (id) do nothing;

-- Original uploaded files (kept so they can be downloaded again)
create table if not exists uploads (
  id           bigserial primary key,
  filename     text not null,
  content_type text,
  data         bytea not null,
  sheet_name   text,
  row_count    int,
  uploaded_at  timestamptz not null default now()
);

-- The Standings table exactly as imported
create table if not exists qualifying_rows (
  id               bigserial primary key,
  upload_id        bigint not null references uploads(id) on delete cascade,
  row_order        int not null,
  rank             int,
  team             text not null,
  score            numeric,
  correct_answers  int,
  time_on_correct  numeric,
  qualified        boolean not null default false,
  qualified_raw    text,
  anti_cheat_flags text,
  tie_break        text
);
create index if not exists qualifying_rows_upload_idx on qualifying_rows (upload_id, row_order);

-- Teams available for the draw. selected = ticked as a qualifier.
-- Teams are never deleted (active = false) so old draws keep their names.
create table if not exists teams (
  id                bigserial primary key,
  name              text not null,
  source            text not null check (source in ('import', 'manual')),
  qualifying_row_id bigint references qualifying_rows(id) on delete set null,
  qual_rank         int,
  qual_score        numeric,
  selected          boolean not null default true,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- One row per draw. Only one draw is current (status open or locked);
-- "Redo draw" archives it.
create table if not exists draws (
  id           bigserial primary key,
  status       text not null default 'open' check (status in ('open', 'locked', 'archived')),
  mode         text not null check (mode in ('manual', 'random')),
  team_count   int  not null check (team_count between 2 and 16),
  bracket_size int  not null,
  created_at   timestamptz not null default now(),
  locked_at    timestamptz,
  archived_at  timestamptz
);
-- (v4 replaces the old one-current-draw index with one per competition, below)

create table if not exists draw_placements (
  draw_id    bigint not null references draws(id) on delete cascade,
  slot       int    not null,
  team_id    bigint not null references teams(id),
  team_name  text   not null,
  pick_order int    not null,
  method     text   not null check (method in ('manual', 'random')),
  placed_at  timestamptz not null default now(),
  primary key (draw_id, slot),
  unique (draw_id, team_id),
  unique (draw_id, pick_order)
);

create table if not exists match_results (
  draw_id      bigint not null references draws(id) on delete cascade,
  code         text   not null,
  team_a_id    bigint not null references teams(id),
  team_b_id    bigint not null references teams(id),
  score_a      int,
  score_b      int,
  sudden_death boolean not null default false,
  walkover     boolean not null default false,
  winner_id    bigint not null references teams(id),
  updated_at   timestamptz not null default now(),
  primary key (draw_id, code)
);

-- Every change to a result: the previous value and when it changed
create table if not exists match_edits (
  id        bigserial primary key,
  draw_id   bigint not null references draws(id) on delete cascade,
  code      text   not null,
  action    text   not null check (action in ('create', 'update', 'clear')),
  old_value jsonb,
  new_value jsonb,
  note      text,
  edited_at timestamptz not null default now()
);
create index if not exists match_edits_draw_idx on match_edits (draw_id, edited_at);

alter table event           enable row level security;
alter table uploads         enable row level security;
alter table qualifying_rows enable row level security;
alter table teams           enable row level security;
alter table draws           enable row level security;
alter table draw_placements enable row level security;
alter table match_results   enable row level security;
alter table match_edits     enable row level security;

-- ---------------------------------------------------------------------------
-- v2 (October 2026): fields that match the paper record forms F1–F3.
-- Safe to run on a database created from the first version.
alter table event           add column if not exists f1 jsonb not null default '{}'::jsonb;  -- F1 certificate details
alter table uploads         add column if not exists question_count int;                    -- rows in the Questions tab
alter table qualifying_rows add column if not exists team_no text;                          -- เลขทีม · Team No.
alter table teams           add column if not exists team_no text;
alter table draws           add column if not exists place text;                            -- F2 สถานที่ · Place
alter table draws           add column if not exists software text;                         -- F2 Software (state which)
alter table draw_placements add column if not exists drawn_by text;                         -- F2 ผู้จับ · Drawn by
alter table match_results   add column if not exists disqualification boolean not null default false; -- F3 (10)
alter table match_results   add column if not exists sd_question int;                       -- F3 Sudden Death (ข้อ · Q __)
alter table match_results   add column if not exists start_time text;                       -- F3 เวลาเริ่ม · Start
alter table match_results   add column if not exists end_time text;                         -- F3 เวลาจบ · End
alter table match_results   add column if not exists last_question int;                     -- F3 ข้อสุดท้ายที่เล่น
alter table match_results   add column if not exists f4_entries text;                       -- F3 เลขรายการ F4

-- ---------------------------------------------------------------------------
-- v3: settings kept in the database, so nothing has to be set in Vercel.
create table if not exists settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table settings enable row level security;

-- ---------------------------------------------------------------------------
-- v4: one row per competition (for example one per year). Starting a new one
-- keeps every earlier competition, with its teams, draws, results and edit log.
create table if not exists competitions (
  id              bigserial primary key,
  name            text not null default 'Samaggi University Challenge',
  event_date      date,
  qualifier_count int  not null default 8 check (qualifier_count between 2 and 16),
  draw_mode       text not null default 'manual' check (draw_mode in ('manual', 'random')),
  f1              jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table competitions enable row level security;
-- The data that existed before v4 becomes the first competition.
insert into competitions (id, name, event_date, qualifier_count, draw_mode, f1, created_at, updated_at)
  select 1, name, event_date, qualifier_count, draw_mode, f1, updated_at, updated_at from event
  where id = 1 and not exists (select 1 from competitions);
insert into competitions (id) select 1 where not exists (select 1 from competitions);
select setval(pg_get_serial_sequence('competitions', 'id'), (select max(id) from competitions));

alter table uploads add column if not exists competition_id bigint references competitions(id) on delete cascade;
alter table teams   add column if not exists competition_id bigint references competitions(id) on delete cascade;
alter table draws   add column if not exists competition_id bigint references competitions(id) on delete cascade;
update uploads set competition_id = (select min(id) from competitions) where competition_id is null;
update teams   set competition_id = (select min(id) from competitions) where competition_id is null;
update draws   set competition_id = (select min(id) from competitions) where competition_id is null;
alter table uploads alter column competition_id set not null;
alter table teams   alter column competition_id set not null;
alter table draws   alter column competition_id set not null;
create index if not exists uploads_competition_idx on uploads (competition_id);
create index if not exists teams_competition_idx   on teams (competition_id);
drop index if exists draws_one_current;
create unique index if not exists draws_one_current_per_competition on draws (competition_id) where status <> 'archived';

-- ===> Set the admin password: change the text in quotes, then run this line. <===
-- (The app replaces it with a salted hash the first time someone signs in.
--  Run it again later to reset a forgotten password. If the ADMIN_PASSWORD
--  environment variable is set in Vercel, that one is used instead.)
-- insert into settings (key, value) values ('admin_password', 'CHANGE-ME') on conflict (key) do update set value = excluded.value, updated_at = now();
