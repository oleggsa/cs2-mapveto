// Supabase Edge Function: Steam OpenID login for the map-vote app.
// Two steps behind one function, selected via ?step=:
//   (default / "login")  -> redirect the browser to Steam's OpenID login page
//   "callback"            -> verify Steam's response server-side, upsert the profile,
//                             mint a Supabase session token, redirect back to the app
//
// Required secrets (supabase secrets set ...): STEAM_API_KEY, SITE_URL, FACEIT_API_KEY (optional)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically by the platform.

import { createClient } from "npm:@supabase/supabase-js@2";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL")!; // e.g. https://<user>.github.io/map-vote
// Optional: without it, Faceit level/elo sync is simply skipped.
const FACEIT_API_KEY = Deno.env.get("FACEIT_API_KEY");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// req.url inside a Supabase Edge Function reflects an internal rewritten
// request (http://, and missing the /functions/v1/<name> prefix) rather than
// the public URL the browser actually hit — so the base must come from the
// SUPABASE_URL secret, never from req.url.
const FUNCTION_BASE_URL = `${SUPABASE_URL}/functions/v1/steam-auth`;

// The client tells us where it's running (production site, or a localhost dev
// server) via ?dest=. Only ever redirect a session token back to an origin we
// explicitly trust — otherwise fall back to the production SITE_URL secret.
function resolveDest(rawDest: string | null): string {
  if (!rawDest) return SITE_URL;
  if (rawDest === SITE_URL) return rawDest;
  if (/^https?:\/\/localhost:\d+\/?$/.test(rawDest)) return rawDest;
  return SITE_URL;
}

// Only ever bounce back into one of the app's known hash routes — this value
// round-trips through Steam's OpenID redirect, so it must be validated before
// being reflected into the final redirect's URL fragment.
const RETURN_PATH_RE = /^\/(room|tournament|player)\/[^/]+$/;

function resolvePath(rawPath: string | null): string {
  if (!rawPath) return "";
  return RETURN_PATH_RE.test(rawPath) ? rawPath : "";
}

function handleLogin(req: Request): Response {
  const url = new URL(req.url);
  const path = resolvePath(url.searchParams.get("path"));
  const dest = resolveDest(url.searchParams.get("dest"));
  const returnTo =
    `${FUNCTION_BASE_URL}?step=callback&path=${encodeURIComponent(path)}&dest=${encodeURIComponent(dest)}`;

  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": new URL(SUPABASE_URL).origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });

  return Response.redirect(`${STEAM_OPENID_ENDPOINT}?${params.toString()}`, 302);
}

async function verifySteamResponse(url: URL): Promise<string> {
  const params = new URLSearchParams(url.search);
  params.set("openid.mode", "check_authentication");

  const verifyRes = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const body = await verifyRes.text();
  if (!/is_valid\s*:\s*true/.test(body)) {
    throw new Error("Steam OpenID verification failed");
  }

  const claimedId = url.searchParams.get("openid.claimed_id") ?? "";
  const match = claimedId.match(STEAM_ID_RE);
  if (!match) throw new Error("could not parse SteamID from claimed_id");
  return match[1];
}

async function fetchSteamProfile(steamId: string): Promise<{ name: string; avatar: string | null }> {
  const res = await fetch(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${steamId}`,
  );
  const data = await res.json();
  const player = data?.response?.players?.[0];
  return {
    name: player?.personaname ?? `Steam ${steamId}`,
    avatar: player?.avatarfull ?? null,
  };
}

// Looks up the player's CS2 (falling back to legacy CSGO) skill level/elo on
// Faceit's public Data API. Matching is by Steam ID, so it needs no Faceit
// login from the user at all — just a server-side API key.
async function fetchFaceitLevel(steamId: string): Promise<{ level: number; elo: number } | null> {
  if (!FACEIT_API_KEY) return null;

  for (const game of ["cs2", "csgo"]) {
    const res = await fetch(
      `https://open.faceit.com/data/v4/players?game=${game}&game_player_id=${steamId}`,
      { headers: { Authorization: `Bearer ${FACEIT_API_KEY}` } },
    );
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Faceit API (${game}) responded ${res.status}`);

    const data = await res.json();
    const stats = data?.games?.[game];
    if (stats?.skill_level) {
      return { level: stats.skill_level, elo: stats.faceit_elo ?? 0 };
    }
  }
  return null;
}

// Runs after the response has already been sent (see backgroundTask below),
// so a slow or failing Faceit lookup never delays or breaks the Steam login.
async function syncFaceitLevel(userId: string, steamId: string): Promise<void> {
  try {
    const result = await fetchFaceitLevel(steamId);
    if (!result) return;
    await admin
      .from("profiles")
      .update({
        faceit_level: result.level,
        faceit_elo: result.elo,
        faceit_synced_at: new Date().toISOString(),
      })
      .eq("id", userId);
  } catch (err) {
    console.error("Faceit sync failed", err);
  }
}

// Schedules `promise` to keep running after the request handler returns its
// response, via the edge runtime's background-task hook when available.
function backgroundTask(promise: Promise<void>): void {
  const waitUntil = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<void>) => void } })
    .EdgeRuntime?.waitUntil;
  if (waitUntil) waitUntil(promise);
  else promise.catch((err) => console.error("background task failed", err));
}

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = resolvePath(url.searchParams.get("path"));
  const dest = resolveDest(url.searchParams.get("dest"));

  let steamId: string;
  try {
    steamId = await verifySteamResponse(url);
  } catch (err) {
    return new Response(`Steam login failed: ${(err as Error).message}`, { status: 401 });
  }

  const { name, avatar } = await fetchSteamProfile(steamId);
  const email = `steam_${steamId}@steam.local`;

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("steam_id", steamId)
    .maybeSingle();

  let userId: string;
  if (existingProfile) {
    userId = existingProfile.id;
    await admin.from("profiles").update({ name, avatar_url: avatar }).eq("id", userId);
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { steam_id: steamId },
    });
    if (createErr || !created?.user) {
      return new Response(`could not create user: ${createErr?.message}`, { status: 500 });
    }
    userId = created.user.id;
    const { error: insertErr } = await admin
      .from("profiles")
      .insert({ id: userId, steam_id: steamId, name, avatar_url: avatar });
    if (insertErr) {
      return new Response(`could not create profile: ${insertErr.message}`, { status: 500 });
    }
  }

  // Fire-and-forget: kicks off after this function returns its redirect, so a
  // slow/unavailable Faceit API never delays or breaks the login itself.
  backgroundTask(syncFaceitLevel(userId, steamId));

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData) {
    return new Response(`could not create session link: ${linkErr?.message}`, { status: 500 });
  }

  const redirectUrl = new URL(dest);
  redirectUrl.searchParams.set("token_hash", linkData.properties.hashed_token);
  redirectUrl.searchParams.set("type", "magiclink");
  redirectUrl.hash = path || "/";

  return Response.redirect(redirectUrl.toString(), 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const step = url.searchParams.get("step");

  if (step === "callback") return handleCallback(req);
  return handleLogin(req);
});
