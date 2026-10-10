import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Links a signed-in GafferBot user to their real Xbox gamertag via Microsoft sign-in + Xbox Live.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALLOWED = [/^https:\/\/(www\.)?gafferbot\.app$/, /^https:\/\/[a-z0-9-]+\.lovable\.app$/, /^https:\/\/[a-z0-9-]+\.workers\.dev$/, /^http:\/\/localhost:\d+$/];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const clientId = Deno.env.get("XBOX_CLIENT_ID");
    if (req.method === "GET") return json({ client_id: clientId ?? null });

    const authHeader = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Please sign in first" }, 401);

    const { code, redirect_uri } = await req.json().catch(() => ({}));
    if (typeof code !== "string" || code.length < 10 || code.length > 2000) return json({ error: "Invalid code" }, 400);
    if (typeof redirect_uri !== "string") return json({ error: "Invalid redirect" }, 400);
    const r = new URL(redirect_uri);
    if (!ALLOWED.some((x) => x.test(r.origin)) || r.pathname !== "/auth/xbox") return json({ error: "Redirect not allowed" }, 400);
    const secret = Deno.env.get("XBOX_CLIENT_SECRET");
    if (!clientId || !secret) return json({ error: "Xbox linking is not configured yet" }, 500);

    // 1. Microsoft token
    const tokRes = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: "authorization_code", code, redirect_uri, scope: "XboxLive.signin" }),
    });
    if (!tokRes.ok) { console.error("ms token", await tokRes.text()); return json({ error: "Microsoft rejected the sign-in" }, 400); }
    const { access_token } = await tokRes.json();

    // 2. Xbox user token
    const xblRes = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "x-xbl-contract-version": "1" },
      body: JSON.stringify({ RelyingParty: "http://auth.xboxlive.com", TokenType: "JWT", Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: `d=${access_token}` } }),
    });
    if (!xblRes.ok) { console.error("xbl", xblRes.status, await xblRes.text()); return json({ error: "Xbox Live sign-in failed" }, 400); }
    const xbl = await xblRes.json();

    // 3. XSTS token carries gamertag + XUID
    const xstsRes = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "x-xbl-contract-version": "1" },
      body: JSON.stringify({ RelyingParty: "http://xboxlive.com", TokenType: "JWT", Properties: { SandboxId: "RETAIL", UserTokens: [xbl.Token] } }),
    });
    if (!xstsRes.ok) {
      const t = await xstsRes.json().catch(() => ({}));
      const msg = t?.XErr === 2148916233 ? "This Microsoft account has no Xbox profile yet." : t?.XErr === 2148916238 ? "Child accounts need to be added to a Microsoft family first." : "Xbox Live authorization failed";
      return json({ error: msg }, 400);
    }
    const claim = (await xstsRes.json())?.DisplayClaims?.xui?.[0] ?? {};
    const gamertag: string | undefined = claim.gtg;
    const xuid: string | undefined = claim.xid;
    if (!gamertag) return json({ error: "Could not read your gamertag" }, 400);

    // 4. Save to the player's profile (verified by Microsoft, so it overwrites typed values)
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: link } = await admin.from("user_discord_links").select("discord_user_id").eq("auth_user_id", u.user.id).maybeSingle();
    if (!link?.discord_user_id) return json({ error: "Link your Discord account first", gamertag }, 400);
    const { data: prof } = await admin.from("profiles").select("ea_username").eq("discord_user_id", link.discord_user_id).maybeSingle();
    const patch: Record<string, string | null> = { xbox_gamertag: gamertag, xbox_xuid: xuid ?? null };
    if (!prof?.ea_username) { patch.ea_username = gamertag; patch.ea_platform = "xbsx"; }
    const { error } = await admin.from("profiles").update(patch).eq("discord_user_id", link.discord_user_id);
    if (error) throw error;
    return json({ gamertag, xuid });
  } catch (e) {
    console.error(e);
    return json({ error: "Xbox linking failed" }, 500);
  }
});
