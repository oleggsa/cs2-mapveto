-- Editing a tournament roster after the round-robin matches have already
-- been generated (admin_set_tournament_player / kick_tournament_player,
-- both usable post-start per 0020) only updated tournament_players — every
-- already-created match kept whatever roster snapshot it was seeded with at
-- start_tournament time, so its own room kept showing the old player (or a
-- dash for a slot the admin had since filled). Cascade both operations into
-- every match_players row for that tournament team + slot, same idea as the
-- team-name-rename cascade in 0019.
--
-- Also lets a super-admin fix a single MATCH's roster directly, at any stage
-- of that match — e.g. a stand-in played one game for someone, and that
-- player should get credit for this specific match without becoming a
-- permanent member of the tournament team's roster (that's what
-- admin_set_tournament_player above is for instead).

create or replace function public.kick_tournament_player(p_tournament_id uuid, p_team_id uuid, p_slot int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_is_admin boolean;
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

  select is_admin into v_is_admin from public.profiles where id = auth.uid();
  if v_status <> 'lobby' and not coalesce(v_is_admin, false) then
    raise exception 'tournament is not in lobby stage';
  end if;

  update public.tournament_players
  set player_id = null
  where tournament_id = p_tournament_id and team_id = p_team_id and slot = p_slot;

  update public.match_players mp
  set player_id = null
  from public.matches m
  where mp.match_id = m.id
    and m.tournament_id = p_tournament_id
    and mp.slot = p_slot
    and (
      (m.tournament_team_a_id = p_team_id and mp.team = 'A')
      or (m.tournament_team_b_id = p_team_id and mp.team = 'B')
    );
end;
$$;

create or replace function public.admin_set_tournament_player(
  p_tournament_id uuid,
  p_team_id uuid,
  p_slot int,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_old_team_id uuid;
  v_old_slot int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select is_admin into v_is_admin from public.profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception 'only a super-admin can assign players directly';
  end if;

  if not exists (
    select 1 from public.tournament_teams where id = p_team_id and tournament_id = p_tournament_id
  ) then
    raise exception 'team does not belong to this tournament';
  end if;

  if p_player_id is not null then
    select team_id, slot into v_old_team_id, v_old_slot
    from public.tournament_players
    where tournament_id = p_tournament_id and player_id = p_player_id;

    update public.tournament_players
    set player_id = null
    where tournament_id = p_tournament_id and player_id = p_player_id;

    if v_old_team_id is not null then
      update public.match_players mp
      set player_id = null
      from public.matches m
      where mp.match_id = m.id
        and m.tournament_id = p_tournament_id
        and mp.slot = v_old_slot
        and (
          (m.tournament_team_a_id = v_old_team_id and mp.team = 'A')
          or (m.tournament_team_b_id = v_old_team_id and mp.team = 'B')
        );
    end if;
  end if;

  update public.tournament_players
  set player_id = p_player_id
  where tournament_id = p_tournament_id and team_id = p_team_id and slot = p_slot;

  update public.match_players mp
  set player_id = p_player_id
  from public.matches m
  where mp.match_id = m.id
    and m.tournament_id = p_tournament_id
    and mp.slot = p_slot
    and (
      (m.tournament_team_a_id = p_team_id and mp.team = 'A')
      or (m.tournament_team_b_id = p_team_id and mp.team = 'B')
    );
end;
$$;

create or replace function public.kick_player(p_match_id uuid, p_team text, p_slot int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_privileged(p_match_id) then
    raise exception 'not allowed to remove players from this match';
  end if;

  select status into v_status from public.matches where id = p_match_id;
  if v_status is null then
    raise exception 'match not found';
  end if;

  select is_admin into v_is_admin from public.profiles where id = auth.uid();
  if v_status <> 'lobby' and not coalesce(v_is_admin, false) then
    raise exception 'match is not in lobby stage';
  end if;

  update public.match_players
  set player_id = null
  where match_id = p_match_id and team = p_team and slot = p_slot;
end;
$$;

-- Drops an arbitrary player straight into a match's slot, admin-only, at any
-- match stage. Scoped to this one match only — it does not touch the
-- tournament's own roster (tournament_players), so it won't carry over to
-- that team's other games.
create function public.admin_set_match_player(p_match_id uuid, p_team text, p_slot int, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select is_admin into v_is_admin from public.profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception 'only a super-admin can assign players directly';
  end if;
  if p_team not in ('A', 'B') then
    raise exception 'invalid team';
  end if;
  if not exists (select 1 from public.matches where id = p_match_id) then
    raise exception 'match not found';
  end if;

  if p_player_id is not null then
    update public.match_players
    set player_id = null
    where match_id = p_match_id and player_id = p_player_id;
  end if;

  update public.match_players
  set player_id = p_player_id
  where match_id = p_match_id and team = p_team and slot = p_slot;
end;
$$;

revoke all on function public.admin_set_match_player(uuid, text, int, uuid) from public, anon;
grant execute on function public.admin_set_match_player(uuid, text, int, uuid) to authenticated;

-- A single match (tournament game or standalone) can now be cancelled by its
-- host/organizer or a super-admin — e.g. a team didn't show up. A cancelled
-- tournament game no longer blocks the round after it from opening, and no
-- longer blocks the tournament itself from being marked done, once every
-- other game in the round/tournament is settled.

alter table public.matches drop constraint if exists matches_status_check;
alter table public.matches add constraint matches_status_check
  check (status in ('lobby', 'veto', 'scheduled', 'done', 'cancelled'));

create or replace function public.toggle_tournament_ready(p_match_id uuid)
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
      and status <> 'cancelled'
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

create or replace function public._advance_tournament(p_match_id uuid)
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
    where tournament_id = v_tournament_id and status <> 'cancelled' and (score_a is null or score_b is null)
  ) then
    update public.tournaments set status = 'done' where id = v_tournament_id and status = 'in_progress';
  end if;
end;
$$;

create function public.cancel_match(p_match_id uuid)
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
  if not public.is_privileged(p_match_id) then
    raise exception 'not allowed to cancel this match';
  end if;

  select status into v_status from public.matches where id = p_match_id for update;
  if v_status is null then
    raise exception 'match not found';
  end if;
  if v_status in ('done', 'cancelled') then
    raise exception 'match is already finished or cancelled';
  end if;

  update public.matches set status = 'cancelled' where id = p_match_id;

  perform public._advance_tournament(p_match_id);
end;
$$;

revoke all on function public.cancel_match(uuid) from public, anon;
grant execute on function public.cancel_match(uuid) to authenticated;
