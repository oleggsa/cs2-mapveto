-- Switch from 7 sequential single-pick rounds to 4 rounds where each player
-- gets multiple votes to distribute: Ban A gets 2 votes/player, Ban B gets 3,
-- pick_map and pick_side get 1. Each round now resolves to pick_count winners
-- at once (top-voted, ties broken randomly, gaps filled randomly).

alter table public.match_rounds add column pick_count int not null default 1;
alter table public.match_rounds add column results text[];
update public.match_rounds set results = case when result is not null then array[result] else '{}' end;
alter table public.match_rounds alter column results set default '{}';
alter table public.match_rounds alter column results set not null;
alter table public.match_rounds drop column result;

alter table public.match_votes drop constraint match_votes_pkey;
alter table public.match_votes add primary key (round_id, player_id, choice);

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
begin
  select * into v_match from public.matches where id = p_match_id;

  select coalesce(array_agg(m), '{}') into v_banned
  from public.match_rounds r, unnest(r.results) as m
  where r.match_id = p_match_id and r.kind = 'ban' and r.resolved = true;

  select coalesce(array_agg(x), '{}') into v_remaining
  from unnest(v_match.map_pool) as x
  where x not in (select unnest(v_banned));

  if v_next_no = 1 then
    v_kind := 'ban'; v_team := 'A'; v_pick_count := 2; v_options := v_remaining;
  elsif v_next_no = 2 then
    v_kind := 'ban'; v_team := 'B'; v_pick_count := 3; v_options := v_remaining;
  elsif v_next_no = 3 then
    v_kind := 'pick_map'; v_team := 'A'; v_pick_count := 1; v_options := v_remaining;
  elsif v_next_no = 4 then
    v_kind := 'pick_side'; v_team := 'B'; v_pick_count := 1; v_options := array['CT', 'T'];
  else
    update public.matches set status = 'done' where id = p_match_id;
    return;
  end if;

  insert into public.match_rounds (match_id, round_no, kind, team, options, pick_count, deadline)
  values (p_match_id, v_next_no, v_kind, v_team, v_options, v_pick_count, now() + interval '25 seconds');
end;
$$;

-- Toggle semantics: clicking an already-selected choice deselects it. For
-- pick_count = 1 rounds, picking a different choice replaces your pick.
-- For pick_count > 1, you must free up a slot yourself before adding another.
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
  v_total int;
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

  select count(*) into v_total from public.match_votes where round_id = p_round_id;
  if v_total = 5 * v_round.pick_count then
    perform public.resolve_round(p_round_id);
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
  where id = p_round_id and resolved = false and (
    now() > deadline or (select count(*) from public.match_votes where round_id = p_round_id) = 5 * pick_count
  )
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
  elsif v_round.kind = 'pick_side' then
    update public.matches set starting_side = v_picked[1] where id = v_round.match_id;
  end if;

  perform public._create_next_round(v_round.match_id, v_round.round_no);
end;
$$;
