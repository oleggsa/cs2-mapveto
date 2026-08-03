-- Lets a super-admin (not just the match host) correct a finished match's
-- final map and score after the fact — e.g. the veto landed on the wrong map
-- due to a mistake, or the score was mistyped.

create or replace function public.admin_edit_result(
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
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select is_admin into v_is_admin from public.profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception 'only a super-admin can edit a finished match result';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if v_match is null then
    raise exception 'match not found';
  end if;
  if v_match.status <> 'done' then
    raise exception 'match is not finished yet';
  end if;
  if p_final_map <> all (v_match.map_pool) then
    raise exception 'map is not part of this match''s pool';
  end if;
  if p_score_a < 0 or p_score_b < 0 or p_score_a > 50 or p_score_b > 50 then
    raise exception 'scores must be between 0 and 50';
  end if;

  update public.matches
  set final_map = p_final_map, score_a = p_score_a, score_b = p_score_b
  where id = p_match_id;
end;
$$;

revoke all on function public.admin_edit_result(uuid, text, int, int) from public, anon;
grant execute on function public.admin_edit_result(uuid, text, int, int) to authenticated;
