-- Retain: friend invites by the exact sign-in email on auth.users.
-- Run after sharing.sql. Safe to re-run.
-- Flow: exact email match → send request → accept → share words.
-- Usernames are not searchable. A partial address returns nobody.

-- Bidirectional friendship. Always store user_a < user_b.
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_ordered check (user_a < user_b),
  constraint friendships_not_self check (user_a <> user_b),
  constraint friendships_requester_in_pair check (requested_by = user_a or requested_by = user_b)
);

create unique index if not exists friendships_pair_uidx
  on public.friendships (user_a, user_b);

create index if not exists friendships_pending_idx
  on public.friendships (user_a, user_b, status)
  where status = 'pending';

alter table public.friendships enable row level security;

drop policy if exists "friendships_select_own" on public.friendships;
drop policy if exists "friendships_insert_own" on public.friendships;
drop policy if exists "friendships_update_own" on public.friendships;
drop policy if exists "friendships_delete_own" on public.friendships;

create policy "friendships_select_own" on public.friendships
  for select to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "friendships_insert_own" on public.friendships
  for insert to authenticated
  with check (
    auth.uid() = requested_by
    and (auth.uid() = user_a or auth.uid() = user_b)
    and status = 'pending'
  );

-- Recipient (not the requester) may accept/decline.
create policy "friendships_update_own" on public.friendships
  for update to authenticated
  using (
    (auth.uid() = user_a or auth.uid() = user_b)
    and auth.uid() <> requested_by
  )
  with check (
    (auth.uid() = user_a or auth.uid() = user_b)
    and status in ('accepted', 'declined')
  );

create policy "friendships_delete_own" on public.friendships
  for delete to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

revoke update on public.friendships from authenticated;
grant update (status, responded_at) on public.friendships to authenticated;

-- Exact sign-in email only. One account or none. No prefix match and no friend list.
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

revoke all on function public.find_user_by_email(text) from public, anon;
grant execute on function public.find_user_by_email(text) to authenticated;

-- Send invite by email. Idempotent for pending/accepted pairs.
create or replace function public.send_friend_request(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  target uuid;
  target_name text;
  a uuid;
  b uuid;
  existing public.friendships%rowtype;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in first');
  end if;

  select f.user_id, f.name into target, target_name
  from public.find_user_by_email(p_email) f;

  if target is null then
    return jsonb_build_object('ok', false, 'error', 'No Retain account matches that email');
  end if;

  if target = me then
    return jsonb_build_object('ok', false, 'error', 'That is your own account');
  end if;

  a := least(me, target);
  b := greatest(me, target);

  select * into existing
  from public.friendships
  where user_a = a and user_b = b;

  if found then
    if existing.status = 'accepted' then
      return jsonb_build_object('ok', true, 'status', 'accepted', 'name', target_name, 'already', true);
    end if;
    if existing.status = 'pending' then
      return jsonb_build_object(
        'ok', true,
        'status', 'pending',
        'name', target_name,
        'already', true,
        'incoming', existing.requested_by = target
      );
    end if;
    -- declined → allow a fresh request from this user
    update public.friendships
    set status = 'pending',
        requested_by = me,
        created_at = now(),
        responded_at = null
    where id = existing.id;
    return jsonb_build_object('ok', true, 'status', 'pending', 'name', target_name, 'id', existing.id);
  end if;

  insert into public.friendships (user_a, user_b, requested_by, status)
  values (a, b, me, 'pending')
  returning id into existing.id;

  return jsonb_build_object('ok', true, 'status', 'pending', 'name', target_name, 'id', existing.id);
end;
$$;

revoke all on function public.send_friend_request(text) from public;
grant execute on function public.send_friend_request(text) to authenticated;

create or replace function public.respond_friend_request(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.friendships%rowtype;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in first');
  end if;

  select * into row from public.friendships where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Invite not found');
  end if;

  if me <> row.user_a and me <> row.user_b then
    return jsonb_build_object('ok', false, 'error', 'Not your invite');
  end if;

  if me = row.requested_by then
    return jsonb_build_object('ok', false, 'error', 'Wait for them to respond');
  end if;

  if row.status <> 'pending' then
    return jsonb_build_object('ok', true, 'status', row.status, 'already', true);
  end if;

  update public.friendships
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'status', case when p_accept then 'accepted' else 'declined' end);
end;
$$;

revoke all on function public.respond_friend_request(uuid, boolean) from public;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- Accepted friends for the signed-in user.
drop function if exists public.list_friends();
create function public.list_friends()
returns table (user_id uuid, name text, avatar_id text)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when f.user_a = auth.uid() then f.user_b else f.user_a end as user_id,
    coalesce(p.name, 'Friend') as name,
    coalesce(nullif(p.avatar_id, ''), 'boy-1-1') as avatar_id
  from public.friendships f
  left join public.profiles p
    on p.user_id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  where auth.uid() is not null
    and f.status = 'accepted'
    and (f.user_a = auth.uid() or f.user_b = auth.uid())
  order by 2;
$$;

revoke all on function public.list_friends() from public;
grant execute on function public.list_friends() to authenticated;

-- Pending invites involving me.
drop function if exists public.list_friend_requests();
create function public.list_friend_requests()
returns table (
  id uuid,
  other_user uuid,
  other_name text,
  other_avatar text,
  direction text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    case when f.user_a = auth.uid() then f.user_b else f.user_a end as other_user,
    coalesce(p.name, 'Someone') as other_name,
    coalesce(nullif(p.avatar_id, ''), 'boy-1-1') as other_avatar,
    case when f.requested_by = auth.uid() then 'outgoing' else 'incoming' end as direction,
    f.created_at
  from public.friendships f
  left join public.profiles p
    on p.user_id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  where auth.uid() is not null
    and f.status = 'pending'
    and (f.user_a = auth.uid() or f.user_b = auth.uid())
  order by f.created_at desc;
$$;

revoke all on function public.list_friend_requests() from public;
grant execute on function public.list_friend_requests() to authenticated;

-- People who already shared words are treated as accepted friends (keeps Rohan ↔ Rishit).
insert into public.friendships (user_a, user_b, requested_by, status, responded_at)
select distinct on (least(s.from_user, s.to_user), greatest(s.from_user, s.to_user))
  least(s.from_user, s.to_user),
  greatest(s.from_user, s.to_user),
  s.from_user,
  'accepted',
  now()
from public.shares s
order by least(s.from_user, s.to_user), greatest(s.from_user, s.to_user), s.created_at
on conflict (user_a, user_b) do update
  set status = 'accepted',
      responded_at = coalesce(public.friendships.responded_at, excluded.responded_at)
  where public.friendships.status <> 'accepted';

-- Only accepted friends may send shares to each other.
drop policy if exists "shares_insert_as_sender" on public.shares;
create policy "shares_insert_as_sender" on public.shares
  for insert to authenticated
  with check (
    from_user = auth.uid()
    and pg_column_size(payload) < 8000
    and exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and f.user_a = least(auth.uid(), to_user)
        and f.user_b = greatest(auth.uid(), to_user)
    )
  );

-- Friend RPCs answer only for the signed-in caller. anon cannot list or probe them.
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
