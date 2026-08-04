-- Round-robin tournaments: an organizer names 4 teams, players join a team
-- (5 slots each, same shape as a regular match), and starting the tournament
-- generates all 6 round-robin games at once as ordinary `matches` rows —
-- reusing the existing lobby/veto/result engine per game, just pre-seated
-- with each tournament team's roster and skipped straight to 'veto'.

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id),
  name text,
  game text not null default 'Counter-Strike 2',
  format text not null default 'round_robin' check (format in ('round_robin')),
  status text not null default 'lobby' check (status in ('lobby', 'in_progress', 'done')),
  map_pool text[] not null,
  start_time timestamptz,
  created_at timestamptz not null default now()
);

create table public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  seed int not null check (seed between 1 and 4),
  name text not null,
  unique (tournament_id, seed)
);

create table public.tournament_players (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id uuid not null references public.tournament_teams (id) on delete cascade,
  slot int not null check (slot between 0 and 4),
  player_id uuid references public.profiles (id),
  primary key (tournament_id, team_id, slot),
  unique (tournament_id, player_id)
);

-- Each round-robin game is a normal match; these columns place it on the bracket.
alter table public.matches add column tournament_id uuid references public.tournaments (id) on delete cascade;
alter table public.matches add column tournament_round_no int;
alter table public.matches add column tournament_board_no int;
-- Identify the two competing tournament teams by id (not just the display-name
-- snapshot in team_a_name/team_b_name), so standings stay correct even if a
-- team is renamed after the tournament has started.
alter table public.matches add column tournament_team_a_id uuid references public.tournament_teams (id) on delete cascade;
alter table public.matches add column tournament_team_b_id uuid references public.tournament_teams (id) on delete cascade;

alter publication supabase_realtime add table public.tournaments;
alter publication supabase_realtime add table public.tournament_teams;
alter publication supabase_realtime add table public.tournament_players;

alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_players enable row level security;

create policy "tournaments readable by authenticated" on public.tournaments
  for select to authenticated using (true);

create policy "tournament_teams readable by authenticated" on public.tournament_teams
  for select to authenticated using (true);

create policy "tournament_players readable by authenticated" on public.tournament_players
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.is_privileged_tournament(p_tournament_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (select 1 from public.tournaments where id = p_tournament_id and created_by = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

create function public.create_tournament(
  p_name text,
  p_team_names text[],
  p_map_pool text[],
  p_start_time timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_team_id uuid;
  v_seed int;
  v_slot int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if array_length(p_team_names, 1) is distinct from 4 then
    raise exception 'exactly 4 team names are required';
  end if;
  if array_length(p_map_pool, 1) is distinct from 7 then
    raise exception 'map pool must contain exactly 7 maps';
  end if;

  insert into public.tournaments (created_by, name, map_pool, start_time)
  values (auth.uid(), nullif(trim(p_name), ''), p_map_pool, p_start_time)
  returning id into v_tournament_id;

  for v_seed in 1..4 loop
    insert into public.tournament_teams (tournament_id, seed, name)
    values (v_tournament_id, v_seed, coalesce(nullif(trim(p_team_names[v_seed]), ''), 'Команда ' || v_seed))
    returning id into v_team_id;

    for v_slot in 0..4 loop
      insert into public.tournament_players (tournament_id, team_id, slot) values (v_tournament_id, v_team_id, v_slot);
    end loop;
  end loop;

  return v_tournament_id;
end;
$$;

create function public.join_tournament_slot(p_tournament_id uuid, p_team_id uuid, p_slot int)
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

  select status into v_status from public.tournaments where id = p_tournament_id for update;
  if v_status is null then
    raise exception 'tournament not found';
  end if;
  if v_status <> 'lobby' then
    raise exception 'tournament is not in lobby stage';
  end if;
  if not exists (
    select 1 from public.tournament_teams where id = p_team_id and tournament_id = p_tournament_id
  ) then
    raise exception 'team does not belong to this tournament';
  end if;

  update public.tournament_players
  set player_id = null
  where tournament_id = p_tournament_id and player_id = auth.uid();

  update public.tournament_players
  set player_id = auth.uid()
  where tournament_id = p_tournament_id and team_id = p_team_id and slot = p_slot and player_id is null;

  if not found then
    raise exception 'slot unavailable';
  end if;
end;
$$;

create function public.leave_tournament_slot(p_tournament_id uuid)
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

  select status into v_status from public.tournaments where id = p_tournament_id;
  if v_status is distinct from 'lobby' then
    raise exception 'tournament is not in lobby stage';
  end if;

  update public.tournament_players
  set player_id = null
  where tournament_id = p_tournament_id and player_id = auth.uid();
end;
$$;

create function public.kick_tournament_player(p_tournament_id uuid, p_team_id uuid, p_slot int)
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
  if not public.is_privileged_tournament(p_tournament_id) then
    raise exception 'not allowed to remove players from this tournament';
  end if;

  select status into v_status from public.tournaments where id = p_tournament_id;
  if v_status is null then
    raise exception 'tournament not found';
  end if;
  if v_status <> 'lobby' then
    raise exception 'tournament is not in lobby stage';
  end if;

  update public.tournament_players
  set player_id = null
  where tournament_id = p_tournament_id and team_id = p_team_id and slot = p_slot;
end;
$$;

create function public.rename_tournament(p_tournament_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_privileged_tournament(p_tournament_id) then
    raise exception 'not allowed to rename this tournament';
  end if;

  update public.tournaments set name = nullif(trim(p_name), '') where id = p_tournament_id;
end;
$$;

create function public.rename_tournament_team(p_tournament_id uuid, p_team_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seed int;
  v_name text := nullif(trim(left(p_name, 40)), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_privileged_tournament(p_tournament_id) then
    raise exception 'not allowed to rename teams in this tournament';
  end if;

  select seed into v_seed from public.tournament_teams where id = p_team_id and tournament_id = p_tournament_id;
  if v_seed is null then
    raise exception 'team not found';
  end if;

  update public.tournament_teams
  set name = coalesce(v_name, 'Команда ' || v_seed)
  where id = p_team_id;
end;
$$;

create function public.delete_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_privileged_tournament(p_tournament_id) then
    raise exception 'not allowed to delete this tournament';
  end if;

  delete from public.tournaments where id = p_tournament_id;
end;
$$;

-- Generates the fixed 3-round / 2-board round-robin schedule for 4 teams
-- (every pairing of {1,2,3,4} occurs exactly once) and creates one `matches`
-- row per board, pre-seated with each team's roster, straight into 'veto'.
create function public.start_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments;
  v_filled int;
  v_is_admin boolean;
  v_teams uuid[];
  -- Fixed 1-factorization of K4 (every pairing of seeds 1..4 exactly once),
  -- flattened in (round, board) order: R1B1, R1B2, R2B1, R2B2, R3B1, R3B2.
  v_a_seeds int[] := array[1, 2, 1, 4, 1, 3];
  v_b_seeds int[] := array[4, 3, 3, 2, 2, 4];
  v_round_no int;
  v_board_no int;
  v_i int;
  v_team_a uuid;
  v_team_b uuid;
  v_team_a_name text;
  v_team_b_name text;
  v_match_id uuid;
  v_slot int;
  v_player uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_privileged_tournament(p_tournament_id) then
    raise exception 'not allowed to start this tournament';
  end if;

  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if v_tournament is null then
    raise exception 'tournament not found';
  end if;
  if v_tournament.status <> 'lobby' then
    raise exception 'tournament is not in lobby stage';
  end if;

  select count(*) into v_filled from public.tournament_players
  where tournament_id = p_tournament_id and player_id is not null;

  select is_admin into v_is_admin from public.profiles where id = auth.uid();
  if v_filled <> 20 and not coalesce(v_is_admin, false) then
    raise exception 'all 20 slots must be filled first';
  end if;

  select array_agg(id order by seed) into v_teams
  from public.tournament_teams where tournament_id = p_tournament_id;
  if array_length(v_teams, 1) is distinct from 4 then
    raise exception 'tournament does not have exactly 4 teams';
  end if;

  for v_i in 1..6 loop
    v_round_no := ((v_i - 1) / 2) + 1;
    v_board_no := ((v_i - 1) % 2) + 1;
    v_team_a := v_teams[v_a_seeds[v_i]];
    v_team_b := v_teams[v_b_seeds[v_i]];

    select name into v_team_a_name from public.tournament_teams where id = v_team_a;
    select name into v_team_b_name from public.tournament_teams where id = v_team_b;

    insert into public.matches (
      created_by, map_pool, name, team_a_name, team_b_name,
      status, tournament_id, tournament_round_no, tournament_board_no,
      tournament_team_a_id, tournament_team_b_id
    )
    values (
      v_tournament.created_by, v_tournament.map_pool,
      coalesce(v_tournament.name, 'Турнир') || ' — раунд ' || v_round_no,
      v_team_a_name, v_team_b_name,
      'veto', p_tournament_id, v_round_no, v_board_no,
      v_team_a, v_team_b
    )
    returning id into v_match_id;

    for v_slot in 0..4 loop
      select player_id into v_player from public.tournament_players
      where team_id = v_team_a and slot = v_slot;
      insert into public.match_players (match_id, team, slot, player_id) values (v_match_id, 'A', v_slot, v_player);

      select player_id into v_player from public.tournament_players
      where team_id = v_team_b and slot = v_slot;
      insert into public.match_players (match_id, team, slot, player_id) values (v_match_id, 'B', v_slot, v_player);
    end loop;

    perform public._create_next_round(v_match_id, 0);
  end loop;

  update public.tournaments set status = 'in_progress' where id = p_tournament_id;
end;
$$;

-- Once every generated game has both a final map and a recorded score, the
-- tournament as a whole is done. Hooked from set_score / admin_edit_result
-- below (the only two places a match's score is ever written).
create function public._maybe_finish_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tournament_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.matches
    where tournament_id = p_tournament_id and (score_a is null or score_b is null)
  ) then
    update public.tournaments set status = 'done' where id = p_tournament_id and status = 'in_progress';
  end if;
end;
$$;

create or replace function public.set_score(p_match_id uuid, p_score_a int, p_score_b int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_privileged(p_match_id) then
    raise exception 'not allowed to set the score for this match';
  end if;
  if p_score_a < 0 or p_score_b < 0 or p_score_a > 50 or p_score_b > 50 then
    raise exception 'scores must be between 0 and 50';
  end if;

  update public.matches set score_a = p_score_a, score_b = p_score_b
  where id = p_match_id
  returning tournament_id into v_tournament_id;

  perform public._maybe_finish_tournament(v_tournament_id);
end;
$$;

create or replace function public.admin_edit_result(
  p_match_id uuid,
  p_final_map text,
  p_score_a int,
  p_score_b int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select is_admin into v_is_admin from public.profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception 'only a super-admin can edit a finished match result';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if v_match is null then
    raise exception 'match not found';
  end if;
  if v_match.status <> 'done' then
    raise exception 'match is not finished yet';
  end if;
  if p_final_map <> all (v_match.map_pool) then
    raise exception 'map is not part of this match''s pool';
  end if;
  if p_score_a < 0 or p_score_b < 0 or p_score_a > 50 or p_score_b > 50 then
    raise exception 'scores must be between 0 and 50';
  end if;

  update public.matches
  set final_map = p_final_map, score_a = p_score_a, score_b = p_score_b
  where id = p_match_id;

  perform public._maybe_finish_tournament(v_match.tournament_id);
end;
$$;

revoke all on function public.create_tournament(text, text[], text[], timestamptz) from public, anon;
revoke all on function public.join_tournament_slot(uuid, uuid, int) from public, anon;
revoke all on function public.leave_tournament_slot(uuid) from public, anon;
revoke all on function public.kick_tournament_player(uuid, uuid, int) from public, anon;
revoke all on function public.rename_tournament(uuid, text) from public, anon;
revoke all on function public.rename_tournament_team(uuid, uuid, text) from public, anon;
revoke all on function public.delete_tournament(uuid) from public, anon;
revoke all on function public.start_tournament(uuid) from public, anon;

grant execute on function public.create_tournament(text, text[], text[], timestamptz) to authenticated;
grant execute on function public.join_tournament_slot(uuid, uuid, int) to authenticated;
grant execute on function public.leave_tournament_slot(uuid) to authenticated;
grant execute on function public.kick_tournament_player(uuid, uuid, int) to authenticated;
grant execute on function public.rename_tournament(uuid, text) to authenticated;
grant execute on function public.rename_tournament_team(uuid, uuid, text) to authenticated;
grant execute on function public.delete_tournament(uuid) to authenticated;
grant execute on function public.start_tournament(uuid) to authenticated;
