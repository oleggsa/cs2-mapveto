-- Cap recorded match scores at 50 per side — the UI only validated a lower
-- bound of 0, so a host could save nonsense values like 23452346.

create or replace function public.set_score(p_match_id uuid, p_score_a int, p_score_b int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_privileged(p_match_id) then
    raise exception 'not allowed to set the score for this match';
  end if;
  if p_score_a < 0 or p_score_b < 0 or p_score_a > 50 or p_score_b > 50 then
    raise exception 'scores must be between 0 and 50';
  end if;

  update public.matches set score_a = p_score_a, score_b = p_score_b where id = p_match_id;
end;
$$;
