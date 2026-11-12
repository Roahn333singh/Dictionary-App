-- Retain: word sharing between friends.
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.

-- Usernames. A signed-in person can read only their own row.
-- Friend names are returned by list_friends for that caller, not by listing this table.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_read_signed_in" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (user_id = auth.uid());

-- Create a profile for every new account.
-- A taken username fails the signup. Other profile errors must not.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired text := lower(trim(coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    split_part(coalesce(new.email, ''), '@', 1)
  )));
begin
  insert into public.profiles (user_id, name)
  values (new.id, desired)
  on conflict (user_id) do nothing;
  return new;
exception
  when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  when check_violation then
    raise exception 'username_invalid' using errcode = '23514';
  when others then
    return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for accounts that already exist.
insert into public.profiles (user_id, name)
select id, coalesce(nullif(raw_user_meta_data ->> 'display_name', ''), split_part(email, '@', 1))
from auth.users
on conflict do nothing;

-- Words shared from one friend to another.
create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  word text not null check (char_length(word) between 1 and 80),
  payload jsonb not null default '{}'::jsonb,
  note text not null default '' check (char_length(note) <= 200),
  status text not null default 'pending' check (status in ('pending', 'added', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint shares_not_self check (from_user <> to_user)
);

create index if not exists shares_inbox_idx on public.shares (to_user, status, created_at desc);
create unique index if not exists shares_one_pending_idx
  on public.shares (from_user, to_user, lower(word)) where status = 'pending';

alter table public.shares enable row level security;

drop policy if exists "shares_select_own" on public.shares;
drop policy if exists "shares_insert_as_sender" on public.shares;
drop policy if exists "shares_update_recipient" on public.shares;
drop policy if exists "shares_delete_own" on public.shares;

create policy "shares_select_own" on public.shares
  for select to authenticated using (to_user = auth.uid() or from_user = auth.uid());
create policy "shares_insert_as_sender" on public.shares
  for insert to authenticated
  with check (from_user = auth.uid() and pg_column_size(payload) < 8000);
create policy "shares_update_recipient" on public.shares
  for update to authenticated using (to_user = auth.uid()) with check (to_user = auth.uid());
create policy "shares_delete_own" on public.shares
  for delete to authenticated using (to_user = auth.uid() or from_user = auth.uid());

-- Recipients may only change the status (added / dismissed), nothing else.
revoke update on public.shares from authenticated;
grant update (status) on public.shares to authenticated;
