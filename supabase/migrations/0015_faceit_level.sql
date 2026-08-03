-- Faceit skill level/elo, synced best-effort by the steam-auth edge function on each login.
alter table public.profiles
  add column faceit_level smallint,
  add column faceit_elo integer,
  add column faceit_synced_at timestamptz;
