-- Custom lobby names, host-confirmed veto start (instead of auto-start at 10/10),
-- and a final score the match creator can record once the map is played.

alter table public.matches add column name text;
alter table public.matches add column score_a int;
alter table public.matches add column score_b int;

drop function if exists public.create_match(text[]);

create function public.create_match(p_map_pool text[], p_name text default null)
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

  insert into public.matches (created_by, map_pool, name)
  values (auth.uid(), p_map_pool, nullif(trim(p_name), ''))
  returning id into v_match_id;

  foreach v_team in array array['A', 'B'] loop
    for v_slot in 0..4 loop
      insert into public.match_players (match_id, team, slot) values (v_match_id, v_team, v_slot);
    end loop;
  end loop;

  return v_match_id;
end;
$$;

-- join_slot no longer auto-starts veto at 10/10 — the creator now confirms via start_veto.
create or replace function public.join_slot(p_match_id uuid, p_team text, p_slot int)
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

  select status into v_status from public.matches where id = p_match_id for update;
  if v_status is null then
    raise exception 'match not found';
  end if;
  if v_status <> 'lobby' then
    raise exception 'match is not in lobby stage';
  end if;

  update public.match_players
  set player_id = null
  where match_id = p_match_id and player_id = auth.uid();

  update public.match_players
  set player_id = auth.uid()
  where match_id = p_match_id and team = p_team and slot = p_slot and player_id is null;

  if not found then
    raise exception 'slot unavailable';
  end if;
end;
$$;

-- Host can free up anyone's slot (e.g. an inactive/wrong player) — they can simply rejoin after.
create function public.kick_player(p_match_id uuid, p_team text, p_slot int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_match from public.matches where id = p_match_id;
  if v_match is null then
    raise exception 'match not found';
  end if;
  if v_match.created_by <> auth.uid() then
    raise exception 'only the host can remove players';
  end if;
  if v_match.status <> 'lobby' then
    raise exception 'match is not in lobby stage';
  end if;

  update public.match_players
  set player_id = null
  where match_id = p_match_id and team = p_team and slot = p_slot;
end;
$$;

create function public.start_veto(p_match_id uuid)
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

  select * into v_match from public.matches where id = p_match_id for update;
  if v_match is null then
    raise exception 'match not found';
  end if;
  if v_match.created_by <> auth.uid() then
    raise exception 'only the host can start the veto';
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

create function public.set_score(p_match_id uuid, p_score_a int, p_score_b int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select created_by into v_created_by from public.matches where id = p_match_id;
  if v_created_by is null then
    raise exception 'match not found';
  end if;
  if v_created_by <> auth.uid() then
    raise exception 'only the host can record the score';
  end if;
  if p_score_a < 0 or p_score_b < 0 then
    raise exception 'scores must be non-negative';
  end if;

  update public.matches set score_a = p_score_a, score_b = p_score_b where id = p_match_id;
end;
$$;

revoke all on function public.start_veto(uuid) from public, anon;
revoke all on function public.set_score(uuid, int, int) from public, anon;
revoke all on function public.kick_player(uuid, text, int) from public, anon;
grant execute on function public.start_veto(uuid) to authenticated;
grant execute on function public.set_score(uuid, int, int) to authenticated;
grant execute on function public.kick_player(uuid, text, int) to authenticated;

revoke all on function public.create_match(text[], text) from public, anon;
grant execute on function public.create_match(text[], text) to authenticated;
