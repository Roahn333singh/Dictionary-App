-- Retain: profile avatars (Gen Z boy/girl packs).
-- Safe to re-run. Requires profiles table from sharing.sql.

alter table public.profiles
  add column if not exists avatar_id text not null default 'boy-1-1';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_avatar_id_len'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_id_len check (char_length(avatar_id) between 3 and 40);
  end if;
end $$;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke update on public.profiles from authenticated;
grant update (avatar_id) on public.profiles to authenticated;

create or replace function public.set_my_avatar(p_avatar_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  cleaned text := lower(trim(coalesce(p_avatar_id, '')));
begin
  if me is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in first');
  end if;
  if cleaned !~ '^(boy|girl)-[12]-[1-8]$' then
    return jsonb_build_object('ok', false, 'error', 'Unknown avatar');
  end if;

  insert into public.profiles (user_id, name, avatar_id)
  values (
    me,
    coalesce(
      nullif((select name from public.profiles where user_id = me), ''),
      split_part(coalesce(auth.jwt() ->> 'email', 'you@users.retain.app'), '@', 1)
    ),
    cleaned
  )
  on conflict (user_id) do update set avatar_id = excluded.avatar_id;

  return jsonb_build_object('ok', true, 'avatar_id', cleaned);
end;
$$;

revoke all on function public.set_my_avatar(text) from public;
grant execute on function public.set_my_avatar(text) to authenticated;

create or replace function public.get_my_profile()
returns table (user_id uuid, name text, avatar_id text)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.name, p.avatar_id
  from public.profiles p
  where p.user_id = auth.uid();
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;
