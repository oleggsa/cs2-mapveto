-- Follow-up fixes to the round-robin tournament engine (0018):
--
-- 1. Round-robin games no longer all enter veto at once when the tournament
--    starts. Each game now waits in a new 'scheduled' status until BOTH
--    competing team captains mark their team ready — only then does the ban
--    phase begin. A team's captain is whoever sits in that team's slot 0.
-- 2. A later round can't be readied up until every game in the round before
--    it has a recorded score, so the bracket always plays out in order.
-- 3. Renaming a tournament team now also updates the team_a_name/team_b_name
--    snapshot on every match already generated for that team, so a match's
--    own room (lobby/veto/result) doesn't keep showing the old name.

alter table public.matches add column ready_a boolean not null default false;
alter table public.matches add column ready_b boolean not null default false;

alter table public.matches drop constraint if exists matches_status_check;
alter table public.matches add constraint matches_status_check
  check (status in ('lobby', 'veto', 'scheduled', 'done'));

create or replace function public.start_tournament(p_tournament_id uuid)
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

    -- Every game starts life as 'scheduled', round 1 included — none of them
    -- enter veto until both captains mark ready; see toggle_tournament_ready.
    insert into public.matches (
      created_by, map_pool, name, team_a_name, team_b_name,
      status, tournament_id, tournament_round_no, tournament_board_no,
      tournament_team_a_id, tournament_team_b_id
    )
    values (
      v_tournament.created_by, v_tournament.map_pool,
      coalesce(v_tournament.name, 'Турнир') || ' — раунд ' || v_round_no,
      v_team_a_name, v_team_b_name,
      'scheduled', p_tournament_id, v_round_no, v_board_no,
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
  end loop;

  update public.tournaments set status = 'in_progress' where id = p_tournament_id;
end;
$$;

-- Toggles the ready state for whichever team the caller captains (slot 0 on
-- team A or B of this match). Once both sides are ready, the game moves to
-- 'veto' and its first ban round is created — same engine every other match
-- uses. Blocked until the previous round is fully scored, so a captain can't
-- get ahead of the bracket.
create function public.toggle_tournament_ready(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_team text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if v_match is null then
    raise exception 'match not found';
  end if;
  if v_match.tournament_id is null then
    raise exception 'this match is not part of a tournament';
  end if;
  if v_match.status <> 'scheduled' then
    raise exception 'match is not waiting to start';
  end if;

  if v_match.tournament_round_no > 1 and exists (
    select 1 from public.matches
    where tournament_id = v_match.tournament_id
      and tournament_round_no = v_match.tournament_round_no - 1
      and (score_a is null or score_b is null)
  ) then
    raise exception 'the previous round is not finished yet';
  end if;

  select team into v_team from public.match_players
  where match_id = p_match_id and slot = 0 and team in ('A', 'B') and player_id = auth.uid();

  if v_team is null then
    raise exception 'only a team captain (first slot) can mark the team ready';
  end if;

  if v_team = 'A' then
    update public.matches set ready_a = not ready_a where id = p_match_id;
  else
    update public.matches set ready_b = not ready_b where id = p_match_id;
  end if;

  update public.matches set status = 'veto'
  where id = p_match_id and ready_a and ready_b and status = 'scheduled';

  if found then
    perform public._create_next_round(p_match_id, 0);
  end if;
end;
$$;

drop function if exists public._maybe_finish_tournament(uuid);

-- Round-unlocking is now just "is the previous round fully scored", checked
-- on demand by toggle_tournament_ready — nothing needs to auto-flip games
-- out of 'scheduled' anymore. All that's left to watch for is the
-- tournament as a whole finishing.
create function public._advance_tournament(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
begin
  select tournament_id into v_tournament_id from public.matches where id = p_match_id;

  if v_tournament_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.matches
    where tournament_id = v_tournament_id and (score_a is null or score_b is null)
  ) then
    update public.tournaments set status = 'done' where id = v_tournament_id and status = 'in_progress';
  end if;
end;
$$;

create or replace function public.set_score(p_match_id uuid, p_score_a int, p_score_b int)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  update public.matches set score_a = p_score_a, score_b = p_score_b where id = p_match_id;

  perform public._advance_tournament(p_match_id);
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

  perform public._advance_tournament(p_match_id);
end;
$$;

-- Renaming a tournament team only updated tournament_teams.name — any
-- round-robin match already generated for that team kept showing the old
-- name (its own team_a_name/team_b_name snapshot), even though the bracket
-- and standings (which read live team names via tournament_team_a_id/b_id)
-- picked the new name up immediately. Cascade the rename into every match
-- row for that team so a match's own room (lobby/veto/result) stays in sync.
create or replace function public.rename_tournament_team(p_tournament_id uuid, p_team_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seed int;
  v_name text := nullif(trim(left(p_name, 40)), '');
  v_final_name text;
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

  v_final_name := coalesce(v_name, 'Команда ' || v_seed);

  update public.tournament_teams set name = v_final_name where id = p_team_id;

  update public.matches set team_a_name = v_final_name
  where tournament_team_a_id = p_team_id;

  update public.matches set team_b_name = v_final_name
  where tournament_team_b_id = p_team_id;
end;
$$;

revoke all on function public.toggle_tournament_ready(uuid) from public, anon;
grant execute on function public.toggle_tournament_ready(uuid) to authenticated;
