-- Lets the match creator or a super-admin undo a cancellation and record a
-- real result in one step (e.g. the match was cancelled by mistake, or it
-- actually did get played out despite being marked cancelled) — moves the
-- match from 'cancelled' straight to 'done' with a final map and score,
-- rather than requiring it to somehow pass back through 'veto' first.

create function public.restore_cancelled_match(
  p_match_id uuid,
  p_final_map text,
  p_score_a int,
  p_score_b int
)
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
  if not public.is_privileged(p_match_id) then
    raise exception 'not allowed to restore this match';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if v_match is null then
    raise exception 'match not found';
  end if;
  if v_match.status <> 'cancelled' then
    raise exception 'match is not cancelled';
  end if;
  if p_final_map <> all (v_match.map_pool) then
    raise exception 'map is not part of this match''s pool';
  end if;
  if p_score_a < 0 or p_score_b < 0 or p_score_a > 50 or p_score_b > 50 then
    raise exception 'scores must be between 0 and 50';
  end if;

  update public.matches
  set status = 'done', final_map = p_final_map, score_a = p_score_a, score_b = p_score_b
  where id = p_match_id;

  perform public._advance_tournament(p_match_id);
end;
$$;

revoke all on function public.restore_cancelled_match(uuid, text, int, int) from public, anon;
grant execute on function public.restore_cancelled_match(uuid, text, int, int) to authenticated;
