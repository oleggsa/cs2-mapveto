-- Per-round-type deadlines: 15s for the 2-map ban block, 20s for the 3-map
-- ban block, 10s for map pick, 10s for side pick (was a flat 25s for all).

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
    v_kind := 'pick_map'; v_team := 'A'; v_pick_count := 1; v_options := v_remaining; v_seconds := 10;
  elsif v_next_no = 4 then
    v_kind := 'pick_side'; v_team := 'B'; v_pick_count := 1; v_options := array['CT', 'T']; v_seconds := 10;
  else
    update public.matches set status = 'done' where id = p_match_id;
    return;
  end if;

  insert into public.match_rounds (match_id, round_no, kind, team, options, pick_count, deadline)
  values (p_match_id, v_next_no, v_kind, v_team, v_options, v_pick_count, now() + make_interval(secs => v_seconds));
end;
$$;
