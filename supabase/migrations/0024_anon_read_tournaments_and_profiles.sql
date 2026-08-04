-- Let logged-out visitors open a match or tournament link directly and see
-- its actual content (rosters, veto board, bracket, standings) instead of a
-- "sign in with Steam" wall — same rationale as 0010_anon_read_access.sql,
-- extended to profiles (needed for the embedded player names/avatars on
-- those rows) and to the tournament tables added later in 0018. Read-only;
-- all writes still go through security-definer functions gated on auth.uid().

create policy "profiles readable by anon" on public.profiles
  for select to anon using (true);

create policy "tournaments readable by anon" on public.tournaments
  for select to anon using (true);

create policy "tournament_teams readable by anon" on public.tournament_teams
  for select to anon using (true);

create policy "tournament_players readable by anon" on public.tournament_players
  for select to anon using (true);
