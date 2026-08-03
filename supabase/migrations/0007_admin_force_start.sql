-- Lets a super-admin force-start the veto without all 10 slots filled — handy
-- for solo QA: seat your one account, force-start, and empty-team turns just
-- auto-resolve randomly once their round timer runs out.
create or replace function public.start_veto(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_filled int;
  v_is_admin boolean;
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

  select is_admin into v_is_admin from public.profiles where id = auth.uid();
  if v_filled <> 10 and not coalesce(v_is_admin, false) then
    raise exception 'all 10 slots must be filled first';
  end if;

  update public.matches set status = 'veto' where id = p_match_id;
  perform public._create_next_round(p_match_id, 0);
end;
$$;
