import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";
import { rejectUnlessCaller } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TWITCH_CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID")?.trim();
const TWITCH_CLIENT_SECRET = Deno.env.get("TWITCH_CLIENT_SECRET")?.trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
// Where Twitch delivers stream.online events: the public site's Worker forwards /api/functions/* to
// the functions server, so the callback never depends on where the database lives.
const CALLBACK_URL = Deno.env.get("TWITCH_CALLBACK_URL")?.trim() ||
  `${(Deno.env.get("DASHBOARD_URL") || "https://gafferbot.app").replace(/\/+$/, "")}/api/functions/v1/twitch-webhook`;

// Message signing secret provided by Twitch when subscribing.
// Fail closed: with no secret configured, signatures can never verify, so webhooks are rejected.
const TWITCH_MESSAGE_SECRET = Deno.env.get("TWITCH_WEBHOOK_SECRET")?.trim();
if (!TWITCH_MESSAGE_SECRET) {
  console.error("[twitch-webhook] TWITCH_WEBHOOK_SECRET is not set; all webhook deliveries will be rejected");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// Verify Twitch webhook signature
function verifyTwitchSignature(
  messageId: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  if (!TWITCH_MESSAGE_SECRET) return false;
  const message = messageId + timestamp + body;
  const expectedSignature = "sha256=" + createHmac("sha256", TWITCH_MESSAGE_SECRET)
    .update(message)
    .digest("hex");
  return signature === expectedSignature;
}

// Get Twitch App Access Token
async function getTwitchAppToken(): Promise<string> {
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID!,
      client_secret: TWITCH_CLIENT_SECRET!,
      grant_type: "client_credentials",
    }),
  });
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Failed to get Twitch app token: " + JSON.stringify(data));
  }
  return data.access_token;
}

// Get Twitch user by username
async function getTwitchUser(username: string, token: string) {
  const response = await fetch(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`,
    {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID!,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const data = await response.json();
  return data.data?.[0] || null;
}

// Subscribe to stream.online EventSub
async function subscribeToStreamOnline(
  broadcasterId: string,
  callbackUrl: string,
  token: string
): Promise<string | null> {
  console.log(`[Twitch] Subscribing to stream.online for broadcaster ${broadcasterId}`);
  
  const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    method: "POST",
    headers: {
      "Client-ID": TWITCH_CLIENT_ID!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "stream.online",
      version: "1",
      condition: { broadcaster_user_id: broadcasterId },
      transport: {
        method: "webhook",
        callback: callbackUrl,
        secret: TWITCH_MESSAGE_SECRET,
      },
    }),
  });

  const data = await response.json();
  console.log(`[Twitch] Subscribe response:`, data);
  
  if (data.data?.[0]?.id) {
    return data.data[0].id;
  }
  return null;
}

// Delete EventSub subscription
async function deleteSubscription(subscriptionId: string, token: string) {
  await fetch(
    `https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscriptionId}`,
    {
      method: "DELETE",
      headers: {
        "Client-ID": TWITCH_CLIENT_ID!,
        Authorization: `Bearer ${token}`,
      },
    }
  );
}

// Get stream info (for thumbnail, game, etc.)
async function getStreamInfo(broadcasterId: string, token: string) {
  const response = await fetch(
    `https://api.twitch.tv/helix/streams?user_id=${broadcasterId}`,
    {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID!,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const data = await response.json();
  return data.data?.[0] || null;
}

// Send Discord message
async function sendDiscordMessage(channelId: string, content: string, embed?: any) {
  const body: any = {};
  if (content) body.content = content;
  if (embed) body.embeds = [embed];

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[Discord] Failed to send message: ${response.status} ${errText}`);
  }
  return response.ok;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  // setup/remove/list manage a server's subscriptions, so only the bot may call them.
  // The Twitch callback itself is checked by its message signature below.
  if (path === "setup" || path === "remove" || path === "list" || path === "resync") {
    const denied = await rejectUnlessCaller(req, { botOnly: true });
    if (denied) return denied;
  }

  try {
    // =============================
    // POST /twitch-webhook/setup - Setup a new subscription
    // =============================
    if (req.method === "POST" && path === "setup") {
      if (!TWITCH_MESSAGE_SECRET) {
        return new Response(
          JSON.stringify({ error: "Twitch webhooks are not configured on this deployment yet" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { guild_id, twitch_username, channel_id, custom_message } = await req.json();

      if (!guild_id || !twitch_username || !channel_id) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: guild_id, twitch_username, channel_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const token = await getTwitchAppToken();
      const twitchUser = await getTwitchUser(twitch_username, token);

      if (!twitchUser) {
        return new Response(
          JSON.stringify({ error: `Twitch user "${twitch_username}" not found` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if subscription already exists for this guild+username
      const { data: existing } = await supabase
        .from("twitch_notifications")
        .select("*")
        .eq("guild_id", guild_id)
        .eq("twitch_username", twitch_username.toLowerCase())
        .single();

      // If exists, delete old subscription
      if (existing?.subscription_id) {
        await deleteSubscription(existing.subscription_id, token);
      }

      // Create EventSub subscription
      const subscriptionId = await subscribeToStreamOnline(twitchUser.id, CALLBACK_URL, token);

      if (!subscriptionId) {
        return new Response(
          JSON.stringify({ error: "Failed to create Twitch EventSub subscription" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Upsert notification settings
      const { error: upsertError } = await supabase.from("twitch_notifications").upsert({
        guild_id,
        twitch_username: twitch_username.toLowerCase(),
        notification_channel_id: channel_id,
        subscription_id: subscriptionId,
        custom_message,
        is_live: false,
      }, {
        onConflict: "guild_id,twitch_username"
      });

      if (upsertError) {
        console.error("[Setup] DB upsert error:", upsertError);
        return new Response(
          JSON.stringify({ error: "Failed to save notification settings" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[Setup] Successfully configured Twitch notifications for ${twitch_username} in guild ${guild_id}`);

      return new Response(
        JSON.stringify({
          success: true,
          twitch_user: {
            id: twitchUser.id,
            login: twitchUser.login,
            display_name: twitchUser.display_name,
            profile_image_url: twitchUser.profile_image_url,
          },
          subscription_id: subscriptionId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================
    // DELETE /twitch-webhook/remove - Remove a subscription
    // =============================
    if (req.method === "POST" && path === "remove") {
      const { guild_id, twitch_username } = await req.json();

      if (!guild_id || !twitch_username) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: guild_id, twitch_username" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: existing } = await supabase
        .from("twitch_notifications")
        .select("*")
        .eq("guild_id", guild_id)
        .eq("twitch_username", twitch_username.toLowerCase())
        .single();

      if (existing?.subscription_id) {
        const token = await getTwitchAppToken();
        await deleteSubscription(existing.subscription_id, token);
      }

      await supabase
        .from("twitch_notifications")
        .delete()
        .eq("guild_id", guild_id)
        .eq("twitch_username", twitch_username.toLowerCase());

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================
    // POST /twitch-webhook/resync - Point every saved subscription at CALLBACK_URL
    // (subscriptions made before the move still deliver to the old backend's address).
    // Idempotent: rows whose subscription is already enabled on CALLBACK_URL are left alone.
    // =============================
    if (req.method === "POST" && path === "resync") {
      if (!TWITCH_MESSAGE_SECRET || !TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
        return new Response(JSON.stringify({ skipped: "Twitch is not configured" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: rows, error } = await supabase.from("twitch_notifications").select("guild_id, twitch_username, subscription_id");
      if (error) throw error;
      if (!rows?.length) return new Response(JSON.stringify({ checked: 0, moved: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const token = await getTwitchAppToken();
      const current = new Map<string, { callback: string; status: string }>();
      let cursor: string | undefined;
      do {
        const res = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?type=stream.online${cursor ? `&after=${cursor}` : ""}`, {
          headers: { "Client-ID": TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
        });
        const page = await res.json();
        for (const sub of page.data || []) current.set(sub.id, { callback: sub.transport?.callback, status: sub.status });
        cursor = page.pagination?.cursor;
      } while (cursor);

      let moved = 0;
      const failed: string[] = [];
      for (const row of rows) {
        const sub = row.subscription_id ? current.get(row.subscription_id) : undefined;
        if (sub && sub.callback === CALLBACK_URL && sub.status === "enabled") continue;
        if (row.subscription_id) await deleteSubscription(row.subscription_id, token);
        const user = await getTwitchUser(row.twitch_username, token);
        const id = user ? await subscribeToStreamOnline(user.id, CALLBACK_URL, token) : null;
        if (!id) { failed.push(row.twitch_username); continue; }
        await supabase.from("twitch_notifications").update({ subscription_id: id })
          .eq("guild_id", row.guild_id).eq("twitch_username", row.twitch_username);
        moved++;
      }
      console.log(`[Resync] ${moved} moved to ${CALLBACK_URL}, ${failed.length} failed`);
      return new Response(JSON.stringify({ checked: rows.length, moved, failed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // =============================
    // GET /twitch-webhook/list - List subscriptions for a guild
    // =============================
    if (req.method === "GET" && path === "list") {
      const guildId = url.searchParams.get("guild_id");

      if (!guildId) {
        return new Response(
          JSON.stringify({ error: "Missing guild_id parameter" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from("twitch_notifications")
        .select("*")
        .eq("guild_id", guildId);

      if (error) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch notifications" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ notifications: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================
    // POST /twitch-webhook - Twitch EventSub callback
    // =============================
    if (req.method === "POST" && (path === "twitch-webhook" || !path || path === "")) {
      const body = await req.text();
      const messageId = req.headers.get("Twitch-Eventsub-Message-Id") || "";
      const timestamp = req.headers.get("Twitch-Eventsub-Message-Timestamp") || "";
      const signature = req.headers.get("Twitch-Eventsub-Message-Signature") || "";
      const messageType = req.headers.get("Twitch-Eventsub-Message-Type");

      console.log(`[Webhook] Received ${messageType} message`);

      // Verify signature
      if (!verifyTwitchSignature(messageId, timestamp, body, signature)) {
        console.error("[Webhook] Invalid signature");
        return new Response("Invalid signature", { status: 403 });
      }

      const payload = JSON.parse(body);

      // Handle verification challenge
      if (messageType === "webhook_callback_verification") {
        console.log("[Webhook] Responding to verification challenge");
        return new Response(payload.challenge, {
          headers: { "Content-Type": "text/plain" },
        });
      }

      // Handle revocation
      if (messageType === "revocation") {
        console.log("[Webhook] Subscription revoked:", payload.subscription);
        // Clean up from database
        await supabase
          .from("twitch_notifications")
          .update({ subscription_id: null })
          .eq("subscription_id", payload.subscription.id);
        return new Response("OK");
      }

      // Handle stream.online notification
      if (messageType === "notification" && payload.subscription?.type === "stream.online") {
        const event = payload.event;
        const broadcasterId = event.broadcaster_user_id;
        const broadcasterLogin = event.broadcaster_user_login;
        const broadcasterName = event.broadcaster_user_name;

        console.log(`[Webhook] ${broadcasterName} went live!`);

        // Find all guilds monitoring this streamer
        const { data: notifications } = await supabase
          .from("twitch_notifications")
          .select("*")
          .eq("twitch_username", broadcasterLogin.toLowerCase());

        if (!notifications || notifications.length === 0) {
          console.log("[Webhook] No guilds monitoring this streamer");
          return new Response("OK");
        }

        // Get stream info for embed
        const token = await getTwitchAppToken();
        const streamInfo = await getStreamInfo(broadcasterId, token);
        const twitchUser = await getTwitchUser(broadcasterLogin, token);

        for (const notification of notifications) {
          // Check if already notified recently (prevent duplicate notifications)
          const lastNotified = notification.last_notified_at
            ? new Date(notification.last_notified_at)
            : null;
          const now = new Date();
          
          // Skip if notified within last 30 minutes
          if (lastNotified && now.getTime() - lastNotified.getTime() < 30 * 60 * 1000) {
            console.log(`[Webhook] Skipping duplicate notification for guild ${notification.guild_id}`);
            continue;
          }

          // Build embed
          const embed: any = {
            title: `🔴 ${broadcasterName} is now LIVE!`,
            url: `https://twitch.tv/${broadcasterLogin}`,
            color: 0x9146FF, // Twitch purple
            fields: [],
            timestamp: new Date().toISOString(),
          };

          if (streamInfo) {
            embed.description = streamInfo.title || "Live on Twitch";
            if (streamInfo.game_name) {
              embed.fields.push({ name: "Playing", value: streamInfo.game_name, inline: true });
            }
            if (streamInfo.viewer_count !== undefined) {
              embed.fields.push({ name: "Viewers", value: streamInfo.viewer_count.toString(), inline: true });
            }
            // Thumbnail with cache-busting
            embed.image = {
              url: streamInfo.thumbnail_url
                .replace("{width}", "440")
                .replace("{height}", "248") + `?t=${Date.now()}`,
            };
          }

          if (twitchUser?.profile_image_url) {
            embed.thumbnail = { url: twitchUser.profile_image_url };
          }

          embed.footer = { text: "Twitch", icon_url: "https://static.twitchcdn.net/assets/favicon-32-e29e246c157142c94346.png" };

          // Custom message or default
          const content = notification.custom_message || `🎮 **${broadcasterName}** just went live! Come watch: https://twitch.tv/${broadcasterLogin}`;

          // Send to Discord
          const sent = await sendDiscordMessage(notification.notification_channel_id, content, embed);

          if (sent) {
            // Update last notified time and is_live status
            await supabase
              .from("twitch_notifications")
              .update({ last_notified_at: now.toISOString(), is_live: true })
              .eq("id", notification.id);
          }
        }

        return new Response("OK");
      }

      // Handle stream.offline (if we add it later)
      if (messageType === "notification" && payload.subscription?.type === "stream.offline") {
        const broadcasterLogin = payload.event.broadcaster_user_login;
        
        await supabase
          .from("twitch_notifications")
          .update({ is_live: false })
          .eq("twitch_username", broadcasterLogin.toLowerCase());

        return new Response("OK");
      }

      return new Response("OK");
    }

    return new Response("Not Found", { status: 404 });
  } catch (error: unknown) {
    console.error("[Error]", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
