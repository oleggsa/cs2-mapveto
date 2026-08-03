// Supabase Edge Function: Steam OpenID login for the map-vote app.
// Two steps behind one function, selected via ?step=:
//   (default / "login")  -> redirect the browser to Steam's OpenID login page
//   "callback"            -> verify Steam's response server-side, upsert the profile,
//                             mint a Supabase session token, redirect back to the app
//
// Required secrets (supabase secrets set ...): STEAM_API_KEY, SITE_URL
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically by the platform.

import { createClient } from "npm:@supabase/supabase-js@2";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL")!; // e.g. https://<user>.github.io/map-vote

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function functionBaseUrl(req: Request): string {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}${u.pathname}`;
}

function handleLogin(req: Request): Response {
  const url = new URL(req.url);
  const room = url.searchParams.get("room") ?? "";
  const base = functionBaseUrl(req);
  const returnTo = `${base}?step=callback&room=${encodeURIComponent(room)}`;

  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": `${url.protocol}//${url.host}`,
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

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const room = url.searchParams.get("room") ?? "";

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

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData) {
    return new Response(`could not create session link: ${linkErr?.message}`, { status: 500 });
  }

  const redirectUrl = new URL(SITE_URL);
  redirectUrl.searchParams.set("token_hash", linkData.properties.hashed_token);
  redirectUrl.searchParams.set("type", "magiclink");
  redirectUrl.hash = room ? `/room/${room}` : "/";

  return Response.redirect(redirectUrl.toString(), 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const step = url.searchParams.get("step");

  if (step === "callback") return handleCallback(req);
  return handleLogin(req);
});
