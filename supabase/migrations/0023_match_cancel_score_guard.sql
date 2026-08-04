-- A match can only be cancelled while it has no real recorded result yet —
-- no score, or a 0:0 placeholder. Once a genuine score is in (anything
-- other than 0:0), cancelling is blocked server-side too, not just hidden
-- in the UI, so the RPC can't be used to void a real result.

create or replace function public.cancel_match(p_match_id uuid)
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
    raise exception 'not allowed to cancel this match';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if v_match is null then
    raise exception 'match not found';
  end if;
  if v_match.status = 'cancelled' then
    raise exception 'match is already cancelled';
  end if;
  if v_match.score_a is not null and v_match.score_b is not null and (v_match.score_a > 0 or v_match.score_b > 0) then
    raise exception 'match already has a recorded result';
  end if;

  update public.matches set status = 'cancelled', score_a = null, score_b = null where id = p_match_id;

  perform public._advance_tournament(p_match_id);
end;
$$;
