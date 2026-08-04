-- Lets the tournament organizer (or a super-admin) cancel a tournament that
-- hasn't finished yet — e.g. not enough people showed up. Cancelling only
-- flips the status flag; already-generated matches are left untouched as a
-- historical record, same as how a cancelled tournament still shows its
-- bracket read-only afterwards.
--
-- Also lets a super-admin fix a tournament's rosters at any stage (not just
-- while still in the lobby) — clear a slot, or drop a specific player
-- straight into one, e.g. swapping in a stand-in mid-tournament.

alter table public.tournaments drop constraint if exists tournaments_status_check;
alter table public.tournaments add constraint tournaments_status_check
  check (status in ('lobby', 'in_progress', 'done', 'cancelled'));

create or replace function public.cancel_tournament(p_tournament_id uuid)
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
    raise exception 'not allowed to cancel this tournament';
  end if;

  select status into v_status from public.tournaments where id = p_tournament_id for update;
  if v_status is null then
    raise exception 'tournament not found';
  end if;
  if v_status not in ('lobby', 'in_progress') then
    raise exception 'tournament is already finished or cancelled';
  end if;

  update public.tournaments set status = 'cancelled' where id = p_tournament_id;
end;
$$;

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
end;
$$;

-- Drops an arbitrary player straight into a slot, admin-only, at any
-- tournament stage. If that player already holds a different seat in this
-- tournament, they're moved rather than seated twice.
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
    update public.tournament_players
    set player_id = null
    where tournament_id = p_tournament_id and player_id = p_player_id;
  end if;

  update public.tournament_players
  set player_id = p_player_id
  where tournament_id = p_tournament_id and team_id = p_team_id and slot = p_slot;
end;
$$;

revoke all on function public.cancel_tournament(uuid) from public, anon;
grant execute on function public.cancel_tournament(uuid) to authenticated;

revoke all on function public.admin_set_tournament_player(uuid, uuid, int, uuid) from public, anon;
grant execute on function public.admin_set_tournament_player(uuid, uuid, int, uuid) to authenticated;
