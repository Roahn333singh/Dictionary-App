-- Retain: notifications when a friend sends a word.
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
-- The app never reads this table directly. A signed-in user can only save or
-- remove their own device through the functions below.

create table if not exists public.push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%' and char_length(endpoint) <= 2000),
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 8 and 200),
  auth text not null check (char_length(auth) between 8 and 200),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 2000 then
    raise exception 'bad endpoint';
  end if;
  if p_p256dh is null or char_length(p_p256dh) not between 8 and 200
     or p_auth is null or char_length(p_auth) not between 8 and 200 then
    raise exception 'bad key';
  end if;

  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, updated_at)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, now())
  on conflict (endpoint) do update
    set user_id = auth.uid(),
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        updated_at = now();
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

revoke all on function public.save_push_subscription(text, text, text) from public;
revoke all on function public.delete_push_subscription(text) from public;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- So an open app hears about a new word immediately, not on the next poll.
alter table public.shares replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.shares;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
