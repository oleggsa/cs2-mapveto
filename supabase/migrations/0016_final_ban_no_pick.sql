-- Players found the explicit "pick" round confusing — every veto stage should
-- read as a ban, same as the ones before it. The 3rd round now bans down to
-- exactly one map instead of letting a team pick from the last two; whatever
-- single map survives all the bans automatically becomes the final map.
--
-- The final round's ban count is derived from how many maps are actually left
-- (map_pool size minus 5) rather than a hardcoded 1, so this keeps working if
-- the map pool ever grows or shrinks from today's 7.

create or replace function public._create_next_round(p_match_id uuid, p_prev_round_no int)
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
  v_pick_count int;
  v_options text[];
  v_seconds int;
begin
  select * into v_match from public.matches where id = p_match_id;

  select coalesce(array_agg(m), '{}') into v_banned
  from public.match_rounds r, unnest(r.results) as m
  where r.match_id = p_match_id and r.kind = 'ban' and r.resolved = true;

  select coalesce(array_agg(x), '{}') into v_remaining
  from unnest(v_match.map_pool) as x
  where x not in (select unnest(v_banned));

  if v_next_no = 1 then
    v_kind := 'ban'; v_team := 'A'; v_pick_count := 2; v_options := v_remaining; v_seconds := 15;
  elsif v_next_no = 2 then
    v_kind := 'ban'; v_team := 'B'; v_pick_count := 3; v_options := v_remaining; v_seconds := 20;
  elsif v_next_no = 3 then
    if coalesce(array_length(v_remaining, 1), 0) <= 1 then
      update public.matches set final_map = v_remaining[1], status = 'done' where id = p_match_id;
      return;
    end if;
    v_kind := 'ban'; v_team := 'A'; v_pick_count := array_length(v_remaining, 1) - 1; v_options := v_remaining;
    v_seconds := 10;
  else
    update public.matches set final_map = v_remaining[1], status = 'done' where id = p_match_id;
    return;
  end if;

  insert into public.match_rounds (match_id, round_no, kind, team, options, pick_count, deadline)
  values (p_match_id, v_next_no, v_kind, v_team, v_options, v_pick_count, now() + make_interval(secs => v_seconds));
end;
$$;

-- pick_map rounds are no longer generated, so resolve_round no longer needs to
-- special-case them — final_map is now always set by _create_next_round once
-- the bans leave exactly one map standing.
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

  perform public._create_next_round(v_round.match_id, v_round.round_no);
end;
$$;
