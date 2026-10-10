import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALLOWED = [/^https:\/\/(www\.)?gafferbot\.app$/, /^https:\/\/[a-z0-9-]+\.lovable\.app$/, /^https:\/\/[a-z0-9-]+\.workers\.dev$/, /^http:\/\/localhost:\d+$/];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const clientId = Deno.env.get("DISCORD_CLIENT_ID");
    if (req.method === "GET") return json({ client_id: clientId ?? null });

    const { code, redirect_uri } = await req.json().catch(() => ({}));
    if (typeof code !== "string" || code.length < 10 || code.length > 200) return json({ error: "Invalid code" }, 400);
    if (typeof redirect_uri !== "string") return json({ error: "Invalid redirect" }, 400);
    const origin = new URL(redirect_uri).origin;
    if (!ALLOWED.some((r) => r.test(origin)) || new URL(redirect_uri).pathname !== "/auth/callback") {
      return json({ error: "Redirect not allowed" }, 400);
    }
    const secret = Deno.env.get("DISCORD_CLIENT_SECRET");
    if (!clientId || !secret) return json({ error: "Discord sign-in is not configured yet" }, 500);

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: "authorization_code", code, redirect_uri }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("token exchange failed", tokenRes.status, t);
      return json({ error: "Discord rejected the sign-in", details: t }, 400);
    }
    const { access_token } = await tokenRes.json();
    const meRes = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${access_token}` } });
    if (!meRes.ok) return json({ error: "Could not read Discord profile" }, 400);
    const me = await meRes.json();
    const discordId: string = me.id;
    if (!/^\d{17,20}$/.test(discordId)) return json({ error: "Bad Discord id" }, 400);
    const avatar = me.avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${me.avatar}.png` : null;

    // Linked console accounts (requires the "connections" OAuth scope). Clubs require players
    // to connect their Xbox/PSN account in Discord settings, so this is the gamertag source of truth.
    let xboxGamertag: string | null = null;
    let psnId: string | null = null;
    const connRes = await fetch("https://discord.com/api/users/@me/connections", { headers: { Authorization: `Bearer ${access_token}` } });
    if (connRes.ok) {
      const connections: { type?: string; name?: string; verified?: boolean }[] = await connRes.json();
      for (const c of connections) {
        if (!c?.name || c.verified === false) continue;
        if (c.type === "xbox" && !xboxGamertag) xboxGamertag = c.name;
        if (c.type === "psn" && !psnId) psnId = c.name;
      }
    } else {
      console.error("connections fetch failed", connRes.status, await connRes.text());
    }

    const meta = { discord_user_id: discordId, discord_username: me.username, full_name: me.global_name ?? me.username, avatar_url: avatar, provider: "discord", xbox_gamertag: xboxGamertag, psn_id: psnId };

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let email: string | null = null;
    let userId: string | null = null;

    const { data: link } = await admin.from("user_discord_links").select("auth_user_id").eq("discord_user_id", discordId).maybeSingle();
    if (link?.auth_user_id) {
      const { data } = await admin.auth.admin.getUserById(link.auth_user_id);
      if (data?.user) { email = data.user.email ?? null; userId = data.user.id; }
    }
    if (!userId) {
      // Discord-only identity: synthetic address so nobody can claim an existing email account via Discord.
      email = `discord_${discordId}@users.gafferbot.app`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: meta });
      if (error && !/already/i.test(error.message)) throw error;
      if (created?.user) userId = created.user.id;
      else {
        const { data: gl } = await admin.auth.admin.generateLink({ type: "magiclink", email });
        userId = gl?.user?.id ?? null;
      }
      if (!userId) throw new Error("Could not create account");
      await admin.from("user_discord_links").upsert({ auth_user_id: userId, discord_user_id: discordId, verified: true }, { onConflict: "discord_user_id" });
    } else {
      await admin.auth.admin.updateUserById(userId, { user_metadata: meta });
    }

    // Sync linked console gamertags onto the player's profile. Never overwrite a gamertag
    // the player already set — only fill empty fields.
    if (xboxGamertag || psnId) {
      const { data: profile } = await admin.from("profiles").select("id, ea_username, ea_platform, xbox_gamertag").eq("discord_user_id", discordId).maybeSingle();
      if (profile) {
        const patch: Record<string, string> = {};
        if (xboxGamertag && !profile.xbox_gamertag) patch.xbox_gamertag = xboxGamertag;
        if (!profile.ea_username) {
          if (xboxGamertag) { patch.ea_username = xboxGamertag; patch.ea_platform = "xbsx"; }
          else if (psnId) { patch.ea_username = psnId; patch.ea_platform = "ps5"; }
        }
        if (Object.keys(patch).length > 0) {
          await admin.from("profiles").update(patch).eq("id", profile.id);
        }
      }
    }

    const { data: gen, error: genErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: email! });
    if (genErr || !gen?.properties?.hashed_token) throw genErr ?? new Error("No token");
    return json({ token_hash: gen.properties.hashed_token });
  } catch (e) {
    console.error("auth-discord error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
