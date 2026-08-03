-- Let logged-out visitors open a room link and see the "sign in with Steam"
-- prompt instead of "Матч не найден". Previously select was restricted to
-- `authenticated`, so an incognito visit got an RLS-empty result and Room.tsx
-- couldn't tell "match doesn't exist" apart from "not logged in". Read-only;
-- all writes still go through security-definer functions gated on auth.uid().

create policy "matches readable by anon" on public.matches
  for select to anon using (true);

create policy "match_players readable by anon" on public.match_players
  for select to anon using (true);

create policy "match_rounds readable by anon" on public.match_rounds
  for select to anon using (true);

create policy "match_votes readable by anon" on public.match_votes
  for select to anon using (true);
