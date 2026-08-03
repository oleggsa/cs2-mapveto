-- Super-admin flag on profiles: an admin can do anything a match host can
-- (rename, kick, start veto, set score, delete) on ANY match, not just their own.

alter table public.profiles add column is_admin boolean not null default false;

create function public.is_privileged(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (select 1 from public.matches where id = p_match_id and created_by = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$;

create or replace function public.rename_match(p_match_id uuid, p_name text)
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
    raise exception 'not allowed to rename this match';
  end if;

  update public.matches set name = nullif(trim(p_name), '') where id = p_match_id;
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
  if v_status <> 'lobby' then
    raise exception 'match is not in lobby stage';
  end if;

  update public.match_players
  set player_id = null
  where match_id = p_match_id and team = p_team and slot = p_slot;
end;
$$;

create or replace function public.start_veto(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_filled int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_privileged(p_match_id) then
    raise exception 'not allowed to start this match';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if v_match is null then
    raise exception 'match not found';
  end if;
  if v_match.status <> 'lobby' then
    raise exception 'match is not in lobby stage';
  end if;

  select count(*) into v_filled from public.match_players
  where match_id = p_match_id and player_id is not null;
  if v_filled <> 10 then
    raise exception 'all 10 slots must be filled first';
  end if;

  update public.matches set status = 'veto' where id = p_match_id;
  perform public._create_next_round(p_match_id, 0);
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
  if p_score_a < 0 or p_score_b < 0 then
    raise exception 'scores must be non-negative';
  end if;

  update public.matches set score_a = p_score_a, score_b = p_score_b where id = p_match_id;
end;
$$;

create function public.delete_match(p_match_id uuid)
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
    raise exception 'not allowed to delete this match';
  end if;

  delete from public.matches where id = p_match_id;
end;
$$;

revoke all on function public.delete_match(uuid) from public, anon;
grant execute on function public.delete_match(uuid) to authenticated;

-- Super-admin grant for a specific Steam account is applied separately
-- (see accompanying UPDATE run against the real steam_id, not hardcoded here).
