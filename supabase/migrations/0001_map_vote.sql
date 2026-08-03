-- CS2 map-vote schema: profiles, matches, lobby slots, veto rounds, votes.
-- All mutations go through SECURITY DEFINER RPCs below; clients only ever SELECT the tables directly.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  steam_id text unique not null,
  name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id),
  status text not null default 'lobby' check (status in ('lobby', 'veto', 'done')),
  map_pool text[] not null,
  final_map text,
  starting_side text check (starting_side in ('CT', 'T')),
  created_at timestamptz not null default now()
);

create table public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  team text not null check (team in ('A', 'B')),
  slot int not null check (slot between 0 and 4),
  player_id uuid references public.profiles (id),
  primary key (match_id, team, slot),
  unique (match_id, player_id)
);

create table public.match_rounds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  round_no int not null,
  kind text not null check (kind in ('ban', 'pick_map', 'pick_side')),
  team text not null check (team in ('A', 'B')),
  options text[] not null,
  deadline timestamptz not null,
  resolved boolean not null default false,
  result text,
  resolved_by text check (resolved_by in ('majority', 'random')),
  created_at timestamptz not null default now(),
  unique (match_id, round_no)
);

create table public.match_votes (
  round_id uuid not null references public.match_rounds (id) on delete cascade,
  player_id uuid not null references public.profiles (id),
  choice text not null,
  created_at timestamptz not null default now(),
  primary key (round_id, player_id)
);

-- Realtime: clients subscribe to these to see live lobby fills, round transitions and vote tallies.
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.match_players;
alter publication supabase_realtime add table public.match_rounds;
alter publication supabase_realtime add table public.match_votes;

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_rounds enable row level security;
alter table public.match_votes enable row level security;

-- Reads are open to any logged-in (Steam-authenticated) user; all writes happen only via the RPCs below.
create policy "profiles readable by authenticated" on public.profiles
  for select to authenticated using (true);

create policy "matches readable by authenticated" on public.matches
  for select to authenticated using (true);

create policy "match_players readable by authenticated" on public.match_players
  for select to authenticated using (true);

create policy "match_rounds readable by authenticated" on public.match_rounds
  for select to authenticated using (true);

create policy "match_votes readable by authenticated" on public.match_votes
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- Creates the next round for a match given the round that was just resolved (or round_no = 0 to start).
create function public._create_next_round(p_match_id uuid, p_prev_round_no int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_banned text[];
  v_remaining text[];
  v_next_no int := p_prev_round_no + 1;
  v_kind text;
  v_team text;
  v_options text[];
begin
  select * into v_match from public.matches where id = p_match_id;

  select coalesce(array_agg(result), '{}') into v_banned
  from public.match_rounds
  where match_id = p_match_id and kind = 'ban' and resolved = true;

  select coalesce(array_agg(m), '{}') into v_remaining
  from unnest(v_match.map_pool) as m
  where m not in (select unnest(v_banned));

  if v_next_no between 1 and 2 then
    v_kind := 'ban'; v_team := 'A'; v_options := v_remaining;
  elsif v_next_no between 3 and 5 then
    v_kind := 'ban'; v_team := 'B'; v_options := v_remaining;
  elsif v_next_no = 6 then
    v_kind := 'pick_map'; v_team := 'A'; v_options := v_remaining;
  elsif v_next_no = 7 then
    v_kind := 'pick_side'; v_team := 'B'; v_options := array['CT', 'T'];
  else
    update public.matches set status = 'done' where id = p_match_id;
    return;
  end if;

  insert into public.match_rounds (match_id, round_no, kind, team, options, deadline)
  values (p_match_id, v_next_no, v_kind, v_team, v_options, now() + interval '25 seconds');
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

create function public.create_match(p_map_pool text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_team text;
  v_slot int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if array_length(p_map_pool, 1) is distinct from 7 then
    raise exception 'map pool must contain exactly 7 maps';
  end if;

  insert into public.matches (created_by, map_pool)
  values (auth.uid(), p_map_pool)
  returning id into v_match_id;

  foreach v_team in array array['A', 'B'] loop
    for v_slot in 0..4 loop
      insert into public.match_players (match_id, team, slot) values (v_match_id, v_team, v_slot);
    end loop;
  end loop;

  return v_match_id;
end;
$$;

create function public.join_slot(p_match_id uuid, p_team text, p_slot int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_filled int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select status into v_status from public.matches where id = p_match_id for update;
  if v_status is null then
    raise exception 'match not found';
  end if;
  if v_status <> 'lobby' then
    raise exception 'match is not in lobby stage';
  end if;

  update public.match_players
  set player_id = auth.uid()
  where match_id = p_match_id and team = p_team and slot = p_slot and player_id is null;

  if not found then
    raise exception 'slot unavailable';
  end if;

  select count(*) into v_filled from public.match_players
  where match_id = p_match_id and player_id is not null;

  if v_filled = 10 then
    update public.matches set status = 'veto' where id = p_match_id;
    perform public._create_next_round(p_match_id, 0);
  end if;
end;
$$;

create function public.leave_slot(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select status into v_status from public.matches where id = p_match_id;
  if v_status is distinct from 'lobby' then
    raise exception 'match is not in lobby stage';
  end if;

  update public.match_players
  set player_id = null
  where match_id = p_match_id and player_id = auth.uid();
end;
$$;

create function public.cast_vote(p_round_id uuid, p_choice text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.match_rounds;
  v_is_member boolean;
  v_vote_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_round from public.match_rounds where id = p_round_id for update;
  if v_round is null then
    raise exception 'round not found';
  end if;
  if v_round.resolved then
    raise exception 'round already resolved';
  end if;
  if now() > v_round.deadline then
    raise exception 'round expired';
  end if;
  if p_choice <> all (v_round.options) then
    raise exception 'invalid choice';
  end if;

  select exists (
    select 1 from public.match_players
    where match_id = v_round.match_id and team = v_round.team and player_id = auth.uid()
  ) into v_is_member;
  if not v_is_member then
    raise exception 'not a member of the acting team';
  end if;

  insert into public.match_votes (round_id, player_id, choice)
  values (p_round_id, auth.uid(), p_choice)
  on conflict (round_id, player_id) do nothing;

  select count(*) into v_vote_count from public.match_votes where round_id = p_round_id;
  if v_vote_count = 5 then
    perform public.resolve_round(p_round_id);
  end if;
end;
$$;

create function public.resolve_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.match_rounds;
  v_winner text;
  v_max_votes int;
  v_tied_count int;
  v_method text;
begin
  update public.match_rounds
  set resolved = true
  where id = p_round_id and resolved = false and (
    now() > deadline or (select count(*) from public.match_votes where round_id = p_round_id) = 5
  )
  returning * into v_round;

  if v_round is null then
    return; -- already resolved, or not yet eligible (called too early) -- safe no-op
  end if;

  select max(n) into v_max_votes
  from (select count(*) as n from public.match_votes where round_id = p_round_id group by choice) c;

  if v_max_votes is null then
    v_winner := v_round.options[1 + floor(random() * array_length(v_round.options, 1))::int];
    v_method := 'random';
  else
    select count(*) into v_tied_count
    from (select choice, count(*) as n from public.match_votes where round_id = p_round_id group by choice) c
    where c.n = v_max_votes;

    select choice into v_winner
    from (select choice, count(*) as n from public.match_votes where round_id = p_round_id group by choice) c
    where c.n = v_max_votes
    order by random()
    limit 1;

    v_method := case when v_tied_count > 1 then 'random' else 'majority' end;
  end if;

  update public.match_rounds set result = v_winner, resolved_by = v_method where id = p_round_id;

  if v_round.kind = 'pick_map' then
    update public.matches set final_map = v_winner where id = v_round.match_id;
  elsif v_round.kind = 'pick_side' then
    update public.matches set starting_side = v_winner where id = v_round.match_id;
  end if;

  perform public._create_next_round(v_round.match_id, v_round.round_no);
end;
$$;

-- Lock down execution: only signed-in Steam users may call these, never anon.
revoke all on function public.create_match(text[]) from public, anon;
revoke all on function public.join_slot(uuid, text, int) from public, anon;
revoke all on function public.leave_slot(uuid) from public, anon;
revoke all on function public.cast_vote(uuid, text) from public, anon;
revoke all on function public.resolve_round(uuid) from public, anon;

grant execute on function public.create_match(text[]) to authenticated;
grant execute on function public.join_slot(uuid, text, int) to authenticated;
grant execute on function public.leave_slot(uuid) to authenticated;
grant execute on function public.cast_vote(uuid, text) to authenticated;
grant execute on function public.resolve_round(uuid) to authenticated;
