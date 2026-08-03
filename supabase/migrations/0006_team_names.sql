-- Custom team names — the "Команда" prefix stays fixed in the UI, only the
-- A/B suffix is renameable (up to 40 chars), host/admin only.
alter table public.matches add column team_a_name text;
alter table public.matches add column team_b_name text;

create function public.rename_team(p_match_id uuid, p_team text, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(left(p_name, 40)), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_privileged(p_match_id) then
    raise exception 'not allowed to rename teams in this match';
  end if;
  if p_team not in ('A', 'B') then
    raise exception 'invalid team';
  end if;

  if p_team = 'A' then
    update public.matches set team_a_name = v_name where id = p_match_id;
  else
    update public.matches set team_b_name = v_name where id = p_match_id;
  end if;
end;
$$;

revoke all on function public.rename_team(uuid, text, text) from public, anon;
grant execute on function public.rename_team(uuid, text, text) to authenticated;
