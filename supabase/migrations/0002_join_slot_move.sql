-- join_slot now also vacates whichever slot the player currently holds in this
-- match before claiming the new one, so clicking a slot in the other team
-- moves the player there in one click instead of requiring an explicit leave first.
create or replace function public.join_slot(p_match_id uuid, p_team text, p_slot int)
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
  set player_id = null
  where match_id = p_match_id and player_id = auth.uid();

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
