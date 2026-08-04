-- A match can now be cancelled even after it's already "done" (e.g. the
-- recorded result was bogus, or the match shouldn't have counted at all) —
-- not just while it's still in progress. Cancelling from 'done' also clears
-- the recorded score, so a voided result stops counting toward tournament
-- standings (computeStandings/ _advance_tournament only look at matches
-- that still have a score).

create or replace function public.cancel_match(p_match_id uuid)
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
    raise exception 'not allowed to cancel this match';
  end if;

  select status into v_status from public.matches where id = p_match_id for update;
  if v_status is null then
    raise exception 'match not found';
  end if;
  if v_status = 'cancelled' then
    raise exception 'match is already cancelled';
  end if;

  update public.matches set status = 'cancelled', score_a = null, score_b = null where id = p_match_id;

  perform public._advance_tournament(p_match_id);
end;
$$;
