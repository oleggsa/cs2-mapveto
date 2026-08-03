-- Lets the host rename the lobby from inside the room (pencil icon in the UI)
-- instead of naming it at creation time.
create function public.rename_match(p_match_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select created_by into v_created_by from public.matches where id = p_match_id;
  if v_created_by is null then
    raise exception 'match not found';
  end if;
  if v_created_by <> auth.uid() then
    raise exception 'only the host can rename the match';
  end if;

  update public.matches set name = nullif(trim(p_name), '') where id = p_match_id;
end;
$$;

revoke all on function public.rename_match(uuid, text) from public, anon;
grant execute on function public.rename_match(uuid, text) to authenticated;
