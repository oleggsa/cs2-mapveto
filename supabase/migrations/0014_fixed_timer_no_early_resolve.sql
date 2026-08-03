-- Always wait out the full per-round timer (15s / 20s / 10s) instead of
-- resolving early the moment everyone on the acting team has voted. The
-- previous early-auto-resolve (0013) made a round finish instantly once
-- votes were complete, which skipped the intended countdown entirely for
-- small/solo test matches. Resolution now happens only via deadline expiry,
-- which the client already polls for with a retrying RPC call.

create or replace function public.cast_vote(p_round_id uuid, p_choice text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.match_rounds;
  v_is_member boolean;
  v_already_this int;
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

  select count(*) into v_already_this from public.match_votes
  where round_id = p_round_id and player_id = auth.uid() and choice = p_choice;

  if v_already_this > 0 then
    delete from public.match_votes where round_id = p_round_id and player_id = auth.uid() and choice = p_choice;
  else
    if v_round.pick_count = 1 then
      delete from public.match_votes where round_id = p_round_id and player_id = auth.uid();
    elsif (
      select count(*) from public.match_votes where round_id = p_round_id and player_id = auth.uid()
    ) >= v_round.pick_count then
      raise exception 'no votes left for this round';
    end if;
    insert into public.match_votes (round_id, player_id, choice) values (p_round_id, auth.uid(), p_choice);
  end if;
end;
$$;

create or replace function public.resolve_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.match_rounds;
  v_picked text[];
  v_have int;
  v_need int;
  v_fill text[];
  v_method text;
begin
  update public.match_rounds
  set resolved = true
  where id = p_round_id and resolved = false and now() > deadline
  returning * into v_round;

  if v_round is null then
    return;
  end if;

  select coalesce(array_agg(choice), '{}') into v_picked
  from (
    select choice from public.match_votes
    where round_id = p_round_id
    group by choice
    order by count(*) desc, random()
    limit v_round.pick_count
  ) top_choices;

  v_have := coalesce(array_length(v_picked, 1), 0);
  v_need := v_round.pick_count - v_have;
  v_method := case when v_have > 0 then 'majority' else 'random' end;

  if v_need > 0 then
    select coalesce(array_agg(m), '{}') into v_fill
    from (
      select m from unnest(v_round.options) as m
      where m <> all (v_picked)
      order by random()
      limit v_need
    ) t;
    v_picked := v_picked || v_fill;
    v_method := 'random';
  end if;

  update public.match_rounds set results = v_picked, resolved_by = v_method where id = p_round_id;

  if v_round.kind = 'pick_map' then
    update public.matches set final_map = v_picked[1] where id = v_round.match_id;
  end if;

  perform public._create_next_round(v_round.match_id, v_round.round_no);
end;
$$;
