-- Retain: run this once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run.

-- Each user's words. Row-level security guarantees a user can only ever
-- read or write their own rows.
create table if not exists public.words (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word text not null,
  meaning text not null default '',
  meaning_hi text not null default '',
  examples text[] not null default '{}',
  notes text not null default '',
  phonetic text not null default '',
  part_of_speech text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  next_review_at timestamptz not null default now(),
  interval_days double precision not null default 0,
  ease_factor double precision not null default 2.5,
  repetitions integer not null default 0,
  lapses integer not null default 0
);

create index if not exists words_user_id_idx on public.words (user_id);

alter table public.words enable row level security;

drop policy if exists "words_select_own" on public.words;
drop policy if exists "words_insert_own" on public.words;
drop policy if exists "words_update_own" on public.words;
drop policy if exists "words_delete_own" on public.words;

create policy "words_select_own" on public.words
  for select to authenticated using (user_id = auth.uid());
create policy "words_insert_own" on public.words
  for insert to authenticated with check (user_id = auth.uid());
create policy "words_update_own" on public.words
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "words_delete_own" on public.words
  for delete to authenticated using (user_id = auth.uid());

-- Review streak per user.
create table if not exists public.user_stats (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  streak integer not null default 0,
  last_review_date text,
  total_reviews integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_stats enable row level security;

drop policy if exists "stats_select_own" on public.user_stats;
drop policy if exists "stats_insert_own" on public.user_stats;
drop policy if exists "stats_update_own" on public.user_stats;

create policy "stats_select_own" on public.user_stats
  for select to authenticated using (user_id = auth.uid());
create policy "stats_insert_own" on public.user_stats
  for insert to authenticated with check (user_id = auth.uid());
create policy "stats_update_own" on public.user_stats
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Shared lookup cache (word → meaning). Only the `enrich` Edge Function
-- touches it, using the service role, so no client policies are defined.
create table if not exists public.word_cache (
  word text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.word_cache enable row level security;
