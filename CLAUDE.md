# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — typecheck (`tsc -b`) then production build
- `npm run lint` — run oxlint (config in `.oxlintrc.json`)
- `npm run preview` — preview the production build locally

There is no test suite configured in this repo.

Environment variables (see `.env.example`) must be set for the app to run at all — `src/lib/supabase.ts` throws at import time if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

There is no Supabase CLI config (`supabase/config.toml`) in this repo — migrations under `supabase/migrations/` are plain, numbered SQL files intended to be applied by hand (e.g. pasted into the Supabase SQL editor) rather than via `supabase db push`. When adding schema changes, add a new numbered file rather than editing an existing one.

## Deployment

Deploys to GitHub Pages via `.github/workflows/deploy.yml` on every push to `master`. The build gets `VITE_BASE_PATH=/<repo-name>/` (GitHub Pages project-site subpath) and the Supabase env vars from repo secrets. Because of the subpath, any code referencing `/public` assets must prefix with `import.meta.env.BASE_URL` rather than assuming root (`src/config/mapPool.ts` and `src/lib/supabase.ts` both do this).

## Architecture

This is a CS2 map-veto and mini-tournament web app: a thin React/Vite frontend over Supabase (Postgres + Realtime + Auth + Edge Functions). There is effectively no backend logic in the frontend — **all mutations happen through Postgres RPCs** (`security definer` functions), and the client only ever `select`s tables directly and calls `supabase.rpc(...)`. Row-level security policies grant `select` to any authenticated user; RPCs contain all the authorization and validation checks. When changing behavior, the SQL migration is usually the source of truth, not a hook or component.

### Auth: Steam OpenID, no passwords

Login is Steam-only, implemented in `supabase/functions/steam-auth/index.ts` (a Deno edge function), not Supabase's built-in OAuth providers:
1. Client hits the edge function (`steamAuthUrl()` in `src/lib/supabase.ts`), passing `dest` (the app's own origin, since GitHub Pages *and* localhost both need to work) and optionally `path` (the hash route — `/room/:id`, `/tournament/:id`, `/player/:id` — to bounce back into after login).
2. Edge function redirects to Steam OpenID, verifies the callback, upserts a `profiles` row keyed by `steam_id`, and — since Supabase Auth has no native "Steam" identity — mints a magic-link token for a synthetic `steam_<id>@steam.local` email and redirects back to `dest` with `token_hash`/`type` query params.
3. `useSession()` (`src/hooks/useSession.ts`) detects those params on mount, calls `verifyOtp` to redeem them into a real session, then scrubs them from the URL.
4. Faceit level/ELO sync (optional, needs `FACEIT_API_KEY`) happens as a fire-and-forget background task *after* the redirect response is sent, so a slow/down Faceit API never blocks login.

`is_admin` on `profiles` is a super-admin flag (set manually in the DB) — see `isPrivileged`/`isPrivilegedTournament` in `src/lib/permissions.ts` for the client-side mirror of the same check the RPCs enforce server-side (`created_by === me.id || me.is_admin`).

### Data flow: poll + realtime, no client-side mutation of local state

Every entity has one hook (`useMatch`, `useTournament`, etc. in `src/hooks/`) that:
- fetches all related rows in parallel on mount,
- subscribes to Supabase Realtime (`postgres_changes`) on the relevant tables, calling a full `refetch()` on any change rather than patching state incrementally,
- *also* polls on a `setInterval` (4s) as a fallback in case the realtime websocket silently drops.

Components never mutate local state optimistically — they call an RPC via `supabase.rpc(...)` and rely on the refetch/realtime loop to reflect the new server state. Follow this pattern for new features rather than introducing local optimistic updates.

### Match lifecycle (core domain object: `matches`)

A `Match` (`src/types.ts`) moves through `status`: `lobby → veto → done`, with `scheduled` and `cancelled` as side branches. Each stage has one top-level component rendered by `src/pages/Room.tsx` based on `match.status`:

- **`lobby`** (`Lobby.tsx`) — 2 teams × 5 slots; players call `join_slot`/`leave_slot`. Filling all 10 slots auto-transitions to `veto` (or, for tournament-seeded matches, waits until scheduled — see below) and generates the first veto round server-side.
- **`scheduled`** (`TournamentMatchGate.tsx`) — tournament-generated matches that are pre-seated with rosters but gated until both teams ready up (`ready_a`/`ready_b`).
- **`veto`** (`VetoBoard.tsx`) — a sequence of `match_rounds`, each a timed (25s deadline) ban/pick assigned to one team. `cast_vote` records a vote; the round auto-resolves by majority (ties broken randomly) once all 5 team members vote or the deadline passes. Resolving a round computes and inserts the *next* round (or marks the match `done`) via the `_create_next_round` SQL helper — this sequencing logic lives entirely in `0001_map_vote.sql` (extended by later migrations), not in the frontend.
- **`done`** (`ResultScreen.tsx`) — final map/side decided; score can be set via `set_score` (privileged: creator or admin) or corrected later via `admin_edit_result` (super-admin only, and only after the match is `done`).
- **`cancelled`** (`CancelledMatch.tsx`) — terminal; matches can be cancelled via RPC with guards preventing cancellation after a score is already recorded (`0022`, `0023`).

### Tournaments (round-robin over the match engine)

A `Tournament` (4 teams, 5 players each, `tournament_teams`/`tournament_players`) reuses the match engine rather than reimplementing veto/scoring: `start_tournament` generates all 6 fixed round-robin games at once as ordinary `matches` rows (pre-seeded with each tournament team's roster, status `scheduled`, tagged with `tournament_id`/`tournament_round_no`/`tournament_board_no`/`tournament_team_a_id`/`tournament_team_b_id`). `_maybe_finish_tournament` flips the tournament to `done` once every generated match has both scores recorded — this is invoked from both `set_score` and `admin_edit_result`, the only two places a match score is ever written. `src/pages/TournamentRoom.tsx` + `useTournament.ts` drive the tournament lobby/bracket UI; `TournamentBracket.tsx` renders standings from the underlying `matches` rows.

### Routing

No router library — `src/hooks/useHashRoute.ts` parses `window.location.hash` against three shapes: `/room/:id`, `/player/:id`, `/tournament/:id`. Anything else renders `Home`. `App.tsx` picks the page component directly from these parsed ids.

### UI language

All user-facing strings are in Russian (see `Room.tsx`, error text, button labels). Keep new UI text consistent with this.
