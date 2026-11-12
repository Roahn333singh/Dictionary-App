-- Retain: real email + stable username, and private friendship graphs.
-- Safe to re-run. Does not rewrite existing accounts' emails except the
-- single Rishit address at the bottom, and only on his existing user id.

-- Usernames stay on profiles.name (one row per auth user). Case-insensitive
-- and stable: clients may not rename them.
create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(name));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_format'
  ) then
    alter table public.profiles
      add constraint profiles_username_format
      check (name ~ '^[a-z0-9][a-z0-9._-]{1,23}$');
  end if;
end $$;

revoke update on public.profiles from anon, authenticated;
grant update (avatar_id) on public.profiles to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

drop policy if exists "profiles_read_signed_in" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own" on public.friendships
  for select to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "shares_select_own" on public.shares;
create policy "shares_select_own" on public.shares
  for select to authenticated
  using (to_user = auth.uid() or from_user = auth.uid());

-- A taken username fails signup. Other profile errors must not.
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

-- Exact sign-in email. One row or none. No prefix, no friend list.
drop function if exists public.find_user_by_email(text);
create function public.find_user_by_email(p_email text)
returns table (user_id uuid, email text, name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cleaned text := lower(trim(coalesce(p_email, '')));
begin
  if char_length(cleaned) > 254
     or cleaned !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return;
  end if;

  return query
  select
    u.id,
    lower(u.email)::text as email,
    coalesce(
      nullif(p.name, ''),
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      'Friend'
    )::text as name
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where lower(u.email) = cleaned
  limit 1;
end;
$$;

-- True only when the exact username is free and well formed. Does not say who has it.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(trim(coalesce(p_username, ''))) ~ '^[a-z0-9][a-z0-9._-]{1,23}$'
    and position('@' in lower(trim(coalesce(p_username, '')))) = 0
    and not exists (
      select 1
      from public.profiles p
      where lower(p.name) = lower(trim(coalesce(p_username, '')))
    );
$$;

-- Exact username → that one sign-in email, or null. Never a user list.
create or replace function public.resolve_username_for_signin(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where lower(trim(coalesce(p_username, ''))) ~ '^[a-z0-9][a-z0-9._-]{1,23}$'
    and position('@' in lower(trim(coalesce(p_username, '')))) = 0
    and lower(p.name) = lower(trim(coalesce(p_username, '')))
  limit 1;
$$;

revoke all on function public.find_user_by_email(text) from public, anon;
revoke all on function public.send_friend_request(text) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.list_friends() from public, anon;
revoke all on function public.list_friend_requests() from public, anon;
grant execute on function public.find_user_by_email(text) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.list_friend_requests() to authenticated;

revoke all on function public.username_available(text) from public;
revoke all on function public.resolve_username_for_signin(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.resolve_username_for_signin(text) to anon, authenticated;

-- Attach Rishit's real email to his existing user id. Does not email him,
-- does not create a second user, and does not touch words, shares, or friendships.
update auth.users
set email = 'rishit1krishna@gmail.com',
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where id = 'a4b3c61b-adbf-44f3-8772-92ba88bf5060'
  and lower(email) = 'rishit@users.retain.app';

update auth.identities
set identity_data = jsonb_set(
      identity_data,
      '{email}',
      to_jsonb('rishit1krishna@gmail.com'::text),
      true
    ),
    updated_at = now()
where user_id = 'a4b3c61b-adbf-44f3-8772-92ba88bf5060'
  and provider = 'email'
  and lower(coalesce(identity_data ->> 'email', '')) is distinct from 'rishit1krishna@gmail.com';

do $$
declare
  uid constant uuid := 'a4b3c61b-adbf-44f3-8772-92ba88bf5060';
  got_email text;
  got_name text;
  profile_count int;
  gmail_count int;
begin
  select email into got_email from auth.users where id = uid;
  if got_email is distinct from 'rishit1krishna@gmail.com' then
    raise exception 'rishit email was not attached to the original user id';
  end if;

  select count(*) into gmail_count
  from auth.users
  where lower(email) = 'rishit1krishna@gmail.com';
  if gmail_count <> 1 then
    raise exception 'gmail is not unique on the original user';
  end if;

  select count(*), min(name) into profile_count, got_name
  from public.profiles
  where user_id = uid;
  if profile_count <> 1 or got_name is distinct from 'rishit' then
    raise exception 'rishit profile was disturbed';
  end if;

  if exists (
    select 1
    from auth.identities
    where user_id = uid
      and provider = 'email'
      and lower(coalesce(identity_data ->> 'email', '')) is distinct from 'rishit1krishna@gmail.com'
  ) then
    raise exception 'rishit identity email was not updated';
  end if;

  if (select count(*) from auth.users where id = uid) <> 1 then
    raise exception 'rishit user id changed';
  end if;
end $$;

notify pgrst, 'reload schema';
