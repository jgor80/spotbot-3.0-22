// One-time "link your accounts" invites the bot DMs to club members.
// peek: show who the invite is for. redeem: save gamertag + platform, and if the visitor is
// signed in to the website, connect that website account to their Discord ID.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createAdminClient } from "../_shared/auth.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PLATFORMS = ["ps5", "xbox-series-xs", "pc", "switch"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return json({ error: "Invalid link" }, 400);

    const { data: invite } = await admin.from("link_invites").select("*").eq("token", token).maybeSingle();
    if (!invite) return json({ error: "This link is not valid." }, 404);
    if (new Date(invite.expires_at) < new Date()) return json({ error: "This link has expired. Ask your manager for a new one." }, 410);
    if (invite.used_at) return json({ error: "This link has already been used. Ask your manager for a new one, or use /me → Link EA in Discord." }, 410);

    const { data: profile } = await admin.from("profiles").select("ea_username, ea_platform").eq("discord_user_id", invite.discord_user_id).maybeSingle();
    const { data: guild } = await admin.from("guild_settings").select("name").eq("guild_id", invite.guild_id).maybeSingle();

    if (body.action === "peek") {
      return json({
        discord_username: invite.discord_username,
        guild_name: guild?.name ?? null,
        ea_username: profile?.ea_username ?? null,
        ea_platform: profile?.ea_platform ?? null,
      });
    }

    if (body.action !== "redeem") return json({ error: "Unknown action" }, 400);
    const gamertag = typeof body.ea_username === "string" ? body.ea_username.trim() : "";
    const platform = typeof body.ea_platform === "string" ? body.ea_platform : "ps5";
    if (!/^[A-Za-z0-9_\-. ]{2,24}$/.test(gamertag)) return json({ error: "Enter your gamertag exactly as it shows in game." }, 400);
    if (!PLATFORMS.includes(platform)) return json({ error: "Pick a platform." }, 400);

    // Never take a gamertag that belongs to another real member
    const { data: owners } = await admin.from("profiles").select("discord_user_id").ilike("ea_username", gamertag).neq("discord_user_id", invite.discord_user_id);
    if ((owners || []).some((o: { discord_user_id: string }) => !o.discord_user_id.startsWith("ea_"))) {
      return json({ error: "That gamertag is already linked to another member. Ask a manager to use /forcelink." }, 409);
    }

    // Claim the invite before writing anything. Only one request can win this, so a link that was
    // already used (or leaked from a screenshot or browser history) can never be redeemed again.
    const nowIso = new Date().toISOString();
    const { data: claimed } = await admin.from("link_invites").update({ used_at: nowIso })
      .eq("token", token).is("used_at", null).gt("expires_at", nowIso)
      .select("token").maybeSingle();
    if (!claimed) return json({ error: "This link has already been used. Ask your manager for a new one." }, 410);

    const fields = { ea_username: gamertag, ea_platform: platform, discord_username: invite.discord_username ?? undefined };
    const { error: saveErr } = profile
      ? await admin.from("profiles").update(fields).eq("discord_user_id", invite.discord_user_id)
      : await admin.from("profiles").insert({ discord_user_id: invite.discord_user_id, ...fields });
    if (saveErr) {
      // Nothing was saved, so let the member try again with the same link
      await admin.from("link_invites").update({ used_at: null }).eq("token", token);
      return json({ error: saveErr.message }, 500);
    }

    // Move stats saved under a placeholder profile for this gamertag
    const tempId = `ea_${gamertag.replace(/[^a-zA-Z0-9]/g, "_")}`;
    if ((owners || []).some((o: { discord_user_id: string }) => o.discord_user_id === tempId)) {
      await admin.from("player_stats").update({ discord_user_id: invite.discord_user_id }).eq("discord_user_id", tempId);
      await admin.from("profiles").delete().eq("discord_user_id", tempId);
    }

    // Connect the website account when the visitor is signed in. Never take over a verified link that
    // belongs to someone else, and never move an account that is already verified to another Discord ID.
    let websiteLinked = false;
    let websiteNote: string | null = null;
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt) {
      const { data } = await admin.auth.getUser(jwt);
      if (data?.user) {
        const userId = data.user.id;
        const { data: mine } = await admin.from("user_discord_links").select("discord_user_id, verified").eq("auth_user_id", userId).maybeSingle();
        const { data: theirs } = await admin.from("user_discord_links").select("auth_user_id, verified").eq("discord_user_id", invite.discord_user_id).maybeSingle();
        if (mine?.verified && mine.discord_user_id === invite.discord_user_id) {
          websiteLinked = true;
        } else if (mine?.verified) {
          websiteNote = "Your website account is already connected to a different Discord account, so it was left as it is.";
        } else if (theirs?.verified && theirs.auth_user_id !== userId) {
          websiteNote = "This Discord account is already connected to another website account. Sign in with Discord to use it.";
        } else {
          // Both rows (if any) are unverified here, so clearing them takes nothing from a verified owner
          if (mine) await admin.from("user_discord_links").delete().eq("auth_user_id", userId);
          if (theirs) await admin.from("user_discord_links").delete().eq("discord_user_id", invite.discord_user_id);
          const { error } = await admin.from("user_discord_links").insert({ auth_user_id: userId, discord_user_id: invite.discord_user_id, verified: true });
          websiteLinked = !error;
        }
      }
    }

    return json({ success: true, website_linked: websiteLinked, website_note: websiteNote });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
